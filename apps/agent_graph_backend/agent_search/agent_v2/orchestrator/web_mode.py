# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-62 — Web-mode orchestrator entrypoint.

Extracted from :mod:`agent_v2.app` so the legacy ``/solve_v2`` handler
and the new authenticated ``/solve`` (TAG-58 + TAG-62) both drive the
*same* :class:`PlannerAgent` instance instead of forking the wiring.

The ticket calls this out explicitly:

    Web orchestrator double-extracted with subtle drift -> one extraction,
    both routes reuse.

What ``run_web_solve`` is **not**:

  * A new planner. It re-uses :class:`PlannerAgent` (the existing web
    planner) verbatim — we extract only the *construction* of its
    dependencies (LLMClient, Retriever, WebSearch, NullCorpusSearch),
    not its loop body.
  * A corpus-aware planner. Corpus knowledge lives in
    :func:`agent_v2.orchestrator.modes.run_corpus_solve` (TAG-61).
    The hybrid orchestrator (:mod:`.hybrid_mode`) is the one that
    composes both.

Why ``user`` is absent from the signature:
    Web mode never touches the corpus, so we do not need the tenant id
    embedded in :class:`JWTClaims`. Keeping the surface area minimal
    makes the mode-dispatch table in :func:`.modes.run_solve` easier to
    audit.

``request`` is forwarded as part of the contract for symmetry with the
corpus/hybrid entries; a follow-up will poll ``request.is_disconnected``
between iterations.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import Request

    from ..api.solve_request import SolveRequest
    from ..config import Settings
    from ..llm.base import LLMClient


async def run_web_solve(
    *,
    request: Request,
    llm: LLMClient,
    req: SolveRequest,
    config: Settings | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Run the existing :class:`PlannerAgent` against a web-only retriever.

    Yields SSE-ready event dicts identical in shape to
    ``run_corpus_solve`` (``planner_event`` / ``searcher_event`` /
    ``warning_event`` / ``end_event``) so the React ``AgentGraphPanel``
    renders without branching on mode.

    The retriever is composed with:

      * ``rag=NullCorpusSearch()`` — no corpus side in web mode
      * ``web=build_web_search()`` — the shared factory (TAG-62 extraction)
    """
    from ..config import settings as default_settings
    from ..rag import Retriever
    from ..rag.hybrid_search import NullCorpusSearch
    from ..rag.web_search_factory import build_web_search
    from .planner import PlannerAgent

    cfg = config or default_settings
    _ = request  # reserved for is_disconnected polling in a follow-up

    retriever = Retriever(
        rag=NullCorpusSearch(),
        web=build_web_search(cfg),
        score_threshold=cfg.rag_score_threshold,
        topk=cfg.rag_top_k,
    )
    planner = PlannerAgent(llm=llm, retriever=retriever, config=cfg)

    # TAG-63: explicit (question, history) split — the ticket spec
    # says ``/solve`` passes ``req.messages[:-1]`` as history and
    # ``req.messages[-1].content`` as ``question``. The planner trims
    # and (if needed) summarises history before threading it into the
    # LLM call; we forward verbatim here.
    question = req.messages[-1].content
    history = list(req.messages[:-1])

    async for event in planner.run(
        question=question,
        history=history,
        enable_tools=req.enable_tools,
        web_fallback=req.web_fallback,
        collection_ids=req.collection_ids,
    ):
        yield event


__all__ = ["run_web_solve"]
