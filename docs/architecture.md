# OppMon (Arkon) Architecture

**Last Updated:** 2026-05-11 (init sync)

## Important: Repository Structure

This is a **pnpm + Turborepo monorepo** with the following structure:

| Directory | Status | Purpose |
|-----------|--------|---------|
| `apps/api/` | **ACTIVE** | Express API server (@oppmon/api) |
| `apps/router/` | **ACTIVE** | LiteLLM proxy router (@oppmon/router) |
| `apps/web/` | **ACTIVE** | Next.js frontend (@oppmon/web) |
| `packages/database/` | **ACTIVE** | Prisma schema and client (@oppmon/database) |
| `packages/shared/` | **ACTIVE** | Shared TypeScript types (@oppmon/shared) |
| `packages/cli/` | **ACTIVE** | CLI tool for AI Gateway management (@oppmon/cli) |
| `packages/create-oppmon/` | **ACTIVE** | npm scaffold (`create-oppmon`) — bootstraps a new workstation |
| `packages/agent-engine/` | **ACTIVE** | Agent execution primitives (@arkon/agent-engine) |
| `packages/guardrails/` | **ACTIVE** | Safety / policy enforcement (@arkon/guardrails) |
| `packages/observability/` | **ACTIVE** | Tracing, metrics, latency (@arkon/observability) |
| `packages/skill-framework/` | **ACTIVE** | Skill registry and workflow (@arkon/skill-framework) |
| `packages/integration-tests/` | **ACTIVE** | Cross-package integration tests (@arkon/integration-tests) |
| `packages/tsconfig/` | **ACTIVE** | Shared TypeScript configs (@oppmon/tsconfig) |
| `packages/engine-core/` | **ACTIVE** | Rust workspace for high-performance utilities |
| `arkon-reference-only/` | **READ-ONLY** | Original monorepo — reference only, never modify |

## Overview

Arkon is an AI Gateway platform that provides observability, security, and management capabilities for AI agent deployments. The platform consists of a Next.js frontend application and an Express backend API, backed by PostgreSQL with TimescaleDB for time-series data.

## Tech Stack

### Frontend (`apps/web/`)
- **Framework**: Next.js 15 with React 19
- **Styling**: Tailwind CSS 3.4
- **UI Components**: Radix UI primitives
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Flow Diagrams**: @xyflow/react
- **Charts**: Recharts
- **Testing**: Vitest, Playwright

### Backend (`apps/api/`)
- **Runtime**: Node.js 20+
- **Framework**: Express 4.21
- **Database**: PostgreSQL 15 with TimescaleDB + pgvector (via Prisma)
- **Authentication**: JWT + OAuth 2.0 (GitHub via Arctic)
- **LLM Providers**: Anthropic Claude, Cerebras, Ollama (local)
- **Embeddings**: OpenAI text-embedding-3-small
- **RAG**: Context retrieval with semantic search
- **Validation**: Zod
- **Logging**: Pino, Morgan
- **Real-time**: WebSocket (ws), Web Push
- **Security**: Helmet, CORS, compression

### Rust Engine (`packages/engine-core/`)
- **Common**: Envelope<T>, Error types, SHA-256 hashing
- **NAPI**: Node.js bindings (planned)

### Infrastructure
- **Monorepo**: pnpm + Turborepo
- **Containerization**: Docker, Docker Compose
- **Database**: TimescaleDB (PostgreSQL extension)
- **CI/CD**: GitHub Actions

## System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                           │
│  Browser / Mobile / CLI / AI Agents                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
│  - Server Components     - React Flow diagrams             │
│  - Client Components     - Real-time updates               │
│  - API Routes            - Dashboard & Analytics           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Express)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Middleware  │  │  Services   │  │  WebSocket  │         │
│  │ - OAuth     │  │  - Agents   │  │  - Events   │         │
│  │ - JWT       │  │  - Workflows│  │  - Alerts   │         │
│  │ - Validate  │  │  - Analytics│  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  ┌───────────────────────┐  ┌────────────────────────────┐ │
│  │  PostgreSQL (Prisma)  │  │  TimescaleDB               │ │
│  │  - Tenants, Teams     │  │  - Events (time-series)    │ │
│  │  - Users, Agents      │  │  - Metrics                 │ │
│  │  - Workflows          │  │  - Audit Logs              │ │
│  └───────────────────────┘  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Key Modules

