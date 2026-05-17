# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Unit tests for the pre-planner RAG bootstrap (TAG-CR follow-up).

Covers the four contracts the rest of the system relies on:

  1. ``_dedupe_hits`` collapses multiple chunks of the same document
     into a single ``BootstrapDoc`` and keeps the highest score.
  2. ``render_context_block`` emits a well-formed ``<document_context>``
     block when there are docs, and an empty string when there aren't.
  3. ``bootstrap_document_context`` returns ``None`` when the corpus
     search raises (best-effort failure mode).
  4. ``bootstrap_document_context`` returns ``None`` when the corpus
     search returns zero hits.

No DB / LLM / embedding dependencies — the corpus is a stub.
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_search.agent_v2.orchestrator.rag_bootstrap import (
    BootstrapDoc,
    BootstrapResult,
    _dedupe_hits,
    bootstrap_document_context,
    render_context_block,
)
from agent_search.agent_v2.rag.corpus_search import CorpusHit


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _hit(
    *,
    doc_id: str,
    chunk_id: str,
    score: float,
    title: str | None = "Doc",
    summary: str | None = "Doc summary",
) -> CorpusHit:
    return CorpusHit(
        doc_id=doc_id,
        chunk_id=chunk_id,
        collection_id="col1",
        score=score,
        text="some chunk text",
        title=title,
        source_url=None,
        document_summary=summary,
    )


class StubCorpus:
    """Minimal ``CorpusSearch``-shaped stub for the bootstrap tests."""

    def __init__(
        self,
        hits: list[CorpusHit] | None = None,
        *,
        raises: type[Exception] | None = None,
    ) -> None:
        self._hits = hits or []
        self._raises = raises
        self.search_calls: list[dict[str, Any]] = []

    async def search(
        self,
        query: str,
        *,
        tenant_id: str,
        collection_ids: list[str],
        top_k: int,
    ) -> list[CorpusHit]:
        self.search_calls.append(
            {
                "query": query,
                "tenant_id": tenant_id,
                "collection_ids": collection_ids,
                "top_k": top_k,
            }
        )
        if self._raises is not None:
            raise self._raises("boom")
        return self._hits


# ----------------------------------------------------------------------
# _dedupe_hits
# ----------------------------------------------------------------------


def test_dedupe_collapses_chunks_to_one_per_doc() -> None:
    hits = [
        _hit(doc_id="d1", chunk_id="c1", score=0.4),
        _hit(doc_id="d1", chunk_id="c2", score=0.9),
        _hit(doc_id="d1", chunk_id="c3", score=0.7),
        _hit(doc_id="d2", chunk_id="c1", score=0.5),
    ]
    docs = _dedupe_hits(hits)
    by_id = {d.doc_id: d for d in docs}
    assert set(by_id) == {"d1", "d2"}
    # d1 keeps its highest-scoring chunk's score.
    assert by_id["d1"].score == pytest.approx(0.9)
    assert by_id["d2"].score == pytest.approx(0.5)


def test_dedupe_returns_score_desc() -> None:
    hits = [
        _hit(doc_id="lo", chunk_id="c1", score=0.1),
        _hit(doc_id="hi", chunk_id="c1", score=0.9),
        _hit(doc_id="mid", chunk_id="c1", score=0.5),
    ]
    docs = _dedupe_hits(hits)
    assert [d.doc_id for d in docs] == ["hi", "mid", "lo"]


def test_dedupe_empty_input() -> None:
    assert _dedupe_hits([]) == []


# ----------------------------------------------------------------------
# render_context_block
# ----------------------------------------------------------------------


def test_render_empty_result_returns_empty_string() -> None:
    result = BootstrapResult(docs=(), raw_hits=())
    assert result.is_empty is True
    assert render_context_block(result) == ""


def test_render_block_has_tags_and_summaries() -> None:
    docs = (
        BootstrapDoc(
            doc_id="d1", title="Deploy Guide", summary="How to deploy.", score=0.9
        ),
        BootstrapDoc(
            doc_id="d2", title="Setup Notes", summary="Local setup.", score=0.7
        ),
    )
    result = BootstrapResult(docs=docs, raw_hits=())
    block = render_context_block(result)
    assert block.startswith("<document_context>")
    assert block.rstrip().endswith("</document_context>")
    # Each doc is listed with title + summary.
    assert "[d1] Deploy Guide" in block
    assert "Summary: How to deploy." in block
    assert "[d2] Setup Notes" in block
    assert "Summary: Local setup." in block
    # Citation guard: planner is told NOT to cite from this section.
    assert "Do NOT cite" in block or "do not cite" in block.lower()


def test_render_block_handles_missing_title_and_summary() -> None:
    docs = (BootstrapDoc(doc_id="d3", title=None, summary=None, score=0.4),)
    result = BootstrapResult(docs=docs, raw_hits=())
    block = render_context_block(result)
    # Falls back to doc_id as title and a placeholder summary line.
    assert "[d3] d3" in block
    assert "Summary: (no summary available)" in block


# ----------------------------------------------------------------------
# bootstrap_document_context
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_returns_none_on_exception() -> None:
    corpus = StubCorpus(raises=RuntimeError)
    result = await bootstrap_document_context(
        corpus=corpus,
        user_question="anything",
        tenant_id="t1",
        collection_ids=["col1"],
        top_k=5,
    )
    assert result is None
    # We still called search exactly once before catching the failure.
    assert len(corpus.search_calls) == 1


@pytest.mark.asyncio
async def test_bootstrap_returns_none_on_empty_hits() -> None:
    corpus = StubCorpus(hits=[])
    result = await bootstrap_document_context(
        corpus=corpus,
        user_question="anything",
        tenant_id="t1",
        collection_ids=["col1"],
        top_k=5,
    )
    assert result is None


@pytest.mark.asyncio
async def test_bootstrap_returns_deduped_docs_on_hits() -> None:
    corpus = StubCorpus(
        hits=[
            _hit(doc_id="d1", chunk_id="c1", score=0.6, title="A"),
            _hit(doc_id="d1", chunk_id="c2", score=0.8, title="A"),
            _hit(doc_id="d2", chunk_id="c1", score=0.5, title="B"),
        ]
    )
    result = await bootstrap_document_context(
        corpus=corpus,
        user_question="how to deploy",
        tenant_id="tenantA",
        collection_ids=["col1", "col2"],
        top_k=3,
    )
    assert result is not None
    assert not result.is_empty
    assert len(result.docs) == 2
    # raw_hits is the full unfiltered list — useful for downstream
    # citation reconstruction.
    assert len(result.raw_hits) == 3
    # The corpus call was threaded with the caller's tenant + collections.
    call = corpus.search_calls[0]
    assert call["query"] == "how to deploy"
    assert call["tenant_id"] == "tenantA"
    assert call["collection_ids"] == ["col1", "col2"]
    assert call["top_k"] == 3
