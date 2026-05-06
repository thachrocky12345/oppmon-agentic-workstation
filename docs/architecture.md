# Arkon Architecture

**Last Updated:** 2026-05-05 (synced)

## Important: Repository Structure

This is a **pnpm + Turborepo monorepo** with the following structure:

| Directory | Status | Purpose |
|-----------|--------|---------|
| `apps/api/` | **ACTIVE** | Express API server (@arkon/api) |
| `apps/web/` | **ACTIVE** | Next.js frontend (@arkon/web) |
| `packages/database/` | **ACTIVE** | Prisma schema and client (@arkon/database) |
| `packages/shared/` | **ACTIVE** | Shared TypeScript types (@arkon/shared) |
| `packages/tsconfig/` | **ACTIVE** | Shared TypeScript configs (@arkon/tsconfig) |
| `packages/engine-core/` | **ACTIVE** | Rust workspace for high-performance utilities |
| `packages/cli/` | **ACTIVE** | CLI tool for AI Gateway management (@arkon/cli) |
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

### Shared Packages
- **@arkon/cli**: CLI tool for AI Gateway management (tag command)
- **@arkon/database**: Prisma schema with multi-tenancy, pgvector support
- **@arkon/shared**: TypeScript types (JWTClaims, Role, TeamMembership)
- **@arkon/tsconfig**: Base TypeScript configurations
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

## Open Questions

- [x] Multi-tenancy isolation approach — **Resolved: Tenant/Team/User model with Prisma**
- [ ] Redis caching strategy for high-volume events
- [ ] Message queue for async processing (considering BullMQ)
- [ ] Rate limiting strategy per tenant
- [ ] Parallel backend consideration (FastAPI Python or Rust+Go) — deferred
