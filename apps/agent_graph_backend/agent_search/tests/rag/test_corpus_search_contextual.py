# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-CR Phase 3.5 — tests for Contextual Retrieval in corpus_search + retriever.

Seven mandated cases (in order):

1. ``CorpusHit`` accepts the new optional fields and defaults them to None;
   ``extra='forbid'`` still rejects unknown keys.
2. ``_row_to_hit_dict`` projects ``document_summary`` / ``context_prefix`` /
   ``section_path`` / ``page_number`` when the row carries them and returns
   ``None`` when absent — both for plain-dict rows (test fixtures) and for
   asyncpg.Record-like rows (membership-only access).
3. ``_BM25_SQL`` indexes ``c.content_search``, not ``c.content``.
4. ``_VEC_SQL`` projection includes ``d.summary AS document_summary``.
5. **Cross-tenant isolation (MANDATORY).** When ``pg_fetch_all`` is stubbed
   to return Tenant A's rows and ``PgCorpusSearch.search`` is called with
   ``tenant_id='B'``, the stub must have been invoked with ``'B'`` in the
   tenant slot. Pins both ``c.tenant_id`` and ``d.tenant_id`` filters in
   place — if either is dropped from the SQL the planner could see
   Tenant A's chunk text plus the new ``document_summary`` payload.
6. ``context_block(show_context=False)`` omits ``Doc summary:`` /
   ``Context:`` lines even when the hits carry them.
7. ``context_block(show_context=True)`` renders them when non-null and
   silently skips when null (NULL-tolerant rollback path).
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from agent_search.agent_v2.rag import corpus_search as cs_mod
from agent_search.agent_v2.rag.citation import SearchHit
from agent_search.agent_v2.rag.corpus_search import (
    CorpusHit,
    PgCorpusSearch,
    _BM25_SQL,
    _VEC_SQL,
    _row_to_hit_dict,
)
from agent_search.agent_v2.rag.retriever import RetrievalResult


# ---------------------------------------------------------------------------
# 1. CorpusHit accepts new optional fields; extra='forbid' still raises.
# ---------------------------------------------------------------------------


def test_corpus_hit_accepts_new_optional_fields_with_defaults() -> None:
    h = CorpusHit(
        doc_id="d1",
        chunk_id="c1",
        collection_id="col1",
        score=0.5,
        text="body",
    )
    assert h.document_summary is None
    assert h.context_prefix is None
    assert h.section_path is None
    assert h.page_number is None


def test_corpus_hit_round_trips_contextual_fields() -> None:
    h = CorpusHit(
        doc_id="d1",
        chunk_id="c1",
        collection_id="col1",
        score=0.5,
        text="body",
        document_summary="A doc about pricing.",
        context_prefix="Pricing section.",
        section_path="Pricing > Tiers",
        page_number=4,
    )
    assert h.document_summary == "A doc about pricing."
    assert h.context_prefix == "Pricing section."
    assert h.section_path == "Pricing > Tiers"
    assert h.page_number == 4


def test_corpus_hit_rejects_unknown_field() -> None:
    with pytest.raises(ValidationError):
        CorpusHit(
            doc_id="d1",
            chunk_id="c1",
            collection_id="col1",
            score=0.5,
            text="body",
            never_heard_of_this=True,  # type: ignore[call-arg]
        )


# ---------------------------------------------------------------------------
# 2. _row_to_hit_dict projects new columns; returns None when absent.
# ---------------------------------------------------------------------------


def _full_dict_row(**overrides: Any) -> dict[str, Any]:
    base = {
        "chunk_id": "c1",
        "doc_id": "d1",
        "collection_id": "col1",
        "text": "body",
        "title": "Doc title",
        "metadata": {"k": "v"},
        "document_summary": "summary text",
        "context_prefix": "ctx prefix",
        "section_path": "S1 > S1.2",
        "page_number": 7,
    }
    base.update(overrides)
    return base


def test_row_to_hit_dict_projects_contextual_fields() -> None:
    out = _row_to_hit_dict(_full_dict_row())
    assert out["document_summary"] == "summary text"
    assert out["context_prefix"] == "ctx prefix"
    assert out["section_path"] == "S1 > S1.2"
    assert out["page_number"] == 7