### Frontend Modules
- **Dashboard**: Main overview with metrics and charts
- **Agents**: Agent management and monitoring
- **Workflows**: Workflow builder and automation
- **Events**: Real-time event stream
- **Analytics**: Usage and cost analytics
- **Security**: ThreatGuard and security monitoring

### Backend Modules
- **Auth**: JWT + OAuth 2.0 (GitHub) authentication
- **Agents**: Agent CRUD and lifecycle management
- **Events**: Event ingestion and streaming
- **Teams**: Team management and membership
- **Workflows**: Workflow execution engine
- **Analytics**: Aggregation and reporting
- **Admin**: Administrative operations
- **Skills**: Skills registry with versioning
- **LLM**: Multi-provider LLM proxy (Anthropic, Cerebras, Ollama)
- **RAG**: Retrieval-augmented generation service
- **Embeddings**: Vector embedding generation and storage
- **Search**: Hybrid search (BM25 + vector + RRF)
- **MCP**: Model Context Protocol server registry
- **Usage**: Privacy-first usage analytics (tenant-level aggregation)
- **Models**: Multi-provider model configuration with secrets vault
- **Virtual Keys**: API key management for CLI/SDK access
- **Routing**: LiteLLM-based model routing orchestration (`@oppmon/router` proxy)
- **Document Ingestion**: PDF (pdf-parse), DOCX (mammoth), multipart streaming (busboy)
- **Agent Subsystem**: Oracle loop, semantic cache, memory manager, toolbox, domain pipelines

### Shared Packages
- **@oppmon/cli**: CLI tool for AI Gateway management (`tag` command)
- **create-oppmon**: npm scaffold that bootstraps a new workstation (env files, dev DB, install)
- **@oppmon/database**: Prisma schema with multi-tenancy, pgvector support
- **@oppmon/shared**: TypeScript types (JWTClaims, Role, TeamMembership), provider templates
- **@oppmon/tsconfig**: Base TypeScript configurations
- **@arkon/agent-engine**: Agent execution primitives (wire format, replay, risk, tools)
- **@arkon/guardrails**: Constitution, scope, filter, audit guardrails
- **@arkon/observability**: Tracing, metrics, latency (Langfuse + prom-client peers)
- **@arkon/skill-framework**: YAML frontmatter skill registry and workflow runner
- **@arkon/integration-tests**: Cross-package smoke + integration tests
- **engine-core**: Rust workspace for high-performance utilities

## Multi-Tenancy Model

```
Tenant
  ├── Users (role: TENANT_ADMIN | TEAM_ADMIN | MEMBER)
  ├── Teams
  │     └── TeamMembers (role: ADMIN | MEMBER)
  └── Agents
```

## Recent Decisions

See [Architecture Decision Records](decisions/index.md) for detailed decisions.

## Diagrams

- [System Architecture](diagrams/architecture.md)
- [Dependencies](diagrams/dependencies.md)
- [Data Model](diagrams/data-model.md)
- [Deployment](diagrams/deployment.md)

## Flows

- [Request Flow](flows/request-flow.md)
- [Auth Flow](flows/auth-flow.md)
- [Data Flow](flows/data-flow.md)
- [Error Flow](flows/error-flow.md)

## CLI Documentation

- [CLI Setup Guide](cli-setup-guide.md) - 9-step setup for Arkon CLI
- [CLI Coding Workflows](cli-coding-workflows.md) - Practical workflows for coding and bug fixing

## Week 5 Features (Days 29-34)

### Admin Actions Framework
- Bulk operations with audit logging
- Job queue for retry actions
- Progress tracking for long-running operations

### Migration Safety
- Pre-migration safety checks
- Reversibility verification
- Staged rollout support

### CI/CD Pipeline
- GitHub Actions workflow
- Environment-based deployments
- Automated testing gates

### Deployment Runbooks
- Pre-deployment checklist
- Step-by-step procedures
- Rollback documentation
- Incident response guides

See [Admin User Guide](admin-user-guide.md) for admin features and [Runbooks](runbooks/README.md) for operational procedures.

## Open Questions

- [x] Multi-tenancy isolation approach — **Resolved: Tenant/Team/User model with Prisma**
- [x] Admin action framework — **Resolved: Decorator-based actions with audit logging**
- [x] Deployment procedures — **Resolved: Runbooks created**
- [ ] Redis caching strategy for high-volume events
- [ ] Message queue for async processing (considering BullMQ)
- [ ] Rate limiting strategy per tenant
- [ ] Parallel backend consideration (FastAPI Python or Rust+Go) — deferred
