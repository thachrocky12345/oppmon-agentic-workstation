# CLAUDE.md - Arkon Workstation

This file provides context for Claude Code when working in this repository.

---

## CRITICAL: Read-Only Reference Directory

**DO NOT MODIFY** the `arkon-reference-only/` directory.

This directory contains the original monorepo code and is **FOR REFERENCE ONLY**. Use it to understand patterns, copy implementations, or check how features work — but **NEVER edit files in this directory**.

**All code changes must go to:**
- `apps/api/` — Express API server (@oppmon/api)
- `apps/web/` — Next.js frontend (@oppmon/web)
- `apps/router/` — LiteLLM proxy router (@oppmon/router)
- `packages/cli/` — CLI tool for AI Gateway management (@oppmon/cli)
- `packages/database/` — Prisma schema and client (@oppmon/database)
- `packages/shared/` — Shared TypeScript types (@oppmon/shared)
- `packages/agent-engine/` — Reusable agent execution primitives (@arkon/agent-engine)
- `packages/guardrails/` — Safety / policy enforcement (@arkon/guardrails)
- `packages/observability/` — Tracing, metrics, latency (@arkon/observability)
- `packages/skill-framework/` — Skill definition framework (@arkon/skill-framework)
- `packages/integration-tests/` — Cross-package integration tests (@arkon/integration-tests)
- `packages/engine-core/` — Rust high-performance utilities

---

## CRITICAL: Database Column Naming (snake_case with @map)

**Database columns use snake_case for Go/Rust compatibility.**

The Prisma schema uses camelCase in TypeScript but maps to snake_case columns via `@map()` directives.

When writing raw SQL queries, use **snake_case** column names (no quotes needed):

```sql
-- CORRECT (snake_case in raw SQL)
SELECT id, tenant_id, created_at FROM users WHERE is_active = true

-- In TypeScript/Prisma (camelCase)
prisma.user.findMany({ where: { isActive: true } })
```

### Column Naming Convention

| Prisma (camelCase) | Database (snake_case) |
|--------------------|----------------------|
| `tenantId` | `tenant_id` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `sourceType` | `source_type` |
| `sourceId` | `source_id` |
| `isActive` | `is_active` |
| `passwordHash` | `password_hash` |
| `teamId` | `team_id` |
| `userId` | `user_id` |

### Why snake_case?

- **Go/Rust compatibility**: Standard convention for these languages
- **SQL ergonomics**: No quoting needed in raw queries
- **Industry standard**: Most ORMs and databases use snake_case

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

**Last synced:** 2026-05-07 (init sync)

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

### Frontend (apps/web — @oppmon/web)
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
| react-markdown | ^10.1.0 | Markdown Rendering |
| remark-gfm | ^4.0.1 | Markdown (GFM) |
| jose | ^5.2.0 | JWT verify (middleware) |
| zod | ^3.23.0 | Validation |
| tailwindcss | ^3.4.0 | Styling |
| @tailwindcss/typography | ^0.5.19 | Styling |
| typescript | ^5.6.0 | DevTools |
| vitest | ^2.0.0 | Testing |
| @playwright/test | ^1.47.0 | E2E Testing |

### Backend (apps/api — @oppmon/api)
| Package | Version | Category |
|---------|---------|----------|
| express | ^4.21.0 | Framework |
| pg | ^8.20.0 | Database |
| @prisma/client | ^5.22.0 | ORM (via @oppmon/database) |
| jsonwebtoken | ^9.0.2 | Auth |
| bcryptjs | ^3.0.3 | Auth |
| arctic | ^2.1.0 | OAuth |
| cookie-parser | ^1.4.6 | Auth/Sessions |
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
| busboy | ^1.6.0 | Multipart Uploads |
| pdf-parse | ^2.4.5 | Document Ingestion |
| mammoth | ^1.12.0 | Document Ingestion (DOCX) |
| mustache | ^4.2.0 | Templating |
| tweetnacl | ^1.0.3 | Crypto |
| dockerode | ^4.0.0 | Docker SDK (LiteLLM orchestration) |
| dotenv | ^16.4.5 | Config |
| @paralleldrive/cuid2 | ^2.2.2 | ID Generation |
| typescript | ^5.6.0 | DevTools |
| tsx | ^4.19.0 | DevTools |
| vitest | ^2.0.0 | Testing |
| supertest | ^7.0.0 | Testing |

