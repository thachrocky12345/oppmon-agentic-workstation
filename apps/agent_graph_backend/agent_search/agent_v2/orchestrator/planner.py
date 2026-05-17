# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""PlannerAgent — top-level reactive loop that grows the WebSearchGraph.

Yields SSE-ready event dicts (see `sse.py`) so the FastAPI layer can stream
them straight to the React frontend without further transformation.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from ..api.solve_request import ChatMessage as WireChatMessage
from ..config import Settings, settings as default_settings
from ..llm.base import ChatMessage, LLMClient
from ..memory.conversational import ConversationalMemory
from ..memory.history import safe_summarize_oldest_half, too_long, trim_history
from ..memory.tool_log import ToolLog
from ..prompts import get_prompt, get_prompt_meta
from ..rag.retriever import Retriever
from ..tools.planner_tools import register_planner_tools
from ..tools.registry import ToolContext, ToolRegistry
from .graph import GraphState, WebSearchGraph
from .loop import run_reactive_loop
from .searcher import SearcherAgent
from .sse import end_event, planner_event, searcher_event, warning_event


log = logging.getLogger(__name__)


# Prompt slug the planner uses for its system message. Stored as a class
# attribute so observability hooks (TAG-77) can read it off the agent
# without re-deriving it from the message content.
_PLANNER_SYSTEM_SLUG = "system.web_planner"


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
        inputs: str | list[dict[str, Any]] | None = None,
        question: str | None = None,
        history: list[WireChatMessage] | None = None,
        enable_tools: bool = False,
        web_fallback: bool = False,
        collection_ids: list[str] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Drive a planner reactive loop, yielding SSE-ready event dicts.

        Two argument shapes are accepted (callers pick exactly one):

          * Legacy (``/solve_v2``): ``inputs`` — either a ``str`` or a
            ``list[{role, content}]``. ``history`` is derived from the
            list form; the last user message becomes the question.
          * TAG-63 (``/solve``): ``question`` + ``history`` — explicit
            split, matches the ticket's exact signature. ``history`` is
            trimmed (turn-cap + char-cap) and summarised when it
            exceeds the total-char budget. The summariser uses *this*
            client's :class:`LLMClient` so per-tenant billing stays
            attributed correctly.

        Passing both ``inputs`` and ``question`` raises ``ValueError``
        — the call sites must commit to one shape so the test surface
        stays predictable.
        """
        if inputs is not None and question is not None:
            raise ValueError(
                "PlannerAgent.run accepts either `inputs` or "
                "`question`+`history`, not both"
            )

        if question is not None:
            user_question = question.strip()
            raw_history = list(history or [])
        elif inputs is not None:
            user_question = _extract_user_question(inputs)
            raw_history = _history_from_inputs(inputs)
        else:
            raise ValueError(
                "PlannerAgent.run requires either `inputs` or `question`"
            )

        # TAG-63: trim history, summarise if still over the total cap.
        trimmed = trim_history(raw_history)
        summariser_warning: str | None = None
        if too_long(trimmed):
            trimmed, summariser_warning = await safe_summarize_oldest_half(
                self._llm, trimmed
            )

        graph = WebSearchGraph()
        graph.add_root(user_question)
        yield planner_event(graph, state=GraphState.STREAM_ING)

        if summariser_warning is not None:
            # Risk-table mitigation: surface the fall-back so operators
            # see the cost-saving step degraded for this request.
            yield warning_event(summariser_warning)

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
        system_prompt = get_prompt(_PLANNER_SYSTEM_SLUG)
        log.debug(
            "planner.system_prompt",
            extra={
                "prompt_slug": _PLANNER_SYSTEM_SLUG,
                "prompt_version": get_prompt_meta(_PLANNER_SYSTEM_SLUG).version,
            },
        )
        memory.append(ChatMessage(role="system", content=system_prompt))
        # TAG-63: prior turns sit between the system prompt and the
        # current user question so the model treats them as context,
        # not as a new instruction. `role` on wire-ChatMessage is
        # already constrained to {system,user,assistant} — safe to
        # forward verbatim.
        for prior in trimmed:
            memory.append(ChatMessage(role=prior.role, content=prior.content))
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


def _history_from_inputs(
    inputs: str | list[dict[str, Any]],
) -> list[WireChatMessage]:
    """Extract everything *except* the final user question as history.

    ``/solve_v2``'s ``inputs: str`` path has no history (per the
    ticket: "constructs history=[] so behavior is identical to
    today"). The ``list[dict]`` path slices off the last user message
    so the planner sees the same final question via
    :func:`_extract_user_question` and the rest as prior turns. Roles
    outside ``{system, user, assistant}`` (e.g. ``tool``) are dropped
    — the planner has no use for them and the wire ``ChatMessage``
    validator would reject them anyway.
    """
    if isinstance(inputs, str):
        return []
    if not inputs:
        return []
    # Find the index of the last user message; everything before it
    # is history. If there is no user message at all, treat the entire
    # list as history.
    last_user_idx = -1
    for i in range(len(inputs) - 1, -1, -1):
        if inputs[i].get("role") == "user":
            last_user_idx = i
            break
    prior = inputs[:last_user_idx] if last_user_idx >= 0 else list(inputs)
    out: list[WireChatMessage] = []
    for msg in prior:
        role = msg.get("role")
        if role not in ("system", "user", "assistant"):
            continue
        out.append(
            WireChatMessage(role=role, content=str(msg.get("content", "")))
        )
    return out


def _node_state_in_progress():
    # Imported locally to avoid a top-level cycle with graph.py.
    from .graph import NodeState

    return NodeState.IN_PROGRESS


__all__ = ["PlannerAgent"]
