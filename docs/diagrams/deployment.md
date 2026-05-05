# Deployment Architecture

**Last Updated:** 2026-05-05

## Overview

This diagram shows the deployment architecture as defined in `docker-compose.yml`. The stack supports multiple profiles for development, production, and full deployment with Redis.

```mermaid
graph TB
    subgraph Internet["Internet"]
        User["User"]
    end

    subgraph DockerNetwork["Docker Network: arkon-network"]
        subgraph WebContainer["web-dev / web container"]
            NextJS["Next.js Server<br/>:3002 (dev) / :3000 (prod)"]
        end

        subgraph APIContainer["api-dev / api container"]
            Express["Express API<br/>:3001"]
        end

        subgraph DBContainer["db container"]
            Postgres["PostgreSQL 15<br/>+ TimescaleDB<br/>+ pgvector<br/>:5432"]
            PGData[("pgdata volume")]
        end

        subgraph RedisContainer["redis container (full profile)"]
            Redis["Redis 7<br/>:6379"]
            RedisData[("redisdata volume")]
        end

        subgraph StudioContainer["prisma-studio (dev profile)"]
            Studio["Prisma Studio<br/>:5555"]
        end
    end

    User -->|":3002"| NextJS
    User -->|":3001"| Express
    User -->|":5555"| Studio
    NextJS -->|"HTTP"| Express
    Express -->|"SQL"| Postgres
    Express -.->|"Cache"| Redis
    Studio -->|"SQL"| Postgres
    Postgres --- PGData
    Redis --- RedisData

    style WebContainer fill:#e1f5fe
    style APIContainer fill:#fff3e0
    style DBContainer fill:#e8f5e9
    style RedisContainer fill:#fce4ec
    style StudioContainer fill:#f3e5f5
```

## Docker Compose Profiles

| Profile | Services Included | Use Case |
|---------|------------------|----------|
| (default) | db | Local development with hot reload |
| dev | db, api-dev, web-dev, prisma-studio | Containerized development |
| prod | db, api, web | Production deployment |
| full | db, api, web, redis | Production with caching |

## Service Configuration

### Database Service (db)

| Setting | Value |
|---------|-------|
| Image | `timescale/timescaledb:latest-pg15` |
| Container | `arkon-db` |
| Internal Port | 5432 |
| External Port | 5433 (configurable via `POSTGRES_PORT`) |
| Volume | `pgdata:/var/lib/postgresql/data` |
| Init Script | `scripts/init-db.sql` |
| Health Check | `pg_isready -U arkon` (every 5s) |
| Extensions | TimescaleDB, pgvector |

### API Service (api-dev / api)

| Setting | Development | Production |
|---------|-------------|------------|
| Image | Built from `apps/api/Dockerfile.dev` | Built from `apps/api/Dockerfile` |
| Container | `arkon-api-dev` | `arkon-api` |
| Port | 3001:3001 | 3001:3001 |
| Hot Reload | Yes (tsx watch) | No |
| Depends On | db (healthy) | db (healthy) |
| Health Check | `GET /api/health` (every 30s) | `GET /api/health` (every 30s) |

### Web Service (web-dev / web)

| Setting | Development | Production |
|---------|-------------|------------|
| Image | Built from `apps/web/Dockerfile.dev` | Built from `apps/web/Dockerfile` |
| Container | `arkon-web-dev` | `arkon-web` |
| Port | 3002:3002 | 3002:3000 |
| Hot Reload | Yes (next dev) | No |
| Depends On | api-dev | api |
| Health Check | `GET /` (every 30s) | `GET /` (every 30s) |

### Redis Service (full profile only)

| Setting | Value |
|---------|-------|
| Image | `redis:7-alpine` |
| Container | `arkon-redis` |
| Port | 6379:6379 |
| Volume | `redisdata:/data` |
| Health Check | `redis-cli ping` (every 5s) |

### Prisma Studio (dev profile only)

| Setting | Value |
|---------|-------|
| Image | Built from `packages/database/Dockerfile.studio` |
| Container | `arkon-prisma-studio` |
| Port | 5555:5555 |
| Depends On | db (healthy) |

## Environment Variables

```mermaid
graph LR
    subgraph EnvVars["Environment Variables"]
        subgraph Common["Common"]
            NODE_ENV["NODE_ENV"]
        end

        subgraph Database["Database"]
            PG_USER["POSTGRES_USER=arkon"]
            PG_PASS["POSTGRES_PASSWORD=***"]
            PG_DB["POSTGRES_DB=arkon"]
            DB_URL["DATABASE_URL=postgres://..."]
        end

        subgraph Auth["Authentication"]
            JWT["JWT_SECRET=***"]
            JWT_EXP["JWT_EXPIRES_IN=7d"]
            GH_ID["GITHUB_CLIENT_ID"]
            GH_SECRET["GITHUB_CLIENT_SECRET"]
            GH_REDIRECT["GITHUB_REDIRECT_URI"]
        end

        subgraph Network["Network"]
            CORS["CORS_ORIGIN"]
            FE_URL["FRONTEND_URL"]
            API_URL["NEXT_PUBLIC_API_URL"]
        end

        subgraph Logging["Logging"]
            LOG["LOG_LEVEL=info|debug"]
        end

        subgraph Cache["Cache (optional)"]
            REDIS["REDIS_URL=redis://redis:6379"]
        end
    end
```

## Port Mapping

| Service | Container Port | Host Port | Protocol |
|---------|---------------|-----------|----------|
| web-dev | 3002 | 3002 | HTTP |
| web | 3000 | 3002 | HTTP |
| api-dev / api | 3001 | 3001 | HTTP |
| db | 5432 | 5433 | PostgreSQL |
| redis | 6379 | 6379 | Redis |
| prisma-studio | 5555 | 5555 | HTTP |

## Volumes

| Name | Driver | Mount Point | Purpose |
|------|--------|-------------|---------|
| pgdata | local | /var/lib/postgresql/data | Persistent database storage |
| redisdata | local | /data | Redis persistence |

## Health Checks

```mermaid
sequenceDiagram
    participant DC as Docker Compose
    participant DB as Database
    participant API as API
    participant Web as Web

    DC->>DB: pg_isready (every 5s)
    DB-->>DC: healthy

    Note over DC,API: API starts after DB healthy

    DC->>API: GET /api/health (every 30s)
    API-->>DC: 200 OK

    Note over DC,Web: Web starts after API ready

    DC->>Web: GET / (every 30s)
    Web-->>DC: 200 OK
```

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Frontend | `next dev -p 3002` (hot reload) | `next build && next start` |
| Backend | `tsx watch src/index.ts` (hot reload) | `tsc && node dist/index.js` |
| Database | Local volume | Managed service (recommended) |
| Redis | Optional (full profile) | Recommended for caching |
| Secrets | `.env` file | Secret manager |
| SSL | None | Required (via reverse proxy) |
| Logging | LOG_LEVEL=debug | LOG_LEVEL=info |

## Startup Commands

```bash
# Development (local hot reload)
pnpm docker:up           # Start database only
pnpm dev                  # Start API + Web locally

# Development (containerized)
pnpm docker:up:dev        # Start all with hot reload

# Production
pnpm docker:up:prod       # Start db + api + web

# Full stack with Redis
pnpm docker:up:full       # Start all including Redis
```
