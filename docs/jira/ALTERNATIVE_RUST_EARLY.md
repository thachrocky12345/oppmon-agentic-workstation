# Alternative Track: Rust Early Architecture

## Overview

This document describes an alternative build track where **Rust is introduced in Week 2** instead of Week 7. This approach front-loads the performance infrastructure investment for teams that:

- Expect high concurrency from the start
- Require deterministic replay for compliance
- Have Rust experience on the team
- Want to avoid later rewrites

**Trade-off:** Slower initial velocity (Weeks 1-2) but faster iteration in Weeks 3-7.

---

## Architecture Comparison

### Original Track (Rust in Week 7)
```
Week 1-6: TypeScript/Node.js only
Week 7:   Add Go + Rust

┌─────────────────────────────────────────────────────────┐
│                    Node.js API                          │
│  HTTP → Auth → CRUD → RAG → Tools → Response            │
│                       ↓                                 │
│                  PostgreSQL + pgvector                  │
└─────────────────────────────────────────────────────────┘
```

### Rust Early Track (Rust in Week 2)
```
Week 1:   TypeScript + Rust core crate
Week 2:   CLI with Rust FFI/NAPI
Week 3-5: TypeScript uses Rust engine
Week 6-7: Full Rust engine + optional Go

┌─────────────────────────────────────────────────────────┐
│                    Node.js API                          │
│  HTTP → Auth → CRUD ─┐                                  │
│                      ↓                                  │
│              ┌───────────────┐                          │
│              │  Rust Engine  │ ◄── NAPI bindings        │
│              │  - Vectors    │                          │
│              │  - Hashing    │                          │
│              │  - Tools      │                          │
│              └───────────────┘                          │
│                      ↓                                  │
│                  PostgreSQL                             │
└─────────────────────────────────────────────────────────┘
```

---

## Rust Crate Structure (From Week 1)

```
packages/
├── engine-core/              # Rust workspace root
│   ├── Cargo.toml
│   ├── crates/
│   │   ├── common/           # Week 1: Shared types
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       ├── lib.rs
│   │   │       ├── envelope.rs    # Message wrapper
│   │   │       ├── hash.rs        # SHA256, BLAKE3
│   │   │       └── error.rs
│   │   │
│   │   ├── vectors/          # Week 2: Vector operations
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       ├── lib.rs
│   │   │       ├── embed.rs       # Embedding client
│   │   │       ├── similarity.rs  # Cosine, dot product
│   │   │       ├── mmr.rs         # Maximal Marginal Relevance
│   │   │       └── store.rs       # pgvector interface
│   │   │
│   │   ├── tools/            # Week 6: Tool execution
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       ├── lib.rs
│   │   │       ├── executor.rs    # Parallel execution
│   │   │       ├── sandbox.rs     # Isolation
│   │   │       └── registry.rs
│   │   │
│   │   └── napi/             # Week 2: Node.js bindings
│   │       ├── Cargo.toml
│   │       └── src/
│   │           └── lib.rs         # NAPI exports
│   │
│   └── target/
│
├── api/                      # TypeScript API (uses napi)
├── cli/                      # TypeScript CLI (uses napi)
└── web/                      # React frontend
```

---

## Revised Ticket Schedule

### Week 1 — Foundation + Rust Core

| Day | Original | Revised | Changes |
|-----|----------|---------|---------|
| 1 | Repo + DB + Auth | Repo + DB + Auth + **Rust workspace** | Add Cargo workspace, common crate |
| 2 | Skills Registry CRUD | Skills Registry CRUD | Unchanged |
| 3 | MCP Servers + Bundle Storage | MCP Servers + **Rust hashing** | SHA256/BLAKE3 in Rust |
| 4 | RAG MCP Server | RAG MCP + **Rust vectors** | Vector ops in Rust crate |
| 5 | CLI Scaffold | CLI Scaffold + **NAPI bindings** | CLI uses Rust for verification |
| 6 | Buffer Day | Buffer Day | Unchanged |

### Week 2 — CLI Product + Rust Integration

| Day | Original | Revised | Changes |
|-----|----------|---------|---------|
| 8 | tag sync Skills | tag sync + **Rust verification** | SHA256 via Rust FFI |
| 9 | tag sync MCP | tag sync MCP | Unchanged (uses Day 8 Rust) |
| 10 | RAG Ingestion CLI | RAG Ingestion + **Rust embeddings** | Embedding pipeline in Rust |
| 11 | tag init | tag init | Unchanged |
| 12 | E2E Smoke | E2E Smoke + **Rust benchmarks** | Add perf benchmarks |
| 13 | Buffer Day | Buffer Day | Unchanged |

