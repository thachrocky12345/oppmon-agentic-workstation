"""TAG-62 — Shared web-search provider factory.

Extracted from :mod:`agent_v2.app` so the legacy ``/solve_v2`` handler
(``mount_v2``) and the new ``run_web_solve`` orchestrator in
:mod:`agent_v2.orchestrator.web_mode` build their :class:`WebSearch`
adapter from the **same** code path. The ticket calls this out
explicitly:

    Web orchestrator double-extracted with subtle drift → one
    extraction, both routes reuse.

Resolution rules (unchanged from the previous in-line ``_build_web_search``):

* ``WEB_SEARCH_PROVIDER`` empty / "auto" → chain
  ``[Tavily?, Google?, DDG]`` in that priority order. Question-marked
  providers are skipped when their API keys are missing.
* ``WEB_SEARCH_PROVIDER=tavily`` → ``[Tavily, DDG]`` (DDG safety net).
* ``WEB_SEARCH_PROVIDER=google`` → ``[Google, DDG]``.
* ``WEB_SEARCH_PROVIDER=duckduckgo`` → ``[DDG]``.

Returns ``None`` when no provider can be constructed (caller decides
whether to fail or operate without web fallback).
"""

from __future__ import annotations

import logging

from ..config import Settings, settings as default_settings
from . import (
    ChainedWebSearch,
    DuckDuckGoWebSearch,
    GoogleWebSearch,
    TavilyWebSearch,
    WebSearch,
)

log = logging.getLogger(__name__)


def _try_tavily(s: Settings) -> WebSearch | None:
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


def _try_ddg(s: Settings) -> WebSearch | None:
    try:
        return DuckDuckGoWebSearch(timeout=s.google_search_timeout)
    except Exception as e:  # noqa: BLE001
        log.warning("DuckDuckGoWebSearch init failed: %s", e)
        return None


def _try_google(s: Settings) -> WebSearch | None:
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
    real = [c for c in candidates if c is not None]
    if not real:
        return None
    if len(real) == 1:
        return real[0]
    return ChainedWebSearch(real)


def build_web_search(s: Settings | None = None) -> WebSearch | None:
    """Build a :class:`WebSearch` from :class:`Settings`.

    Accepts an optional ``Settings`` to make this trivially testable.
    Defaults to the module-level singleton, matching the previous
    ``_build_web_search`` behaviour in :mod:`agent_v2.app`.
    """
    s = s or default_settings
    provider = (s.web_search_provider or "").lower()

    if provider == "duckduckgo":
        return _try_ddg(s)
    if provider == "tavily":
        # Tavily explicit but keep DDG as a free safety net for quota / outages.
        return _chain(_try_tavily(s), _try_ddg(s))
    if provider == "google":
        return _chain(_try_google(s), _try_ddg(s))
    # Auto: chain everything available in priority order.
    return _chain(_try_tavily(s), _try_google(s), _try_ddg(s))


__all__ = ["build_web_search"]
