# ADR-0005: [AUTO] Hybrid Search with BM25 + Vector + RRF

**Status:** Accepted
**Date:** 2026-05-05
**Category:** Search Architecture

## Context

The Arkon platform needs to provide accurate search capabilities for skills, agents, journals, and other content. Users search using natural language queries that may contain:

1. **Exact keywords** - specific terms, names, or identifiers
2. **Semantic intent** - conceptual queries where meaning matters more than exact words
3. **Mixed queries** - combinations of both

Single-approach search strategies fail to address all use cases:
- **Keyword-only (BM25)**: Misses semantically similar content with different wording
- **Vector-only**: May miss exact matches and struggles with rare terms

## Decision

Implement a **hybrid search architecture** combining:

1. **BM25 (Best Matching 25)** - Classic keyword/term frequency search
   - Location: `apps/api/src/lib/search/bm25.ts`
   - Good for: Exact matches, rare terms, identifiers

2. **Vector Similarity Search** - Semantic search via embeddings
   - Location: `apps/api/src/lib/search/vector.ts`
   - Uses: pgvector with HNSW index
   - Model: OpenAI text-embedding-3-small (1536 dimensions)
   - Good for: Conceptual queries, synonyms, intent matching

3. **Reciprocal Rank Fusion (RRF)** - Result merging algorithm
   - Location: `apps/api/src/lib/search/rrf.ts`
   - Formula: `RRF(d) = Σ 1/(k + rank_i)` where k=60 (constant)
   - Merges rankings from both search methods

4. **Confidence Scoring** - Result quality assessment
   - Location: `apps/api/src/lib/search/confidence.ts`
   - Evaluates match quality and provides confidence scores

5. **Query Taxonomy** - Query classification
   - Location: `apps/api/src/lib/search/taxonomy.ts`
   - Classifies query type to optimize search strategy

## Consequences

### Positive
- Better search relevance across query types
- Graceful degradation (either method can work alone)
- Configurable weights between keyword and semantic search
- Confidence scores help UI display appropriate results

### Negative
- Higher latency (parallel searches, then fusion)
- More complex indexing (both text and vector indexes)
- Additional embedding costs for query vectors

### Mitigations
- Run BM25 and vector searches in parallel
- Cache query embeddings
- Use HNSW index for fast approximate vector search
- Early termination when high-confidence results found

## Implementation

```typescript
// apps/api/src/services/search.ts
export async function hybridSearch(query: string, options: SearchOptions) {
  const [keywordResults, vectorResults] = await Promise.all([
    bm25Search(query, options),
    vectorSearch(query, options),
  ]);

  return reciprocalRankFusion(keywordResults, vectorResults, {
    k: 60,
    keywordWeight: 0.4,
    vectorWeight: 0.6,
  });
}
```

## Related

- [ADR-0004: Vector Embeddings with pgvector](ADR-0004-pgvector-embeddings.md)
- `apps/api/src/lib/search/` - Search implementation
- `apps/api/src/services/search.ts` - Search service
