"""Source-routing retrieval.

Port of Arkon `apps/api/src/services/advanced-rag.ts:565-581`:
- Always try RAG first.
- If top RAG score < `score_threshold` OR no hits, AND `web_fallback=true`,
  also run web search and merge.
- Return a typed `RetrievalResult` with `source` indicating where hits came from.

The decision is **in code, not in the LLM**. The LLM doesn't get to "choose"
between RAG and web in default modes — this function does.
"""

from __future__ import annotations

from dataclasses import dataclass

from .citation import Citation, SearchHit, Source
from .hybrid_search import CorpusSearch, NullCorpusSearch
from .web_search import StubWebSearch, WebSearch


@dataclass
class RetrievalResult:
    """The aggregated retrieval output for one sub-question."""

    query: str
    hits: list[SearchHit]
    source: Source

    def citations(self, *, start_index: int = 1) -> list[Citation]:
        """Convert hits to numbered citations starting at `start_index`."""
        out: list[Citation] = []
        for i, h in enumerate(self.hits):
            out.append(
                Citation(
                    index=start_index + i,
                    source=h.source,
                    title=h.title,
                    url=h.url,
                    document_id=h.document_id,
                    snippet=h.snippet,
                    score=h.score,
                )
            )
        return out

    def context_block(self) -> str:
        """A markdown-ish block the searcher LLM can read."""
        if not self.hits:
            return "(no results)"
        lines: list[str] = []
        for i, h in enumerate(self.hits, 1):
            head = h.title or h.url or h.document_id or f"result {i}"
            tag = "[rag]" if h.source == "rag" else "[web]"
            body = (h.snippet or h.chunk_text or "").strip()
            lines.append(f"[{i}] {tag} {head}\n    {body}")
        return "\n".join(lines)


class Retriever:
    """Routes a query through RAG → web fallback.

    Either `rag` or `web` may be None; in that case that source is skipped.
    """

    def __init__(
        self,
        *,
        rag: CorpusSearch | None = None,
        web: WebSearch | None = None,
        score_threshold: float = 0.4,
        topk: int = 5,
    ):
        self._rag = rag if rag is not None else NullCorpusSearch()
        self._web = web
        self._threshold = score_threshold
        self._topk = topk

    async def advanced_retrieve(
        self,
        query: str,
        *,
        web_fallback: bool,
        collection_ids: list[str] | None = None,
    ) -> RetrievalResult:
        rag_hits = await self._rag.search(
            query, collection_ids=collection_ids, topk=self._topk
        )
        rag_top_score = max((h.score for h in rag_hits), default=0.0)
        has_good_rag = bool(rag_hits) and rag_top_score >= self._threshold

        if has_good_rag and not web_fallback:
            return RetrievalResult(query=query, hits=rag_hits, source="rag")

        if has_good_rag and web_fallback:
            # Only escalate to web if RAG is weak; here it's strong → stay on RAG.
            return RetrievalResult(query=query, hits=rag_hits, source="rag")

        # RAG was empty or weak.
        if not web_fallback or self._web is None:
            return RetrievalResult(
                query=query,
                hits=rag_hits,
                source="rag" if rag_hits else "none",
            )

        web_hits = await self._web.search(query, topk=self._topk)
        merged: list[SearchHit] = []
        seen_urls: set[str] = set()
        for h in rag_hits + web_hits:
            key = h.url or h.document_id
            if key and key in seen_urls:
                continue
            if key:
                seen_urls.add(key)
            merged.append(h)

        if rag_hits and web_hits:
            source: Source = "both"
        elif web_hits:
            source = "web"
        elif rag_hits:
            source = "rag"
        else:
            source = "none"
        return RetrievalResult(query=query, hits=merged, source=source)


__all__ = ["RetrievalResult", "Retriever"]
