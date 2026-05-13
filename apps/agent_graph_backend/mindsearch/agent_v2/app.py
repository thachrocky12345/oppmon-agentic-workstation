"""FastAPI integration for the v2 reactive agent.

Mounts `/solve_v2` on the same app that serves the legacy `/solve` endpoint.
The legacy endpoint stays untouched during the cutover so we can A/B test.
Once v2 is validated, swap the route name and delete the legacy code.

Usage from `mindsearch/app.py` (legacy entry point):

    from mindsearch.agent_v2.app import mount_v2
    mount_v2(app)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .config import settings as default_settings
from .guardrails import check_user_input
from .llm import create_llm_client
from .orchestrator.planner import PlannerAgent
from .rag import (
    ChainedWebSearch,
    DuckDuckGoWebSearch,
    GoogleWebSearch,
    Retriever,
    TavilyWebSearch,
    WebSearch,
)
from .rag.hybrid_search import NullCorpusSearch


log = logging.getLogger(__name__)


class SolveV2Request(BaseModel):
    """Request schema for /solve_v2. Ports Arkon `rag-chat.ts:32-42`."""

    inputs: str | list[dict[str, Any]]
    enable_tools: bool = False
    web_fallback: bool = False
    collection_ids: list[str] = Field(default_factory=list)


def _try_tavily() -> WebSearch | None:
    s = default_settings
    if not s.tavily_api_key:
        return None
    try:
        return TavilyWebSearch(
            api_key=s.tavily_api_key,
            timeout=s.tavily_search_timeout,
            search_depth=s.tavily_search_depth,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("TavilyWebSearch init failed: %s", e)
        return None


def _try_ddg() -> WebSearch | None:
    s = default_settings
    try:
        return DuckDuckGoWebSearch(timeout=s.google_search_timeout)
    except Exception as e:  # noqa: BLE001
        log.warning("DuckDuckGoWebSearch init failed: %s", e)
        return None


def _try_google() -> WebSearch | None:
    s = default_settings
    if not (s.google_search_api_key and s.google_search_engine_id):
        return None
    try:
        return GoogleWebSearch(
            api_key=s.google_search_api_key,
            search_engine_id=s.google_search_engine_id,
            timeout=s.google_search_timeout,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("GoogleWebSearch init failed: %s", e)
        return None


def _chain(*candidates: WebSearch | None) -> WebSearch | None:
    """Wrap providers in a ChainedWebSearch so we try them in order at call time."""
    real = [c for c in candidates if c is not None]
    if not real:
        return None
    if len(real) == 1:
        return real[0]
    return ChainedWebSearch(real)


def _build_web_search() -> WebSearch | None:
    """Build a web search client with fallback chaining.

    Auto (WEB_SEARCH_PROVIDER unset or empty):
      Chain = [Tavily (if key), Google (if keys), DuckDuckGo]
      Tavily is tried first per request; if it returns no hits OR raises,
      we fall through to Google, then DDG. This gives reliability under
      Tavily quota exhaustion or upstream errors.

    Explicit overrides:
      WEB_SEARCH_PROVIDER=tavily      -> [Tavily, DDG]    (DDG safety net)
      WEB_SEARCH_PROVIDER=google      -> [Google, DDG]
      WEB_SEARCH_PROVIDER=duckduckgo  -> [DDG]            (DDG only)

    Returns None if no provider can be built (caller must handle gracefully).
    """
    s = default_settings
    provider = (s.web_search_provider or "").lower()

    if provider == "duckduckgo":
        return _try_ddg()

    if provider == "tavily":
        # Tavily explicit but keep DDG as a free safety net for quota / outages.
        return _chain(_try_tavily(), _try_ddg())

    if provider == "google":
        return _chain(_try_google(), _try_ddg())

    # Auto: chain everything available in priority order.
    return _chain(_try_tavily(), _try_google(), _try_ddg())


def mount_v2(app: FastAPI) -> None:
    """Add /solve_v2 to an existing FastAPI app."""

    @app.post("/solve_v2")
    async def solve_v2(request: SolveV2Request):  # noqa: ANN201
        # Surface (don't block on) prompt-injection heuristics.
        user_text = (
            request.inputs
            if isinstance(request.inputs, str)
            else next(
                (
                    m.get("content", "")
                    for m in reversed(request.inputs)
                    if m.get("role") == "user"
                ),
                "",
            )
        )
        injection_warnings = check_user_input(user_text or "")
        for w in injection_warnings:
            log.info("guardrail: %s", w)

        llm = create_llm_client()
        retriever = Retriever(
            rag=NullCorpusSearch(),  # swap for real CorpusSearch when corpus exists
            web=_build_web_search(),
            score_threshold=default_settings.rag_score_threshold,
            topk=default_settings.rag_top_k,
        )
        planner = PlannerAgent(llm=llm, retriever=retriever)

        async def event_stream():
            try:
                async for event in planner.run(
                    inputs=request.inputs,
                    enable_tools=request.enable_tools,
                    web_fallback=request.web_fallback,
                    collection_ids=request.collection_ids,
                ):
                    yield {"data": json.dumps(event, ensure_ascii=False)}
            except Exception as exc:  # noqa: BLE001 — surface to client
                log.exception("solve_v2 error")
                yield {
                    "data": json.dumps(
                        {
                            "error": {
                                "msg": "Internal error in solve_v2",
                                "details": str(exc),
                            }
                        },
                        ensure_ascii=False,
                    )
                }

        return EventSourceResponse(event_stream())


__all__ = ["SolveV2Request", "mount_v2"]
