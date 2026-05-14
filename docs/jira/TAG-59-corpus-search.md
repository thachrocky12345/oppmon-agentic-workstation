# TAG-59: `CorpusSearch` — pgvector + BM25 + RRF

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Replace the stubbed `NullCorpusSearch()` used by `/solve_v2` with a real,
tenant-scoped retriever backed by the same hybrid pipeline `apps/api` uses.
Returns ranked chunks with stable, citation-friendly IDs.

## Objective

```python
class CorpusSearch(Protocol):
    async def search(
        self,
        query: str,
        *,
        tenant_id: str,
        collection_ids: list[str],
        top_k: int = 8,
    ) -> list[CorpusHit]: ...
```

Where:

```python
class CorpusHit(BaseModel):
    doc_id: str
    chunk_id: str
    collection_id: str
    score: float           # post-RRF fused score
    text: str              # the chunk body
    title: str | None
    source_url: str | None
    metadata: dict[str, Any] = {}
```

## Requirements

### SQL (copy verbatim from `apps/api/src/lib/search/`)

The hybrid pipeline in `apps/api/src/lib/search/` runs:

1. **BM25** via PostgreSQL `ts_rank_cd` on a `tsvector` column (or `pg_trgm`
   fallback — verify which one the schema uses).
2. **Vector** via pgvector `embedding <=> $query_vec` cosine distance.
3. **Reciprocal Rank Fusion** (`rrf.ts`) over the two ranked lists with
   `k = 60` constant.

Port that exact SQL to Python. Do NOT improvise — drift between the two stacks
is a regression risk.

### Schema reference

```
rag_chunks
  id              cuid (chunk_id)
  doc_id          fk → rag_documents
  collection_id   fk → rag_collections
  tenant_id       fk
  text            text
  tsv             tsvector  -- GENERATED ALWAYS AS (...) STORED
  embedding       vector(1536)   -- or whatever dim apps/api uses
  metadata        jsonb
  created_at

rag_collections
  id, tenant_id, name
```

### Tenant + collection filtering

Every SQL query must include BOTH:

```sql
WHERE c.tenant_id = $1
  AND c.collection_id = ANY($2::text[])
```

`$2` is the request's `collection_ids`. NEVER skip the tenant clause.

### Implementation

`agent_v2/rag/corpus_search.py`:

```python
class PgCorpusSearch(CorpusSearch):
    def __init__(self, embed: EmbeddingProvider):       # TAG-60
        self._embed = embed

    async def search(self, query, *, tenant_id, collection_ids, top_k=8):
        if not collection_ids:
            return []                                   # never run unfiltered
        qvec  = await self._embed.embed_query(query)
        # 1. BM25
        bm25 = await pg_fetch_all(BM25_SQL, query, tenant_id, collection_ids, top_k*3)
        # 2. Vector
        vec  = await pg_fetch_all(VEC_SQL,  qvec, tenant_id, collection_ids, top_k*3)
        # 3. RRF fuse
        return _rrf_fuse(bm25, vec, k=60, top_k=top_k)
```

`_rrf_fuse` implements the standard RRF formula:

```python
def _rrf_fuse(rank_lists, k=60, top_k=8):
    scores = defaultdict(float)
    by_id  = {}
    for ranked in rank_lists:
        for rank, hit in enumerate(ranked):
            scores[hit["id"]] += 1.0 / (k + rank + 1)
            by_id[hit["id"]] = hit
    fused = sorted(by_id.values(), key=lambda h: scores[h["id"]], reverse=True)[:top_k]
    return [CorpusHit(score=scores[h["id"]], **h) for h in fused]
```

### Cross-tenant isolation test (MANDATORY)

```python
async def test_tenant_b_cannot_retrieve_tenant_a_chunk(seed_two_tenants_with_corpora):
    # Tenant A has a chunk containing "alpha-secret-12345".
    # Tenant B queries for that exact string, scoped to A's collection_id.
    hits = await corpus.search(
        "alpha-secret-12345",
        tenant_id=b_user.tenant_id,
        collection_ids=[a_collection.id],
    )
    assert hits == []
```

## Implementation Notes

- Use `asyncpg`'s pgvector adapter (`asyncpg-pgvector` or manual codec
  registration via `await conn.set_type_codec("vector", ...)`).
- `top_k*3` per source list, then fuse to `top_k`. Matches the `apps/api`
  defaults.
- Result `text` field comes back as-is — no summarization. Summarization is the
  planner's job in TAG-61.
- Add a pgvector index check at startup: if `rag_chunks.embedding` has no
  `ivfflat`/`hnsw` index, log a WARN (not an error — dev DBs may not have it).

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/rag/test_corpus_search.py` | BM25 alone returns ranked rows | top hit has best `ts_rank` |
| `tests/rag/test_corpus_search.py` | Vector alone returns ranked rows | top hit has best cosine |
| `tests/rag/test_corpus_search.py` | RRF fuse stable on identical lists | both contribute |
| `tests/rag/test_corpus_search.py` | empty `collection_ids` → `[]` | hard short circuit |
| `tests/rag/test_corpus_search.py` | **cross-tenant** | `[]` |
| `tests/rag/test_corpus_search.py` | unknown collection id | `[]` (not 500) |
| `tests/rag/test_corpus_search.py` | top_k respected | len == top_k |

## Acceptance Criteria

- [ ] Cross-tenant test passes (blocks merge).
- [ ] SQL is byte-identical to `apps/api/src/lib/search/` (diff in PR description).
- [ ] All seven tests pass.
- [ ] No SQL string built by f-string interpolation of user input.
- [ ] `EXPLAIN ANALYZE` smoke (manual) shows hybrid query under 200 ms on 100k chunks.

## Dependencies

**Depends on:** TAG-51, TAG-60
**Blocks:** TAG-61, TAG-62

## Risk Factors

| Risk | Mitigation |
|---|---|
| Vector dim mismatch with `apps/api` embeddings | TAG-60 pins the embedding model to match the one in `apps/api/src/lib/embedding/`. Startup logs the dim. |
| SQL drift over time | PR template requires linking the `apps/api` source file. |
| Large `IN`/`ANY` list explodes plan | Cap `collection_ids` length to 16 in TAG-58 request schema. |
