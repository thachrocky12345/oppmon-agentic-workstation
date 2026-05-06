# Flow Diagrams

**Last Updated:** 2026-05-06 (init sync)

This directory contains Mermaid flow diagrams showing how data and processes move through the Arkon system.

## Flows

| File | Description | Last Updated |
|------|-------------|--------------|
| [request-flow.md](request-flow.md) | API request lifecycle with middleware chain | 2026-05-06 (init sync) |
| [auth-flow.md](auth-flow.md) | JWT + GitHub OAuth authentication | 2026-05-06 (init sync) |
| [data-flow.md](data-flow.md) | Data pipeline with LLM/RAG/embeddings | 2026-05-06 (init sync) |
| [error-flow.md](error-flow.md) | Error propagation and handling | 2026-05-06 (init sync) |

## Flow Types

### Request Flow
Shows the complete lifecycle of an API request from client through middleware (morgan, helmet, cors, compression, auth, RBAC), services, Prisma, database, and back.

### Auth Flow
Details the authentication process including:
- Email/password registration and login
- GitHub OAuth flow (via Arctic)
- JWT token generation and verification
- Protected route access with RBAC

### Data Flow
Illustrates how data enters the system through multiple channels:
- REST API and WebSocket for events
- LLM proxy for chat completions (Anthropic, Cerebras, Ollama)
- Embedding generation (OpenAI) and RAG context retrieval
- Hybrid search (BM25 + vector + RRF fusion)
- Storage to PostgreSQL, TimescaleDB, and pgvector

### Error Flow
Documents error handling including:
- Validation errors (Zod)
- Authentication/authorization errors
- Prisma database errors
- LLM provider errors
- Standardized error responses

## Usage

These diagrams help developers understand:
- Where to add new functionality
- How to handle edge cases
- Where errors should be caught
- How to trace data through the system
- How to integrate with LLM providers

## Updating Flows

Flows are automatically updated when running `/init`. If you add new middleware, services, or error handlers, run `/init` to regenerate these diagrams.

## Related Documentation

- [Architecture Diagrams](../diagrams/index.md) - System architecture diagrams
- [Architecture Overview](../architecture.md) - High-level architecture document
- [ADRs](../decisions/index.md) - Architecture Decision Records
