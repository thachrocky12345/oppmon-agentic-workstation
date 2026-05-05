---
name: hybrid-search-rag
description: Implement hybrid search (BM25 + vector + RRF) for accurate RAG retrieval. Use when building search for skills, MCP servers, tools, flows, or any structured content that needs both keyword and semantic matching.
---

# Hybrid Search RAG

## Overview

Hybrid search combines **lexical matching** (BM25/full-text) with **semantic matching** (vector embeddings) using **Reciprocal Rank Fusion** (RRF) to get the best of both worlds:

- **BM25**: Exact keyword matches, technical terms, names, IDs
- **Vector**: Conceptual similarity, paraphrases, related topics
- **RRF**: Merge ranked lists without score calibration

This is critical for retrieving structured content like Skills, MCP Servers, Flows, and Tool Calls where users may search by exact name OR by conceptual description.

## When to Use

Use hybrid search when:
- Content has **technical names/identifiers** (skill names, command names, tool IDs)
- Users search with **exact terms** AND **natural language descriptions**
- You need **high recall** (don't miss relevant results)
- Results need **confidence scoring** to decide follow-up actions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Query Input                               │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Query Understanding                           │
│  • Parse intent (search vs question vs command)                  │
│  • Extract filters (sourceType, scope, tags)                     │
│  • Expand terms via taxonomy                                     │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
         ┌──────────────────┴──────────────────┐
         ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│   BM25 Search   │                   │  Vector Search  │
│  (PostgreSQL    │                   │  (pgvector      │
│   tsvector)     │                   │   cosine)       │
└────────┬────────┘                   └────────┬────────┘
         │                                      │
         │  [(id, bm25_score), ...]            │  [(id, vec_score), ...]
         ▼                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│               Reciprocal Rank Fusion (RRF)                       │
│  score(d) = Σ 1/(k + rank(d, list)) for each list               │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Confidence Scoring                            │
│  7 signals: intent, filters, constraint, top, margin, overlap,  │
│              coverage                                            │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Final Results                               │
│  { results: [...], confidence: 0.85, debug: {...} }             │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Add Search Vectors to Database

See [database-setup.md](database-setup.md) for full migration.

```sql
-- Add tsvector column
ALTER TABLE skills ADD COLUMN search_vector tsvector;

-- Create GIN index
CREATE INDEX idx_skills_search ON skills USING gin(search_vector);

-- Auto-update trigger
CREATE TRIGGER skills_search_update
BEFORE INSERT OR UPDATE ON skills
FOR EACH ROW EXECUTE FUNCTION update_search_vector();
```

**Apply to each searchable entity:**
- `skills` → name, description, content
- `mcp_servers` → name, description, command, args
- `agents` → name, description, systemPrompt
- `workflows` → name, description, steps (JSON extracted)
- `tools` → name, description, parameters

### Step 2: Implement BM25 Search

See [bm25.md](bm25.md) for details.

```typescript
// Query skills using PostgreSQL full-text search
const bm25Results = await prisma.$queryRaw`
  SELECT id, ts_rank_cd(search_vector, query, 32) as score
  FROM skills,
       plainto_tsquery('english', ${searchQuery}) query
  WHERE search_vector @@ query
    AND "tenantId" = ${tenantId}
    AND "deletedAt" IS NULL
  ORDER BY score DESC
  LIMIT ${topK}
`;
```

### Step 3: Implement Vector Search

Use existing pgvector search:

```typescript
const vectorResults = await prisma.$queryRaw`
  SELECT id, 1 - (embedding <=> ${queryEmbedding}::vector) as score
  FROM embeddings
  WHERE "tenantId" = ${tenantId}
    AND "sourceType" = ${sourceType}
    AND (1 - (embedding <=> ${queryEmbedding}::vector)) >= ${threshold}
  ORDER BY embedding <=> ${queryEmbedding}::vector
  LIMIT ${topK}
`;
```

### Step 4: Implement RRF Fusion

See [rrf.md](rrf.md) for algorithm.

```typescript
function reciprocalRankFusion(
  ...lists: Array<{ id: string; score: number }[]>
): Array<{ id: string; rrfScore: number }> {
  const K = 60; // Standard constant
  const scores = new Map<string, number>();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const { id } = list[rank];
      const current = scores.get(id) || 0;
      scores.set(id, current + 1 / (K + rank + 1));
    }
  }

  return [...scores.entries()]
    .map(([id, rrfScore]) => ({ id, rrfScore }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}
```

### Step 5: Add Query Expansion

See [taxonomy.md](taxonomy.md) for term mappings.

```typescript
const SKILL_TAXONOMY = {
  'git': ['git', 'version control', 'commit', 'branch', 'merge'],
  'deploy': ['deploy', 'deployment', 'release', 'ship', 'ci/cd'],
  'test': ['test', 'testing', 'unit test', 'e2e', 'integration'],
  // ... more mappings
};

function expandQuery(query: string): string[] {
  const tokens = query.toLowerCase().split(/\s+/);
  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const [canonical, synonyms] of Object.entries(SKILL_TAXONOMY)) {
      if (synonyms.includes(token)) {
        synonyms.forEach(s => expanded.add(s));
      }
    }
  }

  return [...expanded];
}
```

### Step 6: Implement Confidence Scoring

See [confidence.md](confidence.md) for signal details.

```typescript
interface ConfidenceBreakdown {
  intentClarity: number;      // Was query clear?
  filterCompleteness: number; // How specific?
  constraintMatch: number;    // Do results match filters?
  topScore: number;           // Quality of #1 result
  margin: number;             // Gap between #1 and #2
  overlap: number;            // BM25 ∩ vector agreement
  dataCoverage: number;       // Do we have data for this query?
  value: number;              // Weighted sum
}

function computeConfidence(
  bm25Ids: string[],
  vectorIds: string[],
  results: SearchResult[]
): ConfidenceBreakdown {
  // Calculate each signal...
  // See confidence.md for weights
}
```

### Step 7: Orchestrate in Service

```typescript
// apps/api/src/services/search.ts

export async function hybridSearch(
  tenantId: string,
  options: HybridSearchOptions
): Promise<HybridSearchResponse> {
  // 1. Expand query
  const expandedTerms = expandQuery(options.query);
  const searchQuery = expandedTerms.join(' ');

  // 2. Parallel search
  const [bm25Results, vectorResults] = await Promise.all([
    bm25Search(tenantId, searchQuery, options.sourceTypes, options.topK * 2),
    vectorSearch(tenantId, options.query, options.sourceTypes, options.topK * 2),
  ]);

  // 3. Fuse results
  const fused = reciprocalRankFusion(
    bm25Results.map(r => ({ id: r.id, score: r.score })),
    vectorResults.map(r => ({ id: r.id, score: r.score }))
  );

  // 4. Enrich with content
  const results = await enrichResults(fused.slice(0, options.topK));

  // 5. Compute confidence
  const confidence = computeConfidence(
    bm25Results.map(r => r.id),
    vectorResults.map(r => r.id),
    results
  );

  return {
    results,
    confidence,
    debug: {
      bm25Count: bm25Results.length,
      vectorCount: vectorResults.length,
      queryExpansion: expandedTerms,
    },
  };
}
```

## Searchable Entity Checklist

For each entity type, ensure:

| Entity | search_vector Fields | Embedding Fields | Taxonomy |
|--------|---------------------|------------------|----------|
| Skill | name, description, content | content (full) | ✅ skill-taxonomy |
| MCP Server | name, description, command | description | ✅ mcp-taxonomy |
| Agent | name, description, systemPrompt | systemPrompt | ⚠️ optional |
| Workflow | name, description, steps | description | ⚠️ optional |
| Tool | name, description, parameters | description | ✅ tool-taxonomy |
| Flow | name, description, nodes | description | ⚠️ optional |

## Confidence Thresholds

Use confidence to drive UX decisions:

| Confidence | Action |
|------------|--------|
| ≥ 0.80 | Return results directly |
| 0.55 - 0.79 | Return results + suggest refinement |
| < 0.55 | Ask clarifying question first |

## Testing Checklist

- [ ] BM25 finds exact name matches
- [ ] Vector finds conceptually similar content
- [ ] RRF ranks items in both lists higher
- [ ] Query expansion improves recall
- [ ] Confidence drops when no good matches
- [ ] Performance < 500ms p95

## Files to Create

```
apps/api/src/lib/search/
├── index.ts           # Barrel export
├── bm25.ts            # PostgreSQL full-text search
├── vector.ts          # pgvector wrapper
├── rrf.ts             # Reciprocal rank fusion
├── taxonomy.ts        # Query expansion maps
├── confidence.ts      # 7-signal scoring
└── config.ts          # Scoring weight presets

apps/api/src/services/
└── search.ts          # Hybrid search orchestration

packages/database/prisma/migrations/
└── XXXXXX_add_search_vectors.sql
```

## Quick Reference

```typescript
// Basic usage
const results = await hybridSearch(tenantId, {
  query: 'git commit workflow',
  sourceTypes: ['skill', 'mcp_server'],
  topK: 10,
  strategy: 'hybrid', // 'bm25' | 'vector' | 'hybrid'
});

if (results.confidence.value >= 0.8) {
  return results.results;
} else {
  return askClarification(results.confidence.weakestSignal);
}
```

## References

- [database-setup.md](database-setup.md) - PostgreSQL tsvector setup
- [bm25.md](bm25.md) - BM25 algorithm details
- [rrf.md](rrf.md) - Reciprocal Rank Fusion
- [taxonomy.md](taxonomy.md) - Query expansion mappings
- [confidence.md](confidence.md) - Confidence scoring signals
- [JIRA Task](../../docs/jira/JIRA_hybrid_search_rag.md) - Implementation ticket