### Router (apps/router — @oppmon/router)
| Package | Version | Category |
|---------|---------|----------|
| express | ^4.21.0 | Framework |
| http-proxy-middleware | ^3.0.0 | Reverse Proxy |
| @oppmon/database | workspace:* | ORM |
| @oppmon/shared | workspace:* | Types |
| bcryptjs | ^3.0.3 | Auth |
| cors | ^2.8.5 | Security |
| helmet | ^7.1.0 | Security |
| pino | ^9.2.0 | Logging |
| dotenv | ^16.4.5 | Config |

### Database (packages/database — @oppmon/database)
| Package | Version | Category |
|---------|---------|----------|
| @prisma/client | ^5.22.0 | ORM |
| prisma | ^5.22.0 | ORM |
| bcryptjs | ^3.0.3 | Auth |

### CLI (packages/cli — @oppmon/cli)
| Package | Version | Category |
|---------|---------|----------|
| commander | ^12.1.0 | CLI Framework |
| chalk | ^5.3.0 | Terminal Styling |
| ora | ^8.0.1 | Spinners |
| keytar | ^7.9.0 | Credential Storage |
| open | ^10.1.0 | Open URLs |
| conf | ^13.0.0 | Config Storage |

### Agent / Skill / Safety Packages
| Package | Version | Category |
|---------|---------|----------|
| @arkon/agent-engine | workspace | Agent execution primitives (oracle loop, replay, risk, tools) |
| @arkon/guardrails | workspace | Constitution, scope, filter, audit guardrails |
| @arkon/observability | workspace | Tracing, metrics, latency (Langfuse/prom-client peers) |
| @arkon/skill-framework | workspace | YAML frontmatter skill registry + workflow runner |
| @arkon/integration-tests | workspace | Cross-package integration & smoke tests |
| zod | ^3.23.0 | Schema validation (shared across all) |
| yaml | ^2.4.5 | Skill frontmatter parsing |
| chokidar | ^3.6.0 | Skill registry file watching |
| glob | ^10.3.10 | Skill discovery |

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
│   ├── api/                    # ✅ Express API server (@oppmon/api)
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic services
│   │   │   ├── lib/            # db, jwt, oauth, llm, rag, search, embedding, storage, crypto
│   │   │   ├── middleware/     # Express middleware
│   │   │   ├── validators/     # Provider connection validators
│   │   │   ├── agent/          # Oracle loop, memory, semantic cache, toolbox, pipelines
│   │   │   └── index.ts        # Entry point
│   │   ├── scripts/            # Migrations, seeds, smoke tests
│   │   └── package.json
│   │
│   ├── router/                 # ✅ LiteLLM proxy router (@oppmon/router)
│   │   ├── src/
│   │   │   ├── index.ts        # Express bootstrap
│   │   │   └── proxy.ts        # http-proxy-middleware wiring
│   │   └── package.json
│   │
│   └── web/                    # ✅ Next.js frontend (@oppmon/web)
│       ├── src/
│       │   ├── app/            # App Router pages (incl. (dashboard) group)
│       │   ├── components/     # Reusable components
│       │   ├── schemas/        # Zod schemas
│       │   ├── lib/            # Utilities, API client
│       │   └── middleware.ts   # Auth middleware (jose)
│       └── package.json
│
├── packages/
│   ├── cli/                    # ✅ CLI tool (@oppmon/cli)
│   │   ├── src/
│   │   │   ├── commands/       # CLI commands
│   │   │   ├── lib/            # CLI utilities
│   │   │   └── index.ts        # Entry point
│   │   └── package.json
│   │
│   ├── database/               # ✅ Prisma schema (@oppmon/database)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   └── seed.ts         # Seed data
│   │   └── package.json
│   │
│   ├── shared/                 # ✅ Shared types (@oppmon/shared)
│   │   ├── src/
│   │   │   ├── types.ts        # JWTClaims, Role, etc.
│   │   │   ├── providers/      # Provider templates
│   │   │   └── constants.ts    # Shared constants
│   │   └── package.json
│   │
│   ├── agent-engine/           # ✅ Agent primitives (@arkon/agent-engine)
│   │   └── src/                # wire, replay, risk, tools, types
│   │
│   ├── guardrails/             # ✅ Safety/policy (@arkon/guardrails)
│   │   └── src/                # constitution, scope, filter, audit, tools
│   │
│   ├── observability/          # ✅ Tracing/metrics (@arkon/observability)
│   │   └── src/                # tracing, metrics, latency, langfuse
│   │
│   ├── skill-framework/        # ✅ Skill registry (@arkon/skill-framework)
│   │   └── src/                # parser, frontmatter, registry, workflow
│   │
│   ├── integration-tests/      # ✅ Cross-package tests (@arkon/integration-tests)
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
| RAG Chat | `rag-chat.ts` | RAG-augmented chat completion |
| RAG Admin | `rag-admin.ts` | RAG document management |
| Embedding | `embedding.ts` | Vector embeddings API |
| MCP | `mcp.ts` | MCP server registry |
| Usage | `usage.ts` | Privacy-first usage analytics |
| Teams | `teams.ts` | Team management |
| Health | `health.ts` | Health checks |
| Models | `models.ts` | Model configuration CRUD |
| Virtual Keys | `virtual-keys.ts` | Virtual key management |
| CLI Routing | `cli-routing.ts` | CLI model routing endpoint |

