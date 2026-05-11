# Request Flow

**Last Updated:** 2026-05-11 (init sync)

## Overview

This diagram shows the complete lifecycle of an API request from the client through Next.js (with `middleware.ts` using `jose`) into the Express backend at `apps/api/`. LLM-bound traffic from CLIs and SDKs may bypass `apps/web` and hit `apps/router/` (LiteLLM proxy) directly.

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (Browser / CLI / Agent)
    participant N as Next.js (apps/web)
    participant MW as web middleware.ts (jose)
    participant Rtr as Router (apps/router)
    participant Mdw as API Middleware Chain
    participant Rt as Route Handler (apps/api/src/routes/*)
    participant Sv as Service (apps/api/src/services/*)
    participant Ag as Agent Subsystem (optional)
    participant G as Guardrails
    participant DB as Prisma → PostgreSQL
    participant LLM as LLM Provider

    alt UI request
        C->>N: HTTP request
        N->>MW: middleware.ts (verify JWT cookie via jose)
        MW-->>N: allow / redirect to /login
        N->>Mdw: REST :3001 (cookies + Bearer)
    else Direct API / CLI
        C->>Mdw: REST :3001
    else LLM proxy
        C->>Rtr: POST /v1/chat/completions
        Rtr->>DB: lookup virtual_key → tenant
        Rtr->>LLM: forward (http-proxy-middleware)
        LLM-->>Rtr: stream
        Rtr-->>C: stream
    end

    Mdw->>Mdw: morgan / helmet / cors / compression / cookie-parser / rate-limit
    Mdw->>Mdw: request-auth.ts (JWT) + tenant-context (RLS GUCs) + access + rbac
    Mdw->>Mdw: idempotency (POST replay-safety)
    Mdw->>Rt: req with claims
    Rt->>Sv: invoke service
    opt Agent path
        Sv->>Ag: oracle loop / semantic cache / toolbox
        Ag->>G: scope + constitution + filter checks
        G-->>Ag: allow / deny + audit
        Ag->>LLM: completion (Anthropic / Cerebras / Ollama)
        LLM-->>Ag: tokens
    end
    Sv->>DB: prisma.* (snake_case columns via @map)
    DB-->>Sv: rows
    Sv-->>Rt: data
    Rt-->>Mdw: JSON
    Mdw-->>N: response
    N-->>C: render
```

## Middleware Chain

1. `morgan` — HTTP access log
2. `helmet` — security headers
3. `cors` — cross-origin
4. `compression` — gzip
5. `cookie-parser` — parse cookies
6. `request-auth.ts` — JWT verification (skips public paths)
7. `tenant-context.ts` — sets Postgres GUCs (`app.tenant_id`, `app.current_actor_id`) so RLS policies apply
8. `access.ts` — scope / policy evaluation
9. `rbac.ts` — role check
10. `idempotency.ts` — replay-safe POSTs via Idempotency-Key
11. `rate-limiter.ts` — per-route limits
12. Route handler → service → Prisma → response
13. `error-handler.ts` — last-resort error formatter

## Notes

- The frontend's `middleware.ts` uses `jose` to verify the JWT at the edge before rendering protected pages.
- The router (`apps/router`) is a separate Express service for LLM traffic — it does not run the full middleware chain because the API still owns auth/audit for non-LLM endpoints.
