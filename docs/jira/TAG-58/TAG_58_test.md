# TAG-58 — `POST /solve` Endpoint: Test Plan

## Objective

Wire the authenticated, tenant-scoped `POST /solve` SSE route into
`agent_v2`, gated behind the `ENABLE_SOLVE_V3` feature flag. The route
composes the building blocks shipped by TAG-52..TAG-57 without owning
business logic itself:

  * **TAG-53 auth** — `get_current_user` produces a verified `JWTClaims`.
  * **TAG-57 resolver** — `resolve_llm_spec(user, model, provider)`
    returns a tenant-scoped `LLMSpec` or raises 403/500.
  * **TAG-56 spec** — `build_client(spec)` materialises an `LLMClient`.
  * **TAG-61/62 orchestrator (stubbed here)** — `select_mode(req)` +
    `run_solve(...)` yield SSE events. Real bodies arrive in the
    follow-up tickets; the seam stays stable.
  * **`sse_starlette.EventSourceResponse`** — wire-format adapter.

The legacy `/solve_v2` route is untouched. The two endpoints coexist
during the cutover and the regression test in the same suite asserts
both paths mount.

## Acceptance Criteria

- [x] `POST /solve` is mounted only when
      `settings.enable_solve_v3 == True`. With the flag off the route
      is absent from `app.routes` and any request gets a clean 404.
- [x] No auth header → 401.
- [x] Invalid JWT → 401.
- [x] Resolver-denied model → 403 with the exact static detail string
      from TAG-57 (`"model not available for this user"`).
- [x] `web_fallback=False` AND `collection_ids=[]` → 422 (no grounding
      source — the request would have no way to ground its answer).
- [x] `messages[-1].role != "user"` → 422 (we never start solving from
      an assistant turn).
- [x] Happy path → 200 + `Content-Type: text/event-stream` + at least
      one `data:` frame from the orchestrator.
- [x] `/solve_v2` still mounts when `enable_solve_v3=True` (regression
      proof).
- [x] `Content-Length > MAX_BODY_BYTES` (64 KiB) → 413 with detail
      `"request body too large"`, before any parsing or auth work.
- [x] ≥ 80 % coverage on new code (achieved **92 %** overall;
      individual modules below).

## Files Touched

| Path | Change |
|---|---|
| `apps/agent_graph_backend/agent_search/agent_v2/api/__init__.py` | NEW — exports `solve_router`, `SolveRequest`, `ChatMessage` |
| `apps/agent_graph_backend/agent_search/agent_v2/api/solve_request.py` | NEW — pydantic `ChatMessage` + `SolveRequest` with `populate_by_name=True`, `extra="forbid"`, the two `@model_validator(mode="after")` rules |
| `apps/agent_graph_backend/agent_search/agent_v2/api/solve.py` | NEW — `POST /solve` route, `MAX_BODY_BYTES`, `_check_body_size`, SSE-error envelope mirroring `/solve_v2` |
| `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/modes.py` | NEW — stubbed `select_mode` + `run_solve` (TAG-61/62 fill the bodies) |
| `apps/agent_graph_backend/agent_search/agent_v2/app.py` | MODIFIED — flag-gated `app.include_router(solve_router)` inside `mount_v2` |
| `apps/agent_graph_backend/agent_search/agent_v2/config.py` | MODIFIED — new `enable_solve_v3: bool = False` field |
| `apps/agent_graph_backend/agent_search/tests/api/__init__.py` | NEW — empty pkg marker |
| `apps/agent_graph_backend/agent_search/tests/api/test_solve_route.py` | NEW — 9 pytest-asyncio tests |
| `scripts/TAG_58_integration.py` | NEW — in-process integration smoke (9 cases) |
| `docs/jira/TAG-58/TAG_58_test.md` | NEW — this file |

