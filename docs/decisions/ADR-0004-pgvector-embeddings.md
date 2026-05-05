# ADR-0004: [AUTO] Vector Embeddings with pgvector

**Date:** 2026-05-05

**Status:** Accepted

## Context

The platform requires semantic search capabilities for:
- Finding relevant skills based on natural language queries
- RAG (Retrieval-Augmented Generation) context retrieval
- Similarity-based agent and document discovery
- Intelligent search across tenant knowledge bases

Traditional keyword search is insufficient for understanding intent and semantic meaning.

## Decision

Implement **pgvector** extension for PostgreSQL with **OpenAI embeddings**.

Key implementation:
- PostgreSQL pgvector extension enabled via Prisma
- Embedding model: `text-embedding-3-small` (1536 dimensions)
- Embedding service in `apps/api/src/lib/embedding/`
- Auto-embedding hooks on model changes (`services/embedding-hooks.ts`)
- RAG context builder in `apps/api/src/lib/rag/`
- HNSW index for fast approximate nearest neighbor search

Supported source types for embeddings:
- `skill` - Skill definitions
- `agent` - Agent descriptions
- `journal` - Agent journal entries
- `document` - Uploaded documents (future)

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Pinecone | Managed, scalable | Cost, external dependency | Want data in-house |
| Weaviate | Full-featured vector DB | Additional infrastructure | PostgreSQL already in stack |
| Elasticsearch | Mature, hybrid search | Heavy, complex deployment | Overkill for current scale |
| Milvus | High performance | Kubernetes-centric | Too complex for dev setup |
| ChromaDB | Simple, embedded | Not production-ready | Need PostgreSQL-level reliability |

## Consequences

### Positive

- All data stays in PostgreSQL (single database)
- Transactional consistency with relational data
- No additional infrastructure to manage
- HNSW index provides fast similarity search
- Natural integration with Prisma (via raw queries for vector ops)
- Cost-effective (no per-query vector DB charges)

### Negative

- Vector columns require raw SQL (Prisma doesn't support natively)
- Performance may lag dedicated vector DBs at very large scale
- Need to manage embedding generation and storage separately
- OpenAI API dependency for embedding generation (cost per token)
- Embedding model upgrades require re-embedding all content

## Related

- [Data Flow Diagram](../flows/data-flow.md) - Embedding and RAG flows
- [Data Model Diagram](../diagrams/data-model.md) - Embedding table
- `apps/api/src/lib/embedding/` - Embedding generation
- `apps/api/src/lib/rag/` - RAG context retrieval
- `packages/database/prisma/schema.prisma` - Embedding model