def test_row_to_hit_dict_returns_none_for_missing_contextual_fields() -> None:
    # Mirrors pre-contextualizer rows / older fixtures.
    legacy_row = {
        "chunk_id": "c1",
        "doc_id": "d1",
        "collection_id": "col1",
        "text": "body",
        "title": None,
        "metadata": {},
    }
    out = _row_to_hit_dict(legacy_row)
    assert out["document_summary"] is None
    assert out["context_prefix"] is None
    assert out["section_path"] is None
    assert out["page_number"] is None


class _RecordLike:
    """Mimics asyncpg.Record: ``__getitem__`` + ``__contains__`` only.

    Specifically lacks ``.get`` so the ``_row_to_hit_dict`` branch that
    falls through to ``in`` membership checks is exercised.
    """

    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def __contains__(self, key: str) -> bool:
        return key in self._data


def test_row_to_hit_dict_handles_record_like_rows_with_fields() -> None:
    out = _row_to_hit_dict(_RecordLike(_full_dict_row()))
    assert out["document_summary"] == "summary text"
    assert out["page_number"] == 7


def test_row_to_hit_dict_handles_record_like_rows_without_fields() -> None:
    row = _RecordLike(
        {
            "chunk_id": "c1",
            "doc_id": "d1",
            "collection_id": "col1",
            "text": "body",
            "title": None,
            "metadata": {},
        }
    )
    out = _row_to_hit_dict(row)
    assert out["document_summary"] is None
    assert out["context_prefix"] is None
    assert out["section_path"] is None
    assert out["page_number"] is None


# ---------------------------------------------------------------------------
# 3. _BM25_SQL indexes content_search, not c.content.
# ---------------------------------------------------------------------------


def test_bm25_sql_indexes_content_search_column() -> None:
    # The generated stored column is what should appear in the tsvector
    # expression. ``c.content`` standalone in the tsvector argument would
    # mean we lost the prefix contribution.
    assert "to_tsvector('english', c.content_search)" in _BM25_SQL
    # Tenant filter (both halves) must remain.
    assert "c.tenant_id = $2" in _BM25_SQL
    assert "d.tenant_id = $2" in _BM25_SQL


def test_bm25_sql_projects_contextual_fields() -> None:
    assert "d.summary           AS document_summary" in _BM25_SQL
    assert "c.context_prefix    AS context_prefix" in _BM25_SQL
    assert "c.section_path      AS section_path" in _BM25_SQL
    assert "c.page_number       AS page_number" in _BM25_SQL


# ---------------------------------------------------------------------------
# 4. _VEC_SQL projection includes d.summary AS document_summary.
# ---------------------------------------------------------------------------


def test_vec_sql_projects_contextual_fields() -> None:
    assert "d.summary           AS document_summary" in _VEC_SQL
    assert "c.context_prefix    AS context_prefix" in _VEC_SQL
    assert "c.section_path      AS section_path" in _VEC_SQL
    assert "c.page_number       AS page_number" in _VEC_SQL
    # Tenant filter (both halves) must remain.
    assert "c.tenant_id = $2" in _VEC_SQL
    assert "d.tenant_id = $2" in _VEC_SQL


# ---------------------------------------------------------------------------
# 5. MANDATORY cross-tenant test.
# ---------------------------------------------------------------------------


class _FakeEmbed:
    """Embeds anything to a fixed 1536-dim vector — tests don't care."""

    async def embed_query(self, _q: str) -> list[float]:
        return [0.0] * 1536


