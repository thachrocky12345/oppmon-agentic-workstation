# TAG-50: Authenticated `/solve` Endpoint — Multi-Tenant Model + Corpus RAG (EPIC)

## Description

**Suggested Points:** 34 (Epic — rolls up TAG-51 … TAG-65)
**Type:** Epic
**Status:** Open

Build a new authenticated `POST /solve` endpoint on `apps/agent_graph_backend/agent_search`
that supersedes the anonymous `/solve_v2`. The new endpoint:

1. **Authenticates** the caller against the existing OppMon Postgres (`users` table) via
   the same JWT secret used by `apps/api` and `apps/web`.
2. **Resolves a per-user LLM** from the caller's registered models in the OppMon admin
   (`models` + `secret_vault`), then constructs an `LLMClient` for that request only
   (no per-process default leak).
3. **Selects orchestration mode** based on the request:
   - `webFallback=true`  AND `collectionIds=[]`     → existing **Web-Search Planner** (Tavily/DDG).
   - `webFallback=false` AND `collectionIds=[...]`  → new **Corpus-RAG Planner** (pgvector + BM25 + RRF,
     no web calls, citations of the form `[[doc_id:chunk_id]]`).
   - `webFallback=true`  AND `collectionIds=[...]`  → **Hybrid** mode: corpus first, web as fallback.
   - `webFallback=false` AND `collectionIds=[]`     → reject with 422 (nothing to ground on).
4. **Preserves** `/solve_v2` exactly as-is (zero behavior change) for the existing graph UI.

This epic exists because `/solve_v2` currently has three blockers for production multi-tenant use:

- No auth — anyone with network reach to port 8002 can run the planner against the
  process-wide ANTHROPIC key.
- Process-wide model — every tenant is forced onto whatever `LLM_PROVIDER`/`ANTHROPIC_MODEL`
  the swarm shell set at deploy time.
- No corpus RAG — `collection_ids` is accepted by the schema but the orchestrator wires
  in `NullCorpusSearch()`, so corpus-only queries fall through to web search regardless
  of UI toggles.

## Objective

Ship a production-ready `/solve` that is safe to expose behind the OppMon web app at
`/api/graph/solve` for any authenticated tenant, using the tenant's own approved models
and (optionally) their own document collections, with provable hallucination guards in
corpus mode.

## New `/solve` Payload

```jsonc
POST /solve
Authorization: Bearer <jwt>           // same JWT issued by apps/api
Content-Type: application/json

{
  "messages": [
    { "role": "user",      "content": "..." },
    { "role": "assistant", "content": "..." },
    { "role": "user",      "content": "the actual question" }
  ],
  "collectionIds": ["col_abc", "col_def"],   // optional, [] for web-only
  "model":         "claude-sonnet-4-20250514", // FK-like reference into models table
  "provider":      "anthropic",                // disambiguator when model name collides
  "enableTools":   true,
  "webFallback":   false                       // true → use web search chain
}
```

The shape mirrors the OpenAI Chat Completions request so the existing web app's chat
state machine (which already speaks `messages[]`) can call `/solve` without translation.

## Architectural Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **HS256 shared-secret JWT**, not RS256 or a remote `/me` lookup | `apps/api` and `apps/web` already share `JWT_SECRET`. A remote lookup adds a hop per request and a cross-service failure mode. |
| 2 | **`asyncpg` direct, not SQLAlchemy/Tortoise** | Read-only access pattern (users, models, secret_vault, rag_chunks). An ORM is overkill and slows startup. |
| 3 | **Python port of `secret-vault.ts`** using `pynacl` | The TS impl uses `tweetnacl`'s XChaCha20-Poly1305. PyNaCl exposes the same primitive. We must NEVER export decrypted secrets out of process. |
| 4 | **Reuse `apps/api`'s pgvector + BM25 + RRF SQL**, just re-issue it from Python | The retrieval ranking has been tuned; rewriting it invites drift. We copy the SQL verbatim and pin the column list. |
| 5 | **Corpus-RAG mode runs `PlannerAgent` with a different system prompt and tool set**, not a separate orchestrator class | The planner→searcher DAG is correct; only the grounding source changes. One orchestrator, two tool registries. |
| 6 | **Hard refusal on empty retrieval** in corpus-only mode | The system prompt instructs the model to answer `"I don't have information about that in the provided collections."` if RRF returns zero rows. Eval-tested. |
| 7 | **Per-request `LLMClient`, never cached** | A cached client would leak a tenant's API key into the next tenant's request. The factory `create_llm_client_from_spec()` is built for this. |

## Sub-Tickets

