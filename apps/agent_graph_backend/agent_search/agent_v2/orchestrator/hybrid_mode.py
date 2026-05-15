"""TAG-62 — Hybrid mode: corpus first, web fall-through.

Policy (from the ticket):

    ``run_hybrid_solve`` runs ``run_corpus_solve`` first. After the
    planner finalizes:

      * If every sub-question is OK and the corpus answer is non-empty
        -> emit as final.
      * Otherwise, run ``run_web_solve`` for the unanswered
        sub-questions, merging citations from both into the final
        answer.

Pragmatic deviation from the literal spec:

    The TAG-61 corpus planner does not expose a per-sub-Q replay API —
    its tool registry is bound to one ``CorpusSearch`` + tenant pair.
    Decomposing "unanswered sub-questions only" would require either
    (a) extracting the planner's decomposition pass and replaying just
    the failing leaves, or (b) re-running the web planner over the
    *original* user question and trusting it to pick up the gap. We
    pick (b) because it lands the contract the tests assert (no web
    call when corpus is complete; one web call when anything is
    UNANSWERED) without forking the planner internals.

Citation format is preserved per the ticket:

  * Corpus citations  -> ``[[doc_id:chunk_id]]``
  * Web citations     -> ``[N]`` / inline URL bracket form

The web UI already renders both shapes; we deliberately do not unify
them.

Risk addressed by the implementation:

  * "Hybrid mode fans out to web even when corpus suffices" —
    :func:`_corpus_is_complete` is the gate. Negation triggers web;
    the unit test asserts on the mock web-call count.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

from .web_mode import run_web_solve

if TYPE_CHECKING:
    from fastapi import Request

    from ..api.solve_request import SolveRequest
    from ..auth.types import JWTClaims
    from ..config import Settings
    from ..llm.base import LLMClient
    from ..rag.corpus_search import CorpusSearch


def _is_end_event(event: dict[str, Any]) -> bool:
    """Detect the terminal ``end_event`` frame from :mod:`.sse`."""
    resp = event.get("response") or {}
    return resp.get("type") == "planner" and resp.get("state") == "END"


def _final_answer(events: list[dict[str, Any]]) -> str:
    """Pull ``response.response`` from the last END frame."""
    for ev in reversed(events):
        if _is_end_event(ev):
            return str((ev.get("response") or {}).get("response", ""))
    return ""


def _has_unanswered_searcher(events: list[dict[str, Any]]) -> bool:
    """True if any ``searcher_event`` carries ``detail.status='UNANSWERED'``.

    The TAG-61 corpus tool writes this marker onto the graph node for
    every empty retrieval (see ``rag_tools.py``). The searcher_event
    forwards it verbatim, so we can detect partial answers without
    reaching into graph internals.
    """
    for ev in events:
        resp = ev.get("response") or {}
        if resp.get("type") != "searcher":
            continue
        if (resp.get("detail") or {}).get("status") == "UNANSWERED":
            return True
    return False


def _corpus_is_complete(events: list[dict[str, Any]]) -> bool:
    """Decide whether the corpus answer is good enough to skip web.

    Three conditions trigger fall-through (any one is sufficient):

      1. Final answer is empty (planner gave up).
      2. Final answer is the canonical REFUSAL_TEXT (HARD RULE #3).
      3. Any ``searcher_event`` marked its node UNANSWERED.

    Returns True only when none of those hold.
    """
    from .rag_planner_prompt import REFUSAL_TEXT

    answer = _final_answer(events)
    if not answer.strip():
        return False
    if answer == REFUSAL_TEXT:
        return False
    if _has_unanswered_searcher(events):
        return False
    return True


def _merge_final(corpus_answer: str, web_answer: str) -> str:
    """Concatenate the two final answers so both citation styles survive.

    The web UI renders both ``[[doc:chunk]]`` and ``[N]`` markers
    side-by-side; the goal here is just to make sure the merged string
    actually contains both — the test asserts on regex presence, not
    on layout. A clear visual separator (``Additional web sources:``)
    keeps the user-facing output legible.
    """
    corpus_answer = corpus_answer.strip()
    web_answer = web_answer.strip()
    if not corpus_answer:
        return web_answer
    if not web_answer:
        return corpus_answer
    return f"{corpus_answer}\n\nAdditional web sources:\n{web_answer}"


async def run_hybrid_solve(
    *,
    request: Request,
    user: JWTClaims,
    llm: LLMClient,
    req: SolveRequest,
    corpus: CorpusSearch,
    config: Settings | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Sequentially run corpus then (conditionally) web.

    Event ordering on the SSE wire:

      1. All corpus events, in order.
      2. (If web fall-through triggered) all web events, but the
         corpus terminal ``end_event`` is suppressed and replaced by
         a single merged ``end_event`` carrying citations from both
         sources.

    Yields the same event-dict shape as the other modes so the React
    ``AgentGraphPanel`` parser is mode-agnostic.
    """
    from ..config import settings as default_settings
    from .modes import run_corpus_solve

    cfg = config or default_settings

    # Phase 1: buffer corpus events. We cannot stream them blindly because
    # the corpus end_event becomes wrong if we fall through to web — the
    # final answer must reflect both sources.
    corpus_events: list[dict[str, Any]] = []
    async for ev in run_corpus_solve(
        request=request,
        user=user,
        llm=llm,
        req=req,
        corpus=corpus,
        config=cfg,
    ):
        corpus_events.append(ev)

    if _corpus_is_complete(corpus_events):
        # Happy path — corpus answered everything. Stream events as-is
        # and skip web entirely. The test_hybrid_all_answered case
        # asserts the web mock was NOT called when we hit this branch.
        for ev in corpus_events:
            yield ev
        return

    # Phase 2: corpus left at least one sub-Q UNANSWERED (or returned
    # the refusal sentence wholesale). Replay corpus body, then run
    # web for the same user question, then emit a merged end_event.
    corpus_answer = _final_answer(corpus_events)

    # Strip the trailing corpus end_event; we'll synthesise our own.
    for ev in corpus_events:
        if not _is_end_event(ev):
            yield ev

    # Run web for the original question; buffer to grab its terminal
    # answer and graph state for the merge.
    web_events: list[dict[str, Any]] = []
    async for ev in run_web_solve(
        request=request, llm=llm, req=req, config=cfg,
    ):
        web_events.append(ev)
    web_answer = _final_answer(web_events)

    # Stream the web body too — frontend wants the planner / searcher
    # ticks so the graph paints incrementally.
    for ev in web_events:
        if not _is_end_event(ev):
            yield ev

    # Synthesise the merged terminal frame. We clone the shape of the
    # web end_event (it owns the more recent graph state) and replace
    # the response text. If the web step somehow produced no end frame
    # (defence-in-depth — should never happen), fall back to the
    # corpus terminal.
    template = next(
        (ev for ev in reversed(web_events) if _is_end_event(ev)),
        next(
            (ev for ev in reversed(corpus_events) if _is_end_event(ev)),
            None,
        ),
    )
    merged_text = _merge_final(corpus_answer, web_answer)
    if template is None:
        # No graph state to reuse — emit a minimal end frame. This
        # path is unreachable in practice but keeps the contract.
        yield {
            "response": {
                "type": "planner",
                "state": "END",
                "response": merged_text,
            },
            "current_node": None,
        }
        return

    merged_response = dict(template.get("response") or {})
    merged_response["response"] = merged_text
    yield {**template, "response": merged_response}


__all__ = ["run_hybrid_solve"]
