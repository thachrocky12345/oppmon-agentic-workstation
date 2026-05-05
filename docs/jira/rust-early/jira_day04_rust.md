# TAG-04-RUST: RAG MCP Server + Rust Vector Operations

## Description

**Suggested Points:** 13 (Critical — RAG ingestion with Rust vector operations, cross-tenant isolation security boundary, MMR diversity selection, SIMD-optimized similarity)

**Track:** Rust Early

## Objective

Implement the RAG MCP server with document ingestion, embedding generation, and vector search, using Rust for high-performance vector operations. **Cross-tenant isolation is the critical security boundary — tests MUST be written first.**

## Requirements

### Rust Vectors Crate

```rust
// packages/engine-core/crates/vectors/Cargo.toml
[package]
name = "vectors"
version.workspace = true
edition.workspace = true

[dependencies]
common = { path = "../common" }
rayon = "1.8"
serde.workspace = true

// packages/engine-core/crates/vectors/src/lib.rs
pub mod similarity;
pub mod mmr;
pub mod batch;

pub use similarity::{cosine_similarity, dot_product};
pub use mmr::mmr_select;
pub use batch::batch_cosine;
```

### Similarity Functions (SIMD-Ready)

```rust
// packages/engine-core/crates/vectors/src/similarity.rs

/// Compute cosine similarity between two vectors
#[inline]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len(), "Vectors must have same length");

    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    // Manual loop for potential SIMD optimization
    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    let denom = (norm_a.sqrt() * norm_b.sqrt()).max(1e-10);
    dot / denom
}

/// Compute dot product
#[inline]
pub fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len());
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Normalize vector to unit length
pub fn normalize(v: &mut [f32]) {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 1e-10 {
        v.iter_mut().for_each(|x| *x /= norm);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_vectors_similarity_1() {
        let v = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn orthogonal_vectors_similarity_0() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn opposite_vectors_similarity_neg1() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 1e-6);
    }
}
```

### Batch Operations (Rayon Parallel)

```rust
// packages/engine-core/crates/vectors/src/batch.rs
use rayon::prelude::*;
use crate::similarity::cosine_similarity;

/// Compute cosine similarity of query against all candidates in parallel
pub fn batch_cosine(query: &[f32], candidates: &[Vec<f32>]) -> Vec<f32> {
    candidates
        .par_iter()
        .map(|c| cosine_similarity(query, c))
        .collect()
}

/// Find top-k most similar vectors
pub fn top_k(query: &[f32], candidates: &[Vec<f32>], k: usize) -> Vec<(usize, f32)> {
    let mut scores: Vec<(usize, f32)> = candidates
        .par_iter()
        .enumerate()
        .map(|(i, c)| (i, cosine_similarity(query, c)))
        .collect();

    // Partial sort for top-k
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    scores.truncate(k);
    scores
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_cosine_parallel() {
        let query = vec![1.0, 0.0, 0.0];
        let candidates = vec![
            vec![1.0, 0.0, 0.0],  // sim = 1.0
            vec![0.0, 1.0, 0.0],  // sim = 0.0
            vec![0.5, 0.5, 0.0],  // sim = 0.707
        ];

        let scores = batch_cosine(&query, &candidates);
        assert!((scores[0] - 1.0).abs() < 1e-6);
        assert!(scores[1].abs() < 1e-6);
    }

    #[test]
    fn top_k_returns_best() {
        let query = vec![1.0, 0.0];
        let candidates: Vec<Vec<f32>> = (0..100)
            .map(|i| vec![i as f32, 100.0 - i as f32])
            .collect();

        let top = top_k(&query, &candidates, 5);
        assert_eq!(top.len(), 5);
        // Highest index should have highest cosine with [1, 0]
        assert_eq!(top[0].0, 99);
    }
}
```

### MMR Selection (Diversity)