## Design Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Feature-flag the entire mount, not the request path | `if settings.enable_solve_v3: app.include_router(...)` keeps the auth/resolver/orchestrator graph out of import scope when the flag is off. Rollback in prod is a single env-flip — no redeploy, no router-level 404 to a half-imported module. |
| 2 | Lazy import of `.api` inside the flag branch | Same reason. With the flag off, `mount_v2` imports neither `solve.py`'s deps (auth/resolve/llm/orchestrator) nor the body-size machinery. Cuts cold-start cost and dependency surface for non-v3 deployments. |
| 3 | `select_mode` + `run_solve` shipped as deliberate stubs | TAG-58 owns wiring; TAG-61 owns `run_solve`, TAG-62 owns `select_mode`. Shipping stubs that satisfy the wire format (yield `step` + `final`) gives a working happy-path test today and a stable seam the follow-ups can drop into. Stubs are flagged with `"stub": True` in the payload — easy to grep for in logs and easy to delete in code review. |
| 4 | Body-size cap enforced via `Content-Length` header, not body buffer | `Content-Length` is the realistic DoS vector — a malicious client advertises a 50 MB body and the framework allocates buffers before we ever look at it. Reading the header costs nothing. Bodies without `Content-Length` (chunked) fall through to FastAPI's own ceiling — out of scope here. |
| 5 | `MAX_BODY_BYTES = 64 KiB` | Generous for ~30 Anthropic-sized turns. Under typical reverse-proxy `client_max_body_size` defaults (Nginx 1 MB, Cloudflare 100 MB). The orchestrator's history-trimming (TAG-63) will handle the upstream "message history grew unbounded" case — this is defence in depth. |
| 6 | Two `@model_validator(mode="after")` rules on `SolveRequest`, not one | Validators raise `ValueError`, which FastAPI converts to 422 with the validator message. Splitting "no grounding source" from "last role must be user" gives the client a clear pydantic field-error path. Combined validator would force a single message that hides which rule fired. |
| 7 | `populate_by_name=True` on `SolveRequest` with camelCase aliases | Web frontend sends `webFallback`/`collectionIds`/`enableTools` (TS convention); Python tests speak snake_case (Python convention). Allowing both lets us write idiomatic tests without ever round-tripping JSON in fixtures. `extra="forbid"` keeps the schema closed so a typo from either side surfaces as 422, not silent drop. |
| 8 | Resolver patched at `solve_mod.resolve_llm_spec`, not `auth.resolve.resolve_llm_spec` | TAG-57's lesson, repeated: `from ..auth.resolve import resolve_llm_spec` rebinds the name into `api.solve`'s namespace. Patching the source module after `api.solve` is imported is a no-op. The fixture comment makes this explicit so the next maintainer doesn't lose ten minutes to it. |
| 9 | SSE error envelope mirrors `/solve_v2` exactly | The web app's `AgentGraphPanel` parser already handles `{"error": {"msg": ..., "details": ...}}` from `/solve_v2`. Re-using the shape means zero frontend work when this route ships — the parser is the same regex. |
| 10 | Integration script monkey-patches `solve_mod.resolve_llm_spec`, runs in-process via `httpx.ASGITransport` | No DB, no real LLM, no separate server. The script doubles as a "TAG-58 works end-to-end in one process" demo. CI can run it as a smoke without any infrastructure. The patched resolver mirrors the unit test's `_ok_resolve` / `_deny_resolve` — same idiom, both call sites. |

## Unit Test Results

```
$ cd apps/agent_graph_backend && pytest agent_search/tests/api/test_solve_route.py -v

agent_search/tests/api/test_solve_route.py::test_no_auth_returns_401 PASSED
agent_search/tests/api/test_solve_route.py::test_invalid_jwt_returns_401 PASSED
agent_search/tests/api/test_solve_route.py::test_model_not_owned_returns_403 PASSED
agent_search/tests/api/test_solve_route.py::test_no_grounding_source_returns_422 PASSED
agent_search/tests/api/test_solve_route.py::test_last_message_must_be_user_returns_422 PASSED
agent_search/tests/api/test_solve_route.py::test_happy_path_returns_sse_stream PASSED
agent_search/tests/api/test_solve_route.py::test_solve_v2_still_mounts PASSED
agent_search/tests/api/test_solve_route.py::test_flag_off_solve_returns_404 PASSED
agent_search/tests/api/test_solve_route.py::test_oversize_body_returns_413 PASSED

============================== 9 passed in 0.74s ==============================
```

Coverage on TAG-58 paths:

```
$ pytest agent_search/tests/api/test_solve_route.py \
    --cov=agent_search.agent_v2.api \
    --cov=agent_search.agent_v2.orchestrator.modes \
    --cov-report=term-missing

Name                                                  Stmts   Miss  Cover   Missing
-----------------------------------------------------------------------------------
agent_search\agent_v2\api\__init__.py                     2      0   100%
agent_search\agent_v2\api\solve.py                       27      4    85%   70, 73-75, 115-117
agent_search\agent_v2\api\solve_request.py               21      0   100%
agent_search\agent_v2\orchestrator\modes.py               9      0   100%
-----------------------------------------------------------------------------------
TOTAL                                                    59      4    92%
```

