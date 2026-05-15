# ADR-0011: [AUTO] FastAPI Python KnowledgeSearchBackend for Graph-Mode Chat

**Date:** 2026-05-12

**Status:** Accepted

**Update 2026-05-15:** The service directory was renamed `apps/KnowledgeSearchBackend/` → `apps/agent_graph_backend/`, and the Python package was renamed `mindsearch/` → `agent_search/`. The wire contract, the ADR-0011 decision, and the consequences are unchanged — only the path/package name changed for clarity. The Docker image entrypoint (`python -m mindsearch.v2_server`) is still being aligned with the new package name; see TAG-50 epic for the full rename arc.

## Context

Arkon's chat experience needed an interactive **graph-mode** that visualizes a live planner→searcher DAG to the user (via the `AgentGraphPanel` component on the chat page). Implementing this purely inside the existing Express backend posed several constraints:

- The graph-mode reference implementation is an upstream fork of [InternLM/MindSearch](https://github.com/InternLM/MindSearch), written in Python and tightly coupled to a Python tool registry, planner, and SSE event loop.
- Streaming planner+searcher events with low per-tick latency is more ergonomic in `sse-starlette` than in the existing Express stack.
- Python LLM/search libraries (anthropic, openai, ddgs) provide first-class support for the patterns mindsearch uses, with minimal reimplementation cost.
- The Express API still owns auth, tenancy, RLS, audit logging, RAG documents, and persistence. Graph-mode does not need those concerns inside the same process.

The earlier architecture document tracked an **open question**: "Parallel backend consideration (FastAPI Python or Rust+Go) — deferred". This ADR closes that question for the graph-mode use case.

## Decision

Add a new **first-class service** `apps/KnowledgeSearchBackend/` — a trimmed Python FastAPI fork of MindSearch that exposes a single endpoint:

- `POST /solve_v2` — SSE-streaming planner → searcher → synthesis loop
- `GET  /healthz` — liveness
- `GET  /`        — Swagger UI

Wire it into the system as follows:

1. **Browser** uses the same-origin Next.js proxy `apps/web/src/app/api/graph/solve/route.ts`.
2. **Proxy** forwards to the FastAPI service running on port `8002`.
3. **Docker Compose** runs the service under a new `graph` profile so dev environments without graph-mode are unaffected.
4. **Production** ships it as a separate image alongside `oppmon-api` and `oppmon-web` (new tag convention `v2.x`).
5. **Wire contract** documented in `docs/solve-v2.md`.

The service is intentionally **stateless** (no DB writes). Auth is enforced at the Next.js proxy boundary; the FastAPI service trusts only requests reaching it from the proxy network.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Reimplement mindsearch in Node/TS inside `apps/api` | Single language, single deploy unit | Large reimplementation effort; loses upstream patches; SSE planner loop awkward in Express | Time + maintenance cost |
| Run mindsearch as a Node child process via stdio | Reuses Express auth/middleware | Process-management complexity, breaks isolation, harder to scale independently | Operational fragility |
| Embed mindsearch into `apps/router` | Co-locates with existing proxy | Conflates LLM routing with agent orchestration | Mixed responsibilities |
| Keep deferring graph-mode | Zero new infra | Blocks the chat UX roadmap | Product priority |

## Consequences

### Positive

- Clear separation of concerns: Express owns persistence/auth/tenancy; FastAPI owns the planner DAG.
- Smaller blast radius — graph-mode bugs cannot crash the main API.
- Independently scalable: graph-mode can scale horizontally without touching the Express service.
- Closes the long-standing "parallel backend" architectural question.
- Trimmed image (~250 MB) by deleting the legacy `/solve` route and heavyweight deps (torch, jupyter, transformers, lmdeploy, etc.).
- LLM provider flexibility (anthropic + openai + fake client for tests).

### Negative

- Adds a second language runtime (Python 3.x) to the deploy surface.
- Two services to keep in sync on a versioned wire contract (`docs/solve-v2.md`).
- Requires a `graph` Compose profile and a new prod image — operational complexity.
- Auth perimeter moves to the Next.js proxy; the FastAPI service must not be exposed publicly.
- Two `anthropic` SDKs in the workspace (TS in api, Python here) — independent version cadence.

## Related

- Wire contract: [`docs/solve-v2.md`](../solve-v2.md)
- Next.js proxy: `apps/web/src/app/api/graph/solve/route.ts`
- Frontend panel: `apps/web/src/components/AgentGraphPanel.tsx`
- Service README: [`apps/KnowledgeSearchBackend/README.md`](../../apps/KnowledgeSearchBackend/README.md)
- Production stack: `docker-stack.yml` (new v2.x image tag convention from commit `06d0bff`)
- Upstream: [InternLM/MindSearch](https://github.com/InternLM/MindSearch)
- Related ADRs: ADR-0002 (Multi-LLM providers), ADR-0008 (Agent Engine subsystem)
