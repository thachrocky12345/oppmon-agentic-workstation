# CLAUDE.md - Arkon Workstation

This file provides context for Claude Code when working in this repository.

---

## CRITICAL: Read-Only Reference Directory

**DO NOT MODIFY** the `arkon-reference-only/` directory.

This directory contains the original monorepo code and is **FOR REFERENCE ONLY**. Use it to understand patterns, copy implementations, or check how features work — but **NEVER edit files in this directory**.

**All code changes must go to:**
- `apps/api/` — Express API server (@arkon/api)
- `apps/web/` — Next.js frontend (@arkon/web)
- `packages/cli/` — CLI tool for AI Gateway management (@arkon/cli)
- `packages/database/` — Prisma schema and client (@arkon/database)
- `packages/shared/` — Shared TypeScript types (@arkon/shared)
- `packages/engine-core/` — Rust high-performance utilities

---

## CRITICAL: Database Column Naming (Prisma uses camelCase)

**Prisma generates database columns in camelCase, NOT snake_case.**

When writing raw SQL queries, you **MUST** use double-quoted camelCase column names:

```sql
-- CORRECT (camelCase with double quotes)
SELECT id, "tenantId", "createdAt" FROM users WHERE "isActive" = true

-- WRONG (snake_case will fail with "column does not exist")
SELECT id, tenant_id, created_at FROM users WHERE is_active = true
```

### Common Column Mappings

| Wrong (snake_case) | Correct (camelCase) |
|--------------------|---------------------|
| `tenant_id` | `"tenantId"` |
| `created_at` | `"createdAt"` |
| `updated_at` | `"updatedAt"` |
| `source_type` | `"sourceType"` |
| `source_id` | `"sourceId"` |
| `is_active` | `"isActive"` |
| `password_hash` | `"passwordHash"` |
| `team_id` | `"teamId"` |
| `user_id` | `"userId"` |

### Why?

PostgreSQL lowercases unquoted identifiers. Since Prisma creates camelCase columns, you must quote them to preserve case. Without quotes, `tenantId` becomes `tenantid` which doesn't exist.

**Full documentation:** [docs/database-conventions.md](docs/database-conventions.md)

**Best practice:** Prefer Prisma Client (`prisma.model.findMany()`) over raw SQL when possible.

---

## Init Behavior (ALWAYS FOLLOW)

Whenever `/init` is run:
1. Read `.claude/skills/init/SKILL.md` and follow it completely
2. Read `.claude/skills/diagrams/SKILL.md` and follow it completely
3. Update CLAUDE.md — refresh structure, stack, modules, known dependencies
4. Update `docs/architecture.md` — timestamp, new layers, new dependencies
5. Check and process `docs/decisions/.pending_adr_review`
6. Update `docs/decisions/index.md`
7. Generate or update ALL diagrams in `docs/diagrams/`
8. Generate or update ALL flows in `docs/flows/`
9. Update `docs/diagrams/index.md` and `docs/flows/index.md`
10. Confirm with: "✅ Init sync complete — updated: [files], diagrams: [list], flows: [list]"

**DO NOT skip any step even if nothing seems changed. Always regenerate diagrams.**

---

## Known Dependencies
<!-- Claude auto-updates this section on every /init — do not edit manually -->

**Last synced:** 2026-05-05 (init sync)

### Reference Only (arkon-reference-only/) — DO NOT MODIFY
| Package | Version | Category |
|---------|---------|----------|
| next | ^16.1.7 | Framework |
| react | 19.2.3 | Framework |
| react-dom | 19.2.3 | Framework |
| @xyflow/react | ^12.10.1 | Visualization |
| recharts | ^3.8.0 | Visualization |
| framer-motion | ^12.35.1 | Animation |
| lucide-react | ^0.577.0 | Icons |
| cmdk | ^1.1.1 | Command Palette |
| sonner | ^2.0.7 | Toast Notifications |
| pg | ^8.20.0 | Database |
| bcryptjs | ^3.0.3 | Auth |
| ws | ^8.20.0 | WebSocket |
| web-push | ^3.6.7 | Push Notifications |
| marked | ^13.0.3 | Markdown |
| dompurify | ^3.3.2 | HTML Sanitization |
| tailwindcss | ^4 | Styling |
| typescript | ^5 | DevTools |
| vitest | ^4.1.5 | Testing |
| @playwright/test | ^1.58.2 | E2E Testing |
| @axe-core/playwright | ^4.11.1 | A11y Testing |

