# Dependency Graph

**Last Updated:** 2026-05-12 (init sync)

## Overview

This diagram shows the major dependencies used by the OppMon (Arkon) platform across all packages in the pnpm + Turborepo monorepo. New since last init: `apps/KnowledgeSearchBackend/` (Python FastAPI mindsearch v2) and the `evals/` workspace (`@oppmon/evals`).

```mermaid
graph TB
    subgraph Monorepo["oppmon-workstation (pnpm + Turborepo)"]
        subgraph Apps["apps/"]
            Web["@oppmon/web<br/>(Next.js Frontend)"]
            API["@oppmon/api<br/>(Express Backend)"]
            RouterApp["@oppmon/router<br/>(LiteLLM Proxy)"]
            KSB["KnowledgeSearchBackend<br/>(Python FastAPI v2)"]
        end

        subgraph Workspaces["workspaces (top-level)"]
            Evals["@oppmon/evals<br/>(eval harness)"]
        end

        subgraph Packages["packages/"]
            Database["@oppmon/database<br/>(Prisma)"]
            Shared["@oppmon/shared<br/>(Types)"]
            TSConfig["@oppmon/tsconfig"]
            CLI["@oppmon/cli<br/>(tag command)"]
            CreateOppmon["create-oppmon<br/>(npm scaffold)"]
            AgentEng["@arkon/agent-engine"]
            Guardrails["@arkon/guardrails"]
            Obs["@arkon/observability"]
            SkillFW["@arkon/skill-framework"]
            IT["@arkon/integration-tests"]
            EngineCore["engine-core (Rust)"]
        end
    end

    subgraph WebDeps["Frontend Dependencies"]
        Next["next ^15"]
        React["react ^19"]
        Radix["@radix-ui/*"]
        Xyflow["@xyflow/react ^12"]
        Recharts["recharts ^2.12"]
        Framer["framer-motion ^11"]
        Lucide["lucide-react"]
        CMDK["cmdk"]
        Sonner["sonner"]
        Tailwind["tailwindcss ^3.4"]
        Markdown["react-markdown + remark-gfm"]
        Jose["jose ^5.2"]
        Zod1["zod"]
    end

    subgraph APIDeps["Backend Dependencies"]
        Express["express ^4.21"]
        PG["pg ^8.20"]
        Prisma["@prisma/client ^5.22"]
        Anthropic["@anthropic-ai/sdk"]
        OpenAI["openai"]
        Arctic["arctic ^2.1"]
        JWT["jsonwebtoken"]
        Bcrypt["bcryptjs"]
        Zod2["zod"]
        WS["ws ^8.20"]
        WebPush["web-push"]
        Helmet["helmet / cors / compression"]
        Pino["pino / morgan"]
        Cookie["cookie-parser"]
        Busboy["busboy"]
        PdfParse["pdf-parse"]
        Mammoth["mammoth"]
        Mustache["mustache"]
        Tweetnacl["tweetnacl"]
        Dockerode["dockerode"]
        Marked["marked / dompurify / jsdom"]
    end

    subgraph RouterDeps["Router Dependencies"]
        ExpressR["express ^4.21"]
        Proxy["http-proxy-middleware ^3"]
        HelmetR["helmet / cors"]
        PinoR["pino"]
    end

    subgraph DBDeps["Database Dependencies"]
        PrismaCLI["prisma ^5.22"]
        BcryptDB["bcryptjs"]
    end

    subgraph CLIDeps["CLI Dependencies"]
        Commander["commander ^12"]
        Chalk["chalk ^5"]
        Ora["ora"]
        Keytar["keytar"]
        OpenLib["open"]
        Conf["conf"]
    end

    subgraph SkillDeps["Skill Framework Deps"]
        YAML["yaml ^2.4"]
        Glob["glob ^10"]
        Chokidar["chokidar ^3"]
    end

    subgraph ObsDeps["Observability Peer Deps"]
        Langfuse["langfuse (peer)"]
        Prom["prom-client (peer)"]
    end

    subgraph KSBDeps["KnowledgeSearchBackend Deps (Python)"]
        FastAPI["fastapi 0.115"]
        Uvicorn["uvicorn[standard] 0.32"]
        SSE["sse-starlette 2.1"]
        Pydantic["pydantic 2.10 + pydantic-settings"]
        AnthropicPy["anthropic 0.42"]
        OpenAIPy["openai 1.59"]
        Httpx["httpx 0.28"]
        DDGS["ddgs 9.0 (DuckDuckGo)"]
        Dotenv["python-dotenv"]
    end

    subgraph EvalsDeps["Evals Deps"]
        EvalsAnthropic["@anthropic-ai/sdk"]
        EvalsDotenv["dotenv"]
        EvalsTsx["tsx"]
    end

    Web --> Shared
    Web --> WebDeps
    API --> Database
    API --> Shared
    API --> APIDeps
    API --> AgentEng
    API --> Guardrails
    API --> Obs
    API --> SkillFW
    RouterApp --> Database
    RouterApp --> Shared
    RouterApp --> RouterDeps
    Database --> DBDeps
    CLI --> Shared
    CLI --> CLIDeps
    SkillFW --> SkillDeps
    Obs --> ObsDeps
    IT --> AgentEng
    IT --> Guardrails
    IT --> Obs
    IT --> SkillFW
    KSB --> KSBDeps
    Web -. POST /api/graph/solve .-> KSB
    Evals --> EvalsDeps
```

## Categories

| Category | Packages |
|----------|----------|
| Web Framework | next, react, react-dom |
| API Framework | express |
| Reverse Proxy | http-proxy-middleware |
| Database | pg, prisma, @prisma/client |
| Auth | jsonwebtoken, bcryptjs, arctic, jose, cookie-parser |
| LLM | @anthropic-ai/sdk, openai (Cerebras + Ollama via REST) |
| UI | @radix-ui/*, tailwindcss, framer-motion, lucide-react |
| Markdown | react-markdown, remark-gfm, marked, dompurify, jsdom |
| Visualization | @xyflow/react, recharts |
| Real-time | ws, web-push |
| Validation | zod |
| Logging | pino, pino-pretty, morgan |
| Document Ingestion | busboy, pdf-parse, mammoth, mustache |
| Crypto | tweetnacl |
| Container Mgmt | dockerode |
| Testing | vitest, @playwright/test, supertest |
| Skill Framework | yaml, glob, chokidar |
| Observability (peer) | langfuse, prom-client |
| Build / DevTools | turbo, typescript, tsx, eslint |
| Graph-Mode (Python) | fastapi, uvicorn, sse-starlette, pydantic, anthropic, openai, httpx, ddgs, python-dotenv |
| Eval Harness | @anthropic-ai/sdk, dotenv, tsx |
