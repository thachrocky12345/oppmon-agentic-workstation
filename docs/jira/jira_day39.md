# TAG-39: Advanced RAG Enhancement (REFRAG + MMR)

## Description

**Suggested Points:** 8 (High — implementing REFRAG methodology with compression, sensing, and expansion; MMR diversity selection; hybrid retrieval with BM25 + vector; query fusion)

## Objective

Enhance the RAG system with advanced retrieval techniques from agent-research-assistant, including REFRAG methodology (compression, sensing, expansion), Maximal Marginal Relevance (MMR) for diversity, hybrid BM25 + vector retrieval, and query fusion for multi-perspective search.

## Requirements

### REFRAG Methodology

```
REFRAG = Retrieval Enhancement Framework for RAG

┌─────────────────────────────────────────────────────────────┐
│                    REFRAG Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│  1. COMPRESSION: Chunk + summarize documents                │
│     └─ LLM summarization of long documents                  │
│     └─ Hierarchical chunking (800 tokens, 100 overlap)      │
│                                                              │
│  2. SENSING: Diversity-aware retrieval                      │
│     └─ MMR (Maximal Marginal Relevance) selection           │
│     └─ Balance relevance vs. diversity                      │
│                                                              │
│  3. EXPANSION: Multi-perspective search                     │
│     └─ Query rewriting/expansion                            │
│     └─ Hypothetical document embedding (HyDE)               │
│     └─ Multi-vector search + fusion                         │
└─────────────────────────────────────────────────────────────┘
```

### MMR (Maximal Marginal Relevance)

```typescript
/**
 * MMR balances relevance to query with diversity among results.
 *
 * Score = λ * sim(doc, query) - (1-λ) * max(sim(doc, selected))
 *
 * λ = 1.0: Pure relevance (may return redundant docs)
 * λ = 0.0: Pure diversity (may return irrelevant docs)
 * λ = 0.5: Balanced (recommended)
 */
function mmrSelect(
  candidates: ScoredDocument[],
  queryEmbedding: number[],
  nResults: number,
  lambda: number = 0.5
): ScoredDocument[] {
  const selected: ScoredDocument[] = []
  const remaining = [...candidates]

  while (selected.length < nResults && remaining.length > 0) {
    let bestScore = -Infinity
    let bestIdx = 0

    for (let i = 0; i < remaining.length; i++) {
      const doc = remaining[i]

      // Relevance to query
      const queryRelevance = cosineSimilarity(doc.embedding, queryEmbedding)

      // Max similarity to already selected
      const maxSelectedSim = selected.length === 0 ? 0 :
        Math.max(...selected.map(s => cosineSimilarity(doc.embedding, s.embedding)))

      // MMR score
      const mmrScore = lambda * queryRelevance - (1 - lambda) * maxSelectedSim

      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }

    selected.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }

  return selected
}
```

### Hybrid Retrieval (BM25 + Vector)

```typescript
interface HybridRetriever {
  // BM25 lexical search
  retrieveBM25(query: string, k: number): Promise<ScoredDocument[]>

  // Vector semantic search
  retrieveVector(query: string, k: number): Promise<ScoredDocument[]>

  // Hybrid with Reciprocal Rank Fusion
  retrieveHybrid(query: string, k: number): Promise<ScoredDocument[]>
}

class HybridRAG implements HybridRetriever {
  private bm25Index: BM25Index
  private vectorStore: VectorStore

  async retrieveHybrid(query: string, k: number): Promise<ScoredDocument[]> {
    // Get candidates from both
    const [bm25Results, vectorResults] = await Promise.all([
      this.retrieveBM25(query, k * 2),
      this.retrieveVector(query, k * 2),
    ])

    // Reciprocal Rank Fusion
    const fused = this.reciprocalRankFusion(bm25Results, vectorResults, k)

    return fused
  }

  private reciprocalRankFusion(
    list1: ScoredDocument[],
    list2: ScoredDocument[],
    k: number,
    rrf_k: number = 60  // Standard RRF parameter
  ): ScoredDocument[] {
    const scores = new Map<string, number>()
    const docs = new Map<string, ScoredDocument>()

    // Score from list 1
    list1.forEach((doc, rank) => {
      const score = 1 / (rrf_k + rank + 1)
      scores.set(doc.id, (scores.get(doc.id) || 0) + score)
      docs.set(doc.id, doc)
    })

    // Score from list 2
    list2.forEach((doc, rank) => {
      const score = 1 / (rrf_k + rank + 1)
      scores.set(doc.id, (scores.get(doc.id) || 0) + score)
      docs.set(doc.id, doc)
    })

    // Sort by combined score
    const ranked = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => ({ ...docs.get(id)!, rrfScore: score }))

    return ranked
  }
}
```

### Query Expansion (HyDE)

```typescript
/**
 * HyDE: Hypothetical Document Embedding
 *
 * Instead of embedding the query directly, generate a hypothetical
 * document that would answer the query, then embed that.
 */
async function hydeExpand(query: string, llm: LLMClient): Promise<string[]> {
  const prompt = `
Given the following question, write a short paragraph (2-3 sentences) that
directly answers it. Write as if you are an expert document containing the answer.

Question: ${query}