### Frontend (apps/web — @arkon/web)
| Package | Version | Category |
|---------|---------|----------|
| next | ^15.0.0 | Framework |
| react | ^19.0.0 | Framework |
| react-dom | ^19.0.0 | Framework |
| @xyflow/react | ^12.10.1 | Visualization |
| recharts | ^2.12.0 | Visualization |
| framer-motion | ^11.0.0 | Animation |
| lucide-react | ^0.400.0 | Icons |
| cmdk | ^1.1.1 | Command Palette |
| sonner | ^1.5.0 | Toast Notifications |
| @radix-ui/* | ^1.1.x | UI Components |
| clsx | ^2.1.1 | Utilities |
| tailwind-merge | ^2.5.0 | Utilities |
| class-variance-authority | ^0.7.0 | Utilities |
| tailwindcss | ^3.4.0 | Styling |
| typescript | ^5.6.0 | DevTools |
| vitest | ^2.0.0 | Testing |
| @playwright/test | ^1.47.0 | E2E Testing |

### Backend (apps/api — @arkon/api)
| Package | Version | Category |
|---------|---------|----------|
| express | ^4.21.0 | Framework |
| pg | ^8.20.0 | Database |
| @prisma/client | ^5.22.0 | ORM (via @arkon/database) |
| jsonwebtoken | ^9.0.2 | Auth |
| bcryptjs | ^3.0.3 | Auth |
| arctic | ^2.1.0 | OAuth |
| @anthropic-ai/sdk | ^0.39.0 | LLM |
| openai | ^4.77.0 | LLM/Embeddings |
| zod | ^3.23.0 | Validation |
| ws | ^8.20.0 | Real-time |
| web-push | ^3.6.7 | Notifications |
| helmet | ^7.1.0 | Security |
| cors | ^2.8.5 | Security |
| compression | ^1.7.4 | Performance |
| morgan | ^1.10.0 | Logging |
| pino | ^9.2.0 | Logging |
| pino-pretty | ^11.2.0 | Logging |
| marked | ^13.0.3 | Markdown |
| dompurify | ^3.3.2 | HTML Sanitization |
| jsdom | ^24.1.0 | DOM |
| @paralleldrive/cuid2 | ^2.2.2 | ID Generation |
| typescript | ^5.6.0 | DevTools |
| tsx | ^4.19.0 | DevTools |
| vitest | ^2.0.0 | Testing |
| supertest | ^7.0.0 | Testing |

### Database (packages/database — @arkon/database)
| Package | Version | Category |
|---------|---------|----------|
| @prisma/client | ^5.22.0 | ORM |
| prisma | ^5.22.0 | ORM |
| bcryptjs | ^3.0.3 | Auth |

### CLI (packages/cli — @arkon/cli)
| Package | Version | Category |
|---------|---------|----------|
| commander | ^12.1.0 | CLI Framework |
| chalk | ^5.3.0 | Terminal Styling |
| ora | ^8.0.1 | Spinners |
| keytar | ^7.9.0 | Credential Storage |
| open | ^10.1.0 | Open URLs |
| conf | ^13.0.0 | Config Storage |

### Monorepo (root)
| Package | Version | Category |
|---------|---------|----------|
| turbo | ^2.0.0 | Build Tool |
| pnpm | ^9.0.0 | Package Manager |

---

## Project Overview

Arkon is an AI Gateway platform that provides observability, security, and management capabilities for AI agent deployments. The platform consists of a Next.js frontend and an Express backend API, backed by PostgreSQL with TimescaleDB for time-series event data.

**Key capabilities:**
- AI agent registration and monitoring
- Event ingestion and real-time streaming
- Workflow automation
- Security threat detection (ThreatGuard)
- Cost tracking and analytics
- Incident management

---

## Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router) + React 19
- **Styling:** Tailwind CSS 3.4
- **UI Library:** Radix UI primitives
- **Visualization:** Recharts, @xyflow/react
- **Animation:** Framer Motion
- **Testing:** Vitest (unit), Playwright (e2e)

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express 4.21
- **Database:** PostgreSQL 15 + TimescaleDB
- **Auth:** JWT + bcrypt
- **Validation:** Zod
- **Real-time:** WebSocket (ws)
- **Logging:** Pino
- **Testing:** Vitest + Supertest

### Infrastructure
- **Containers:** Docker, Docker Compose
- **Database:** TimescaleDB (time-series extension for PostgreSQL)

---

## Project Structure

```
arkon-workstation/
├── .claude/                    # Claude Code configuration
│   ├── hooks/                  # Post-init hooks
│   ├── settings.json           # Claude Code settings
│   └── skills/                 # Claude Code skills
│       ├── init/               # Init synchronization skill
│       ├── diagrams/           # Diagram generation skill
│       └── [other skills...]   # Domain-specific skills
│
├── arkon-reference-only/       # ⛔ READ-ONLY — DO NOT MODIFY
│   └── (original monorepo)     # Reference code only, never edit
│
├── apps/
│   ├── api/                    # ✅ Express API server (@arkon/api)
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic services
│   │   │   ├── lib/            # Database, JWT, OAuth, LLM, RAG
│   │   │   ├── middleware/     # Express middleware
│   │   │   └── index.ts        # Entry point
│   │   ├── scripts/            # Migrations, seeds
│   │   └── package.json
│   │
│   └── web/                    # ✅ Next.js frontend (@arkon/web)
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   └── lib/            # Utilities, API client
│       └── package.json
│
├── packages/
│   ├── cli/                    # ✅ CLI tool (@arkon/cli)
│   │   ├── src/
│   │   │   ├── commands/       # CLI commands
│   │   │   ├── lib/            # CLI utilities
│   │   │   └── index.ts        # Entry point
│   │   └── package.json
│   │
│   ├── database/               # ✅ Prisma schema (@arkon/database)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   └── seed.ts         # Seed data
│   │   └── package.json
│   │
│   ├── shared/                 # ✅ Shared types (@arkon/shared)
│   │   ├── src/
│   │   │   ├── types.ts        # JWTClaims, Role, etc.
│   │   │   └── constants.ts    # Shared constants
│   │   └── package.json
│   │
│   ├── engine-core/            # ✅ Rust utilities
│   │   ├── crates/
│   │   │   ├── common/         # Envelope<T>, Error, Hash
│   │   │   └── napi/           # Node.js bindings
│   │   └── Cargo.toml
│   │
│   └── tsconfig/               # Shared TypeScript configs
│
├── docs/                       # Documentation
│   ├── architecture.md         # Architecture overview
│   ├── decisions/              # ADRs
│   ├── diagrams/               # Mermaid architecture diagrams
│   └── flows/                  # Mermaid flow diagrams
├── docker-compose.yml          # Development stack
├── turbo.json                  # Turborepo configuration
├── pnpm-workspace.yaml         # pnpm workspace definition
├── Makefile                    # Common commands
└── CLAUDE.md                   # This file
```

---

## Key Modules

### Backend Routes (apps/api/src/routes/)
| Module | Location | Purpose |
|--------|----------|---------|
| Auth | `auth.ts` | JWT authentication, login/register |
| OAuth | `oauth.ts` | GitHub OAuth flow |
| Agents | `agents.ts` | Agent CRUD operations |
| Events | `events.ts` | Event ingestion & streaming |
| Workflows | `workflows.ts` | Workflow automation |
| Dashboard | `dashboard.ts` | Aggregated metrics |
| Incidents | `incidents.ts` | Incident management |
| Analytics | `analytics.ts` | Usage analytics |
| Costs | `costs.ts` | Cost tracking |
| Security | `security.ts` | Security overview |
| Compliance | `compliance.ts` | Audit & compliance |
| Notifications | `notifications.ts` | Push notifications |
| Gateway | `gateway.ts` | AI Gateway proxy |
| Admin | `admin.ts` | Admin operations |
| Infra | `infra.ts` | Infrastructure mgmt |
| Journal | `journal.ts` | Agent journal entries |
| Tools | `tools.ts` | Developer tools |
| Skills | `skills.ts` | Skills registry CRUD |
| LLM | `llm.ts` | LLM provider proxy |
| RAG | `rag.ts` | RAG context retrieval |
| Embedding | `embedding.ts` | Vector embeddings API |
| MCP | `mcp.ts` | MCP server registry |
| Usage | `usage.ts` | Privacy-first usage analytics |
| Teams | `teams.ts` | Team management |
| Health | `health.ts` | Health checks |

### Backend Services (apps/api/src/services/)
| Module | Location | Purpose |
|--------|----------|---------|
| Audit | `audit.ts` | Audit log recording |
| Skills | `skills.ts` | Skills business logic |
| LLM | `llm.ts` | Multi-provider LLM orchestration |
| RAG | `rag.ts` | RAG pipeline service |
| Embedding | `embedding.ts` | Embedding generation |
| Embedding Hooks | `embedding-hooks.ts` | Auto-embed on model changes |
| Search | `search.ts` | Hybrid search orchestration |
| MCP | `mcp.ts` | MCP server management |

### Backend LLM Providers (apps/api/src/lib/llm/)
| Module | Location | Purpose |
|--------|----------|---------|
| Anthropic | `anthropic.ts` | Claude API client |
| Cerebras | `cerebras.ts` | Cerebras API client |
| Ollama | `ollama.ts` | Local Ollama client |
| Types | `types.ts` | Shared LLM types |

### Backend Middleware (apps/api/src/middleware/)
| Module | Location | Purpose |
|--------|----------|---------|
| Auth | `request-auth.ts` | JWT verification |
| RBAC | `rbac.ts` | Role-based access control |
| Rate Limiter | `rate-limiter.ts` | Rate limiting |
| Error Handler | `error-handler.ts` | Error responses |

### Backend Libs (apps/api/src/lib/)
| Module | Location | Purpose |
|--------|----------|---------|
| Database | `db.ts` | Prisma client instance |
| JWT | `jwt.ts` | JWT sign/verify |
| OAuth | `oauth.ts` | Arctic OAuth helpers |
| RBAC | `rbac.ts` | RBAC utilities |
| Audit | `audit.ts` | Audit logging |
| RAG | `rag/` | RAG context builder |
| Embedding | `embedding/` | OpenAI embeddings |
| Search | `search/` | Hybrid search (BM25 + vector + RRF) |
| LLM | `llm/` | Multi-provider LLM clients |

### Backend Search Lib (apps/api/src/lib/search/)
| Module | Location | Purpose |
|--------|----------|---------|
| BM25 | `bm25.ts` | BM25 keyword search implementation |
| Vector | `vector.ts` | Vector similarity search |
| RRF | `rrf.ts` | Reciprocal Rank Fusion |
| Taxonomy | `taxonomy.ts` | Query classification |
| Confidence | `confidence.ts` | Result confidence scoring |
| Config | `config.ts` | Search configuration |
| Types | `types.ts` | Search types |

### Frontend Modules (apps/web/src/)
| Module | Location | Purpose |
|--------|----------|---------|
| App Shell | `app/layout.tsx` | Root layout |
| Home | `app/page.tsx` | Landing page |
| API Client | `lib/api.ts` | Backend API calls |

### Shared Packages
| Package | Location | Purpose |
|---------|----------|---------|
| @arkon/cli | `packages/cli/` | CLI tool for AI Gateway management |
| @arkon/database | `packages/database/` | Prisma schema with multi-tenancy |
| @arkon/shared | `packages/shared/` | JWTClaims, Role, TeamMembership types |
| @arkon/tsconfig | `packages/tsconfig/` | Base TypeScript configs |
| engine-core | `packages/engine-core/` | Rust: Envelope<T>, Error, SHA-256 |

### Reference Only: arkon-reference-only/src/ — DO NOT MODIFY
> Use this table to find reference implementations. Copy patterns to apps/api/ or apps/web/.

| Module | Location | Purpose |
|--------|----------|---------|
| Dashboard | `app/page.tsx` | Main dashboard |
| Agents | `app/agents/` | Agent management |
| Agent Detail | `app/agent/[id]/` | Single agent view |
| Workflows | `app/workflows/` | Workflow builder |
| Analytics | `app/analytics/` | Usage analytics |
| Security | `app/security/` | ThreatGuard |
| Costs | `app/costs/` | Cost tracking |
| Incidents | `app/incidents/` | Incident mgmt |
| Fleet | `app/fleet/` | Fleet overview |
| Infrastructure | `app/infrastructure/` | Infra nodes |
| Compliance | `app/compliance/` | Audit logs |
| Admin | `app/admin/` | Admin panel |
| Settings | `app/settings/` | User settings |
| Login | `app/login/` | Authentication |
| Setup | `app/setup/` | Onboarding wizard |
| Journal | `app/journal/` | Agent journals |
| Traces | `app/traces/` | Distributed tracing |
| Tools | `app/tools/` | Developer tools |

---

## Conventions

### Code Style
- **Type hints:** Required for all function parameters and returns
- **Docstrings:** JSDoc style for public APIs
- **Formatter:** Prettier (auto-formatted on save)
- **Linter:** ESLint 9.0

### Testing
- **Unit tests:** Vitest, colocated as `*.test.ts`
- **Integration tests:** Supertest for API routes
- **E2E tests:** Playwright in `e2e/` directory
- **Coverage:** Minimum 80% for critical paths

### Git
- **Branch naming:** `feature/`, `fix/`, `chore/` prefixes
- **Commits:** Conventional commits (feat:, fix:, docs:, etc.)
- **PRs:** Required review before merge

### Diagrams
- **Format:** Mermaid inside markdown fences
- **Location:** `docs/diagrams/` and `docs/flows/`
- **Updates:** Regenerated on every `/init`
- **Style:** Always include plain-English explanation above diagram

---

## API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/health/live | Liveness probe |
| GET | /api/health/ready | Readiness probe |

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | User registration |
| POST | /api/auth/login | User login |
| POST | /api/auth/logout | User logout |
| GET | /api/auth/me | Current user |

### Core Resources
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/agents | Agent management |
| GET/POST | /api/events | Event stream |
| GET/POST | /api/workflows | Workflow automation |
| GET/POST | /api/incidents | Incident management |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/dashboard | Dashboard data |
| GET | /api/analytics | Usage analytics |
| GET | /api/costs | Cost tracking |

---

## Development Commands

```bash
# Setup (first time)
pnpm install
pnpm docker:up         # Start PostgreSQL + TimescaleDB
pnpm db:push           # Push Prisma schema
pnpm db:seed           # Seed database

# Or use the setup script
pnpm setup             # All of the above in one command

# Development
pnpm dev               # Start all (api + web) via Turborepo
pnpm dev:api           # Start API only
pnpm dev:web           # Start web only

# Docker profiles
pnpm docker:up         # Database only (default)
pnpm docker:up:dev     # Database + API + Web (hot reload)
pnpm docker:up:prod    # Production build
pnpm docker:up:full    # All services including Redis
pnpm docker:down       # Stop all
pnpm docker:logs       # View logs

# Database
pnpm db:generate       # Regenerate Prisma client
pnpm db:push           # Push schema changes
pnpm db:migrate        # Run migrations
pnpm db:seed           # Seed data
pnpm db:studio         # Open Prisma Studio
pnpm db:reset          # Reset and reseed

# Testing
pnpm test              # Run all tests
pnpm test:coverage     # With coverage

# Build
pnpm build             # Build all packages
pnpm typecheck         # Type check all
pnpm lint              # Lint all
```

---

## Documentation Links

- [Architecture Overview](docs/architecture.md)
- [Database Conventions](docs/database-conventions.md) - **MUST READ before writing SQL**
- [Architecture Diagrams](docs/diagrams/index.md)
- [Flow Diagrams](docs/flows/index.md)
- [ADRs](docs/decisions/index.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Local Development](docs/LOCAL_DEVELOPMENT.md)
- [API README](apps/api/README.md) - API setup, endpoints, and troubleshooting

---

## Quick Reference

### Ports
| Service | Port |
|---------|------|
| Frontend | 3002 (dev), 3000 (container) |
| Backend | 3001 |
| PostgreSQL | 5433 (host), 5432 (container) |

### Environment Files
| File | Purpose |
|------|---------|
| `arkon-backend/.env` | Backend config |
| `arkon-frontend/.env.local` | Frontend config |
| `.env` (root) | Docker Compose overrides |

### Important Files
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Dev stack definition |
| `arkon-backend/src/index.ts` | Backend entry |
| `arkon-frontend/app/layout.tsx` | Frontend root layout |
| `docs/architecture.md` | Architecture overview |
