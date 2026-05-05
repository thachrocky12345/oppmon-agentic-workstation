# JIRA Task: Hybrid Search Index for Skills and MCP Servers

**Epic:** RAG Enhancement
**Priority:** High
**Story Points:** 13
**Sprint:** TBD

---

## Summary

Implement a hybrid search system (BM25 + Vector + RRF) for Skills and MCP Servers to improve RAG retrieval accuracy. Currently, retrieval relies solely on vector similarity which misses exact keyword matches. This task adds lexical indexing and reciprocal rank fusion to combine the strengths of both approaches.

---

## Background

### Current State
- Skills and MCP Servers are embedded using OpenAI `text-embedding-3-small`
- RAG retrieval uses only cosine similarity (pgvector `<=>` operator)
- No keyword/lexical search capability
- No query expansion or synonym mapping

### Problems
1. **Exact match failures**: Searching for "git commit" may not find a skill named "Git Commit Helper" if the embedding doesn't capture the exact phrase
2. **No query expansion**: "anxiety" doesn't match "PTSD" or "trauma" without synonym mapping
3. **Low precision for specific queries**: Technical terms and exact names need lexical matching
4. **No confidence scoring**: Can't tell if results are high-quality or low-confidence

### Reference Implementation
The POC search system in `agent-research-assistant/backend/poc_search/` demonstrates:
- Hybrid BM25 + vector retrieval with RRF fusion
- Query understanding with taxonomy/synonym expansion
- 7-signal confidence scoring
- Configurable scoring weights

---

## Acceptance Criteria

### AC1: BM25 Index for Skills
- [ ] Skills content is indexed for full-text BM25 search
- [ ] Index includes: name, description, content (parsed YAML front-matter + body)
- [ ] Index updates automatically on skill create/update/delete
- [ ] Search returns (skill_id, bm25_score) ranked list

### AC2: BM25 Index for MCP Servers
- [ ] MCP server metadata indexed for BM25 search
- [ ] Index includes: name, description, command, args (serialized)
- [ ] Index updates automatically on server create/update/delete

### AC3: Hybrid Retrieval
- [ ] RAG search combines BM25 + vector results
- [ ] Reciprocal Rank Fusion (RRF) merges ranked lists
- [ ] Returns top-K candidates with both scores attached
- [ ] API: `POST /api/rag/search` with `strategy: "hybrid"` option

### AC4: Query Expansion
- [ ] Skills taxonomy with canonical terms → synonym mapping
- [ ] Query terms expanded using synonym map before BM25 search
- [ ] Example: "deployment" → also searches "deploy", "release", "ship"

