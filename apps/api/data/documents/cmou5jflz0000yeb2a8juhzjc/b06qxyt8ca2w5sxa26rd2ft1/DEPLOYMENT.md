# Arkon AI Gateway — Deployment Guide

**Last Updated:** May 4, 2026 | **Owner:** Engineering Team

---

## Overview

This guide covers deployment procedures for the Arkon AI Gateway platform. The platform uses a **pnpm + Turborepo monorepo** with containerized deployments.

---

## Table of Contents

1. [Deployment Architecture](#1-deployment-architecture)
2. [Environment Configuration](#2-environment-configuration)
3. [CI/CD Pipeline](#3-cicd-pipeline)
4. [Docker Deployment](#4-docker-deployment)
5. [Database Migrations](#5-database-migrations)
6. [Health Checks & Monitoring](#6-health-checks--monitoring)
7. [Rollback Procedures](#7-rollback-procedures)
8. [Security Considerations](#8-security-considerations)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Deployment Architecture

### 1.1 Repository Structure

```
arkon-workstation/
├── apps/
│   ├── api/           # Express API (@arkon/api)
│   └── web/           # Next.js frontend (@arkon/web)
├── packages/
│   ├── database/      # Prisma schema (@arkon/database)
│   ├── shared/        # Shared types (@arkon/shared)
│   └── engine-core/   # Rust utilities
└── docker-compose.yml
```

### 1.2 Production Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer                           │
│                    (Azure Application Gateway)                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
    ┌─────────▼─────────┐       ┌─────────▼─────────┐
    │   @arkon/web      │       │   @arkon/api      │
    │  (2+ containers)  │       │  (2+ containers)  │
    │     Port 3000     │       │     Port 3001     │
    └─────────┬─────────┘       └─────────┬─────────┘
              │                           │
              └───────────┬───────────────┘
                          │
              ┌───────────▼───────────┐
              │   Azure PostgreSQL    │
              │   (TimescaleDB ext)   │
              │      Port 5432        │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │   Azure Redis Cache   │
              │   (optional caching)  │
              └───────────────────────┘
```

### 1.3 Environments

| Environment | URL | Branch | Auto-Deploy |
|-------------|-----|--------|-------------|
| Development | localhost:3001/3002 | feature/* | No |
| Staging | staging.arkon.io | develop | Yes |
| Production | arkon.io | main | Manual approval |

### 1.4 Container Registry

Images are stored in Azure Container Registry:

```
arkon.azurecr.io/arkon-api:latest
arkon.azurecr.io/arkon-api:<git-sha>
arkon.azurecr.io/arkon-web:latest
arkon.azurecr.io/arkon-web:<git-sha>
```

---

## 2. Environment Configuration

### 2.1 Required Environment Variables

#### Backend (@arkon/api)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) | `<from-keyvault>` |
| `JWT_EXPIRES_IN` | Token expiration | `7d` |
| `CORS_ORIGIN` | Allowed CORS origins | `https://arkon.io` |
| `FRONTEND_URL` | Frontend URL for OAuth redirects | `https://arkon.io` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | `<from-keyvault>` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | `<from-keyvault>` |
| `GITHUB_REDIRECT_URI` | OAuth callback URL | `https://api.arkon.io/api/auth/github/callback` |
| `REDIS_URL` | Redis connection (optional) | `redis://redis:6379` |

#### Frontend (@arkon/web)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://api.arkon.io` |

### 2.2 Secrets Management

All secrets are stored in Azure Key Vault:

```bash
# List secrets
az keyvault secret list --vault-name arkon-keyvault

# Get a secret
az keyvault secret show --vault-name arkon-keyvault --name jwt-secret --query value -o tsv

# Set a secret
az keyvault secret set --vault-name arkon-keyvault --name jwt-secret --value "your-secret"
```

**Secret Names:**

| Secret Name | Description |
|-------------|-------------|
| `arkon-db-connection-string` | Production database URL |
| `arkon-jwt-secret` | JWT signing secret |
| `arkon-github-client-id` | GitHub OAuth client ID |
| `arkon-github-client-secret` | GitHub OAuth client secret |
| `arkon-acr-password` | Container registry password |

---

## 3. CI/CD Pipeline

### 3.1 GitHub Actions Workflow

The CI/CD pipeline is defined in `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: arkon.azurecr.io

jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm db:generate

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm typecheck

      - name: Test
        run: pnpm test

  build-push:
    needs: lint-test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      - name: Login to ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and Push API
        run: |
          docker build -t $REGISTRY/arkon-api:$GITHUB_SHA -f apps/api/Dockerfile .
          docker push $REGISTRY/arkon-api:$GITHUB_SHA
          docker tag $REGISTRY/arkon-api:$GITHUB_SHA $REGISTRY/arkon-api:latest
          docker push $REGISTRY/arkon-api:latest

      - name: Build and Push Web
        run: |
          docker build -t $REGISTRY/arkon-web:$GITHUB_SHA -f apps/web/Dockerfile .
          docker push $REGISTRY/arkon-web:$GITHUB_SHA
          docker tag $REGISTRY/arkon-web:$GITHUB_SHA $REGISTRY/arkon-web:latest
          docker push $REGISTRY/arkon-web:latest

  deploy-staging:
    needs: build-push
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to Staging
        uses: azure/cli@v1
        with:
          inlineScript: |
            az containerapp update \
              --name arkon-api-staging \
              --resource-group arkon-rg \
              --image $REGISTRY/arkon-api:$GITHUB_SHA

            az containerapp update \
              --name arkon-web-staging \
              --resource-group arkon-rg \
              --image $REGISTRY/arkon-web:$GITHUB_SHA

  deploy-production:
    needs: build-push
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Production
        uses: azure/cli@v1
        with:
          inlineScript: |
            az containerapp update \
              --name arkon-api-prod \
              --resource-group arkon-rg \
              --image $REGISTRY/arkon-api:$GITHUB_SHA

            az containerapp update \
              --name arkon-web-prod \
              --resource-group arkon-rg \
              --image $REGISTRY/arkon-web:$GITHUB_SHA
```

### 3.2 Pipeline Stages

1. **Lint & Test** - Run linting, type checking, and unit tests
2. **Build & Push** - Build Docker images and push to ACR
3. **Deploy Staging** - Auto-deploy on `develop` branch
4. **Deploy Production** - Deploy on `main` with approval

### 3.3 Triggering Deployments

```bash
# Deploy to staging
git checkout develop
git merge feature/my-feature
git push origin develop

# Deploy to production
git checkout main
git merge develop
git push origin main
# Then approve in GitHub Actions
```

---

## 4. Docker Deployment

### 4.1 Production Dockerfiles

#### API Dockerfile (`apps/api/Dockerfile`)

```dockerfile
# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY turbo.json ./
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm --filter @arkon/api build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### 4.2 Build and Push Manually

```bash
# Login to ACR
az acr login --name arkon

# Build from repo root
docker build -t arkon.azurecr.io/arkon-api:$(git rev-parse --short HEAD) -f apps/api/Dockerfile .
docker push arkon.azurecr.io/arkon-api:$(git rev-parse --short HEAD)

docker build -t arkon.azurecr.io/arkon-web:$(git rev-parse --short HEAD) -f apps/web/Dockerfile .
docker push arkon.azurecr.io/arkon-web:$(git rev-parse --short HEAD)
```

### 4.3 Deploy with Docker Compose

For VM-based deployments:

```bash
# SSH to VM
ssh arkon-admin@<vm-ip>

# Navigate to deployment directory
cd /opt/arkon

# Pull latest code
git pull origin main

# Deploy with production profile
docker compose --profile prod pull
docker compose --profile prod up -d

# Verify
docker compose ps
curl http://localhost:3001/api/health
```

---

## 5. Database Migrations

### 5.1 Prisma Migration Strategy

Migrations are managed with Prisma and run automatically on deployment:

```bash
# Development: Push schema directly (no migration files)
pnpm db:push

# Production: Create migration files
pnpm db:migrate

# Deploy migrations in CI/CD
pnpm db:migrate:deploy
```

### 5.2 Migration Workflow

1. **Development**: Edit `packages/database/prisma/schema.prisma`
2. **Generate client**: `pnpm db:generate`
3. **Test locally**: `pnpm db:push`
4. **Create migration**: `pnpm db:migrate --name add_feature_x`
5. **Commit**: Migration files in `packages/database/prisma/migrations/`
6. **Deploy**: CI/CD runs `pnpm db:migrate:deploy`

### 5.3 Manual Migration in Production

```bash
# Connect to production container
docker exec -it arkon-api sh

# Run migrations
npx prisma migrate deploy

# Or from local with production DATABASE_URL
DATABASE_URL="$PROD_DB_URL" pnpm db:migrate:deploy
```

### 5.4 Rollback Migrations

> **Warning:** Prisma doesn't support automatic rollbacks. Backup first.

```bash
# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Manually reverse changes in psql
psql $DATABASE_URL

# Mark migration as rolled back
DELETE FROM _prisma_migrations WHERE migration_name = '20260504_add_feature_x';
```

---

## 6. Health Checks & Monitoring

### 6.1 Health Endpoints

| Endpoint | Description | Expected Response |
|----------|-------------|-------------------|
| `GET /api/health` | Full health check | `{"status":"healthy","checks":{"database":"ok"}}` |
| `GET /api/health/live` | Liveness probe | `{"status":"live"}` |
| `GET /api/health/ready` | Readiness probe | `{"status":"ready","database":"connected"}` |

### 6.2 Container Health Checks

Defined in docker-compose.yml:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 30s
```

### 6.3 Azure Monitor

```bash
# View container logs
az containerapp logs show \
  --name arkon-api-prod \
  --resource-group arkon-rg \
  --follow

# View metrics
az monitor metrics list \
  --resource /subscriptions/<sub>/resourceGroups/arkon-rg/providers/Microsoft.App/containerApps/arkon-api-prod \
  --metric "Requests" \
  --interval PT1H
```

### 6.4 Alerts Configuration

Configure alerts in Azure Monitor for:

- **CPU Usage** > 80% for 5 minutes
- **Memory Usage** > 85% for 5 minutes
- **Response Time** > 2 seconds (p95)
- **Error Rate** > 5%
- **Health Check Failures** > 3 consecutive

---

## 7. Rollback Procedures

### 7.1 Quick Rollback (Container Apps)

```bash
# List revisions
az containerapp revision list \
  --name arkon-api-prod \
  --resource-group arkon-rg \
  --output table

# Activate previous revision
az containerapp revision activate \
  --name arkon-api-prod \
  --resource-group arkon-rg \
  --revision arkon-api-prod--<previous-revision>

# Or rollback by image tag
az containerapp update \
  --name arkon-api-prod \
  --resource-group arkon-rg \
  --image arkon.azurecr.io/arkon-api:<previous-sha>
```

### 7.2 Rollback with Docker Compose

```bash
# SSH to VM
ssh arkon-admin@<vm-ip>

cd /opt/arkon

# Checkout previous version
git checkout <previous-tag>

# Rebuild and deploy
docker compose --profile prod build
docker compose --profile prod up -d
```

### 7.3 Database Rollback

If a migration caused issues:

1. **Stop new deployments**
2. **Backup current state**
3. **Restore from backup if needed**
4. **Deploy previous application version**

```bash
# Restore from backup
psql $DATABASE_URL < backup_20260504_120000.sql
```

---

## 8. Security Considerations

### 8.1 Pre-Deployment Checklist

- [ ] All secrets are in Key Vault (not in code or env files)
- [ ] JWT_SECRET is at least 32 characters
- [ ] CORS_ORIGIN is set to specific domains (not `*`)
- [ ] Database SSL is enabled
- [ ] OAuth redirect URIs are production URLs
- [ ] Rate limiting is configured
- [ ] Audit logging is enabled
- [ ] Health endpoints don't expose sensitive info

### 8.2 Network Security

```bash
# Verify SSL certificate
curl -vI https://arkon.io 2>&1 | grep "SSL certificate"

# Check security headers
curl -I https://arkon.io | grep -E "X-|Strict-Transport"
```

### 8.3 Access Control

| Resource | Access Level |
|----------|--------------|
| Production DB | Engineering Lead, SRE only |
| Staging DB | Engineering Team |
| Azure Portal | Engineering Team (RBAC) |
| Key Vault | Engineering Lead only |
| Container Registry | CI/CD service principal |

---

## 9. Troubleshooting

### 9.1 Container Won't Start

```bash
# Check logs
az containerapp logs show \
  --name arkon-api-prod \
  --resource-group arkon-rg \
  --tail 100

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Prisma client not generated
# - Port conflict
```

### 9.2 Database Connection Issues

```bash
# Test connection from container
docker exec -it arkon-api sh
node -e "require('@prisma/client').PrismaClient().connect()"

# Check firewall rules
az postgres flexible-server firewall-rule list \
  --resource-group arkon-rg \
  --name arkon-db
```

### 9.3 Prisma Migration Fails

```bash
# Check migration status
npx prisma migrate status

# Reset if needed (DESTRUCTIVE)
npx prisma migrate reset

# Force push schema
npx prisma db push --force-reset
```

### 9.4 OAuth Not Working

1. Check `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set
2. Verify `GITHUB_REDIRECT_URI` matches GitHub OAuth app settings
3. Check `FRONTEND_URL` is correct for post-auth redirect
4. Check browser console for CORS errors

---

## Quick Reference

### Common Commands

```bash
# View logs
docker compose logs -f api

# Restart service
docker compose restart api

# Scale service
docker compose up -d --scale api=3

# Check health
curl http://localhost:3001/api/health

# Run migrations
docker exec -it arkon-api npx prisma migrate deploy

# Database backup
pg_dump $DATABASE_URL > backup.sql
```

### Emergency Contacts

| Role | Contact |
|------|---------|
| On-Call Engineer | PagerDuty rotation |
| Engineering Lead | @lead in Slack |
| SRE Team | #sre-support in Slack |

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-05-04 | Engineering | Updated for pnpm + Turborepo monorepo, Prisma migrations |
