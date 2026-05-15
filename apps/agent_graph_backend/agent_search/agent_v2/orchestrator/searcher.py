"""SearcherAgent — answers a single sub-question.

Default mode (`enable_tools=false`): pulls grounding once via the retriever,
hands it to the LLM, and asks for an answer in one round.

Tools mode (`enable_tools=true`): runs a reactive sub-loop where the LLM
can call `web_search` / `advanced_retrieve` / `answer` directly.
"""

from __future__ import annotations

from typing import Any

from ..llm.base import ChatMessage, LLMClient
from ..memory.conversational import ConversationalMemory
from ..memory.tool_log import ToolLog
from ..prompts import get_prompt, render_prompt
from ..rag.retriever import Retriever
from ..tools.registry import ToolContext, ToolRegistry
from ..tools.searcher_tools import register_searcher_tools
from .loop import run_reactive_loop


_SEARCHER_SYSTEM_SLUG = "system.searcher"
_SIMPLE_USER_SLUG = "template.searcher_simple_user"
_TOOLS_USER_SLUG = "template.searcher_tools_user"


class SearcherAgent:
    def __init__(
        self,
        *,
        llm: LLMClient,
        retriever: Retriever,
        max_iterations: int = 4,
        tool_dispatch_max_parallel: int = 4,
        tool_dispatch_timeout_s: float = 30.0,
    ):
        self._llm = llm
        self._retriever = retriever
        self._max_iter = max_iterations
        self._max_parallel = tool_dispatch_max_parallel
        self._timeout_s = tool_dispatch_timeout_s

    async def answer(
        self,
        *,
        question: str,
        web_fallback: bool,
        collection_ids: list[str] | None,
        enable_tools: bool,
    ) -> dict[str, Any]:
        if enable_tools:
            return await self._answer_with_tools(
                question=question,
                web_fallback=web_fallback,
                collection_ids=collection_ids,
            )
        return await self._answer_simple(
            question=question,
            web_fallback=web_fallback,
            collection_ids=collection_ids,
        )

    # ---- simple (default) mode ----

    async def _answer_simple(
        self,
        *,
        question: str,
        web_fallback: bool,
        collection_ids: list[str] | None,
    ) -> dict[str, Any]:
        retrieval = await self._retriever.advanced_retrieve(
            question,
            web_fallback=web_fallback,
            collection_ids=collection_ids,
        )
        context = retrieval.context_block()
        user_prompt = render_prompt(
            _SIMPLE_USER_SLUG, question=question, context=context
        )
        resp = await self._llm.chat(
            messages=[
                ChatMessage(role="system", content=get_prompt(_SEARCHER_SYSTEM_SLUG)),
                ChatMessage(role="user", content=user_prompt),
            ],
            tools=[],
        )
        return {
            "answer": resp.text or "(no answer)",
            "source": retrieval.source,
            "hits": [h.model_dump() for h in retrieval.hits],
            "citations": [c.model_dump() for c in retrieval.citations()],
            "iterations": 1,
        }

    # ---- tools mode ----

    async def _answer_with_tools(
        self,
        *,
        question: str,
        web_fallback: bool,
        collection_ids: list[str] | None,
    ) -> dict[str, Any]:
        registry = ToolRegistry(
            max_parallel=self._max_parallel,
            per_tool_timeout_s=self._timeout_s,
        )
        register_searcher_tools(registry)

        memory = ConversationalMemory()
        memory.append(
            ChatMessage(role="system", content=get_prompt(_SEARCHER_SYSTEM_SLUG))
        )
        memory.append(
            ChatMessage(
                role="user",
                content=render_prompt(_TOOLS_USER_SLUG, question=question),
            )
        )

        log = ToolLog()
        ctx = ToolContext(
            data={
                "retriever": self._retriever,
                "web_fallback": web_fallback,
                "collection_ids": collection_ids,
            }
        )

        final_answer = "(no answer)"
        final_source: str = "none"
        final_hits: list[dict[str, Any]] = []
        iterations = 0
        async for turn in run_reactive_loop(
            llm=self._llm,
            registry=registry,
            memory=memory,
            tool_log=log,
            ctx=ctx,
            max_iterations=self._max_iter,
            terminate_on_tool="answer",
        ):
            iterations = turn.iteration
            for r in turn.tool_results:
                if r.status.value == "success" and r.name == "answer":
                    out = r.output or {}
                    final_answer = out.get("answer", final_answer)
                if r.status.value == "success" and r.name == "advanced_retrieve":
                    out = r.output or {}
                    final_source = out.get("source", final_source)
                    final_hits = out.get("hits", final_hits)

        citations = [
            {
                "index": i + 1,
                "source": h.get("source"),
                "title": h.get("title"),
                "url": h.get("url"),
                "snippet": h.get("snippet"),
                "score": h.get("score"),
            }
            for i, h in enumerate(final_hits)
        ]
        return {
            "answer": final_answer,
            "source": final_source,
            "hits": final_hits,
            "citations": citations,
            "iterations": iterations,
            "tool_errors": [e.error for e in log.errors()],
        }


__all__ = ["SearcherAgent"]
