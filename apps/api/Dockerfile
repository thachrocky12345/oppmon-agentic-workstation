# =============================================================================
# OppMon API - Production Dockerfile (pnpm workspace)
# =============================================================================
# Build context: repo root
#   docker build -f apps/api/Dockerfile -t oppmon-api:latest .
#
# Workspace packages (@oppmon/database, @oppmon/shared) export raw TypeScript
# (main: ./src/index.ts), so we run the API with tsx instead of compiling
# api to dist/ — that keeps cross-package imports working at runtime.
# =============================================================================

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wget openssl ca-certificates && \
    corepack enable && \
    corepack prepare pnpm@9.0.0 --activate

# Workspace manifest layer (better caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./

# Per-package manifests (every workspace member must be listed for pnpm)
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/router/package.json apps/router/
COPY packages/agent-engine/package.json packages/agent-engine/
COPY packages/cli/package.json packages/cli/
COPY packages/database/package.json packages/database/
COPY packages/guardrails/package.json packages/guardrails/
COPY packages/integration-tests/package.json packages/integration-tests/
COPY packages/observability/package.json packages/observability/
COPY packages/shared/package.json packages/shared/
COPY packages/skill-framework/package.json packages/skill-framework/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN pnpm install --frozen-lockfile

# Copy full sources
COPY . .

# Generate Prisma client (uses packages/database/prisma/schema.prisma)
RUN pnpm --filter @oppmon/database exec prisma generate || true

# Runtime user + writable data dir
RUN addgroup -g 1001 -S oppmon && \
    adduser -S oppmon -u 1001 -G oppmon && \
    mkdir -p /app/data/documents && \
    chown -R oppmon:oppmon /app/data

USER oppmon

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health/live || exit 1

WORKDIR /app
CMD ["/app/apps/api/docker-entrypoint.sh"]