### AC5: Confidence Scoring
- [ ] Implement confidence breakdown with 7 signals:
  - Intent clarity (is this a skill search vs general question?)
  - Filter completeness (how many criteria specified?)
  - Constraint match (how well do results match filters?)
  - Top score (quality of best result)
  - Margin (gap between #1 and #2)
  - BM25/vector overlap (Jaccard of top-K IDs)
  - Data coverage (do we have skills matching these criteria?)
- [ ] Return confidence score (0.0–1.0) with search results

### AC6: Configurable Scoring
- [ ] Scoring weights externalized to config
- [ ] Presets: `default`, `keyword_focused`, `semantic_focused`
- [ ] API accepts `scoringConfig` parameter

---

## Technical Design

### 1. Database Schema Changes

```sql
-- Add tsvector column for full-text search
ALTER TABLE skills ADD COLUMN search_vector tsvector;
ALTER TABLE mcp_servers ADD COLUMN search_vector tsvector;

-- Create GIN indexes for fast text search
CREATE INDEX idx_skills_search_vector ON skills USING gin(search_vector);
CREATE INDEX idx_mcp_servers_search_vector ON mcp_servers USING gin(search_vector);

-- Trigger to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION skills_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER skills_search_update
BEFORE INSERT OR UPDATE ON skills
FOR EACH ROW EXECUTE FUNCTION skills_search_trigger();
```

### 2. New Service: `search.ts`

```typescript
// apps/api/src/services/search.ts

export interface HybridSearchOptions {
  query: string;
  sourceTypes: ('skill' | 'mcp_server')[];
  topK?: number;
  threshold?: number;
  strategy?: 'vector' | 'bm25' | 'hybrid';
  scoringConfig?: ScoringConfig;
}

export interface SearchResult {
  id: string;
  sourceType: string;
  sourceId: string;
  content: string;
  scores: {
    bm25: number;
    vector: number;
    rrf: number;
    final: number;
  };
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  confidence: ConfidenceBreakdown;
  debug: {
    bm25Count: number;
    vectorCount: number;
    mergedCount: number;
    queryExpansion: string[];
  };
}

export async function hybridSearch(
  tenantId: string,
  options: HybridSearchOptions
): Promise<SearchResponse>;
```

### 3. BM25 Search Implementation

```typescript
// apps/api/src/lib/search/bm25.ts

export async function bm25Search(
  tenantId: string,
  query: string,
  sourceTypes: string[],
  topK: number = 100
): Promise<Array<{ id: string; sourceType: string; score: number }>> {
  // PostgreSQL ts_rank with normalization
  const results = await prisma.$queryRaw`
    WITH ranked_skills AS (
      SELECT
        id,
        'skill' as "sourceType",
        ts_rank_cd(search_vector, plainto_tsquery('english', ${query}), 32) as score
      FROM skills
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND search_vector @@ plainto_tsquery('english', ${query})
      ORDER BY score DESC
      LIMIT ${topK}
    ),
    ranked_mcp AS (
      SELECT
        id,
        'mcp_server' as "sourceType",
        ts_rank_cd(search_vector, plainto_tsquery('english', ${query}), 32) as score
      FROM mcp_servers
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND search_vector @@ plainto_tsquery('english', ${query})
      ORDER BY score DESC
      LIMIT ${topK}
    )
    SELECT * FROM ranked_skills
    UNION ALL
    SELECT * FROM ranked_mcp
    ORDER BY score DESC
    LIMIT ${topK}
  `;

  return results;
}
```

### 4. Reciprocal Rank Fusion

```typescript
// apps/api/src/lib/search/rrf.ts

export function reciprocalRankFusion(
  ...rankedLists: Array<Array<{ id: string; score: number }>>
): Array<{ id: string; rrfScore: number }> {
  const K = 60; // Standard RRF constant
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const { id } = list[rank];
      const current = scores.get(id) || 0;
      scores.set(id, current + 1 / (K + rank + 1));
    }
  }

  return Array.from(scores.entries())
    .map(([id, rrfScore]) => ({ id, rrfScore }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}
```

### 5. Query Expansion with Taxonomy

```typescript
// apps/api/src/lib/search/taxonomy.ts

// Skill taxonomy: canonical term → synonyms
export const SKILL_TAXONOMY: Record<string, string[]> = {
  // Development
  'git': ['git', 'version control', 'vcs', 'repository', 'commit', 'branch'],
  'deployment': ['deploy', 'deployment', 'release', 'ship', 'publish', 'ci/cd'],
  'testing': ['test', 'testing', 'unit test', 'integration test', 'e2e', 'qa'],
  'debugging': ['debug', 'debugging', 'troubleshoot', 'fix', 'error', 'bug'],

  // Data
  'database': ['database', 'db', 'sql', 'postgresql', 'mysql', 'mongo'],
  'api': ['api', 'rest', 'graphql', 'endpoint', 'http', 'request'],

  // AI/ML
  'llm': ['llm', 'language model', 'gpt', 'claude', 'ai', 'completion'],
  'embedding': ['embedding', 'vector', 'semantic', 'similarity'],
  'rag': ['rag', 'retrieval', 'augmented', 'generation', 'context'],
};

export const SYNONYM_MAP = new Map<string, string>();
for (const [canonical, synonyms] of Object.entries(SKILL_TAXONOMY)) {
  for (const syn of synonyms) {
    SYNONYM_MAP.set(syn.toLowerCase(), canonical);
  }
}

export function expandQuery(query: string): string[] {
  const tokens = query.toLowerCase().split(/\s+/);
  const expanded = new Set<string>(tokens);

  for (const token of tokens) {
    const canonical = SYNONYM_MAP.get(token);
    if (canonical && SKILL_TAXONOMY[canonical]) {
      for (const syn of SKILL_TAXONOMY[canonical].slice(0, 5)) {
        expanded.add(syn);
      }
    }
  }

  return Array.from(expanded);
}
```

### 6. Confidence Scoring

```typescript
// apps/api/src/lib/search/confidence.ts

export interface ConfidenceWeights {
  intentClarity: number;      // 0.15
  filterCompleteness: number; // 0.15
  constraintMatch: number;    // 0.15
  topScore: number;           // 0.20
  margin: number;             // 0.10
  overlap: number;            // 0.15
  dataCoverage: number;       // 0.10
}

export interface ConfidenceBreakdown {
  intentClarity: number;
  filterCompleteness: number;
  constraintMatch: number;
  topScore: number;
  margin: number;
  overlap: number;
  dataCoverage: number;
  value: number;
  weakestSignal: string;
}

export function computeConfidence(
  bm25Results: string[],
  vectorResults: string[],
  finalResults: SearchResult[],
  weights: ConfidenceWeights = DEFAULT_WEIGHTS
): ConfidenceBreakdown {
  // Intent clarity: based on query structure
  const intentClarity = /* analyze query */ 0.8;

  // Filter completeness: how specific was the query
  const filterCompleteness = /* count filters */ 0.7;

  // Constraint match: avg constraint score of top-5
  const constraintMatch = finalResults.slice(0, 5)
    .reduce((sum, r) => sum + r.scores.final, 0) / 5;

  // Top score: quality of best result
  const topScore = finalResults[0]?.scores.final || 0;

  // Margin: gap between #1 and #2
  const margin = finalResults.length >= 2
    ? finalResults[0].scores.final - finalResults[1].scores.final
    : 0;

  // Overlap: Jaccard similarity of BM25 and vector top-K
  const bm25Set = new Set(bm25Results.slice(0, 10));
  const vecSet = new Set(vectorResults.slice(0, 10));
  const intersection = [...bm25Set].filter(x => vecSet.has(x)).length;
  const union = new Set([...bm25Set, ...vecSet]).size;
  const overlap = union > 0 ? intersection / union : 0;

  // Data coverage: do we have results for this query type
  const dataCoverage = finalResults.length >= 3 ? 1.0 : finalResults.length / 3;

  // Weighted sum
  const value = (
    weights.intentClarity * intentClarity +
    weights.filterCompleteness * filterCompleteness +
    weights.constraintMatch * constraintMatch +
    weights.topScore * topScore +
    weights.margin * margin +
    weights.overlap * overlap +
    weights.dataCoverage * dataCoverage
  );

  const breakdown = { intentClarity, filterCompleteness, constraintMatch, topScore, margin, overlap, dataCoverage };
  const weakestSignal = Object.entries(breakdown)
    .sort((a, b) => a[1] - b[1])[0][0];

  return { ...breakdown, value: Math.min(value, 1.0), weakestSignal };
}
```

---

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `apps/api/src/lib/search/bm25.ts` | BM25 search using PostgreSQL tsvector |
| `apps/api/src/lib/search/rrf.ts` | Reciprocal rank fusion algorithm |
| `apps/api/src/lib/search/taxonomy.ts` | Skill/MCP taxonomy and query expansion |
| `apps/api/src/lib/search/confidence.ts` | 7-signal confidence scoring |
| `apps/api/src/lib/search/config.ts` | Scoring weight configurations |
| `apps/api/src/lib/search/index.ts` | Barrel export |
| `apps/api/src/services/search.ts` | Hybrid search orchestration |
| `packages/database/prisma/migrations/XXXXXX_add_search_vectors.sql` | tsvector columns + triggers |

### Modified Files
| File | Changes |
|------|---------|
| `apps/api/src/routes/rag.ts` | Add `strategy` parameter to retrieve endpoint |
| `apps/api/src/services/rag.ts` | Call hybrid search when `strategy: 'hybrid'` |
| `packages/database/prisma/schema.prisma` | Add `searchVector` field (optional, for Prisma introspection) |

---

## Testing Strategy

### Unit Tests
- [ ] `bm25.test.ts` - BM25 search with various queries
- [ ] `rrf.test.ts` - RRF fusion with edge cases (empty lists, single list)
- [ ] `taxonomy.test.ts` - Query expansion coverage
- [ ] `confidence.test.ts` - Confidence scoring accuracy

### Integration Tests
- [ ] Create skills with various content types
- [ ] Test BM25-only, vector-only, and hybrid searches
- [ ] Verify RRF ordering matches expected behavior
- [ ] Test confidence thresholds

### Smoke Test Updates
```typescript
// Add to smoke-week2.ts

async function testHybridSearch() {
  const response = await apiCall('POST', '/api/rag/retrieve', {
    token: authToken,
    body: {
      query: 'git commit workflow',
      sourceTypes: ['skill'],
      strategy: 'hybrid',
      topK: 5,
    },
  });

  if (response.data.confidence < 0.3) {
    throw new Error('Hybrid search confidence too low');
  }

  if (!response.data.debug.bm25Count || !response.data.debug.vectorCount) {
    throw new Error('Missing hybrid search debug info');
  }
}
```

---

## Migration Plan

1. **Phase 1: Schema Migration**
   - Add tsvector columns (non-breaking, nullable)
   - Create GIN indexes
   - Add update triggers
   - Backfill existing records

2. **Phase 2: Service Implementation**
   - Implement BM25 search
   - Implement RRF fusion
   - Add taxonomy/query expansion
   - Add confidence scoring

3. **Phase 3: API Integration**
   - Add `strategy` parameter to RAG endpoints
   - Default to `vector` for backwards compatibility
   - Add `confidence` to response

4. **Phase 4: Enable by Default**
   - Change default strategy to `hybrid`
   - Monitor performance and accuracy
   - Tune scoring weights based on feedback

---

## Dependencies

- PostgreSQL full-text search (built-in, no new dependencies)
- pgvector extension (already installed)
- No new npm packages required

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| BM25 index size | GIN indexes are space-efficient; monitor via `pg_total_relation_size` |
| Trigger performance | Triggers are fast; batch updates if needed for bulk imports |
| Scoring tuning | Start with POC weights, add A/B testing capability |
| Breaking existing RAG | Default to `vector` strategy; `hybrid` is opt-in initially |

---

## References

- [POC Search Implementation](../../arkon-reference-only/../agent-research-assistant/backend/poc_search/)
- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [RRF Paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) - Cormack et al., SIGIR 2009
- [pgvector Documentation](https://github.com/pgvector/pgvector)

---

## Sub-Tasks

1. **[DB] Add tsvector columns and indexes** (3 SP)
   - Migration script
   - Backfill existing records
   - Test trigger performance

2. **[BE] Implement BM25 search** (2 SP)
   - PostgreSQL ts_rank queries
   - Source type filtering
   - Unit tests

3. **[BE] Implement RRF fusion** (1 SP)
   - Algorithm implementation
   - Unit tests with edge cases

4. **[BE] Build taxonomy & query expansion** (2 SP)
   - Initial skill taxonomy
   - Expansion function
   - Unit tests

5. **[BE] Implement confidence scoring** (2 SP)
   - 7-signal computation
   - Configurable weights
   - Unit tests

6. **[BE] Orchestrate hybrid search** (2 SP)
   - `search.ts` service
   - Combine BM25, vector, RRF, confidence
   - Integration tests

7. **[API] Add strategy to RAG endpoints** (1 SP)
   - Modify `/api/rag/retrieve`
   - Add confidence to response
   - Update smoke tests

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Unit tests passing with >80% coverage
- [ ] Integration tests passing
- [ ] Smoke tests updated and passing
- [ ] API documentation updated
- [ ] No performance regression (search <500ms p95)
- [ ] Code reviewed and approved
- [ ] Deployed to staging and verified
