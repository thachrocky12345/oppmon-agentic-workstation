# ADR-0012: Residency Model — Centralize Metadata, Isolate Content

**Date:** 2026-05-14

**Status:** Accepted

## Context

OppMon (Arkon) targets regulated-sector buyers (healthcare, finance, public
sector) that require a defensible answer to four questions before they will
sign a contract:

1. **Where does my data live?** (storage region, jurisdiction)
2. **Who else can see it?** (cross-tenant isolation guarantees)
3. **Can I run this in my own VPC?** (BYO-VPC topology)
4. **What leaves the boundary?** (telemetry, third-party LLM calls)

Today the platform mixes three concerns in one cluster:

- **Control-plane metadata** — tenants, users, models, billing, audit logs.
  This is small, transactional, and we want it centralized so support and
  observability work.
- **Customer content** — RAG documents, chunks, embeddings, chat messages,
  uploaded files. This is large, sensitive, and the part regulators care about.
- **Compute** — planner / searcher / LLM clients that touch both above.

Mixing them in one cluster works for SaaS but blocks the two deployment modes
regulated buyers actually want: **single-tenant managed** (their dedicated
stack in our infra) and **BYO-VPC** (our images, their cloud account).

We need a decision that:

- Lets a SaaS tenant keep working with zero changes.
- Lets a single-tenant buyer pin storage + embeddings + LLM to one region.
- Lets a BYO-VPC buyer run the whole thing in their account with no outbound
  calls except to LLM endpoints they explicitly approve.
- Does not require a separate codebase per topology.

## Decision

We adopt a **"centralize metadata, isolate content"** residency model with
three pillars and three deployment topologies.

### Pillar 1 — Tenant ID is enforced at both the chunk and document SQL layer

Every retrieval query MUST filter by `tenant_id` on both `rag_chunks` and
`rag_documents` (the join target). This is denormalized on purpose: a single
missing predicate in one place cannot leak data because the other layer
re-filters.

The mandatory cross-tenant negative test from TAG-59 codifies this:

```python
# apps/agent_graph_backend/.../tests/rag/test_corpus_search.py
async def test_tenant_b_cannot_retrieve_tenant_a_chunk(...):
    hits = await corpus.search(
        "alpha-secret-12345",
        tenant_id=b_user.tenant_id,
        collection_ids=[a_collection.id],
    )
    assert hits == []
```

This test is the security boundary. Every retrieval surface (Python `/solve`,
TypeScript `apps/api`) MUST have its own copy.

### Pillar 2 — Pluggable provider seams (storage, embedding, LLM)

The platform must not assume one S3 bucket, one OpenAI account, or one
Anthropic key. Three seams are declared as Protocols/interfaces and have at
least two concrete impls:

| Seam | Protocol location | Reference impl | Required impls |
|------|------------------|----------------|----------------|
| Storage | `apps/api/src/lib/storage/local-disk.ts` | LocalDiskStorage | S3, AzureBlob (TAG-79) |
| Embedding (Python) | `apps/agent_graph_backend/agent_search/agent_v2/rag/embedding.py` | OpenAIEmbeddingProvider, FakeEmbeddingProvider (TAG-60) | base_url-overridable OpenAI |
| Embedding (TS) | `apps/api/src/lib/embedding/` | OpenAI | base_url-overridable parity (TAG-80) |
| LLM | `apps/agent_graph_backend/agent_search/agent_v2/llm/factory.py` | Anthropic, OpenAI, fake | + Azure OpenAI, + AWS Bedrock (TAG-83) |

The seam shape (constructor takes credentials, `base_url`, region) is what
makes BYO-VPC work — the customer points each seam at their own endpoints.

### Pillar 3 — Three deployment topologies, one codebase

| Topology | Who runs DB | Who runs storage | Who runs LLM | Telemetry |
|----------|-------------|------------------|--------------|-----------|
| **SaaS (default)** | Arkon | Arkon (region-pinned) | Arkon-keyed providers OR customer-keyed | Arkon-hosted, redacted |
| **Single-tenant managed** | Arkon (dedicated cluster) | Arkon (region-pinned per contract) | Customer-keyed only | Arkon-hosted, redacted |
| **BYO-VPC** | Customer | Customer | Customer-keyed only | Customer-hosted, no outbound |

There is one set of container images. Topology is a config bundle (env vars,
DSNs, region pins). The image set is identical so we don't fork
maintenance burden.

The BYO-VPC upgrade channel — how customers receive new images — is governed
by [ADR-0013](./ADR-0013-byo-vpc-upgrade-channel.md).

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Single global DB, row-level tenant_id only | Simplest ops | One missed WHERE clause leaks everything; impossible to credibly answer "where is my data" for a non-US tenant | Doesn't pass regulated-sector procurement |
| Per-tenant DB (database-per-tenant) | Strongest isolation | Ops nightmare at 100s of tenants; schema migrations multiplied; cross-tenant analytics gone | Operationally infeasible at our scale target |
| Separate codebase per topology (SaaS fork vs BYO-VPC fork) | Each fork can be hardened independently | Drift; bug fixes have to land twice; feature parity slips | Maintenance cost too high |
| Run BYO-VPC as a thin proxy back to Arkon | Reuse SaaS infra | Defeats the whole point — customer data still transits Arkon | Doesn't solve the actual buyer requirement |

## Consequences

### Positive

- One codebase, three topologies. Bug fixes land once.
- Cross-tenant isolation is provable: there is a negative test in CI that
  fails the build if the predicate is dropped.
- BYO-VPC story exists without a fork — customer swaps three configs
  (storage, embedding, LLM) and points DB at their cluster.
- Regulated-sector buyers can audit one set of file paths to verify the
  isolation claim.
- The "centralize metadata, isolate content" framing is something support
  and procurement can both say in one sentence.

### Negative

- Double-filtering (chunk + document tenant_id) costs one extra index lookup
  per query. Acceptable — measured under 200ms on 100k chunks in TAG-59 work.
- Every new retrieval surface MUST add its own cross-tenant negative test.
  This is process burden enforced by PR review and the redaction-lint CI
  step from TAG-84.
- BYO-VPC customers carry their own upgrade ops. We do not push images into
  their account. This is a deliberate tradeoff — see ADR-0013.
- The "pluggable seam" discipline means new features have to thread credentials
  through the seam rather than reading a global env var. Slower to write,
  faster to audit.

## Related

- [ADR-0013: BYO-VPC Upgrade Channel](./ADR-0013-byo-vpc-upgrade-channel.md)
- [ADR-0011: FastAPI KnowledgeSearchBackend](./ADR-0011-fastapi-knowledgesearch-backend.md) — the Python service this residency model applies to
- [ADR-0004: pgvector Embeddings](./ADR-0004-pgvector-embeddings.md) — the storage layer for chunks
- [docs/residency/architecture.md](../residency/architecture.md) — long-form architecture story
- [docs/residency/topology.md](../residency/topology.md) — three-topology Mermaid diagrams
- [TAG-78 epic](../jira/TAG-78-residency-governance-hardening-epic.md) — the implementation arc
- [TAG-59](../jira/TAG-59-corpus-search.md) — the cross-tenant test pattern this ADR locks in
- [TAG-60](../jira/TAG-60-embedding-provider.md) — the embedding seam pattern this ADR locks in
