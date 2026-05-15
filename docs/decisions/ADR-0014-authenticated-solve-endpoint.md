# ADR-0014: Authenticated `/solve` Endpoint (TAG-50 epic)

**Date:** 2026-05-14

**Status:** Accepted

## Context

ADR-0011 introduced the FastAPI `KnowledgeSearchBackend` (graph-agent) with a single **unauthenticated** SSE endpoint, `POST /solve_v2`. The service was stateless and trusted the Next.js proxy boundary for auth.

The TAG-50 epic (TAG-55..TAG-65) adds a **second** endpoint, `POST /solve`, that:

- Authenticates each request against the same `JWT_SECRET` as `apps/api`.
- Resolves a per-request `LLMSpec` from a tenant-scoped model registry row.
- Decrypts the operator's API key with the same `TAG_ENCRYPTION_MASTER_KEY` that `apps/api` uses on the Express side.
- Streams the same planner/searcher event shape as `/solve_v2`, but with citations and tenant-scoped corpus search.
- Records an audit row per call.

This requires moving auth, secret-decryption, and DB access into the FastAPI process — concerns that ADR-0011 had explicitly delegated to Express. The cross-language boundary forces several mechanical decisions (key transport, JWT verification, DB driver, orchestrator reuse) that this ADR captures so future contributors don't relitigate them.

## Decision

### 1. HS256 shared-secret JWT (not RS256, not remote `/me`)

`apps/api` mints HS256 JWTs against `JWT_SECRET`. The graph-agent verifies them with the same secret. Operator parity is enforced at deploy time by `scripts/check-jwt-parity.sh` and at boot by `check_required_env()` in `agent_v2/app.py`.

### 2. `asyncpg` direct (not an ORM)

Two read-only queries (model-registry lookup + audit insert) don't justify dragging SQLAlchemy or Tortoise into the image. The asyncpg pool lives in `agent_v2/db/pool.py` and is lazily opened on first request.

### 3. Per-request `LLMClient` (not cached)

Each request can land on a different tenant's model row with a different provider, model, API base, and decrypted key. Caching by tenant would require invalidation hooks on every model-registry write in `apps/api` — out of scope. The instantiation cost is dwarfed by the LLM call itself.

### 4. Corpus mode reuses `PlannerAgent` (not a separate orchestrator)

The planner/searcher loop is the same; only the `Retriever` swaps in a real `CorpusSearch` instead of `NullCorpusSearch`. Forking the orchestrator would double the maintenance surface for the SSE event format.

### 5. 403 on cross-tenant model lookup (not 404)

When a JWT for tenant B requests a model owned by tenant A, the registry returns 403, not 404. 404 would leak the existence of the row; 403 makes the access denial explicit. The same backstop is applied at the SQL level (`WHERE tenant_id = $1`) so a routing bug can't escalate.

### 6. Decryption lives in `agent_search` (not via short-lived tokens from `apps/api`)

The alternative — `apps/api` decrypts and mints a one-time token, then graph-agent fetches the cleartext key — would add a network round-trip per request and a second secret-distribution channel. Sharing `TAG_ENCRYPTION_MASTER_KEY` is operationally simpler and the threat model (both services are inside the same prod swarm) is identical.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|---|---|---|---|
| RS256 JWT + public key in graph-agent | No shared secret | New key-distribution channel; `apps/api` already uses HS256 everywhere | Operational symmetry with `apps/api` |
| Remote `/me` call per request | No JWT logic in Python | Doubles latency; couples graph-agent uptime to `apps/api` | Latency + coupling |
| SQLAlchemy + alembic in graph-agent | Familiar ORM | Two queries don't justify the dep weight or migration tooling | Scope discipline |
| Cached `LLMClient` per tenant | Saves instantiation cost | Cache invalidation on every `apps/api` registry write | Premature optimization |
| `apps/api` mints short-lived decrypt tokens | Confines master key to one service | Adds an RPC, a second secret channel, retry handling | Same threat boundary, more moving parts |
| Separate orchestrator for corpus mode | Could specialize for citations | Doubles SSE event-shape surface | Reuse beats fork |

## Consequences

### Positive

- One JWT verification path, one secret-rotation procedure across both services.
- Graph-agent owns its own DB pool; no synchronous calls back to `apps/api` in the request path.
- Corpus mode is one `Retriever` swap, not a parallel orchestrator.
- Rollback knob is a single env var (`ENABLE_SOLVE_V3=false`) — no schema or data changes to undo.
- Fail-fast container init means a misconfigured deploy CrashLoopBackOffs in seconds instead of accepting traffic that 401s.

### Negative

- Two services must keep `JWT_SECRET` and `TAG_ENCRYPTION_MASTER_KEY` in lockstep. A rotation has to land on both atomically. Mitigation: `scripts/check-jwt-parity.sh` runs on every deploy.
- The Python and TypeScript encryption implementations must agree on framing (XChaCha20-Poly1305, same nonce length, same AAD policy). Tested via the TAG-62 round-trip fixture.
- Two model-registry consumers (Express writes, Python reads) — schema changes must consider both readers.
- Graph-agent now has DB access, which widens its blast radius slightly. Mitigation: read-only role at the DSN level (operator-enforced, not in code).

## Related

- Epic: [TAG-50](../jira/TAG-50-authenticated-solve-endpoint-epic.md)
- Stories: TAG-55..TAG-65
- Wire contract: [`docs/solve-v2.md`](../solve-v2.md) (event shape shared with `/solve`)
- Web proxy: `apps/web/src/app/api/graph/solve/route.ts` (authenticated, this epic)
- Legacy proxy: `apps/web/src/app/api/graph/solve_v2/route.ts` (unauthenticated, preserved)
- Fail-fast: `apps/agent_graph_backend/agent_search/agent_v2/app.py::check_required_env`
- JWT parity: `scripts/check-jwt-parity.sh`
- Runbook: `.claude/skills/swarm-debug/SKILL.md#solve-v3-check`
- Production stack: `docker-stack.yml` (graph-agent environment block)
- Related ADRs: ADR-0011 (FastAPI service), ADR-0002 (multi-LLM providers), ADR-0007 (LiteLLM router)
