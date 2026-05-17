# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-59 — Tenant-scoped hybrid corpus search (pgvector + BM25 + RRF).

Replaces the stub :class:`NullCorpusSearch` (see ``hybrid_search.py``) with
a real, tenant-isolated retriever over ``rag_chunks`` + ``rag_documents``.
Returns ranked chunks with citation-friendly IDs that the planner
(TAG-61) and the SSE citation stream (TAG-62) will consume.

Pipeline:

  1. **BM25** over ``rag_chunks.content`` via on-the-fly
     ``to_tsvector('english', content)``. The chunks table has no
     precomputed ``search_vector`` column (unlike
     ``skills`` / ``mcp_servers`` / ``agents`` / ``workflows`` in
     ``apps/api``), so we compute the tsvector at query time. Slower
     but schema-honest; a generated-column migration can land in a
     follow-up without changing this code.
  2. **pgvector** cosine similarity over ``rag_chunks.embedding`` using
     a query embedding produced by the TAG-60 :class:`EmbeddingProvider`.
  3. **Reciprocal Rank Fusion** with ``k=60`` — same constant as
     ``apps/api/src/lib/search/rrf.ts:RRF_K``.

Tenant isolation is enforced on **both** ``rag_chunks.tenant_id`` and
``rag_documents.tenant_id`` (defence-in-depth — the chunk table carries
a denormalised tenant_id, so a mistaken join wouldn't silently leak).
"""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field

from ..db.queries import pg_fetch_all
from .embedding import EmbeddingProvider

# RRF constant — matches ``apps/api/src/lib/search/config.ts:RRF_K``.
_RRF_K = 60
# ts_rank_cd normalisation flag — matches
# ``apps/api/src/lib/search/config.ts:BM25_NORMALIZATION``.
_BM25_NORMALIZATION = 32


class CorpusHit(BaseModel):
    """One ranked chunk + post-RRF fused score.

    ``doc_id`` + ``chunk_id`` together form the citation key consumed
    by TAG-61 (planner) and TAG-62 (SSE citation events).
    """

    model_config = ConfigDict(extra="forbid")

    doc_id: str
    chunk_id: str
    collection_id: str
    score: float
    text: str
    title: str | None = None
    source_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


@runtime_checkable
class CorpusSearch(Protocol):
    """TAG-59 corpus retriever Protocol.

    Distinct from the legacy ``CorpusSearch`` in
    :mod:`agent_v2.rag.hybrid_search` (which takes no ``tenant_id`` and
    returns ``SearchHit``). That older Protocol is kept in place until
    TAG-61 wires this one into :class:`Retriever`.
    """

    async def search(
        self,
        query: str,
        *,
        tenant_id: str,
        collection_ids: list[str],
        top_k: int = 8,
    ) -> list[CorpusHit]: ...


# ----------------------------------------------------------------------
# SQL — ported from apps/api/src/lib/search/{bm25,vector}.ts
# ----------------------------------------------------------------------
#
# Two divergences from apps/api worth flagging:
#
#   1. apps/api BM25 uses a precomputed ``search_vector`` column on
#      ``skills`` / ``mcp_servers`` / ``agents`` / ``workflows``.
#      ``rag_chunks`` has no such column, so we compute the tsvector
#      on the fly. The ``$1`` query parameter is the user's natural
#      string — ``plainto_tsquery`` neutralises injection.
#   2. apps/api Vector targets the ``embeddings`` table; we target
#      ``rag_chunks.embedding`` directly. Same ``<=> ::vector`` operator
#      and same ``1 - distance`` similarity convention so the RRF
#      input ordering is consistent.

_BM25_SQL = """
SELECT
  c.id                AS chunk_id,
  c.document_id       AS doc_id,
  d.collection_id     AS collection_id,
  c.content           AS text,
  c.metadata          AS metadata,
  d.original_filename AS title,
  ts_rank_cd(
    to_tsvector('english', c.content),
    plainto_tsquery('english', $1),
    {bm25_norm}
  ) AS score
FROM rag_chunks c
JOIN rag_documents d ON d.id = c.document_id
WHERE c.tenant_id = $2
  AND d.tenant_id = $2
  AND d.collection_id = ANY($3::text[])
  AND d.deleted_at IS NULL
  AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
ORDER BY score DESC
LIMIT $4
""".format(bm25_norm=_BM25_NORMALIZATION)


_VEC_SQL = """
SELECT
  c.id                AS chunk_id,
  c.document_id       AS doc_id,
  d.collection_id     AS collection_id,
  c.content           AS text,
  c.metadata          AS metadata,
  d.original_filename AS title,
  1 - (c.embedding <=> $1::vector) AS score
FROM rag_chunks c
JOIN rag_documents d ON d.id = c.document_id
WHERE c.tenant_id = $2
  AND d.tenant_id = $2
  AND d.collection_id = ANY($3::text[])
  AND d.deleted_at IS NULL
ORDER BY c.embedding <=> $1::vector
LIMIT $4
"""


def _vec_literal(vec: list[float]) -> str:
    """Stringify a Python vector for pgvector's ``::vector`` cast.

    We avoid the ``asyncpg-pgvector`` codec dance by sending the vector
    as a plain text literal — pgvector accepts ``[v1,v2,...]`` syntax
    when the parameter is explicitly cast to ``::vector`` in SQL.
    """
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


def _row_to_hit_dict(row: Any) -> dict[str, Any]:
    """Coerce an asyncpg ``Record`` into a plain dict the RRF helper fuses.

    ``rag_chunks.metadata`` is jsonb. asyncpg returns it as a Python str
    when no JSON codec is registered; we accept both shapes so tests
    that monkeypatch ``pg_fetch_all`` with a list of plain dicts work
    without extra ceremony.
    """
    md = row["metadata"]
    if isinstance(md, str):
        try:
            md = json.loads(md)
        except json.JSONDecodeError:
            md = {}
    return {
        "chunk_id": row["chunk_id"],
        "doc_id": row["doc_id"],
        "collection_id": row["collection_id"],
        "text": row["text"],
        "title": row["title"],
        "metadata": md or {},
    }


def _rrf_fuse(
    *rank_lists: list[dict[str, Any]],
    k: int = _RRF_K,
    top_k: int = 8,
) -> list[CorpusHit]:
    """Reciprocal Rank Fusion.

    Identical formula to ``apps/api/src/lib/search/rrf.ts``:

        score(id) = Σ_lists 1 / (k + rank + 1)

    where ``rank`` is 0-based within each input list. The ``+1`` keeps
    the canonical RRF formulation while letting us enumerate from zero.
    """
    scores: dict[str, float] = defaultdict(float)
    by_id: dict[str, dict[str, Any]] = {}
    for ranked in rank_lists:
        for rank, hit in enumerate(ranked):
            cid = hit["chunk_id"]
            scores[cid] += 1.0 / (k + rank + 1)
            by_id[cid] = hit
    ordered = sorted(
        by_id.values(),
        key=lambda h: scores[h["chunk_id"]],
        reverse=True,
    )
    return [
        CorpusHit(
            chunk_id=h["chunk_id"],
            doc_id=h["doc_id"],
            collection_id=h["collection_id"],
            text=h["text"],
            title=h["title"],
            source_url=None,
            metadata=h["metadata"],
            score=scores[h["chunk_id"]],
        )
        for h in ordered[:top_k]
    ]


class PgCorpusSearch:
    """Real :class:`CorpusSearch` over ``rag_chunks`` + ``rag_documents``.

    Empty ``collection_ids`` short-circuits to ``[]`` — we never run an
    unfiltered query against the corpus. The mandatory cross-tenant
    test (Tenant B asks for Tenant A's collection containing Tenant A's
    secret) is covered because both tenant_id filters in
    :data:`_BM25_SQL` and :data:`_VEC_SQL` must match the caller's
    ``tenant_id``.
    """

    def __init__(self, embed: EmbeddingProvider) -> None:
        self._embed = embed

    async def search(
        self,
        query: str,
        *,
        tenant_id: str,
        collection_ids: list[str],
        top_k: int = 8,
    ) -> list[CorpusHit]:
        if not collection_ids:
            # Hard short-circuit. Running BM25 + vector without a
            # collection filter would scan the whole tenant — that's
            # a TAG-58 request-validation concern, but we double-down
            # here so a buggy caller can't bypass it.
            return []
        if not tenant_id:
            # Defensive — caller bug, not an injection vector but a
            # clear sign of broken auth wiring. Fail loud.
            raise RuntimeError("PgCorpusSearch.search: tenant_id is required")

        qvec = await self._embed.embed_query(query)
        # Per ticket: pull top_k*3 from each retriever, then RRF down
        # to top_k. Matches apps/api defaults.
        per_list = top_k * 3
        vec_param = _vec_literal(qvec)

        bm25_rows = await pg_fetch_all(
            _BM25_SQL,
            query,
            tenant_id,
            collection_ids,
            per_list,
        )
        vec_rows = await pg_fetch_all(
            _VEC_SQL,
            vec_param,
            tenant_id,
            collection_ids,
            per_list,
        )

        bm25 = [_row_to_hit_dict(r) for r in bm25_rows]
        vec = [_row_to_hit_dict(r) for r in vec_rows]
        return _rrf_fuse(bm25, vec, k=_RRF_K, top_k=top_k)


__all__ = [
    "CorpusHit",
    "CorpusSearch",
    "PgCorpusSearch",
]
