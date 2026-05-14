# TAG-51: asyncpg Pool + DATABASE_URL Plumbing

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Add a process-lifetime `asyncpg.Pool` to `agent_search` so downstream tickets
(JWT verify, model registry, corpus search) can issue read-only queries against
the existing OppMon Postgres without each one re-managing connections.

## Objective

Ship a singleton pool exposed through FastAPI `lifespan` that is:

- Lazy: not opened until the first request (so `/solve_v2` stays runnable with no DB).
- Bounded: `min_size=1, max_size=10` by default, env-tunable.
- Read-only by convention: a thin `pg_fetch_one / pg_fetch_all / pg_execute` wrapper
  asserts the SQL string starts with `SELECT` unless the caller passes
  `_allow_write=True`. Tickets 52–63 are all reads.

## Requirements

### Config

Extend `agent_v2/config.py` `Settings`:

```python
database_url: str = ""           # postgres://user:pass@host:port/db
db_pool_min_size: int = 1
db_pool_max_size: int = 10
db_pool_timeout_s: float = 5.0
```

`require_db()` helper raises `RuntimeError("DATABASE_URL not set")` when consumers
need the pool but config is empty.

### Module

New file `agent_v2/db/pool.py`:

```python
_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        s = settings
        s.require_db()
        _pool = await asyncpg.create_pool(
            dsn=s.database_url,
            min_size=s.db_pool_min_size,
            max_size=s.db_pool_max_size,
            timeout=s.db_pool_timeout_s,
            statement_cache_size=0,   # multi-tenant safety
        )
    return _pool

async def close_pool() -> None: ...
```

Helpers in `agent_v2/db/queries.py`:

```python
async def pg_fetch_one(sql: str, *params, _allow_write: bool = False) -> Record | None
async def pg_fetch_all(sql: str, *params, _allow_write: bool = False) -> list[Record]
async def pg_execute  (sql: str, *params, _allow_write: bool = False) -> str
```

All three assert `sql.lstrip().upper().startswith("SELECT")` unless `_allow_write`.

### Lifespan wiring

`agent_v2/app.py` adds an ASGI lifespan or `@app.on_event("shutdown")` calling
`close_pool()`. `mount_v2()` does NOT eagerly open the pool — `/solve_v2` must
still run with `DATABASE_URL=""`.

### Dependencies

Add to `apps/agent_graph_backend/requirements-v2.txt`:

```
asyncpg==0.30.0
```

## Implementation Notes

- Disable prepared-statement caching (`statement_cache_size=0`) so a malicious tenant
  cannot poison a cached plan by issuing a query that pgbouncer would later replay
  for another tenant. We are not behind pgbouncer today, but the cost of disabling
  is negligible at our query volume.
- Use `dsn=` only; never accept individual user/password kwargs. This keeps secrets
  in one place (the env var).
- Pool is module-global, not `app.state`-attached, so unit tests can monkeypatch it.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/db/test_pool.py` | `get_pool()` is idempotent | second call returns same object |
| `tests/db/test_pool.py` | `require_db()` raises with empty DSN | `RuntimeError` |
| `tests/db/test_queries.py` | `pg_fetch_one("UPDATE …")` rejected | raises `ValueError` |
| `tests/db/test_queries.py` | `pg_fetch_one("SELECT 1")` works | returns `1` |
| `tests/db/test_queries.py` | `pg_fetch_one("update …", _allow_write=True)` passes guard | reaches DB call |
| `tests/orchestrator/test_solve_v2.py` | `/solve_v2` still runs with empty DATABASE_URL | 200 OK |

## Acceptance Criteria

- [ ] `pip install -r requirements-v2.txt` succeeds with asyncpg pinned.
- [ ] `pg_fetch_one("SELECT now()")` returns a row in a docker-compose smoke.
- [ ] `/solve_v2` smoke still passes with `DATABASE_URL=""`.
- [ ] Write-guard test passes.
- [ ] `close_pool()` runs cleanly on shutdown.

## Dependencies

**Blocks:** TAG-52, TAG-55, TAG-59
**Depends on:** none

## Risk Factors

| Risk | Mitigation |
|---|---|
| asyncpg connection storms on cold start | `min_size=1`, lazy open. |
| Connection leaked on exception | Always use `async with pool.acquire() as conn:` inside helpers. |
| DSN logged at startup | Never log `s.database_url`; log only `bool(s.database_url)`. |
