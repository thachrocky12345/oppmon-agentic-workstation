# Deployment Architecture

**Last Updated:** 2026-05-11 (init sync)

## Overview

This diagram reflects `docker-compose.yml` and the production `docker-stack.yml` for the OppMon platform. Containers are namespaced as `oppmon-*` and join the `oppmon-network` bridge. Profiles let you select db-only, dev (hot reload), prod (built images), or full (with Redis).

```mermaid
graph TB
    subgraph Internet["Internet"]
        User["User / CLI / Agents"]
    end

    subgraph DockerNetwork["Docker Network: oppmon-network"]
        subgraph WebContainer["oppmon-web / oppmon-web-dev"]
            NextJS["Next.js<br/>:3002 (dev) / :3000 (prod)"]
        end

        subgraph APIContainer["oppmon-api / oppmon-api-dev"]
            Express["Express API<br/>:3001"]
            DocVol[("oppmon-documents<br/>volume")]
        end

        subgraph RouterContainer["oppmon-router (LiteLLM proxy)"]
            RouterSvc["http-proxy-middleware<br/>Express :PORT"]
        end

        subgraph LiteLLMSwarm["LiteLLM Tenant Containers (managed via dockerode)"]
            LL1["litellm-tenant-A"]
            LL2["litellm-tenant-B"]
        end

        subgraph DBContainer["oppmon-db"]
            Postgres["PostgreSQL 15<br/>+ TimescaleDB<br/>+ pgvector<br/>:5432"]
            PGData[("pgdata volume")]
        end

        subgraph RedisContainer["oppmon-redis (full profile)"]
            Redis["Redis 7<br/>:6379"]
            RedisData[("redisdata volume")]
        end

        subgraph StudioContainer["oppmon-prisma-studio (dev)"]
            Studio["Prisma Studio<br/>:5555"]
        end
    end

    User -->|HTTP :3002| NextJS
    NextJS -->|REST :3001| Express
    User -->|LLM proxy| RouterSvc
    RouterSvc -->|forward| LiteLLMSwarm
    Express -->|tcp 5432| Postgres
    Express -.->|optional| Redis
    Express -->|docker socket| LiteLLMSwarm
    Express --> DocVol
    Studio --> Postgres
    Postgres --> PGData
    Redis --> RedisData
```

## Services

| Service | Container | Image / Build | Port | Profile |
|---------|-----------|---------------|------|---------|
| db | `oppmon-db` | timescale/timescaledb:latest-pg15 | 5433→5432 | always |
| redis | `oppmon-redis` | redis:7-alpine | 6379 | full |
| api-dev | `oppmon-api-dev` | apps/api/Dockerfile.dev | 3001 | dev |
| api | `oppmon-api` | apps/api/Dockerfile | 3001 | prod |
| web-dev | `oppmon-web-dev` | apps/web/Dockerfile.dev | 3002→3002 | dev |
| web | `oppmon-web` | apps/web/Dockerfile | 3002→3000 | prod |
| prisma-studio | `oppmon-prisma-studio` | packages/database/Dockerfile.studio | 5555 | dev |
| router | (defined in `docker-stack.yml` for prod) | apps/router | env-driven | prod |

## Volumes

| Volume | Purpose |
|--------|---------|
| `pgdata` | PostgreSQL data |
| `redisdata` | Redis persistence |
| `oppmon-documents` | Uploaded RAG documents (mounted by api) |

## Profiles

| Profile | Services |
|---------|----------|
| (default) | db |
| dev | db, api-dev, web-dev, prisma-studio |
| prod | db, api, web |
| full | db, api, web, redis |

## Production (docker-stack.yml)

`docker-stack.yml` defines the Swarm-mode topology for production deployments — see the `prod-swarm-deploy` skill for build/push/apply automation.

## Health Checks

- **db**: `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` (every 5s)
- **redis**: `redis-cli ping` (every 5s)
- **api / api-dev**: `wget -qO- http://localhost:3001/api/health` (every 30s)
- **web / web-dev**: `wget -qO- http://localhost:3002` (every 30s)
