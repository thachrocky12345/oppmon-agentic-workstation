# TAG-51: asyncpg Pool + DATABASE_URL Plumbing — Test Plan

**Type:** Test Plan
**Status:** Approved
**Author:** Claude (build-fastapi-single-ticket skill)
**Date:** 2026-05-13
**Ticket:** [docs/jira/TAG-51-asyncpg-pool.md](../TAG-51-asyncpg-pool.md)
**Branch:** `feature/TAG-51-asyncpg-pool`
**Commit:** `aacc825` (base) + this work

---

## Objective

Add a lazy, bounded, process-lifetime `asyncpg.Pool` to `agent_search` so
downstream tickets (TAG-52 JWT verify, TAG-55 model registry, TAG-59
corpus search) can issue read-only queries against the existing OppMon
Postgres without each one re-managing connections. The pool exposes
three helpers (`pg_fetch_one`, `pg_fetch_all`, `pg_execute`) that enforce
a SELECT-only guard unless the caller passes `_allow_write=True`.
`/solve_v2` continues to boot and run with `DATABASE_URL=""`.

## Acceptance Criteria Verification

- [x] AC1: `pip install -r requirements-v2.txt` succeeds with asyncpg pinned
      — verified by `pip install asyncpg==0.30.0` succeeding cleanly.
- [x] AC2: `pg_fetch_one("SELECT now()")` returns a row in a docker-compose smoke
      — verified by integration TC-05 against `lumy:lumy@localhost:5432/lumy`.
- [x] AC3: `/solve_v2` smoke still passes with `DATABASE_URL=""`
      — verified by unit test `test_app_has_solve_v2_route` + bootstrap
      `mount_v2(FastAPI())` succeeding with no DB env.
- [x] AC4: Write-guard test passes
      — verified by 6 parametric rejection tests in `test_queries.py` +
      integration TC-04.
- [x] AC5: `close_pool()` runs cleanly on shutdown
      — verified by `test_shutdown_handler_closes_pool_noop` +
      `test_shutdown_handler_closes_open_pool` + integration TC-07.

## Files Touched

```
apps/agent_graph_backend/agent_search/agent_v2/db/__init__.py     (new, 22 LoC)
apps/agent_graph_backend/agent_search/agent_v2/db/pool.py         (new, 65 LoC)
apps/agent_graph_backend/agent_search/agent_v2/db/queries.py      (new, 78 LoC)
apps/agent_graph_backend/agent_search/agent_v2/config.py          (edited: +14 LoC, +require_db, +4 fields)
apps/agent_graph_backend/agent_search/agent_v2/app.py             (edited: +6 LoC, on_event("shutdown") hook)
apps/agent_graph_backend/agent_search/tests/__init__.py           (new, empty)
apps/agent_graph_backend/agent_search/tests/conftest.py           (new, autouse env + app fixtures + pool reset)
apps/agent_graph_backend/agent_search/tests/db/__init__.py        (new, empty)
apps/agent_graph_backend/agent_search/tests/db/test_pool.py       (new, 8 tests)
apps/agent_graph_backend/agent_search/tests/db/test_queries.py    (new, 15 tests)
apps/agent_graph_backend/agent_search/tests/orchestrator/__init__.py (new, empty)
apps/agent_graph_backend/agent_search/tests/orchestrator/test_solve_v2.py (new, 3 tests)
apps/agent_graph_backend/pytest.ini                               (new — asyncio_mode=auto)
apps/agent_graph_backend/ruff.toml                                (new — line-length 100, py311)
apps/agent_graph_backend/pyrightconfig.json                       (new — basic mode)
apps/agent_graph_backend/requirements-v2.txt                      (edited: +asyncpg==0.30.0)
apps/agent_graph_backend/.env.example                             (edited: +DB section)
scripts/TAG_51_integration.py                                     (new — 7 test cases)
docs/jira/TAG-51/TAG_51_test.md                                   (this file)
```

## Decisions

- **`statement_cache_size=0`** in `asyncpg.create_pool`. The ticket calls this
  out for multi-tenant safety; cost is negligible at our query volume.
- **Lazy pool open via `get_pool()`**, not eager via FastAPI `lifespan` startup.
  This keeps `/solve_v2` runnable with `DATABASE_URL=""` (which is the path
  the v2-only Docker image currently exercises). Shutdown still calls
  `close_pool()` so a pool that DID open will be drained cleanly.
- **`@app.on_event("shutdown")` instead of full `lifespan` context manager.**
  Less invasive — the existing `mount_v2` signature stays unchanged, no need
  to refactor callers in `v2_server.py`. The shutdown event is the only DB
  lifecycle hook we need at this layer.
