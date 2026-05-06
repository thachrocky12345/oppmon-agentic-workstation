'use client'

import { TutorialSection } from '@/components/tutorial'

export default function ArchitecturePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Architecture</h1>
        <p className="text-gray-400">
          Understanding how OppMon is built and how the components work together.
        </p>
      </div>

      {/* System Overview */}
      <TutorialSection
        id="system-overview"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="System Overview"
      >
        <div className="space-y-6">
          <p className="text-gray-400">
            OppMon is a pnpm + Turborepo monorepo with separate apps for the API, web frontend,
            and CLI tool, plus shared packages for database schema and types.
          </p>

          {/* Architecture Diagram */}
          <div className="bg-black/30 rounded-xl p-6 border border-white/10 overflow-x-auto">
            <pre className="text-xs text-gray-400 font-mono">{`┌─────────────────────────────────────────────────────────────┐
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
│  │ - OAuth     │  │  - Skills   │  │  - Events   │         │
│  │ - JWT       │  │  - RAG      │  │  - Alerts   │         │
│  │ - RBAC      │  │  - LLM      │  │             │         │
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
│  │  - Skills, Models     │  │  - Audit Logs              │ │
│  └───────────────────────┘  └────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  pgvector - Vector embeddings for semantic search     │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘`}</pre>
          </div>
        </div>
      </TutorialSection>

      {/* Tech Stack */}
      <TutorialSection
        id="tech-stack"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Tech Stack"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-medium mb-3">Frontend (apps/web)</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-blue-400">▸</span>
                <span><strong className="text-white">Next.js 15</strong> with React 19</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">▸</span>
                <span><strong className="text-white">Tailwind CSS</strong> 3.4</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">▸</span>
                <span><strong className="text-white">Radix UI</strong> primitives</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">▸</span>
                <span><strong className="text-white">Recharts</strong> for analytics</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Backend (apps/api)</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-purple-400">▸</span>
                <span><strong className="text-white">Express</strong> 4.21</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">▸</span>
                <span><strong className="text-white">Prisma</strong> 5.22 ORM</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">▸</span>
                <span><strong className="text-white">Zod</strong> validation</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">▸</span>
                <span><strong className="text-white">Pino</strong> logging</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Database</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-green-400">▸</span>
                <span><strong className="text-white">PostgreSQL 15</strong> with TimescaleDB</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">▸</span>
                <span><strong className="text-white">pgvector</strong> for embeddings</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">▸</span>
                <span><strong className="text-white">Time-series</strong> events</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">LLM Providers</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-orange-400">▸</span>
                <span><strong className="text-white">Anthropic</strong> Claude</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-orange-400">▸</span>
                <span><strong className="text-white">OpenAI</strong> for embeddings</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-orange-400">▸</span>
                <span><strong className="text-white">Cerebras</strong> fast inference</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-orange-400">▸</span>
                <span><strong className="text-white">Ollama</strong> local models</span>
              </li>
            </ul>
          </div>
        </div>
      </TutorialSection>

      {/* Directory Structure */}
      <TutorialSection
        id="directory-structure"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        }
        iconBg="bg-yellow-500/20"
        title="Directory Structure"
      >
        <div className="bg-black/30 rounded-xl p-6 border border-white/10 overflow-x-auto">
          <pre className="text-xs text-gray-400 font-mono">{`oppmon-workstation/
├── apps/
│   ├── api/                    # Express API server
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── lib/            # Database, JWT, LLM, RAG
│   │   │   └── middleware/     # Auth, RBAC, rate limiting
│   │   └── package.json
│   │
│   └── web/                    # Next.js frontend
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   ├── components/     # React components
│       │   └── lib/            # Utilities, API client
│       └── package.json
│
├── packages/
│   ├── cli/                    # CLI tool (tag command)
│   │   ├── src/commands/       # CLI commands
│   │   └── src/services/       # CLI business logic
│   │
│   ├── database/               # Prisma schema
│   │   ├── prisma/schema.prisma
│   │   └── prisma/seed.ts
│   │
│   └── shared/                 # Shared types
│       └── src/types.ts        # JWTClaims, Role, etc.
│
├── docs/                       # Documentation
│   ├── architecture.md
│   ├── diagrams/               # Mermaid diagrams
│   └── flows/                  # Flow diagrams
│
├── docker-compose.yml          # Development stack
├── turbo.json                  # Turborepo config
└── pnpm-workspace.yaml         # Workspace definition`}</pre>
        </div>
      </TutorialSection>

      {/* Multi-Tenancy */}
      <TutorialSection
        id="multi-tenancy"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Multi-Tenancy Model"
      >
        <div className="space-y-6">
          <p className="text-gray-400">
            OppMon uses a hierarchical multi-tenancy model where each tenant can have multiple teams,
            and each team can have its own resources and permissions.
          </p>

          <div className="bg-black/30 rounded-xl p-6 border border-white/10">
            <pre className="text-xs text-gray-400 font-mono">{`Tenant
  ├── Users (role: TENANT_ADMIN | TEAM_ADMIN | MEMBER)
  │     └── OAuthAccounts (GitHub, Google)
  │     └── Notifications
  ├── Teams
  │     └── TeamMembers (role: ADMIN | MEMBER)
  ├── Agents
  │     └── Events (time-series)
  │     └── Incidents
  ├── Skills → SkillVersions
  ├── Models → ModelSecrets (encrypted)
  ├── VirtualKeys (CLI/SDK access)
  ├── McpServers
  ├── Embeddings (pgvector)
  ├── AuditLogs
  └── UsageEvents (privacy-first)`}</pre>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <p className="text-green-400 font-medium">Privacy by Design</p>
            <p className="text-gray-400 text-sm mt-1">
              The <code className="text-green-400">tenant_id</code> is enforced at the SQL layer for all queries.
              Cross-tenant data access is architecturally impossible — not just access-controlled.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Data Flow */}
      <TutorialSection
        id="data-flow"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="Data Flow"
      >
        <div className="space-y-4">
          <p className="text-gray-400 mb-4">
            Data enters through REST API, WebSocket, or the CLI, gets validated, processed, and stored
            in the appropriate database (relational, time-series, or vector).
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">Relational Data</h5>
              <p className="text-gray-500 text-sm">Users, Teams, Skills, Models, Configs</p>
              <p className="text-green-400 text-xs mt-2">→ PostgreSQL (Prisma)</p>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">Time-Series Data</h5>
              <p className="text-gray-500 text-sm">Events, Metrics, Audit Logs</p>
              <p className="text-blue-400 text-xs mt-2">→ TimescaleDB</p>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">Vector Data</h5>
              <p className="text-gray-500 text-sm">Embeddings, Semantic Search</p>
              <p className="text-purple-400 text-xs mt-2">→ pgvector</p>
            </div>
          </div>
        </div>
      </TutorialSection>
    </div>
  )
}