**Coverage on TAG-58 paths: 92 %.** The four uncovered lines in
`solve.py` are defensive paths:

  * `solve.py:70` — `Content-Length` header absent (request passes
    through to FastAPI's own buffering, by design).
  * `solve.py:73-75` — malformed `Content-Length` (non-integer); we
    fall through to FastAPI rather than 400 the caller.
  * `solve.py:115-117` — the `except Exception` envelope inside
    `event_stream()`. Exercising it requires an orchestrator that
    raises mid-stream; the stub doesn't. TAG-61's real implementation
    will cover this path naturally.

All four are non-business-logic guards; not worth a defensive test
that would lock in the exact import structure.

Full suite regression:

```
$ pytest agent_search/tests/

============================= 135 passed in 3.86s =============================
```

TAG-49..TAG-57 stayed green (126 prior + 9 new = 135). No regressions.

## Integration Test Results

```
$ cd apps/agent_graph_backend && python ../../scripts/TAG_58_integration.py

[PASS] TC-01 flag off hides /solve | paths=['/solve_v2']
[PASS] TC-02 no auth -> 401 | 401
[PASS] TC-03 invalid JWT -> 401 | 401
[PASS] TC-04 resolver denies -> 403 | 403
[PASS] TC-05 no grounding -> 422 | 422
[PASS] TC-06 last role != user -> 422 | 422
[PASS] TC-07 happy path SSE | status=200 ctype='text/event-stream; charset=utf-8' frame=True
[PASS] TC-08 /solve_v2 still mounts | paths=['/solve', '/solve_v2']
[PASS] TC-09 oversize body -> 413 | 413

total=9 passed=9 failed=0
```

Each case builds a fresh `FastAPI()` via `_build_app(flag=, resolver=)`,
mounts via `mount_v2`, and exercises the route in-process through
`httpx.AsyncClient(transport=httpx.ASGITransport(app=app))`. No DB,
no separate server, no real LLM — the resolver is monkey-patched at
the import-site in `api.solve` (same idiom as the unit tests).

Run from `apps/agent_graph_backend/` so the relative `sys.path` insert
in the script finds the package; no env vars required.

## Quality Gate

| Check | Result |
|---|---|
| `ruff check ... --select E,F,W,B,UP,SIM` on new paths | **0 issues** |
| `pyright` on `api/`, `orchestrator/modes.py`, `tests/api/`, `scripts/TAG_58_integration.py` | **0 errors, 0 warnings, 0 informations** |
| Secret grep (`sk-`, `csk-`, `tvly-`, `AKIA…`) on new paths | **0 matches** |
| Full pytest suite | **135 / 135 pass** |
| Integration script | **9 / 9 pass** |
| Coverage on new code | **92 %** (uncovered paths are defensive guards documented above) |

Two `SIM117` lints surfaced during the gate (nested `async with` for
the happy-path SSE reader). Both fixed by collapsing into a single
parenthesised `async with (a, b, c,):` block — same fix in
`test_solve_route.py` and `TAG_58_integration.py`. Tests still green
after the fix.

## Known Limitations

- **Orchestrator stubs.** `select_mode` and `run_solve` are
  intentionally minimal — they pick `"graph"` if `enable_tools` else
  `"simple"`, and yield one `step` frame plus one terminal `final`
  frame with `"stub": True`. TAG-61 ships the real `run_solve` (DAG
  planner + searcher loop); TAG-62 ships the real `select_mode`
  (heuristic / model-driven). The wire contract is stable, so neither
  follow-up will touch the route in this ticket.
- **`Content-Length` only.** Bodies sent with `Transfer-Encoding:
  chunked` bypass the early 413 check; FastAPI's own buffer limit
  catches them later. The realistic DoS vector is the announced
  `Content-Length` header — that's what we cap on.
- **No per-tenant rate limiting.** The route currently allows any
  authenticated caller to fire `/solve` as fast as they like. TAG-65
  (rate limit) is the natural place to add this. Until then, the
  reverse proxy / load balancer is the only throttle.
- **Pre-existing `F401` in `app.py` and `config.py`.** `os` and
  `Field` are imported but unused in modules I touched but did NOT
  introduce the import. Per the skill's "do not touch unrelated
  existing violations" rule, left alone — would file a follow-up
  cleanup ticket if requested.
- **No structured request-id / trace-id in error logs.**
  `log.exception("solve error")` records the cause but not the
  request context. Belongs in the same observability follow-up as
  TAG-57's resolver — both are 500-path log sites that want the same
  request-id correlation.

## Rollback

```
git revert <this-commit-sha>
```

OR — without a code change — flip the runtime flag:

```
ENABLE_SOLVE_V3=false  # in apps/api/.env on the swarm manager
docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
```

The new module tree is fully isolated:
  * `api/`, `orchestrator/modes.py`, and `tests/api/` are net-new.
  * `app.py`'s patch is one `if`-branched `include_router` call.
  * `config.py`'s patch is one field with a `False` default.

Nothing else in `agent_v2` imports from `agent_v2.api` yet, so the
revert is a clean delete + two-line backout in `app.py` / `config.py`.
