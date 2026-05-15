"""Async web search.

Ports `mindsearch/agent/google_search.py` to httpx + asyncio. No threads,
no hardcoded keys (read from config), per-call timeout via asyncio.wait_for.

Two implementations:
- `GoogleWebSearch`: real Google Custom Search JSON API client.
- `StubWebSearch`: deterministic fake for tests.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Protocol, runtime_checkable

from .citation import SearchHit


_BLOCKLIST = ("youtube.com", "bilibili.com", "researchgate.net")
_BASE_URL = "https://www.googleapis.com/customsearch/v1"
_TAVILY_URL = "https://api.tavily.com/search"

log = logging.getLogger(__name__)


@runtime_checkable
class WebSearch(Protocol):
    async def search(self, query: str, *, topk: int = 3) -> list[SearchHit]:
        ...


class GoogleWebSearch:
    """Real Google Custom Search client over httpx."""

    def __init__(
        self,
        *,
        api_key: str,
        search_engine_id: str,
        timeout: float = 5.0,
        blocklist: tuple[str, ...] = _BLOCKLIST,
    ):
        if not api_key or not search_engine_id:
            raise RuntimeError(
                "GoogleWebSearch requires api_key and search_engine_id. "
                "Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID."
            )
        self._api_key = api_key
        self._cx = search_engine_id
        self._timeout = timeout
        self._blocklist = blocklist

    async def search(self, query: str, *, topk: int = 3) -> list[SearchHit]:
        try:
            import httpx  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "httpx not installed. Run: pip install 'httpx>=0.27'"
            ) from e

        params = {
            "key": self._api_key,
            "cx": self._cx,
            "q": query.strip("'\""),
            "num": min(10, topk * 2),
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await asyncio.wait_for(
                    client.get(_BASE_URL, params=params), timeout=self._timeout
                )
                resp.raise_for_status()
                payload = resp.json()
        except asyncio.TimeoutError:
            log.warning("GoogleWebSearch timeout after %ss for query=%r", self._timeout, query)
            return []
        except Exception as e:  # noqa: BLE001
            log.warning("GoogleWebSearch error for query=%r: %s", query, e)
            return []

        items = payload.get("items") or []
        hits: list[SearchHit] = []
        for it in items:
            url = it.get("link", "") or ""
            if not url or any(b in url for b in self._blocklist) or url.endswith(".pdf"):
                continue
            hits.append(
                SearchHit(
                    source="web",
                    title=it.get("title", "") or "",
                    snippet=it.get("snippet", "") or "",
                    url=url,
                    score=1.0,  # Google doesn't return scores; treat all as relevant
                )
            )
            if len(hits) >= topk:
                break
        return hits


class TavilyWebSearch:
    """Web search via Tavily (https://tavily.com).

    Tavily is an LLM-optimized search API: a single POST returns deduped,
    snippet-trimmed results with relevance scores. Used as the primary
    web search provider now that Google PSE is phasing out whole-web mode.
    """

    def __init__(
        self,
        *,
        api_key: str,
        timeout: float = 8.0,
        search_depth: str = "basic",
        blocklist: tuple[str, ...] = _BLOCKLIST,
    ):
        if not api_key:
            raise RuntimeError(
                "TavilyWebSearch requires api_key. Set TAVILY_API_KEY."
            )
        self._api_key = api_key
        self._timeout = timeout
        self._search_depth = search_depth
        self._blocklist = blocklist

    async def search(self, query: str, *, topk: int = 3) -> list[SearchHit]:
        try:
            import httpx  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "httpx not installed. Run: pip install 'httpx>=0.27'"
            ) from e

        payload = {
            "api_key": self._api_key,
            "query": query.strip("'\""),
            "search_depth": self._search_depth,
            "max_results": min(20, max(topk * 2, 5)),
            "include_answer": False,
            "include_raw_content": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await asyncio.wait_for(
                    client.post(_TAVILY_URL, json=payload), timeout=self._timeout
                )
                resp.raise_for_status()
                data = resp.json()
        except asyncio.TimeoutError:
            log.warning("TavilyWebSearch timeout after %ss for query=%r", self._timeout, query)
            return []
        except Exception as e:  # noqa: BLE001
            log.warning("TavilyWebSearch error for query=%r: %s", query, e)
            return []

        results = data.get("results") or []
        hits: list[SearchHit] = []
        for r in results:
            url = r.get("url", "") or ""
            if not url or any(b in url for b in self._blocklist) or url.endswith(".pdf"):
                continue
            hits.append(
                SearchHit(
                    source="web",
                    title=r.get("title", "") or "",
                    snippet=r.get("content", "") or "",
                    url=url,
                    score=float(r.get("score", 1.0) or 1.0),
                )
            )
            if len(hits) >= topk:
                break
        return hits


class DuckDuckGoWebSearch:
    """No-API-key web search via duckduckgo-search / ddgs.

    Useful when Google Custom Search keys are missing or rate-limited.
    Synchronous library — we run the call in a thread so the event loop
    doesn't block.
    """

    def __init__(self, *, timeout: float = 8.0, blocklist: tuple[str, ...] = _BLOCKLIST):
        try:
            from ddgs import DDGS  # type: ignore  # noqa: F401
        except ImportError as e:
            raise RuntimeError(
                "ddgs not installed. Run: pip install ddgs"
            ) from e
        self._timeout = timeout
        self._blocklist = blocklist

    async def search(self, query: str, *, topk: int = 3) -> list[SearchHit]:
        try:
            from ddgs import DDGS  # type: ignore
        except ImportError:
            return []

        def _blocking() -> list[SearchHit]:
            hits: list[SearchHit] = []
            try:
                with DDGS() as ddgs:
                    results = ddgs.text(query, max_results=max(topk * 2, 6))
                    for r in results or []:
                        url = r.get("href") or r.get("url") or ""
                        if not url or any(b in url for b in self._blocklist):
                            continue
                        if url.endswith(".pdf"):
                            continue
                        hits.append(
                            SearchHit(
                                source="web",
                                title=r.get("title", "") or "",
                                snippet=r.get("body", "") or r.get("snippet", "") or "",
                                url=url,
                                score=1.0,
                            )
                        )
                        if len(hits) >= topk:
                            break
            except Exception as e:  # noqa: BLE001
                log.warning("DuckDuckGoWebSearch error for query=%r: %s", query, e)
            return hits

        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_blocking), timeout=self._timeout
            )
        except asyncio.TimeoutError:
            log.warning("DuckDuckGoWebSearch timeout for query=%r", query)
            return []


class ChainedWebSearch:
    """Try providers in order, falling back when one returns no hits or errors.

    Tavily is rate-limit-friendly and reliable but has a monthly quota.
    DDG is free but Bing throttles container egress on finance-y queries.
    Chaining `[Tavily, DDG]` gives us Tavily's reliability with DDG as a
    free overflow when Tavily is unavailable.
    """

    def __init__(self, providers: list["WebSearch"]):
        if not providers:
            raise RuntimeError("ChainedWebSearch needs at least one provider.")
        self._providers = providers

    async def search(self, query: str, *, topk: int = 3) -> list[SearchHit]:
        last_err: Exception | None = None
        for idx, p in enumerate(self._providers):
            try:
                hits = await p.search(query, topk=topk)
            except Exception as e:  # noqa: BLE001
                last_err = e
                log.warning(
                    "ChainedWebSearch[%d] %s raised %s — trying next",
                    idx, p.__class__.__name__, e,
                )
                continue
            if hits:
                if idx > 0:
                    log.info(
                        "ChainedWebSearch[%d] %s served %d hit(s) (earlier providers empty)",
                        idx, p.__class__.__name__, len(hits),
                    )
                return hits
            log.info(
                "ChainedWebSearch[%d] %s returned 0 hits — trying next",
                idx, p.__class__.__name__,
            )
        if last_err is not None:
            log.warning("ChainedWebSearch exhausted; last error: %s", last_err)
        return []


class StubWebSearch:
    """Deterministic stub for tests.

    Use `StubWebSearch.canned({...})` to return preset hits per query,
    or `StubWebSearch.empty()` to always return [].
    """

    def __init__(self, responses: dict[str, list[dict]] | None = None):
        self._responses = responses or {}
        self.calls: list[str] = []

    @classmethod
    def canned(cls, responses: dict[str, list[dict]]) -> "StubWebSearch":
        return cls(responses)

    @classmethod
    def empty(cls) -> "StubWebSearch":
        return cls({})

    async def search(self, query: str, *, topk: int = 3) -> list[SearchHit]:
        self.calls.append(query)
        raw = self._responses.get(query)
        if raw is None:
            # Try substring match so tests don't have to be exact.
            for key, val in self._responses.items():
                if key.lower() in query.lower() or query.lower() in key.lower():
                    raw = val
                    break
        if not raw:
            return []
        return [
            SearchHit(
                source="web",
                title=r.get("title", ""),
                snippet=r.get("snippet", ""),
                url=r.get("url"),
                score=r.get("score", 1.0),
            )
            for r in raw[:topk]
        ]


__all__ = [
    "ChainedWebSearch",
    "DuckDuckGoWebSearch",
    "GoogleWebSearch",
    "StubWebSearch",
    "TavilyWebSearch",
    "WebSearch",
]