| Ticket | Title | Points | Layer |
|---|---|---|---|
| [TAG-51](./TAG-51-asyncpg-pool.md)             | asyncpg pool + DATABASE_URL plumbing            | 3 | Backend |
| [TAG-52](./TAG-52-jwt-verify-python.md)        | Mirror Arkon JWT verification in Python         | 2 | Backend |
| [TAG-53](./TAG-53-fastapi-auth-dep.md)         | FastAPI `Depends(get_current_user)`             | 2 | Backend |
| [TAG-54](./TAG-54-secret-vault-python.md)      | Port `secret-vault.ts` to Python (pynacl)       | 3 | Crypto  |
| [TAG-55](./TAG-55-model-registry-queries.md)   | Read-only model registry queries                | 3 | Backend |
| [TAG-56](./TAG-56-llmspec-schema.md)           | `LLMSpec` Pydantic schema + factory adapter     | 2 | Backend |
| [TAG-57](./TAG-57-resolve-user-model.md)       | Resolve `LLMSpec` from `{model,provider,user}`  | 3 | Backend |
| [TAG-58](./TAG-58-solve-endpoint.md)           | `POST /solve` route + request schema            | 3 | Backend |
| [TAG-59](./TAG-59-corpus-search.md)            | `CorpusSearch` (pgvector + BM25 + RRF)          | 5 | Retrieval |
| [TAG-60](./TAG-60-embedding-provider.md)       | Python embedding provider for corpus queries    | 2 | Retrieval |
| [TAG-61](./TAG-61-rag-planner-prompt.md)       | RAG-mode planner system prompt + tool set       | 5 | Agent |
| [TAG-62](./TAG-62-mode-selection.md)           | Mode-selection logic in `/solve`                | 2 | Backend |
| [TAG-63](./TAG-63-conversation-history.md)     | `messages[]` history support                    | 2 | Backend |
| [TAG-64](./TAG-64-eval-and-integration.md)     | Integration tests + eval entries                | 3 | QA |
| [TAG-65](./TAG-65-swarm-deploy.md)             | Swarm deploy hardening + ADR                    | 2 | DevOps |

**Total:** 42 sub-points (epic budgeted at 34 — buffer absorbed in TAG-59/TAG-61).

## Cut Lines (NOT in this epic)

- Per-tenant rate limiting on `/solve` — folded into existing API gateway rate limits.
- Streaming `messages[]` updates back into the corpus (i.e. memory) — separate epic.
- Cost tracking per `/solve` call — separate epic; will hook into existing `cost_events` table.
- UI wiring on `apps/web` to actually pick `model`/`provider` from the user's registered set —
  separate epic (TAG-66 placeholder).
- Migrating `/solve_v2` callers to `/solve` — soft-deprecation, not in scope.

## Critical Non-Negotiables

1. **`/solve_v2` MUST NOT change behavior.** All new code lives behind feature flag
   `ENABLE_SOLVE_V3=true` (default true once shipped, but flag exists for rollback).
2. **Decrypted secrets MUST NOT cross the request boundary.** A tenant's `api_key` is
   decrypted once inside `resolve_llm_spec()`, handed to `create_llm_client_from_spec()`,
   and the resulting client lives only for that request's `await`. No logs. No traces.
3. **Cross-tenant isolation is a security boundary.** TAG-55 has a mandatory negative test:
   user A cannot fetch user B's model record by guessing the ID. Same test against
   collections in TAG-59.
4. **Empty-retrieval refusal in corpus mode.** TAG-61's eval set MUST include "ask about
   X when X is not in the corpus" and the answer MUST be a refusal, not a hallucination.

## Dependencies

**Depends on:** [TAG-49](./TAG-49-provider-integration-audit.md) (provider audit baseline).
**Blocks:** UI work to pick model+collection in chat (separate epic).

## Risk Factors

| Risk | Mitigation |
|---|---|
| JWT_SECRET mismatch between `apps/api` and `agent_search` on swarm | TAG-65 adds a deploy-time parity check + the swarm-debug runbook section. |
| Decrypting secrets in Python diverges from TS impl → corrupted keys | TAG-54 ships a round-trip test that takes ciphertext produced by `apps/api/src/crypto/secret-vault.ts` and decrypts it in Python. CI runs both directions. |
| pgvector query plan regresses on large corpora | TAG-59 copies the existing tuned SQL verbatim; adds `EXPLAIN ANALYZE` smoke in CI. |
| Hallucination in corpus mode despite the new system prompt | TAG-61 ships eval entries with held-out questions; refusal rate gate at 0.9 for out-of-corpus questions. |
| `messages[]` history blows context window | TAG-63 trims to last N=8 turns with a summarizer fallback (reuse `summary_memory` helper if present). |

## Acceptance Criteria (Epic)

- [ ] `POST /solve` with a valid JWT and a registered model returns a streaming SSE response.
- [ ] `POST /solve` with no auth returns 401.
- [ ] `POST /solve` with a model the user does not own returns 403.
- [ ] `POST /solve` with `webFallback=false collectionIds=[<owned>]` returns answers grounded
      ONLY in those collections, with `[[doc_id:chunk_id]]` citations.
- [ ] `POST /solve` with `webFallback=false collectionIds=[]` returns 422.
- [ ] `/solve_v2` continues to pass its existing eval suite unchanged.
- [ ] Decrypted API keys do not appear in logs, traces, or error responses (grep test in CI).
- [ ] Refusal rate ≥ 0.9 on out-of-corpus eval questions in corpus-only mode.
