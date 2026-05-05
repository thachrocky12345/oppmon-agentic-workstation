# Arkon AI Gateway — Local Development Guide

**Last Updated:** May 4, 2026 | **Owner:** Engineering Team

---

## Overview

This guide covers local development setup for the Arkon AI Gateway platform. Arkon uses a **pnpm + Turborepo monorepo** architecture with:
- **Frontend**: Next.js 15 + React 19
- **Backend**: Express 4.21 + Prisma ORM
- **Database**: PostgreSQL 15 + TimescaleDB
- **Engine**: Rust workspace for high-performance utilities

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Structure](#2-repository-structure)
3. [Quick Start](#3-quick-start)
4. [Environment Configuration](#4-environment-configuration)
5. [Development Workflows](#5-development-workflows)
6. [Database Management](#6-database-management)
7. [API Reference](#7-api-reference)
8. [Common Tasks](#8-common-tasks)
9. [Testing](#9-testing)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Installation |
|------|---------|--------------|
| Node.js | 20.x LTS | `nvm install 20` |
| pnpm | 9.x+ | `corepack enable && corepack prepare pnpm@9 --activate` |
| Docker | 24.x+ | [Docker Desktop](https://docker.com/products/docker-desktop) |
| Git | 2.x+ | `brew install git` or [git-scm.com](https://git-scm.com) |
| Rust (optional) | 1.75+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |

### Verify Installation

```bash
node --version      # v20.x.x
pnpm --version      # 9.x.x
docker --version    # 24.x.x
git --version       # 2.x.x
cargo --version     # 1.75+ (optional, for Rust development)
```

---

## 2. Repository Structure

```
arkon-workstation/
├── apps/
│   ├── api/                    # Express API server (@arkon/api)
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── lib/            # Utilities (db, oauth, jwt, audit)
│   │   │   ├── middleware/     # Auth, error handling, rate limiting
│   │   │   └── routes/         # API route handlers (16 modules)
│   │   ├── Dockerfile
│   │   ├── Dockerfile.dev
│   │   └── package.json
│   │
│   └── web/                    # Next.js frontend (@arkon/web)
│       ├── src/
│       │   ├── app/            # Next.js App Router
│       │   ├── components/     # React components
│       │   └── lib/            # API client, hooks
│       ├── Dockerfile
│       ├── Dockerfile.dev
│       └── package.json
│
├── packages/
│   ├── database/               # Prisma schema + client (@arkon/database)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   └── seed.ts         # Seed data
│   │   └── src/
│   │       └── client.ts       # Prisma client singleton
│   │
│   ├── shared/                 # Shared TypeScript types (@arkon/shared)
│   │   └── src/
│   │       ├── types.ts        # JWTClaims, Role, TeamMembership
│   │       └── constants.ts    # JWT config, OAuth providers
│   │
│   ├── tsconfig/               # Shared TypeScript configs
│   │   ├── base.json
│   │   ├── node.json
│   │   └── nextjs.json
│   │
│   └── engine-core/            # Rust workspace
│       ├── Cargo.toml
│       └── crates/
│           ├── common/         # Envelope<T>, hash, error types
│           └── napi/           # Node.js bindings (stub)
│
├── scripts/
│   └── init-db.sql             # Database initialization
│
├── docker-compose.yml          # Development stack
├── pnpm-workspace.yaml         # pnpm workspace config
├── turbo.json                  # Turborepo config
└── package.json                # Root scripts
```

---

## 3. Quick Start

### One-Command Setup

```bash
# Clone and setup everything
git clone <repo-url> arkon-workstation
cd arkon-workstation
pnpm setup
```

This runs:
1. `pnpm install` — Install all dependencies
2. `docker compose up -d db` — Start PostgreSQL
3. `pnpm db:push` — Push Prisma schema to database
4. `pnpm db:seed` — Seed development data

### Start Development Servers

```bash
# Start all services (database + API + Web)
pnpm dev

# Or start individually
pnpm dev:api   # API only (http://localhost:3001)
pnpm dev:web   # Web only (http://localhost:3002)
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3002 | Next.js application |
| Backend API | http://localhost:3001/api | REST API |
| Health Check | http://localhost:3001/api/health | Service health |
| Prisma Studio | http://localhost:5555 | Database GUI |
| PostgreSQL | localhost:5433 | Direct DB access |

### Default Credentials

After seeding, use these credentials:
- **Email**: `admin@arkon.dev`
- **Password**: `admin123`

---

## 4. Environment Configuration

### Create Environment Files

```bash
# Root .env (copy from example)
cp .env.example .env

# Edit with your settings
code .env
```

### Required Variables

```env
# Database
DATABASE_URL=postgres://arkon:arkon_dev_password@localhost:5433/arkon
POSTGRES_USER=arkon
POSTGRES_PASSWORD=arkon_dev_password
POSTGRES_DB=arkon
POSTGRES_PORT=5433

# JWT Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# OAuth - GitHub (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://localhost:3001/api/auth/github/callback

# URLs
CORS_ORIGIN=http://localhost:3002
FRONTEND_URL=http://localhost:3002
NEXT_PUBLIC_API_URL=http://localhost:3001

# Logging
LOG_LEVEL=debug
NODE_ENV=development
```

### Setting Up GitHub OAuth (Optional)

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App:
   - **Application name**: Arkon Local
   - **Homepage URL**: http://localhost:3002
   - **Callback URL**: http://localhost:3001/api/auth/github/callback
3. Copy Client ID and Client Secret to `.env`

---

## 5. Development Workflows

### Docker Commands

```bash
# Database only (recommended for local dev)
pnpm docker:up              # Start PostgreSQL

# Full Docker development
pnpm docker:up:dev          # Start all services with hot reload
pnpm docker:up:prod         # Start production-like environment

# Logs and status
pnpm docker:logs            # All logs
pnpm docker:logs:api        # API logs only
pnpm docker:logs:db         # Database logs
pnpm docker:ps              # Service status

# Cleanup
pnpm docker:down            # Stop services
pnpm docker:down:clean      # Stop and remove volumes
```

### Turborepo Commands

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Type checking
pnpm typecheck

# Lint all packages
pnpm lint

# Clean build artifacts
pnpm clean
```

### Package-Specific Commands

```bash
# Run command in specific package
pnpm --filter @arkon/api <command>
pnpm --filter @arkon/web <command>
pnpm --filter @arkon/database <command>

# Examples
pnpm --filter @arkon/api test
pnpm --filter @arkon/web build
pnpm --filter @arkon/database db:studio
```

---

## 6. Database Management

### Prisma Commands

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Push schema to database (development)
pnpm db:push

# Create and run migrations (production-ready)
pnpm db:migrate

# Open Prisma Studio (GUI)
pnpm db:studio

# Seed the database
pnpm db:seed

# Reset database and reseed
pnpm db:reset
```

### Direct Database Access

```bash
# Using psql
psql postgres://arkon:arkon_dev_password@localhost:5433/arkon

# Using Docker
docker exec -it arkon-db psql -U arkon -d arkon
```

### Common Queries

```sql
-- List all tables
\dt

-- View users
SELECT id, email, role, tenant_id FROM users;

-- View teams
SELECT t.name, tm.role, u.email
FROM teams t
JOIN team_members tm ON tm.team_id = t.id
JOIN users u ON u.id = tm.user_id;

-- View agents
SELECT name, status, last_seen FROM agents ORDER BY updated_at DESC;
```

### Schema Changes Workflow

1. Edit `packages/database/prisma/schema.prisma`
2. Run `pnpm db:generate` to update Prisma client
3. Run `pnpm db:push` to apply changes (dev)
4. Or run `pnpm db:migrate` to create migration (prod)

---

## 7. API Reference

### Authentication

```bash
# Login with password
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@arkon.dev", "password": "admin123"}'

# Response
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "...",
    "email": "admin@arkon.dev",
    "role": "TENANT_ADMIN"
  }
}

# OAuth (redirect to GitHub)
curl http://localhost:3001/api/auth/github
```

### Using the Token

```bash
TOKEN="your-jwt-token"

# Get current user with teams
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# List agents
curl http://localhost:3001/api/agents \
  -H "Authorization: Bearer $TOKEN"
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Password login |
| POST | `/api/auth/register` | Create account |
| GET | `/api/auth/me` | Current user + teams |
| GET | `/api/auth/github` | GitHub OAuth |
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create agent |
| GET | `/api/dashboard` | Dashboard metrics |
| GET | `/api/events` | Event stream |
| GET | `/api/analytics` | Usage analytics |
| GET | `/api/costs` | Cost tracking |
| GET | `/api/health` | Health check |

---

## 8. Common Tasks

### Adding a New API Route

1. Create route file:

```typescript
// apps/api/src/routes/my-feature.ts
import { Router, Response } from 'express';
import { prisma } from '@arkon/database';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';

export const myFeatureRouter = Router();

myFeatureRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await prisma.myTable.findMany({
    where: { tenantId: req.user!.tenantId }
  });
  res.json({ data });
}));
```

2. Register in `apps/api/src/index.ts`:

```typescript
import { myFeatureRouter } from './routes/my-feature.js';

app.use('/api/my-feature', requestAuth, myFeatureRouter);
```

### Adding a Database Model

1. Edit `packages/database/prisma/schema.prisma`:

```prisma
model MyTable {
  id        String   @id @default(cuid())
  name      String
  tenantId  String
  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("my_table")
}
```

2. Update schema:

```bash
pnpm db:generate
pnpm db:push
```

### Adding Shared Types

Edit `packages/shared/src/types.ts`:

```typescript
export interface MyFeature {
  id: string;
  name: string;
  tenantId: string;
}
```

Import in apps:

```typescript
import type { MyFeature } from '@arkon/shared';
```

---

## 9. Testing

### Run Tests

```bash
# All tests
pnpm test

# With coverage
pnpm test:coverage

# Specific package
pnpm --filter @arkon/api test
pnpm --filter @arkon/web test

# Watch mode
pnpm --filter @arkon/api test -- --watch
```

### Backend Tests

Tests use Vitest + Supertest:

```typescript
// apps/api/src/routes/health.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('Health Check', () => {
  it('returns healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
```

### Rust Tests

```bash
cd packages/engine-core
cargo test
cargo test -- --nocapture  # With output
```

---

## 10. Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3001  # or :3002, :5433

# Kill process
kill -9 <PID>

# Or use different port
PORT=3003 pnpm dev:api
```

### Database Connection Failed

```bash
# Check if PostgreSQL is running
pnpm docker:ps

# Check logs
pnpm docker:logs:db

# Restart database
pnpm docker:down && pnpm docker:up
```

### Prisma Client Issues

```bash
# Regenerate client
pnpm db:generate

# If schema out of sync
pnpm db:push --force-reset  # WARNING: Drops all data
```

### pnpm Install Fails

```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Docker Build Fails

```bash
# Rebuild without cache
pnpm docker:build:no-cache

# Clear Docker cache
docker system prune -af
```

### Hot Reload Not Working

1. Check volume mounts in docker-compose.yml
2. Ensure file is being saved (not just buffered)
3. Try restarting the dev container:

```bash
docker compose restart api-dev
```

### TypeScript Errors After Schema Change

```bash
# Regenerate all types
pnpm db:generate
pnpm typecheck
```

---

## Quick Reference

### Common Workflows

| Task | Command |
|------|---------|
| Start everything | `pnpm setup && pnpm dev` |
| Reset database | `pnpm db:reset` |
| View database | `pnpm db:studio` |
| Run tests | `pnpm test` |
| Build for production | `pnpm build` |
| Update dependencies | `pnpm update` |

### Useful URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3002 |
| API | http://localhost:3001/api |
| Prisma Studio | http://localhost:5555 |
| GitHub OAuth | http://localhost:3001/api/auth/github |

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-05-04 | Engineering | Updated for pnpm + Turborepo monorepo structure |
