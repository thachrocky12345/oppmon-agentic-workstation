# ADR-0007: [AUTO] LiteLLM Router via http-proxy-middleware

**Date:** 2026-05-07

**Status:** Accepted

## Context

Tenants need to route AI API calls to per-tenant LiteLLM instances with isolation, virtual key resolution, and request rewriting. The platform required a dedicated proxy app separate from the main API to keep latency low and concerns separated.

A new `apps/router/` workspace package (`@oppmon/router`) was added. It uses `http-proxy-middleware` for transparent forwarding and shares Prisma + shared types with the main API.

## Decision

Adopt `http-proxy-middleware ^3.0.0` inside a dedicated Express service (`@oppmon/router`) that:

- Resolves tenant context from virtual keys
- Routes traffic to the correct LiteLLM container/instance
- Reuses `@oppmon/database` and `@oppmon/shared`
- Runs alongside `apps/api` and `apps/web`

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| In-process proxy in apps/api | Single deploy unit | Couples LLM proxy latency to API request loop; harder to scale independently | Rejected — separation of concerns |
| Nginx/Envoy reverse proxy | Battle-tested, fast | Hard to express tenant lookup + DB-driven rewriting | Rejected — needs custom routing logic |
| LiteLLM proxy directly exposed | Zero custom code | No multi-tenant key abstraction, no audit trail | Rejected — security/observability gaps |

## Consequences

### Positive

- Independent scaling of router and API
- Centralized virtual-key → tenant resolution
- Reuse of monorepo shared types and Prisma client
- Path to per-tenant rate limiting and metering

### Negative

- Extra service to deploy and monitor
- Additional network hop for LLM calls

## Related

- `apps/router/src/index.ts`
- `apps/router/src/proxy.ts`
- ADR-0002 Multi-LLM Providers
- `apps/api/src/services/litellm-orchestrator.ts`