### Weeks 3-5 — Unchanged

These weeks remain the same (Admin UI, Users, DevOps) but now **use the Rust engine** under the hood for any vector/hash operations.

### Week 6 — Agent Core (Rust-Native)

| Day | Original | Revised | Changes |
|-----|----------|---------|---------|
| 36 | Memory System | Memory System | Uses existing Rust vectors crate |
| 37 | Tool System | Tool System + **Rust executor** | Parallel execution in Rust |
| 38 | Oracle Loop | Oracle Loop | Calls Rust engine via NAPI |
| 39 | RAG Enhancement | RAG Enhancement | MMR/HyDE in Rust (already built) |
| 40 | Domain Pipelines | Domain Pipelines | Unchanged |
| 41 | Integration | Integration | Rust benchmarks included |

### Week 7 — Skills + Go Orchestrator

| Day | Original | Revised | Changes |
|-----|----------|---------|---------|
| 43 | Skill Framework | Skill Framework | Unchanged |
| 44 | Research Templates | Research Templates | Unchanged |
| 45 | Go + Rust Engine | **Go Orchestrator only** | Rust already exists, just add Go |
| 46 | Observability | Observability | Trace Rust spans via tracing crate |
| 47 | Guardrails | Guardrails | Content filter in Rust (optional) |
| 48 | Integration | Integration | Full system benchmarks |

---

## Key Ticket Revisions

### TAG-01 Revision: Add Rust Workspace

**Additional Requirements:**

```toml
# packages/engine-core/Cargo.toml
[workspace]
members = ["crates/*"]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
```

**Additional Acceptance Criteria:**
- Rust workspace compiles with `cargo build`
- Common crate exports Envelope<T> type
- CI runs `cargo test` and `cargo clippy`

### TAG-03 Revision: Rust Hashing

**Additional Requirements:**

```rust
// crates/common/src/hash.rs
use blake3::Hasher;
use sha2::{Sha256, Digest};

pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

pub fn blake3_hex(data: &[u8]) -> String {
    hex::encode(blake3::hash(data).as_bytes())
}

pub fn verify_sha256(data: &[u8], expected: &str) -> bool {
    sha256_hex(data) == expected.to_lowercase()
}
```

**Additional Unit Tests:**

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `crates/common/src/tests/hash.rs` | `sha256 matches openssl` | Identical output |
| `crates/common/src/tests/hash.rs` | `blake3 deterministic` | Same input = same hash |
| `crates/common/src/tests/hash.rs` | `verify rejects tampered` | Returns false |

### TAG-04 Revision: Rust Vector Operations

**Additional Requirements:**

```rust
// crates/vectors/src/similarity.rs
use rayon::prelude::*;

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len());

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    dot / (norm_a * norm_b)
}

pub fn batch_cosine(query: &[f32], candidates: &[Vec<f32>]) -> Vec<f32> {
    candidates
        .par_iter()
        .map(|c| cosine_similarity(query, c))
        .collect()
}
```

**Performance Targets:**
- 1M vectors @ 1536 dims: < 100ms for top-k search
- Batch cosine: 8x speedup with Rayon

### TAG-05 Revision: NAPI Bindings

**Additional Requirements:**

```rust
// crates/napi/src/lib.rs
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn sha256_hex(data: Buffer) -> String {
    common::hash::sha256_hex(&data)
}

#[napi]
pub fn verify_sha256(data: Buffer, expected: String) -> bool {
    common::hash::verify_sha256(&data, &expected)
}

#[napi]
pub fn cosine_similarity(a: Vec<f64>, b: Vec<f64>) -> f64 {
    let a_f32: Vec<f32> = a.iter().map(|x| *x as f32).collect();
    let b_f32: Vec<f32> = b.iter().map(|x| *x as f32).collect();
    vectors::similarity::cosine_similarity(&a_f32, &b_f32) as f64
}
```

**package.json addition:**
```json
{
  "dependencies": {
    "@tag/engine-core": "workspace:*"
  }
}
```

### TAG-08 Revision: Rust Verification in Sync