### Backend Services (apps/api/src/services/)
| Module | Location | Purpose |
|--------|----------|---------|
| Audit | `audit.ts` | Audit log recording |
| Skills | `skills.ts` | Skills business logic |
| LLM | `llm.ts` | Multi-provider LLM orchestration |
| RAG | `rag.ts` | RAG pipeline service |
| RAG Chat | `rag-chat.ts` | RAG chat completion service |
| RAG Retriever | `rag-retriever.ts` | Advanced document retrieval |
| Advanced RAG | `advanced-rag.ts` | Complex RAG workflows |
| Toolbox | `toolbox.ts` | Comprehensive toolbox service |
| Embedding | `embedding.ts` | Embedding generation |
| Embedding Hooks | `embedding-hooks.ts` | Auto-embed on model changes |
| Search | `search.ts` | Hybrid search orchestration |
| MCP | `mcp.ts` | MCP server management |
| Models | `models.ts` | Model configuration service |
| LiteLLM Config | `litellm-config-generator.ts` | LiteLLM YAML generation |
| LiteLLM Orchestrator | `litellm-orchestrator.ts` | LiteLLM container management |

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
| Storage | `storage/local-disk.ts` | Pluggable file storage (local-disk impl) |
| RAG | `rag/` | RAG context builder |
| Embedding | `embedding/` | OpenAI embeddings |
| Search | `search/` | Hybrid search (BM25 + vector + RRF) |
| LLM | `llm/` | Multi-provider LLM clients |

### Backend Crypto (apps/api/src/crypto/)
| Module | Location | Purpose |
|--------|----------|---------|
| Secret Vault | `secret-vault.ts` | XChaCha20-Poly1305 encryption (tweetnacl) |

### Backend Agent Subsystem (apps/api/src/agent/)
| Module | Location | Purpose |
|--------|----------|---------|
| Oracle Loop | `oracle-loop.ts` | Iterative reasoning + tool dispatch |
| Memory Manager | `memory-manager.ts` + `memory-types.ts` | Short/long-term agent memory |
| Semantic Cache | `semantic-cache.ts` | Embedding-keyed prompt/result cache |
| Toolbox | `toolbox.ts` + `tools/` | Tool registry & execution |
| Domain Pipelines | `domain-pipelines.ts` | Domain-specific orchestration |
| Advanced RAG | `advanced-rag.ts` | Multi-stage RAG inside agent loop |