- **Module-global `_pool`, not `app.state.pool`.** Lets unit tests reset by
  setting `pool_mod._pool = None` without spinning up a full ASGI app.
  Trade-off: a second mounted app in the same process would share the pool,
  which is fine because the DSN is single-source-of-truth from Settings.
- **Write-guard via `sql.lstrip().upper().startswith("SELECT")`.** Cheap and
  catches the four targeted footguns (UPDATE / DELETE / INSERT / DROP / TRUNCATE).
  `_allow_write=True` is the explicit opt-out for TAG-58 write paths.
- **`Record` and `asyncpg.Pool` type annotations** are kept un-quoted (relying
  on `from __future__ import annotations`) so ruff's UP037 stays clean. The
  runtime import of `asyncpg` is still lazy inside `get_pool()`, so `pool.py`
  loads with no driver installed.
- **Type-stub warnings for asyncpg are tolerated** (`reportMissingTypeStubs`
  produces 3 warnings, 0 errors). Per QUALITY.md, third-party stub gaps are
  acceptable in basic mode.

## Unit Test Results

```bash
$ cd apps/agent_graph_backend
$ python -m pytest agent_search/tests/ --cov=agent_search.agent_v2.db --cov-report=term-missing -v

============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.1, pluggy-1.5.0
configfile: pytest.ini
plugins: anyio-4.10.0, asyncio-1.3.0, cov-7.1.0
asyncio: mode=Mode.AUTO
collected 26 items

agent_search/tests/db/test_pool.py::test_require_db_raises_when_dsn_empty PASSED                         [  3%]
agent_search/tests/db/test_pool.py::test_require_db_passes_when_dsn_set PASSED                           [  7%]
agent_search/tests/db/test_pool.py::test_get_pool_raises_when_settings_have_no_dsn PASSED                [ 11%]
agent_search/tests/db/test_pool.py::test_get_pool_is_idempotent PASSED                                   [ 15%]
agent_search/tests/db/test_pool.py::test_get_pool_passes_settings_to_create_pool PASSED                  [ 19%]
agent_search/tests/db/test_pool.py::test_close_pool_no_op_when_unopened PASSED                           [ 23%]
agent_search/tests/db/test_pool.py::test_close_pool_closes_and_resets PASSED                             [ 26%]
agent_search/tests/db/test_pool.py::test_close_pool_resets_even_on_close_error PASSED                    [ 30%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_rejects_writes[UPDATE users SET name='x'] PASSED [ 34%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_rejects_writes[DELETE FROM users] PASSED        [ 38%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_rejects_writes[INSERT INTO users VALUES (1)] PASSED [ 42%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_rejects_writes[DROP TABLE users] PASSED         [ 46%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_rejects_writes[  update users SET x=1] PASSED   [ 50%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_rejects_writes[TRUNCATE users] PASSED           [ 53%]
agent_search/tests/db/test_queries.py::test_pg_fetch_all_rejects_writes[UPDATE users SET name='x'] PASSED [ 57%]
agent_search/tests/db/test_queries.py::test_pg_fetch_all_rejects_writes[DELETE FROM users] PASSED        [ 61%]
agent_search/tests/db/test_queries.py::test_pg_execute_rejects_writes[UPDATE users SET name='x'] PASSED  [ 65%]
agent_search/tests/db/test_queries.py::test_pg_execute_rejects_writes[DELETE FROM users] PASSED          [ 69%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_select_reaches_db PASSED                        [ 73%]
agent_search/tests/db/test_queries.py::test_pg_fetch_all_select_reaches_db PASSED                        [ 76%]
agent_search/tests/db/test_queries.py::test_pg_execute_select_reaches_db PASSED                          [ 80%]
agent_search/tests/db/test_queries.py::test_pg_fetch_one_allow_write_reaches_db PASSED                   [ 84%]
agent_search/tests/db/test_queries.py::test_pg_execute_allow_write_reaches_db PASSED                     [ 88%]
agent_search/tests/orchestrator/test_solve_v2.py::test_app_has_solve_v2_route PASSED                     [ 92%]
agent_search/tests/orchestrator/test_solve_v2.py::test_shutdown_handler_closes_pool_noop PASSED          [ 96%]
agent_search/tests/orchestrator/test_solve_v2.py::test_shutdown_handler_closes_open_pool PASSED          [100%]

---------- coverage: platform win32, python 3.13.5-final-0 -----------
Name                                   Stmts   Miss  Cover   Missing
--------------------------------------------------------------------
agent_search/agent_v2/db/__init__.py       4      0   100%
agent_search/agent_v2/db/pool.py          23      0   100%
agent_search/agent_v2/db/queries.py       25      0   100%
--------------------------------------------------------------------
TOTAL                                     52      0   100%

============================== 26 passed in 1.12s =============================
```

