"""Hybrid retrieval stub.

Port of Arkon `apps/api/src/lib/search/` (BM25 + vector + RRF) — kept as
a stub until KnowledgeSearchBackend gets a corpus.

When a corpus arrives, swap `NullCorpusSearch.search()` for a real implementation
backed by pgvector. The `CorpusSearch` Protocol is the only thing the
retriever depends on, so the retriever code doesn't change.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .citation import SearchHit


@runtime_checkable
class CorpusSearch(Protocol):
    async def search(
        self,
        query: str,
        *,
        collection_ids: list[str] | None = None,
        topk: int = 5,
    ) -> list[SearchHit]:
        ...


class NullCorpusSearch:
    """No corpus → always returns []. The retriever will fall back to web."""

    async def search(
        self,
        query: str,
        *,
        collection_ids: list[str] | None = None,
        topk: int = 5,
    ) -> list[SearchHit]:
        return []


__all__ = ["CorpusSearch", "NullCorpusSearch"]
