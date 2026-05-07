# ADR-0009: [AUTO] Guardrails and Observability Packages

**Date:** 2026-05-07

**Status:** Accepted

## Context

Running autonomous agents on behalf of tenants requires enforced safety policies (input/output filtering, scope checks, audit trails) and end-to-end observability (tracing, metrics, latency). Embedding these inside the API made them hard to share with the agent engine, the router, and future workers.

Two new workspace packages were introduced:

- `@arkon/guardrails` — constitution, scope, filter, audit, tools, types
- `@arkon/observability` — tracing, metrics, latency, Langfuse integration (optional peer dep)

## Decision

Adopt a guardrails-first design where every agent action passes through:

1. **Scope check** — is the tenant/team allowed to invoke this tool/model?
2. **Constitution** — content policy enforcement
3. **Filter** — input/output sanitization
4. **Audit** — record decisions and denials

Observability is wired in parallel with optional peer dependencies (`langfuse`, `prom-client`) so deployments can opt in without forcing the dependency.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Inline guardrails in apps/api only | Less indirection | Cannot reuse in router or future workers | Rejected — duplication |
| Third-party guardrails (NeMo, Guardrails AI) | Mature | Python-first, doesn't fit TS monorepo | Rejected — runtime mismatch |
| OpenTelemetry only | Standard | Heavier setup, less LLM-aware | Deferred — wrap via observability package later |

## Consequences

### Positive

- Single audit/decision pipeline reusable by agent engine, API, and router
- Optional observability backends keep the base footprint small
- Independent test suites under each package's `__tests__/`

### Negative

- Two more packages to version and publish
- Risk of duplicated logic between `apps/api/src/services/audit.ts` and guardrails audit; needs convergence

## Related

- `packages/guardrails/src/`
- `packages/observability/src/`
- ADR-0002 Multi-LLM Providers
- ADR-0008 Agent Engine Subsystem