```rust
// packages/engine-core/crates/vectors/src/mmr.rs
use crate::similarity::cosine_similarity;

/// Maximal Marginal Relevance selection
/// Balances relevance to query with diversity among selected results
///
/// lambda = 1.0: Pure relevance (may return redundant docs)
/// lambda = 0.0: Pure diversity (may return irrelevant docs)
/// lambda = 0.5: Balanced (recommended)
pub fn mmr_select(
    query: &[f32],
    candidates: &[(usize, Vec<f32>)],  // (id, embedding)
    n_results: usize,
    lambda: f32,
) -> Vec<usize> {
    if candidates.is_empty() || n_results == 0 {
        return vec![];
    }

    let mut selected: Vec<usize> = Vec::with_capacity(n_results);
    let mut selected_embeddings: Vec<&[f32]> = Vec::with_capacity(n_results);
    let mut remaining: Vec<usize> = (0..candidates.len()).collect();

    while selected.len() < n_results && !remaining.is_empty() {
        let mut best_score = f32::NEG_INFINITY;
        let mut best_idx = 0;

        for (pos, &cand_idx) in remaining.iter().enumerate() {
            let (_, ref embedding) = candidates[cand_idx];

            // Relevance to query
            let relevance = cosine_similarity(query, embedding);

            // Max similarity to already selected
            let max_sim = if selected_embeddings.is_empty() {
                0.0
            } else {
                selected_embeddings
                    .iter()
                    .map(|sel| cosine_similarity(embedding, sel))
                    .fold(f32::NEG_INFINITY, f32::max)
            };

            // MMR score
            let mmr_score = lambda * relevance - (1.0 - lambda) * max_sim;

            if mmr_score > best_score {
                best_score = mmr_score;
                best_idx = pos;
            }
        }

        let chosen_cand_idx = remaining.remove(best_idx);
        selected.push(candidates[chosen_cand_idx].0);
        selected_embeddings.push(&candidates[chosen_cand_idx].1);
    }

    selected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mmr_selects_diverse() {
        let query = vec![1.0, 0.0];

        // Three very similar candidates and one different
        let candidates = vec![
            (0, vec![0.99, 0.01]),  // Very similar to query
            (1, vec![0.98, 0.02]),  // Very similar to query and to 0
            (2, vec![0.97, 0.03]),  // Very similar to query and to 0,1
            (3, vec![0.0, 1.0]),    // Orthogonal - diverse!
        ];

        // With lambda=0.5, should pick 0 (most relevant) and 3 (most diverse)
        let selected = mmr_select(&query, &candidates, 2, 0.5);
        assert!(selected.contains(&0));
        assert!(selected.contains(&3));
    }

    #[test]
    fn mmr_lambda_1_pure_relevance() {
        let query = vec![1.0, 0.0];
        let candidates = vec![
            (0, vec![0.99, 0.01]),
            (1, vec![0.98, 0.02]),
            (2, vec![0.0, 1.0]),
        ];

        // lambda=1 should just pick by relevance
        let selected = mmr_select(&query, &candidates, 2, 1.0);
        assert_eq!(selected, vec![0, 1]);
    }
}
```

### NAPI Bindings for Vectors