### Backend Validators (apps/api/src/validators/)
| Module | Location | Purpose |
|--------|----------|---------|
| Connection Validator | `connection-validator.ts` | Provider connection validation |
| Anthropic | `providers/anthropic.ts` | Anthropic provider validation |
| OpenAI | `providers/openai.ts` | OpenAI provider validation |
| Azure | `providers/azure.ts` | Azure OpenAI validation |
| Bedrock | `providers/bedrock.ts` | AWS Bedrock validation |
| Ollama | `providers/ollama.ts` | Ollama provider validation |
| Cerebras | `providers/cerebras.ts` | Cerebras provider validation |
| OpenAI Compatible | `providers/openai-compatible.ts` | Generic OpenAI-compatible validation |

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
| Dashboard | `app/(dashboard)/dashboard/page.tsx` | Main dashboard |
| Agents | `app/(dashboard)/agents/page.tsx` | Agent management |
| Events | `app/(dashboard)/events/page.tsx` | Event stream |
| Analytics | `app/(dashboard)/analytics/page.tsx` | Usage analytics |
| Costs | `app/(dashboard)/costs/page.tsx` | Cost tracking |
| Workflows | `app/(dashboard)/workflows/page.tsx` | Workflow automation |
| Incidents | `app/(dashboard)/incidents/page.tsx` | Incident management |
| Security | `app/(dashboard)/security/page.tsx` | ThreatGuard |
| Infrastructure | `app/(dashboard)/infrastructure/page.tsx` | Infrastructure nodes |
| Journal | `app/(dashboard)/journal/page.tsx` | Agent journals |
| Chat | `app/(dashboard)/chat/page.tsx` | RAG Chat interface |
| Notifications | `app/(dashboard)/notifications/page.tsx` | Notifications |
| API Client | `lib/api.ts` | Backend API calls |

### Shared Packages
| Package | Location | Purpose |
|---------|----------|---------|
| @oppmon/cli | `packages/cli/` | CLI tool for AI Gateway management (`tag` command) |
| @oppmon/database | `packages/database/` | Prisma schema with multi-tenancy |
| @oppmon/shared | `packages/shared/` | JWTClaims, Role, TeamMembership types, Provider templates |
| @oppmon/tsconfig | `packages/tsconfig/` | Base TypeScript configs |
| @arkon/agent-engine | `packages/agent-engine/` | Wire format, replay, risk classification, tool types |
| @arkon/guardrails | `packages/guardrails/` | Constitution, scope, filter, audit |
| @arkon/observability | `packages/observability/` | Tracing, metrics, latency, Langfuse |
| @arkon/skill-framework | `packages/skill-framework/` | YAML frontmatter, registry, workflow |
| @arkon/integration-tests | `packages/integration-tests/` | Cross-package smoke + integration tests |
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

### AI/LLM
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/llm/chat | LLM chat completion |
| POST | /api/rag/query | RAG context retrieval |
| POST | /api/rag/chat | RAG-augmented chat completion |
| GET/POST | /api/rag/admin | RAG document management |
| POST | /api/embedding | Generate embeddings |
| GET/POST | /api/skills | Skills registry |
| GET/POST | /api/mcp | MCP server registry |

### Model Routing
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/models | Model configuration |
| GET/POST | /api/virtual-keys | Virtual key management |
| POST | /api/cli/routing | CLI model routing |

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
- [CLI Setup Guide](docs/cli-setup-guide.md) - 9-step Arkon CLI setup
- [CLI Coding Workflows](docs/cli-coding-workflows.md) - Practical workflows for coding and bug fixing

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
| `apps/api/.env` | Backend config |
| `apps/web/.env.local` | Frontend config |
| `apps/router/.env` | Router proxy config |
| `.env` (root) | Docker Compose overrides |

### Important Files
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Dev stack definition (db, api, web, router, redis, prisma-studio) |
| `docker-stack.yml` | Production Docker Swarm stack |
| `apps/api/src/index.ts` | Backend entry |
| `apps/router/src/index.ts` | Router entry |
| `apps/web/src/app/layout.tsx` | Frontend root layout |
| `apps/web/src/middleware.ts` | Frontend auth middleware |
| `packages/database/prisma/schema.prisma` | Database schema |
| `docs/architecture.md` | Architecture overview |
