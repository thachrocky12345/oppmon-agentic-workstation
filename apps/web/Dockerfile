# =============================================================================
# OppMon Web - Production Dockerfile (pnpm workspace, Next.js 15)
# =============================================================================
# Build context: repo root
#   docker build -f apps/web/Dockerfile -t oppmon-web:latest .
#
# Builds with `next build` and runs with `next start -p 3000`.
# =============================================================================

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wget && \
    corepack enable && \
    corepack prepare pnpm@9.0.0 --activate

# Workspace manifests for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
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

# Copy sources
COPY . .

# Build args -> baked into the client bundle.
# NEXT_PUBLIC_API_URL is empty so the browser uses relative /api/* paths.
# INTERNAL_API_URL must be set at BUILD time because Next.js evaluates
# next.config.ts rewrites during `next build`, not at runtime.
ARG NEXT_PUBLIC_API_URL=
ARG INTERNAL_API_URL=http://192.168.1.195:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INTERNAL_API_URL=$INTERNAL_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @oppmon/web build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000 || exit 1

WORKDIR /app/apps/web
CMD ["pnpm", "exec", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