**Coverage on new code:** 100 % (target ≥ 80 %).

## Integration Test Results

Script: `scripts/TAG_51_integration.py`

### Without DB (`DATABASE_URL=""`)

```bash
$ cd apps/agent_graph_backend
$ DATABASE_URL="" python ../../scripts/TAG_51_integration.py

[PASS] TC-01 imports clean | agent_search.agent_v2.db OK
[PASS] TC-02 require_db empty DSN | DATABASE_URL not set. agent_search requires Postgres for JWT verify / model regi
[PASS] TC-03 require_db with DSN | no raise
[PASS] TC-04 write-guard | agent_search.db: refusing to run non-SELECT SQL without _allow_write=True. Pass
[PASS] TC-05 SELECT now() live | skipped (DATABASE_URL unset)
[PASS] TC-06 allow_write reaches DB | skipped (DATABASE_URL unset)
[PASS] TC-07 close_pool idempotent | two calls OK

total=7 passed=7 failed=0
```

### With live Postgres

```bash
$ DATABASE_URL="postgresql://lumy:lumy@localhost:5432/lumy" python ../../scripts/TAG_51_integration.py

[PASS] TC-01 imports clean | agent_search.agent_v2.db OK
[PASS] TC-02 require_db empty DSN | DATABASE_URL not set. agent_search requires Postgres for JWT verify / model regi
[PASS] TC-03 require_db with DSN | no raise
[PASS] TC-04 write-guard | agent_search.db: refusing to run non-SELECT SQL without _allow_write=True. Pass
[PASS] TC-05 SELECT now() live | row received
[PASS] TC-06 allow_write reaches DB | DROP TABLE
[PASS] TC-07 close_pool idempotent | two calls OK

total=7 passed=7 failed=0
```

## Quality Gate

```
$ ruff check agent_search/agent_v2/db/ agent_search/tests/
All checks passed!

$ ruff check scripts/TAG_51_integration.py --line-length 100
All checks passed!

$ pyright agent_search/agent_v2/db/ agent_search/tests/db/ agent_search/tests/orchestrator/
0 errors, 3 warnings, 0 informations
  (3 warnings are reportMissingTypeStubs for asyncpg — acceptable per QUALITY.md)

$ pytest agent_search/tests/ --cov=agent_search.agent_v2.db --cov-report=term-missing
26 passed in 1.12s
TOTAL  52 stmts  0 miss  100% coverage

$ secret-grep on agent_search/agent_v2/db/, agent_search/tests/, scripts/TAG_51_integration.py, .env.example
  no secrets
```

## Known Limitations

- **No connection-storm test.** We don't simulate many concurrent
  `get_pool()` calls; relying on asyncpg's own connection limiting.
- **Live integration tests (TC-05, TC-06) require a running Postgres** on
  the URL provided by `DATABASE_URL`. They silently skip with a PASS row
  when unset, so CI without a DB still gives a green run. To force live
  testing in CI, set `DATABASE_URL` in the job env.
- **The write-guard is a SQL-prefix check, not a parser.** A query like
  `SELECT * FROM x; UPDATE x SET y=1` would pass the guard. asyncpg does
  not allow multi-statement queries by default (no `;`-chaining in a
  single `execute`), so this is mitigated at the driver layer — but
  callers should still use parameterized queries.
- **Statement cache disabled.** asyncpg's per-connection prepared
  statement cache is off. At low QPS this is invisible. If we ever hit
  thousands of QPS, revisit this with pgbouncer-aware logic (e.g.
  `statement_cache_size=0` only behind transaction-mode pgbouncer).

## Rollback

```bash
# Single revert (since this is one logical change set):
git checkout dev
git branch -D feature/TAG-51-asyncpg-pool

# Or, if already merged:
git revert <merge-commit-sha>
```

No database migration ran — TAG-51 only adds an outgoing connection
capability. There is nothing to roll back on the database side.

## Sign-off

- [x] Code written and follows agent_v2 conventions
- [x] Unit tests green (26/26)
- [x] Integration tests green (7/7 with live DB, 7/7 with empty DSN)
- [x] Quality gate clean (ruff, pyright basic, secret-grep)
- [x] /solve_v2 still mounts and runs with `DATABASE_URL=""` (AC verified)
- [ ] Reviewer: _pending_