```rust
// packages/engine-core/crates/napi/src/lib.rs additions

#[napi]
pub fn cosine_similarity(a: Vec<f64>, b: Vec<f64>) -> f64 {
    let a_f32: Vec<f32> = a.iter().map(|x| *x as f32).collect();
    let b_f32: Vec<f32> = b.iter().map(|x| *x as f32).collect();
    vectors::cosine_similarity(&a_f32, &b_f32) as f64
}

#[napi]
pub fn batch_cosine(query: Vec<f64>, candidates: Vec<Vec<f64>>) -> Vec<f64> {
    let query_f32: Vec<f32> = query.iter().map(|x| *x as f32).collect();
    let cands_f32: Vec<Vec<f32>> = candidates
        .iter()
        .map(|c| c.iter().map(|x| *x as f32).collect())
        .collect();

    vectors::batch::batch_cosine(&query_f32, &cands_f32)
        .into_iter()
        .map(|x| x as f64)
        .collect()
}

#[napi]
pub fn mmr_select(
    query: Vec<f64>,
    candidates: Vec<MmrCandidate>,
    n_results: u32,
    lambda: f64,
) -> Vec<u32> {
    let query_f32: Vec<f32> = query.iter().map(|x| *x as f32).collect();
    let cands_f32: Vec<(usize, Vec<f32>)> = candidates
        .into_iter()
        .map(|c| (c.id as usize, c.embedding.iter().map(|x| *x as f32).collect()))
        .collect();

    vectors::mmr::mmr_select(&query_f32, &cands_f32, n_results as usize, lambda as f32)
        .into_iter()
        .map(|x| x as u32)
        .collect()
}

#[napi(object)]
pub struct MmrCandidate {
    pub id: u32,
    pub embedding: Vec<f64>,
}
```

### Cross-Tenant Isolation (CRITICAL)

```typescript
// packages/rag-mcp/src/__tests__/isolation.integration.test.ts
// THESE TESTS MUST BE WRITTEN AND PASSING BEFORE ANY RAG IMPLEMENTATION

describe('CROSS-TENANT ISOLATION', () => {
  let tenantAJwt: string
  let tenantBJwt: string

  beforeAll(async () => {
    // Create two tenants
    const tenantA = await createTenant('tenant-a')
    const tenantB = await createTenant('tenant-b')

    tenantAJwt = await getJwtForTenant(tenantA.id)
    tenantBJwt = await getJwtForTenant(tenantB.id)

    // Ingest documents with unique phrases
    await ingestDocument(tenantAJwt, {
      content: 'This document contains the secret phrase alpha-secret-12345',
    })
    await ingestDocument(tenantAJwt, {
      content: 'Another alpha-secret-12345 document for tenant A',
    })
    await ingestDocument(tenantAJwt, {
      content: 'Third document with alpha-secret-12345 in tenant A',
    })

    await ingestDocument(tenantBJwt, {
      content: 'This document contains beta-secret-67890 for tenant B',
    })
    await ingestDocument(tenantBJwt, {
      content: 'Another beta-secret-67890 document',
    })
    await ingestDocument(tenantBJwt, {
      content: 'Third beta-secret-67890 document',
    })
  })

  it('tenant B JWT searching "alpha-secret" returns 0 results', async () => {
    const results = await searchDocs(tenantBJwt, 'alpha-secret-12345')
    expect(results).toHaveLength(0)
  })

  it('tenant A JWT searching "alpha-secret" returns 3 results', async () => {
    const results = await searchDocs(tenantAJwt, 'alpha-secret-12345')
    expect(results).toHaveLength(3)
  })

  it('tenant A JWT searching "beta-secret" returns 0 results', async () => {
    const results = await searchDocs(tenantAJwt, 'beta-secret-67890')
    expect(results).toHaveLength(0)
  })

  it('tenant B JWT searching "beta-secret" returns 3 results', async () => {
    const results = await searchDocs(tenantBJwt, 'beta-secret-67890')
    expect(results).toHaveLength(3)
  })

  it('extracts tenant_id from JWT, not query params', async () => {
    // Try to inject tenant_id via query param (should be ignored)
    const results = await fetch('/api/rag/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantBJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'alpha-secret-12345',
        tenant_id: 'tenant-a', // SHOULD BE IGNORED
      }),
    }).then(r => r.json())

    // Should return 0 because JWT is tenant B, not injected tenant A
    expect(results).toHaveLength(0)
  })

  it('returns 401 if JWT missing', async () => {
    const res = await fetch('/api/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    })
    expect(res.status).toBe(401)
  })
})
```

### RAG Service with Rust Vectors

