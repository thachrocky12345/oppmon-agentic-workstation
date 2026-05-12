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
from .rag import DuckDuckGoWebSearch, GoogleWebSearch, Retriever, WebSearch
from .rag.hybrid_search import NullCorpusSearch


log = logging.getLogger(__name__)


class SolveV2Request(BaseModel):
    """Request schema for /solve_v2. Ports Arkon `rag-chat.ts:32-42`."""

    inputs: str | list[dict[str, Any]]
    enable_tools: bool = False
    web_fallback: bool = False
    collection_ids: list[str] = Field(default_factory=list)


def _build_web_search() -> WebSearch | None:
    """Build a web search client.

    Priority:
      1. Google Custom Search (if keys set AND not flagged as broken).
      2. DuckDuckGo (no key needed) — fallback so local dev works out of the box.
      3. None — caller must handle gracefully.

    Set `WEB_SEARCH_PROVIDER=duckduckgo` to skip Google explicitly even when
    keys are present (useful when the Google key is rate-limited).
    """
    s = default_settings
    provider = (s.web_search_provider or "").lower()

    if provider == "duckduckgo":
        return DuckDuckGoWebSearch(timeout=s.google_search_timeout)

    if provider == "google" or (
        provider == "" and s.google_search_api_key and s.google_search_engine_id
    ):
        try:
            return GoogleWebSearch(
                api_key=s.google_search_api_key,
                search_engine_id=s.google_search_engine_id,
                timeout=s.google_search_timeout,
            )
        except Exception as e:  # noqa: BLE001
            log.warning("GoogleWebSearch init failed (%s) — falling back to DDG", e)

    # Default: DuckDuckGo (no API key required).
    try:
        return DuckDuckGoWebSearch(timeout=s.google_search_timeout)
    except Exception as e:  # noqa: BLE001
        log.warning("DuckDuckGoWebSearch unavailable: %s — web search disabled.", e)
        return None


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
