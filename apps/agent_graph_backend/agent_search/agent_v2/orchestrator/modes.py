"""Mode selection + dispatcher for ``POST /solve`` (TAG-58 / TAG-61 / TAG-62).

TAG-62 owns this file. The contract is:

  * :class:`SolveMode` — four-state enum (WEB / CORPUS / HYBRID / INVALID)
    naming every reachable orchestrator branch.

  * :func:`select_mode` — pure function over :class:`SolveRequest`.
    The four ``(web_fallback, collection_ids)`` quadrants:

        +---------------+----------------+--------+
        | web_fallback  | collection_ids | mode   |
        +===============+================+========+
        | True          | []             | WEB    |
        | False         | [...]          | CORPUS |
        | True          | [...]          | HYBRID |
        | False         | []             | (422)  |
        +---------------+----------------+--------+

    The bottom row never reaches us — ``SolveRequest._at_least_one_grounding_source``
    rejects it at construction time. We still emit
    :attr:`SolveMode.INVALID` as a defence-in-depth marker so a buggy
    upstream produces a clean ``RuntimeError`` from
    :func:`run_solve` rather than silently picking a branch.

  * :func:`run_solve` — async dispatcher. Yields the same SSE-ready
    event-dict shape regardless of mode so the FastAPI route stays a
    one-liner.

  * :func:`run_corpus_solve` — TAG-61's corpus-grounded planner. Unchanged
    here; preserved for the dispatcher to call.

The web and hybrid runners live in dedicated modules
(:mod:`.web_mode`, :mod:`.hybrid_mode`) — both imported lazily inside
:func:`run_solve` to keep this module's import graph small (matters for
the ``select_mode`` unit tests which should not pull asyncpg).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from enum import StrEnum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import Request

    from ..api.solve_request import SolveRequest
    from ..auth.types import JWTClaims
    from ..config import Settings
    from ..llm.base import LLMClient
    from ..rag.corpus_search import CorpusSearch


class SolveMode(StrEnum):
    """Orchestrator branch selector.

    String values are stable wire constants — they appear in log lines
    and metrics. Don't rename without an ADR.
    """

    WEB = "web"
    CORPUS = "corpus"
    HYBRID = "hybrid"
    INVALID = "invalid"


def select_mode(req: SolveRequest) -> SolveMode:
    """Pick a :class:`SolveMode` from a validated :class:`SolveRequest`.

    Pure function — no side effects, no I/O. Safe to call as many
    times as you like; the dispatcher in :func:`run_solve` does exactly
    one call.

    ``SolveMode.INVALID`` is unreachable in practice (the request
    validator rejects ``web_fallback=False && collection_ids==[]`` at
    schema time). We still emit it on the no-grounding quadrant so
    that *if* the validator ever drifts, the orchestrator fails loud
    instead of guessing.
    """
    has_corpus = bool(req.collection_ids)
    if has_corpus and not req.web_fallback:
        return SolveMode.CORPUS
    if has_corpus and req.web_fallback:
        return SolveMode.HYBRID
    if not has_corpus and req.web_fallback:
        return SolveMode.WEB
    return SolveMode.INVALID


def _build_corpus_search(config: Settings | None = None) -> CorpusSearch:
    """Construct the production :class:`PgCorpusSearch` for ``/solve``.

    Singleton-per-process is fine: :class:`PgCorpusSearch` holds no
    per-tenant state. The tenant id is threaded in on every
    ``.search()`` call via :func:`.rag_tools.register_rag_planner_tools`
    so the same instance serves every request safely.

    Lives behind a function (rather than a module-level constant) so
    tests can monkeypatch this seam without importing pgvector — and
    so the embedding provider is constructed lazily, after pytest's
    ``monkeypatch.setenv`` runs.
    """
    from ..config import settings as default_settings
    from ..rag.corpus_search import PgCorpusSearch
    from ..rag.embedding import create_embedding_provider

    cfg = config or default_settings
    return PgCorpusSearch(embed=create_embedding_provider(cfg))


async def run_solve(
    *,
    request: Request,
    user: JWTClaims,
    llm: LLMClient,
    req: SolveRequest,
    mode: SolveMode,
) -> AsyncIterator[dict[str, Any]]:
    """Dispatch to the correct orchestrator and stream its events.

    The route (``/solve`` in ``api/solve.py``) is intentionally thin:
    auth -> resolve -> ``select_mode`` -> ``run_solve``. Everything
    behind this function is mode-specific; the route never branches.
    """
    from .hybrid_mode import run_hybrid_solve
    from .web_mode import run_web_solve

    if mode is SolveMode.WEB:
        async for ev in run_web_solve(request=request, llm=llm, req=req):
            yield ev
        return

    if mode is SolveMode.CORPUS:
        corpus = _build_corpus_search()
        async for ev in run_corpus_solve(
            request=request, user=user, llm=llm, req=req, corpus=corpus,
        ):
            yield ev
        return

    if mode is SolveMode.HYBRID:
        corpus = _build_corpus_search()
        async for ev in run_hybrid_solve(
            request=request, user=user, llm=llm, req=req, corpus=corpus,
        ):
            yield ev
        return

    # SolveMode.INVALID — unreachable in normal flow (validator
    # blocks the no-grounding quadrant). If we get here, the request
    # validator has drifted out of sync with the dispatcher.
    raise RuntimeError(f"unreachable: invalid SolveMode {mode!r}")


async def run_corpus_solve(
    *,
    request: Request,
    user: JWTClaims,
    llm: LLMClient,
    req: SolveRequest,
    corpus: CorpusSearch,
    config: Settings | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Run a corpus-grounded planner->retrieval DAG (TAG-61).

    Yields SSE-ready event dicts in the same shape as the web planner
    (``planner_event`` / ``searcher_event`` / ``warning_event`` /
    ``end_event``). The grounding rules live in the system prompt
    (:func:`.rag_planner_prompt._rag_planner_system`); if the loop
    exits without a ``finalize`` call, the final answer falls back to
    :data:`.rag_planner_prompt.REFUSAL_TEXT`.

    Tenant isolation is enforced at two layers:

      1. :class:`PgCorpusSearch` filters on both ``rag_chunks.tenant_id``
         and ``rag_documents.tenant_id`` (TAG-59).
      2. The closure-captured ``tenant_id`` inside the registered tools
         is asserted non-empty on every call as defence-in-depth.
    """
    from ..config import settings as default_settings
    from ..llm.base import ChatMessage as LLMChatMessage
    from ..memory.conversational import ConversationalMemory
    from ..memory.history import safe_summarize_oldest_half, too_long, trim_history
    from ..memory.tool_log import ToolLog
    from ..tools.registry import ToolContext, ToolRegistry
    from .graph import GraphState, WebSearchGraph
    from .loop import run_reactive_loop
    from .rag_planner_prompt import REFUSAL_TEXT, _rag_planner_system
    from .rag_tools import register_rag_planner_tools
    from .sse import end_event, planner_event, searcher_event, warning_event

    cfg = config or default_settings

    user_question = req.messages[-1].content.strip()

    # TAG-63: bound prior turns before they hit the LLM. Same policy
    # as the web planner (PlannerAgent.run) so multi-mode requests
    # don't observe different history-handling behaviour.
    trimmed_history = trim_history(list(req.messages[:-1]))
    summariser_warning: str | None = None
    if too_long(trimmed_history):
        trimmed_history, summariser_warning = await safe_summarize_oldest_half(
            llm, trimmed_history
        )

    graph = WebSearchGraph()
    graph.add_root(user_question)
    yield planner_event(graph, state=GraphState.STREAM_ING)

    if summariser_warning is not None:
        yield warning_event(summariser_warning)

    registry = ToolRegistry(
        max_parallel=cfg.tool_dispatch_max_parallel,
        per_tool_timeout_s=cfg.tool_dispatch_timeout_s,
    )
    register_rag_planner_tools(
        registry,
        corpus=corpus,
        tenant_id=user.tenant_id,
        collection_ids=req.collection_ids,
        top_k=cfg.rag_top_k * 2,
    )

    memory = ConversationalMemory(
        max_context_tokens=80_000, summarize_when_over=0.8
    )
    memory.append(LLMChatMessage(role="system", content=_rag_planner_system()))
    for prior in trimmed_history:
        memory.append(LLMChatMessage(role=prior.role, content=prior.content))
    memory.append(LLMChatMessage(role="user", content=user_question))

    tool_log = ToolLog()
    ctx = ToolContext(data={"graph": graph})

    async for turn in run_reactive_loop(
        llm=llm,
        registry=registry,
        memory=memory,
        tool_log=tool_log,
        ctx=ctx,
        max_iterations=cfg.planner_max_iterations,
        terminate_on_tool="finalize",
    ):
        for tc, tr in zip(turn.tool_calls, turn.tool_results, strict=False):
            if tc.name == "search_corpus_node" and tr.status.value == "success":
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

        response_text = turn.response.text or "" if turn.tool_calls else ""
        yield planner_event(
            graph,
            state=(
                GraphState.PLUGIN_RETURN
                if turn.tool_calls
                else GraphState.ANSWER_ING
            ),
            response_text=response_text,
        )

    final_answer = ""
    for entry in reversed(tool_log.entries()):
        if entry.name == "finalize" and entry.status == "success":
            final_answer = (entry.output or {}).get("answer", "")
            break
    if not final_answer:
        final_answer = REFUSAL_TEXT

    yield end_event(graph, response_text=final_answer)


__all__ = [
    "SolveMode",
    "_build_corpus_search",
    "run_corpus_solve",
    "run_solve",
    "select_mode",
]