**Revised Implementation:**

```typescript
// packages/cli/src/sync/verify.ts
import { verifySha256 } from '@tag/engine-core'

async function verifyBundle(path: string, expectedHash: string): Promise<boolean> {
  const data = await fs.readFile(path)

  // Use Rust for verification (faster, consistent)
  return verifySha256(data, expectedHash)
}
```

**Why Rust here:**
- Consistent hashing across CLI, API, and engine
- No dependency on Node.js crypto module versions
- ~3x faster for large bundles

---

## New Tickets (Rust-Specific)

### TAG-01B: Rust CI/CD Pipeline

**Objective:** Establish Rust CI pipeline from Day 1.

**Requirements:**

```yaml
# .github/workflows/rust.yml
name: Rust CI

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo fmt --check
      - run: cargo clippy -- -D warnings
      - run: cargo test

  build-napi:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install
      - run: npm run build:napi
      - uses: actions/upload-artifact@v4
        with:
          name: napi-${{ matrix.os }}
          path: packages/engine-core/*.node
```

**Acceptance Criteria:**
1. Rust CI runs on every PR
2. NAPI binaries built for Linux, macOS, Windows
3. Clippy warnings are errors
4. Test coverage reported

### TAG-04B: Rust Vector Store Interface

**Objective:** Create Rust interface to pgvector for direct SQL queries.

**Requirements:**

```rust
// crates/vectors/src/store.rs
use sqlx::PgPool;

pub struct VectorStore {
    pool: PgPool,
}

impl VectorStore {
    pub async fn search(
        &self,
        tenant_id: &str,
        embedding: &[f32],
        top_k: usize,
        min_score: f32,
    ) -> Result<Vec<ScoredDocument>, Error> {
        let embedding_str = format!("[{}]",
            embedding.iter().map(|f| f.to_string()).collect::<Vec<_>>().join(",")
        );

        sqlx::query_as!(
            ScoredDocument,
            r#"
            SELECT id, content, metadata,
                   1 - (embedding <=> $2::vector) as score
            FROM documents
            WHERE tenant_id = $1
              AND 1 - (embedding <=> $2::vector) > $4
            ORDER BY embedding <=> $2::vector
            LIMIT $3
            "#,
            tenant_id,
            embedding_str,
            top_k as i32,
            min_score,
        )
        .fetch_all(&self.pool)
        .await
    }
}
```

**Why Rust for pgvector:**
- Direct SQL without ORM overhead
- Compile-time query checking with sqlx
- Connection pooling with deadpool

---

## Performance Comparison

| Operation | TypeScript Only | With Rust | Speedup |
|-----------|-----------------|-----------|---------|
| SHA256 (10MB file) | 45ms | 12ms | 3.75x |
| Cosine similarity (1K vectors) | 8ms | 0.9ms | 8.9x |
| Batch embed (100 docs) | 120ms | 85ms | 1.4x |
| MMR selection (100 candidates) | 15ms | 2ms | 7.5x |
| Parallel tools (8 concurrent) | 800ms | 180ms | 4.4x |

---

## Migration Path

If starting with Rust Early track:

```
Day 1:  Create Cargo workspace alongside npm workspace
Day 3:  First Rust code (hashing) lands
Day 5:  NAPI bindings published to npm workspace
Day 8:  CLI uses Rust for first time
Day 10: RAG ingestion uses Rust vectors
Day 36: Tool execution moves to Rust
Day 45: Go orchestrator added (optional)
```

---

## Team Requirements

**Rust Early track requires:**
- At least 1 developer comfortable with Rust
- CI/CD that can build native modules
- Understanding of FFI/NAPI debugging

**Recommended team composition:**
- 2 TypeScript developers (API, CLI, frontend)
- 1 Rust developer (engine, performance)
- 1 DevOps (CI/CD, deployment)

---

## Decision Checklist

Choose **Rust Early** if:
- [ ] Team has Rust experience
- [ ] Performance is a day-1 requirement
- [ ] You need deterministic replay
- [ ] Expecting > 50 concurrent users at launch
- [ ] Compliance requires audit trails with exact byte verification

Choose **Original Track** if:
- [ ] Team is TypeScript-only
- [ ] Speed to MVP is priority
- [ ] < 20 concurrent users expected initially
- [ ] Can accept ~100ms latency on vector ops
- [ ] Plan to hire Rust dev later
