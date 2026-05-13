# System Architecture

**Last Updated:** 2026-05-12 (init sync)

## Overview

This diagram shows the high-level architecture of the OppMon (Arkon) AI Gateway platform. The platform is a pnpm + Turborepo monorepo with a Next.js frontend, an Express API, a dedicated LiteLLM proxy router, a Python FastAPI KnowledgeSearchBackend for graph-mode chat (`/solve_v2`), PostgreSQL with TimescaleDB and pgvector for storage, and a layered agent subsystem with guardrails and observability packages.

```mermaid
graph TD
    subgraph Clients["Client Layer"]
        Browser["Browser"]
        Mobile["Mobile App"]
        CLI["CLI (tag)"]
        AIAgents["AI Agents / SDKs"]
    end

    subgraph Frontend["Frontend (apps/web - Next.js 15)"]
        NextApp["Next.js App Router"]
        AuthMW["middleware.ts (jose)"]
        DashGroup["(dashboard) group<br/>agents / events / chat / costs / etc."]
        GraphProxy["/api/graph/solve proxy"]
        AgentGraphPanel["AgentGraphPanel<br/>(@xyflow/react)"]
        Markdown["react-markdown + remark-gfm"]
        ReactFlow["@xyflow/react"]
        Recharts["Recharts"]
        CMDK["cmdk Palette"]
    end

    subgraph Router["Router (apps/router - @oppmon/router)"]
        ProxyMW["http-proxy-middleware"]
        VKResolve["Virtual Key Resolution"]
    end

    subgraph KSB["KnowledgeSearchBackend (Python FastAPI v2 :8002)"]
        Uvicorn["uvicorn ASGI"]
        SolveV2["/solve_v2 (SSE)"]
        Planner["planner"]
        Searcher["searcher"]
        HybridSearch["hybrid_search"]
        WebSearch["web_search (ddgs)"]
        LLMv2["anthropic / openai clients"]
        ConstitutionPy["guardrails: constitution"]
    end

    subgraph Backend["Backend API (apps/api - Express 4.21)"]
        subgraph Middleware["Middleware Layer"]
            Morgan["Morgan"]
            Helmet["Helmet"]
            CORS["CORS"]
            Compress["Compression"]
            Cookie["cookie-parser"]
            Auth["JWT Auth (request-auth)"]
            TenantCtx["Tenant Context (RLS GUCs)"]
            Access["Access (scope check)"]
            Idem["Idempotency"]
            RBAC["RBAC"]
            RateLimit["Rate Limiter"]
        end

        subgraph Routes["Route Handlers"]
            AuthRoutes["Auth / OAuth"]
            CoreRoutes["Agents / Events / Workflows / Incidents"]
            AnalyticsRoutes["Dashboard / Analytics / Costs / Compliance"]
            AIR["LLM / RAG / RAG-Chat / RAG-Admin / Embedding"]
            RegistryRoutes["Skills / MCP / Tools"]
            ModelRoutes["Models / Virtual Keys / CLI Routing"]
            UsageRoutes["Usage / Teams / Admin / Infra / Journal"]
        end

        subgraph Services["Services"]
            AuditSvc["Audit"]
            SkillsSvc["Skills"]
            LLMSvc["LLM"]
            RAGSvc["RAG / RAG-Chat / Retriever / Advanced"]
            EmbeddingSvc["Embedding (+hooks)"]
            SearchSvc["Search"]
            MCPSvc["MCP"]
            ModelsSvc["Models"]
            LiteLLMSvc["LiteLLM Orchestrator (dockerode)"]
            ToolboxSvc["Toolbox"]
        end

        subgraph Agent["Agent Subsystem (apps/api/src/agent)"]
            Oracle["Oracle Loop"]
            Memory["Memory Manager"]
            SemCache["Semantic Cache"]
            DomPipe["Domain Pipelines"]
            AdvRAG["Advanced RAG"]
        end

        subgraph Crypto["Crypto"]
            Vault["Secret Vault<br/>(tweetnacl)"]
        end

        subgraph Storage["Storage"]
            Disk["local-disk.ts"]
        end

        subgraph Ingest["Document Ingestion"]
            Busboy["busboy (multipart)"]
            PDF["pdf-parse"]
            Docx["mammoth"]
            Mustache["mustache (templating)"]
        end

        subgraph LLMProviders["LLM Provider Clients"]
            Anthropic["Anthropic"]
            Cerebras["Cerebras"]
            Ollama["Ollama"]
        end

        subgraph Realtime["Real-time"]
            WS["WebSocket"]
            WebPush["Web Push"]
        end
    end

    subgraph SafetyObs["Cross-cutting Packages"]
        Guardrails["@arkon/guardrails<br/>constitution / scope / filter / audit"]
        Obs["@arkon/observability<br/>tracing / metrics / latency / langfuse"]
        AgentEng["@arkon/agent-engine<br/>wire / replay / risk / tools"]
        SkillFW["@arkon/skill-framework<br/>frontmatter / registry / workflow"]
    end

    subgraph Data["Data Layer (PostgreSQL 15)"]
        PG["PostgreSQL"]
        TS["TimescaleDB"]
        PGVector["pgvector"]
    end

    subgraph SharedPkgs["Shared Packages"]
        DBPkg["@oppmon/database"]
        SharedPkg["@oppmon/shared"]
        TSConfig["@oppmon/tsconfig"]
        EngineCore["engine-core (Rust)"]
        CLIPkg["@oppmon/cli"]
        Scaffold["create-oppmon (scaffold)"]
    end

    Browser --> NextApp
    Mobile --> NextApp
    NextApp --> AuthMW
    AuthMW --> DashGroup
    DashGroup --> AgentGraphPanel
    AgentGraphPanel -->|same-origin SSE| GraphProxy
    GraphProxy -->|POST /solve_v2| SolveV2
    SolveV2 --> Planner
    Planner --> Searcher
    Searcher --> HybridSearch
    Searcher --> WebSearch
    SolveV2 --> LLMv2
    SolveV2 --> ConstitutionPy
    CLI --> Backend
    AIAgents --> Router
    Router --> ProxyMW
    ProxyMW -->|forward| LLMProviders

    NextApp -->|REST| Middleware
    Middleware --> Routes
    Routes --> Services
    Services --> Agent
    Services --> LLMProviders
    Services --> Crypto
    Services --> Storage
    Routes --> Ingest
    Services --> DBPkg
    DBPkg --> PG
    PG --> TS
    PG --> PGVector

    Services --> Guardrails
    Services --> Obs
    Agent --> AgentEng
    Services --> SkillFW

    WS -.-> Browser
    WebPush -.-> Browser

    Backend --> SharedPkgs
    Frontend --> SharedPkgs
    Router --> SharedPkgs
```

