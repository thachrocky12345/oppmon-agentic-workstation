# OppMon - AI Gateway Platform

OppMon is an AI Gateway platform providing observability, security, and management capabilities for AI agent deployments. The platform includes multi-provider LLM integration, semantic search with embeddings, and RAG (Retrieval Augmented Generation) pipelines.

## Features

- **AI Agent Management** - Register, monitor, and manage AI agents
- **Multi-Provider LLM** - Support for Ollama, Cerebras, and Anthropic
- **Semantic Search** - OpenAI embeddings with pgvector for similarity search
- **RAG Pipeline** - Retrieval Augmented Generation with grounded responses
- **Auto-Embedding** - Automatic embedding generation on entity create/update
- **Skills Registry** - Versioned skill definitions with RBAC
- **Event Streaming** - Real-time event ingestion and monitoring
- **Audit Logging** - Comprehensive audit trail for compliance

## Tech Stack

- **Backend**: Express.js, TypeScript, Prisma ORM
- **Database**: PostgreSQL with TimescaleDB + pgvector
- **LLM Providers**: Ollama (local), Cerebras, Anthropic
- **Embeddings**: OpenAI text-embedding-3-small
- **Frontend**: Next.js (separate package)

## Project Structure

```
oppmon-workstation/
├── apps/
│   ├── api/                 # Express API server
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   ├── lib/         # LLM, Embedding, RAG libraries
│   │   │   └── middleware/  # Auth, RBAC, error handling
│   │   └── scripts/         # Migrations, seeds, smoke tests
│   └── web/                 # Next.js frontend
├── packages/
│   ├── database/            # Prisma schema and client
│   └── shared/              # Shared types and utilities
├── docs/                    # Documentation
│   ├── llm_models.md        # LLM provider documentation
│   ├── embeddings.md        # Embedding documentation
│   ├── rag.md               # RAG pipeline documentation
│   └── auto_embedding.md    # Auto-embedding documentation
└── docker-compose.yml       # Development stack
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- pnpm (recommended) or npm

### 1. Clone and Install

```bash
git clone <repository>
cd oppmon-workstation
pnpm install
```

### 2. Start Database

```bash
# Using Docker Compose (recommended)
docker-compose up db -d

# Wait for database to be ready
docker-compose logs -f db
```

### 3. Configure Environment

```bash
cd apps/api
cp .env.example .env
# Edit .env with your API keys
```

Required environment variables:
```env
DATABASE_URL=postgres://oppmon:oppmon_dev_password@localhost:5433/oppmon
JWT_SECRET=your-secret-key

# LLM Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
# or
OLLAMA_BASE_URL=http://localhost:11434

# Embeddings
OPENAI_API_KEY=sk-...
```

### 4. Setup Database

```bash
# Generate Prisma client
pnpm --filter @oppmon/database db:generate

# Push schema to database
pnpm --filter @oppmon/database db:push

# Run pgvector migration (cross-platform)
pnpm --filter @oppmon/api migrate

# Seed development data
pnpm --filter @oppmon/database db:seed
```

### 5. Start Development Server

```bash
pnpm --filter @oppmon/api dev
# API available at http://localhost:3001
```

### 6. Run Smoke Tests

```bash
pnpm --filter @oppmon/api smoke:week1
```

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Skills Registry

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skills` | List skills |
| POST | `/api/skills` | Create skill |
| GET | `/api/skills/:id` | Get skill |
| PUT | `/api/skills/:id` | Update skill |
| DELETE | `/api/skills/:id` | Soft delete skill |
| GET | `/api/skills/:id/versions` | Version history |

### LLM

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/llm/chat` | Send chat message |
| GET | `/api/llm/models` | List available models |
| GET | `/api/llm/providers` | List providers and status |
| GET | `/api/llm/sessions` | List chat sessions |
| GET | `/api/llm/usage` | Get usage statistics |

### Embeddings

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/embedding/embed` | Generate embedding |
| POST | `/api/embedding/embed-batch` | Batch embeddings |
| POST | `/api/embedding/search` | Semantic search |
| GET | `/api/embedding/stats` | Embedding statistics |
| POST | `/api/embedding/reindex` | Re-index all content |
| GET | `/api/embedding/coverage` | Coverage statistics |

### RAG

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rag/query` | Full RAG query |
| POST | `/api/rag/retrieve` | Retrieval only |
| GET | `/api/rag/status` | Pipeline status |
| GET | `/api/rag/sessions` | List sessions |
| GET | `/api/rag/usage` | Usage statistics |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| POST | `/api/agents/register` | Register external agent |

## Docker Compose

### Start All Services

```bash
# Development mode with hot reload
docker-compose --profile dev up -d

# Production mode
docker-compose --profile prod up -d

# View logs
docker-compose logs -f

# Stop all
docker-compose down
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| `db` | 5433 | PostgreSQL with TimescaleDB |
| `api-dev` | 3001 | Backend API (dev) |
| `web-dev` | 3002 | Frontend (dev) |
| `redis` | 6379 | Redis (optional, use `--profile full`) |
| `prisma-studio` | 5555 | Database GUI (dev) |

## Development

### Running Tests

```bash
# Unit tests
pnpm --filter @oppmon/api test

# Coverage report
pnpm --filter @oppmon/api test:coverage

# Smoke tests
pnpm --filter @oppmon/api smoke:week1
```

### Code Quality

```bash
# Lint
pnpm --filter @oppmon/api lint

# Type check
pnpm --filter @oppmon/api typecheck
```

### Database Migrations

```bash
# Generate migration
pnpm --filter @oppmon/database db:generate

# Push schema changes
pnpm --filter @oppmon/database db:push
```

## Configuration

### LLM Providers

```env
# Default provider: 'ollama', 'cerebras', 'anthropic'
LLM_DEFAULT_PROVIDER=anthropic

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Cerebras (cloud)
CEREBRAS_API_KEY=your-key
CEREBRAS_MODEL=llama3.1-70b

# Anthropic (cloud)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### Embeddings

```env
POC_SEARCH_EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
```

### RAG

```env
RAG_DEFAULT_TOP_K=5
RAG_DEFAULT_THRESHOLD=0.7
RAG_MAX_CONTEXT_TOKENS=4000
RAG_STRATEGY=simple
```

### Auto-Embedding

```env
# Enable/disable automatic embedding on entity changes
AUTO_EMBEDDING_ENABLED=true
```

## Documentation

- [LLM Integration](docs/llm_models.md) - Multi-provider LLM support
- [Embeddings](docs/embeddings.md) - Embedding provider integration
- [RAG Pipeline](docs/rag.md) - Retrieval Augmented Generation
- [Auto-Embedding](docs/auto_embedding.md) - Automatic embedding hooks

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────────┐
│   Frontend      │────▶│              Backend API                │
│   (Next.js)     │     │              (Express)                  │
│   :3002         │     │              :3001                      │
└─────────────────┘     └───────────────┬─────────────────────────┘
                                        │
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                ┌───────────────┐ ┌───────────┐ ┌───────────────┐
                │  PostgreSQL   │ │  Ollama   │ │   OpenAI      │
                │  + pgvector   │ │  (local)  │ │   (cloud)     │
                │  :5433        │ │  :11434   │ │               │
                └───────────────┘ └───────────┘ └───────────────┘
                                        │               │
                                        └───────┬───────┘
                                                │
                                        ┌───────▼───────┐
                                        │   Anthropic   │
                                        │   (cloud)     │
                                        └───────────────┘
```

## License

Proprietary - All rights reserved.
