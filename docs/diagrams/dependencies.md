# Dependency Graph

**Last Updated:** 2026-05-11 (init sync)

## Overview

This diagram shows the major dependencies used by the OppMon (Arkon) platform across all packages in the pnpm + Turborepo monorepo. New since last init: `apps/router`, the agent/skill/safety/observability packages, document ingestion deps, and frontend markdown rendering.

```mermaid
graph TB
    subgraph Monorepo["oppmon-workstation (pnpm + Turborepo)"]
        subgraph Apps["apps/"]
            Web["@oppmon/web<br/>(Next.js Frontend)"]
            API["@oppmon/api<br/>(Express Backend)"]
            RouterApp["@oppmon/router<br/>(LiteLLM Proxy)"]
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