```typescript
// packages/rag-mcp/src/rag.service.ts
import { batchCosine, mmrSelect, MmrCandidate } from '@tag/engine-napi'

export class RagService {
  async search(
    tenantId: string,  // FROM JWT ONLY
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { topK = 10, minScore = 0.5, useMmr = true, mmrLambda = 0.5 } = options

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query)

    // Fetch candidates from pgvector with tenant filter
    const candidates = await this.vectorStore.search(
      tenantId,  // CRITICAL: tenant isolation
      queryEmbedding,
      topK * 3,  // Fetch more for MMR reranking
      minScore,
    )

    if (!useMmr) {
      return candidates.slice(0, topK)
    }

    // Use Rust MMR for diversity selection
    const mmrCandidates: MmrCandidate[] = candidates.map((c, i) => ({
      id: i,
      embedding: c.embedding,
    }))

    const selectedIndices = mmrSelect(
      queryEmbedding,
      mmrCandidates,
      topK,
      mmrLambda,
    )

    return selectedIndices.map(i => candidates[i])
  }
}
```

## Implementation Notes

- **Backend:** RAG MCP server with TypeScript, Rust for vectors
- **Rust:** vectors crate with similarity, batch ops, MMR
- **Frontend:** N/A for this ticket
- **CLI:** RAG ingestion commands (Day 10)
- **Database:** documents table with pgvector, tenant_id index

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `crates/vectors/src/similarity.rs` | `identical vectors` | sim = 1.0 |
| `crates/vectors/src/similarity.rs` | `orthogonal vectors` | sim = 0.0 |
| `crates/vectors/src/batch.rs` | `parallel matches sequential` | Same results |
| `crates/vectors/src/mmr.rs` | `selects diverse` | Not all similar |
| `crates/vectors/src/mmr.rs` | `lambda=1 pure relevance` | Top by similarity |
| `crates/napi/src/lib.rs` | `napi cosine matches rust` | Identical |
| `packages/rag-mcp/src/__tests__/isolation.test.ts` | `tenant isolation` | **CRITICAL** |

### Test Coverage Requirements

- 100% on Rust vector operations
- Cross-tenant isolation tests MUST pass before implementation
- MMR edge cases covered

## Integration Tests

### Required Integration Tests

| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `cross-tenant isolation` | 2 tenants | See test above | **MUST PASS FIRST** |
| `MMR diversity` | 10 similar docs | 1. Search 2. Check diversity | Not all similar |
| `batch performance` | 10K vectors | 1. batch_cosine | < 50ms |
| `ingestion pipeline` | Document | 1. Ingest 2. Search | Found |

### End-to-End Flows

- Document → Embed → Store (with tenant_id) → Search (tenant filtered) → MMR → Results

## Acceptance Criteria

1. **Cross-tenant isolation tests pass FIRST**
2. Rust vectors crate with similarity functions
3. NAPI bindings for TypeScript
4. MMR selection for diversity
5. Batch operations with Rayon parallelism
6. RAG search respects tenant_id from JWT only
7. Query params cannot override tenant_id
8. Performance: 10K vectors < 50ms

## Review Checklist

- [ ] **Are isolation tests written BEFORE implementation?**
- [ ] Is tenant_id extracted from JWT only?
- [ ] Are query params never used for tenant_id?
- [ ] Does pgvector query include WHERE tenant_id = ?
- [ ] Is MMR lambda configurable?
- [ ] Are Rust vector ops tested against numpy?

## Dependencies

- Depends on: Day 1 (Rust workspace), Day 3 (NAPI bindings)
- Blocks: Day 10 (RAG CLI), Day 39 (RAG enhancement)

## Risk Factors

- **Tenant isolation failure** — Mitigation: Tests first, WHERE clause mandatory
- **Vector precision** — Mitigation: f32 sufficient, test against numpy
- **Large candidate sets** — Mitigation: Rayon parallel, limit to 10K