## Component Descriptions

| Component | Technology | Purpose |
|-----------|------------|---------|
| Next.js App | Next.js 15, React 19 | UI, routing, dashboards |
| Frontend Auth Middleware | jose 5.2 | JWT verification at the edge |
| Express API | Express 4.21 | REST API, business logic |
| Router | http-proxy-middleware 3.0 | Per-tenant LiteLLM proxy |
| KnowledgeSearchBackend | FastAPI 0.115 + Uvicorn 0.32 | Graph-mode planner+searcher DAG, `/solve_v2` SSE |
| Graph Proxy (web) | Next.js Route Handler | Same-origin SSE proxy → KnowledgeSearchBackend |
| Agent Graph Panel | @xyflow/react | Live DAG visualization for graph-mode chat |
| PostgreSQL | PostgreSQL 15 | Relational data |
| TimescaleDB | TimescaleDB extension | Time-series events |
| pgvector | pgvector extension | Vector embeddings |
| Prisma | Prisma 5.22 | Type-safe ORM |
| WebSocket | ws 8.20 | Real-time event streaming |
| Web Push | web-push 3.6 | Push notifications |
| Anthropic | @anthropic-ai/sdk | Claude LLM |
| OpenAI | openai SDK | Embeddings |
| Arctic | arctic 2.1 | OAuth 2.0 (GitHub) |
| Dockerode | dockerode 4.0 | Manage LiteLLM containers |
| busboy / pdf-parse / mammoth | varies | Document ingestion |
| tweetnacl | tweetnacl 1.0 | XChaCha20-Poly1305 secret vault |

## External Integrations

- **LLM Providers**: Anthropic Claude, Cerebras, Ollama (local), plus tenant LiteLLM
- **Embedding Providers**: OpenAI text-embedding-3-small
- **OAuth Providers**: GitHub (via Arctic)
- **Observability (optional)**: Langfuse, prom-client (peer deps)
- **Notifications**: Web Push