@pytest.mark.asyncio
async def test_cross_tenant_filter_flows_into_pg_fetch_all(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When caller asks as Tenant B, the SQL parameter must be 'B'.

    Pins both ``c.tenant_id = $2`` and ``d.tenant_id = $2`` in place —
    if either filter is dropped from the SQL the planner could see
    Tenant A's chunk text plus the new ``document_summary`` payload.
    """
    seen_calls: list[dict[str, Any]] = []

    async def _stub(sql: str, *params: Any) -> list[dict[str, Any]]:
        # Capture the tenant slot ($2 is the second user-bound param).
        seen_calls.append({"sql": sql, "tenant_param": params[1], "params": params})
        # Return tenant_A-owned rows (a malicious response). The test
        # only inspects the call params, not the rows — but the realistic
        # shape proves the SQL projection still parses.
        return [
            _full_dict_row(
                doc_id="d_tenant_a",
                chunk_id="c_tenant_a",
                text="Tenant A's secret pricing.",
                document_summary="Tenant A: pricing playbook.",
                context_prefix="Tenant A executive summary.",
            )
        ]

    monkeypatch.setattr(cs_mod, "pg_fetch_all", _stub)

    pg = PgCorpusSearch(embed=_FakeEmbed())
    await pg.search(
        "pricing",
        tenant_id="B",
        collection_ids=["col_tenant_a"],
        top_k=5,
    )

    # Both BM25 and VEC SQLs were called — at least 2 invocations.
    assert len(seen_calls) >= 2
    # The tenant slot ($2) must be 'B' in every call. If it was 'A' or
    # the empty string, isolation has regressed.
    for call in seen_calls:
        assert call["tenant_param"] == "B", (
            f"PgCorpusSearch leaked tenant scope: pg_fetch_all called "
            f"with tenant_id={call['tenant_param']!r} when caller asked "
            f"as 'B'. SQL: {call['sql'][:120]}..."
        )


@pytest.mark.asyncio
async def test_search_short_circuits_on_empty_collections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Empty ``collection_ids`` must never reach pg_fetch_all."""
    called = False

    async def _stub(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
        nonlocal called
        called = True
        return []

    monkeypatch.setattr(cs_mod, "pg_fetch_all", _stub)
    pg = PgCorpusSearch(embed=_FakeEmbed())
    out = await pg.search("any", tenant_id="B", collection_ids=[], top_k=5)
    assert out == []
    assert called is False


@pytest.mark.asyncio
async def test_search_rejects_empty_tenant_id() -> None:
    pg = PgCorpusSearch(embed=_FakeEmbed())
    with pytest.raises(RuntimeError, match="tenant_id is required"):
        await pg.search("q", tenant_id="", collection_ids=["c"], top_k=5)


# ---------------------------------------------------------------------------
# 6 + 7. context_block honours show_context and is NULL-tolerant.
# ---------------------------------------------------------------------------


def _hit_with_context(**overrides: Any) -> SearchHit:
    base: dict[str, Any] = {
        "source": "rag",
        "title": "Pricing FAQ",
        "snippet": "Tier 1 starts at $X/seat/month.",
        "url": None,
        "document_id": "doc_alpha",
        "chunk_text": None,
        "score": 0.8,
        "document_summary": "FAQ about pricing tiers.",
        "context_prefix": "From the Pricing > Tiers section.",
        "section_path": "Pricing > Tiers",
        "page_number": 3,
    }
    base.update(overrides)
    return SearchHit(**base)


def test_context_block_show_context_false_omits_contextual_lines() -> None:
    result = RetrievalResult(
        query="how much does tier 1 cost?",
        hits=[_hit_with_context()],
        source="rag",
    )
    rendered = result.context_block(show_context=False)
    assert "Doc summary:" not in rendered
    assert "Context:" not in rendered
    # Body still rendered.
    assert "Tier 1 starts at $X/seat/month." in rendered
    # Page annotation is independent of show_context.
    assert "page 3" in rendered


def test_context_block_show_context_true_renders_contextual_lines() -> None:
    result = RetrievalResult(
        query="how much does tier 1 cost?",
        hits=[_hit_with_context()],
        source="rag",
    )
    rendered = result.context_block(show_context=True)
    assert "Doc summary: FAQ about pricing tiers." in rendered
    assert "Context: From the Pricing > Tiers section." in rendered
    assert "Tier 1 starts at $X/seat/month." in rendered


def test_context_block_show_context_true_skips_null_contextual_fields() -> None:
    """NULL-tolerant rollback path: pre-contextualizer rows render cleanly."""
    legacy_hit = _hit_with_context(
        document_summary=None,
        context_prefix=None,
        section_path=None,
        page_number=None,
    )
    result = RetrievalResult(
        query="how much does tier 1 cost?",
        hits=[legacy_hit],
        source="rag",
    )
    rendered = result.context_block(show_context=True)
    # No headers should appear when the fields are None.
    assert "Doc summary:" not in rendered
    assert "Context:" not in rendered
    # And no orphan "page None" annotation.
    assert "page None" not in rendered
    assert "page" not in rendered.lower().split("\n")[0]
    # Body still rendered.
    assert "Tier 1 starts at $X/seat/month." in rendered


def test_context_block_defaults_show_context_true() -> None:
    result = RetrievalResult(
        query="q",
        hits=[_hit_with_context()],
        source="rag",
    )
    default = result.context_block()
    forced_on = result.context_block(show_context=True)
    assert default == forced_on