Answer paragraph:
`

  // Generate multiple hypothetical documents for diversity
  const hypotheticals = await Promise.all([
    llm.complete(prompt, { temperature: 0.7 }),
    llm.complete(prompt, { temperature: 0.9 }),
  ])

  return [query, ...hypotheticals]
}

async function multiVectorSearch(
  queries: string[],
  vectorStore: VectorStore,
  k: number
): Promise<ScoredDocument[]> {
  // Search with each query variant
  const allResults = await Promise.all(
    queries.map(q => vectorStore.search(q, k))
  )

  // Reciprocal Rank Fusion across all result sets
  return reciprocalRankFusionMultiple(allResults, k)
}
```

### Document Compression (LLM Summarization)

```typescript
interface CompressionConfig {
  maxChunkTokens: number  // 800
  overlapTokens: number   // 100
  summarizeThreshold: number  // Documents > this get summarized
}

async function compressDocument(
  document: string,
  config: CompressionConfig,
  llm: LLMClient
): Promise<CompressedDocument[]> {
  const tokens = estimateTokens(document)

  if (tokens > config.summarizeThreshold) {
    // Generate summary for long documents
    const summary = await llm.complete(`
Summarize the following document in 2-3 paragraphs, preserving key facts:

${document}
`)

    // Return both summary and chunks
    return [
      { content: summary, type: 'summary', originalLength: tokens },
      ...chunkDocument(document, config),
    ]
  }

  return chunkDocument(document, config)
}

function chunkDocument(
  document: string,
  config: CompressionConfig
): CompressedDocument[] {
  const chunks: CompressedDocument[] = []
  const words = document.split(/\s+/)

  let start = 0
  while (start < words.length) {
    const end = Math.min(start + config.maxChunkTokens, words.length)
    const chunk = words.slice(start, end).join(' ')

    chunks.push({
      content: chunk,
      type: 'chunk',
      chunkIndex: chunks.length,
    })

    // Overlap for context continuity
    start = end - config.overlapTokens
  }

  return chunks
}
```

## Implementation Notes
- Backend: Enhance `packages/agent-memory/src/advanced-rag.ts`
- Frontend: N/A
- CLI: RAG testing commands
- Database: BM25 index table, existing pgvector

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/agent-memory/src/__tests__/mmr.test.ts` | `selects diverse documents` | Not all similar |
| `packages/agent-memory/src/__tests__/mmr.test.ts` | `lambda=1 is pure relevance` | Most relevant first |
| `packages/agent-memory/src/__tests__/mmr.test.ts` | `lambda=0 is pure diversity` | Most different selected |
| `packages/agent-memory/src/__tests__/hybrid.test.ts` | `combines BM25 and vector` | Both sources used |
| `packages/agent-memory/src/__tests__/hybrid.test.ts` | `RRF scoring correct` | Formula verified |
| `packages/agent-memory/src/__tests__/hyde.test.ts` | `generates hypotheticals` | Multiple variants |
| `packages/agent-memory/src/__tests__/hyde.test.ts` | `multi-vector fusion works` | Results merged |
| `packages/agent-memory/src/__tests__/compress.test.ts` | `chunks at 800 tokens` | Chunk size correct |
| `packages/agent-memory/src/__tests__/compress.test.ts` | `overlap of 100 tokens` | Overlap correct |
| `packages/agent-memory/src/__tests__/compress.test.ts` | `summarizes long docs` | Summary generated |

### Test Coverage Requirements
- 100% coverage on MMR algorithm
- All retrieval strategies tested
- Compression edge cases covered

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `MMR diversity` | Similar documents | 1. Query 2. Check diversity | Non-redundant results |
| `hybrid retrieval` | Mixed content | 1. Query with rare term | Both lexical and semantic match |
| `HyDE expansion` | Knowledge base | 1. Query 2. Compare results | Better recall |
| `document compression` | Long document | 1. Ingest 2. Query | Chunks + summary indexed |
| `end-to-end REFRAG` | Full pipeline | 1. Ingest 2. Compress 3. Query 4. MMR | Quality results |

### End-to-End Flows
- Document ingested → Compressed/chunked → Indexed → Query → HyDE expansion → Hybrid search → MMR selection → Results

## Acceptance Criteria
1. MMR selection balances relevance and diversity
2. Hybrid retrieval combines BM25 and vector
3. RRF correctly fuses multiple result sets
4. HyDE generates useful hypothetical documents
5. Document compression with chunking and summarization
6. All retrieval methods configurable (lambda, k, etc.)
7. Performance acceptable (< 500ms for retrieval)
8. Integration with existing memory system

## Review Checklist
- [ ] Is MMR lambda configurable per query?
- [ ] Does BM25 index update with new documents?
- [ ] Are HyDE generations cached?
- [ ] Is chunk overlap handled correctly at boundaries?
- [ ] Does RRF handle missing documents from one source?
- [ ] Are embeddings cached for efficiency?

## Dependencies
- Depends on: Day 36 (Memory system), Day 4 (Basic RAG)
- Blocks: Day 40 (Domain pipelines use enhanced RAG)

## Risk Factors
- **HyDE latency** — Mitigation: Cache hypotheticals, async generation
- **BM25 index size** — Mitigation: Pruning, incremental updates
- **MMR computation** — Mitigation: Limit candidate set size
- **Over-diversification** — Mitigation: Tune lambda parameter
