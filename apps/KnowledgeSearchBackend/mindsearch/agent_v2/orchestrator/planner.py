"""PlannerAgent — top-level reactive loop that grows the WebSearchGraph.

Yields SSE-ready event dicts (see `sse.py`) so the FastAPI layer can stream
them straight to the React frontend without further transformation.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from ..config import Settings, settings as default_settings
from ..llm.base import ChatMessage, LLMClient
from ..memory.conversational import ConversationalMemory
from ..memory.tool_log import ToolLog
from ..rag.retriever import Retriever
from ..tools.planner_tools import register_planner_tools
from ..tools.registry import ToolContext, ToolRegistry
from .graph import GraphState, WebSearchGraph
from .loop import run_reactive_loop
from .searcher import SearcherAgent
from .sse import end_event, planner_event, searcher_event, warning_event


log = logging.getLogger(__name__)


PLANNER_SYSTEM = """You are MindSearch's planner. Decompose the user's question into atomic, independently-searchable sub-questions, then call tools to expand a search graph.

Workflow:
1. Use `add_node` to create one searcher node per sub-question. Independent sub-questions can be added in one turn — `search_node` calls run in parallel.
2. Use `search_node` to dispatch each node. The result is a structured answer with citations.
3. Use `read_node_answer` if you need to re-read a prior answer.
4. When you have enough information, call `finalize(answer, citations)` with the synthesized answer.

Rules:
- Prefer 2-4 sub-questions for compound queries; one is fine for simple ones.
- Use [[N]] inline citation markers in the final answer.
- Do not invent facts. If searcher answers conflict or are empty, say so.
- Call `finalize` exactly once.
"""


class PlannerAgent:
    def __init__(
        self,
        *,
        llm: LLMClient,
        retriever: Retriever,
        searcher: SearcherAgent | None = None,
        config: Settings | None = None,
    ):
        self._llm = llm
        self._retriever = retriever
        self._config = config or default_settings
        self._searcher = searcher or SearcherAgent(
            llm=llm,
            retriever=retriever,
            max_iterations=self._config.searcher_max_iterations,
            tool_dispatch_max_parallel=self._config.tool_dispatch_max_parallel,
            tool_dispatch_timeout_s=self._config.tool_dispatch_timeout_s,
        )

    async def run(
        self,
        *,
        inputs: str | list[dict[str, Any]],
        enable_tools: bool = False,
        web_fallback: bool = False,
        collection_ids: list[str] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Drive a planner reactive loop, yielding SSE-ready event dicts."""
        user_question = _extract_user_question(inputs)
        graph = WebSearchGraph()
        graph.add_root(user_question)
        yield planner_event(graph, state=GraphState.STREAM_ING)

        registry = ToolRegistry(
            max_parallel=self._config.tool_dispatch_max_parallel,
            per_tool_timeout_s=self._config.tool_dispatch_timeout_s,
        )
        register_planner_tools(registry)

        # The planner's `search_node` tool delegates here. This is where each
        # leaf graph node fans out into a SearcherAgent sub-loop.
        async def _run_searcher(node_id: str) -> dict[str, Any]:
            node = graph.nodes.get(node_id)
            if node is None:
                # Raise so the ToolRegistry catches and reports it as
                # status='error' — the orchestrator surfaces a warning event
                # to the SSE stream and the LLM sees the failure next turn.
                raise KeyError(
                    f"search_node called with unknown node_id {node_id!r}. "
                    f"Known nodes: {sorted(graph.nodes.keys())}"
                )
            graph.set_node_state(node_id, _node_state_in_progress())
            result = await self._searcher.answer(
                question=node.content,
                web_fallback=web_fallback,
                collection_ids=collection_ids,
                enable_tools=enable_tools,
            )
            # Re-number citations into the graph's global namespace so
            # different nodes' [[N]] don't collide in references. Each
            # searcher's local [[1]]..[[K]] becomes [[ptr]]..[[ptr+K-1]].
            local_citations = result.get("citations") or []
            offset = graph._citation_ptr  # noqa: SLF001 — same module owns it
            renumbered: list[dict[str, Any]] = []
            for i, c in enumerate(local_citations):
                new_idx = offset + i
                renumbered.append({**c, "index": new_idx})
            graph._citation_ptr = offset + len(local_citations)  # noqa: SLF001

            graph.write_searcher_result(
                node_id,
                response=result["answer"],
                detail={
                    "iterations": result.get("iterations", 1),
                    "tool_errors": result.get("tool_errors", []),
                    "local_to_global_offset": offset,
                },
                source=result.get("source"),
                citations=renumbered,
            )
            for c in renumbered:
                if c.get("url"):
                    graph.references[str(c["index"])] = c["url"]
            return {
                "node_id": node_id,
                "answer": result["answer"],
                "source": result.get("source"),
                "citations": renumbered,
                "iterations": result.get("iterations", 1),
            }

        memory = ConversationalMemory(
            max_context_tokens=80_000, summarize_when_over=0.8
        )
        memory.append(ChatMessage(role="system", content=PLANNER_SYSTEM))
        memory.append(ChatMessage(role="user", content=user_question))

        tool_log = ToolLog()
        ctx = ToolContext(
            data={
                "graph": graph,
                "search_node": _run_searcher,
            }
        )

        async for turn in run_reactive_loop(
            llm=self._llm,
            registry=registry,
            memory=memory,
            tool_log=tool_log,
            ctx=ctx,
            max_iterations=self._config.planner_max_iterations,
            terminate_on_tool="finalize",
        ):
            # After each turn, emit graph state. If any searcher ran, also emit
            # a searcher event per completed node so the frontend updates.
            for tc, tr in zip(turn.tool_calls, turn.tool_results):
                if tc.name == "search_node" and tr.status.value == "success":
                    nid = (tr.output or {}).get("node_id")
                    if nid:
                        node = graph.nodes.get(nid)
                        yield searcher_event(
                            graph,
                            node_id=nid,
                            state=GraphState.END,
                            response_text=(node.response or "") if node else "",
                            content=(node.content or "") if node else "",
                            detail=(node.detail or {}) if node else {},
                        )
                if tr.status.value != "success":
                    yield warning_event(
                        f"tool {tr.name} failed: {tr.error or 'unknown error'}"
                    )

            response_text = ""
            if turn.tool_calls:
                # If the planner just emitted tool calls, surface its preface text.
                response_text = turn.response.text or ""
            yield planner_event(
                graph,
                state=GraphState.PLUGIN_RETURN if turn.tool_calls else GraphState.ANSWER_ING,
                response_text=response_text,
            )

        # Final answer event.
        final_answer = ""
        for entry in reversed(tool_log.entries()):
            if entry.name == "finalize" and entry.status == "success":
                final_answer = (entry.output or {}).get("answer", "")
                break
        if not final_answer:
            final_answer = "(planner ended without finalize — iteration cap?)"
            log.warning("PlannerAgent ended without finalize tool call")

        yield end_event(graph, response_text=final_answer)


def _extract_user_question(inputs: str | list[dict[str, Any]]) -> str:
    if isinstance(inputs, str):
        return inputs.strip()
    # List of {role, content} dicts; take the last user message.
    for msg in reversed(inputs):
        if msg.get("role") == "user":
            return str(msg.get("content", "")).strip()
    if inputs:
        return str(inputs[-1].get("content", "")).strip()
    return ""


def _node_state_in_progress():
    # Imported locally to avoid a top-level cycle with graph.py.
    from .graph import NodeState

    return NodeState.IN_PROGRESS


__all__ = ["PlannerAgent"]
