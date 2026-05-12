# Flow Diagrams

**Last Updated:** 2026-05-11 (init sync)

This directory contains Mermaid flow diagrams showing how data and processes move through the OppMon (Arkon) system.

## Flows

| File | Description | Last Updated |
|------|-------------|--------------|
| [request-flow.md](request-flow.md) | API request lifecycle with middleware chain (incl. tenant-context, access, idempotency) | 2026-05-11 (init sync) |
| [auth-flow.md](auth-flow.md) | JWT + GitHub OAuth authentication | 2026-05-11 (init sync) |
| [data-flow.md](data-flow.md) | Data pipeline with LLM/RAG/embeddings | 2026-05-11 (init sync) |
| [error-flow.md](error-flow.md) | Error propagation and handling | 2026-05-11 (init sync) |

## Cross-Domain Flows

End-to-end sequence diagrams covering single user actions that touch multiple domains (audit + outbox + notifications + RLS triggers). Added 2026-05-10 alongside the schema-improvement consolidation.

| File | Description | Last Updated |
|------|-------------|--------------|
| [cross-domain/chat-message-end-to-end.md](cross-domain/chat-message-end-to-end.md) | POST /api/llm/chat → llm_sessions → llm_messages → usage_events → events → audit_log_v2 → event_outbox → outbox-publisher | 2026-05-10 |
| [cross-domain/incident-creation.md](cross-domain/incident-creation.md) | Agent → incidents → audit_log_v2 → event_outbox → notifications fanout to all tenant admins | 2026-05-10 |
| [cross-domain/tenant-deletion.md](cross-domain/tenant-deletion.md) | Admin DELETE /admin/tenants/:id → BEFORE DELETE trigger → tenant_archives + tenant_deletion_audit → ON DELETE CASCADE | 2026-05-10 |
| [../solve-v2.md](../solve-v2.md) | Graph-mode chat: web → KnowledgeSearchBackend `/solve_v2` (SSE) → live planner+searcher DAG → final synthesis | 2026-05-12 |

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
- LiteLLM proxy via `apps/router` (http-proxy-middleware)
- Embedding generation (OpenAI) and RAG context retrieval
- Hybrid search (BM25 + vector + RRF fusion)
- Document ingestion (busboy + pdf-parse + mammoth)
- Agent oracle loop with semantic cache, memory, toolbox, guardrails
- Storage to PostgreSQL, TimescaleDB, and pgvector

### Error Flow
Documents error handling including:
- Validation errors (Zod)
- Authentication/authorization errors
- Prisma database errors
- LLM provider errors
- Standardized error responses

### Cross-Domain Flows
End-to-end sequence diagrams that span multiple subsystems (API → DB → triggers → outbox → workers → web UI) and show exactly which tables get touched in what order:
- **Chat message** — full lifecycle of `POST /api/llm/chat` from web UI through LLM provider, MCP tool calls, audit logging, usage tracking, and the outbox enqueue that fans out to downstream workers.
- **Incident creation** — atomic write of `incidents` + `audit_log_v2` + `event_outbox` in one transaction, then async fanout to per-user `notifications` rows for every admin in the tenant.
- **Tenant deletion** — GDPR-grade hard delete: GUC contract (`app.delete_reason`, `app.current_actor_id`), `tenants_snapshot_trigger` archives the tenant and writes a `tenant_deletion_audit` receipt, then `ON DELETE CASCADE` cleans up everything.

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
