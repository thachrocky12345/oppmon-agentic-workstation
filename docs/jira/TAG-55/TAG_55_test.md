# TAG-55 — Read-Only Model Registry Queries: Test Plan

## Objective

Expose two read-only async helpers in `agent_v2.db.model_registry` that
let the FastAPI service look up a user's registered models — and the
encrypted secrets that go with them — while making cross-tenant data
leakage impossible by construction.

The two functions:

```python
async def get_user_models(user_id: str, tenant_id: str) -> list[ModelRow]
async def get_user_model(user_id: str, tenant_id: str, *,
                         model_id: str | None = None,
                         provider: str | None = None,
                         model_identifier: str | None = None) -> ModelRow | None
```

…both ALWAYS bind `tenant_id` at `$1` in the WHERE clause. No exceptions,
no caller-provided override path.

## Acceptance Criteria (mirroring the ticket)

- [x] Cross-tenant test passes (blocks merge) — `test_model_registry_isolation.py` + integration TC-05.
- [x] Queries always include `tenant_id` filter — enforced in the shared `_VISIBILITY` clause, asserted in unit and integration tests.
- [x] Only `enabled=true` rows returned (ticket called this `is_active`; actual schema uses `enabled`).
- [x] Soft-deleted rows (`deleted_at IS NOT NULL`) excluded.
- [x] No raw SQL interpolation — asyncpg `$1, $2, $3, $4` only.
- [x] TEAM-scope models gated on `team_members` membership.
- [x] BYTEA secrets returned as base64 strings, ready to hand to `decrypt_secret` (TAG-54).

## Files Touched

| Path | Change |
|---|---|
| `apps/agent_graph_backend/agent_search/agent_v2/db/models.py` | NEW — Pydantic `ModelRow` reflecting actual schema |
| `apps/agent_graph_backend/agent_search/agent_v2/db/model_registry.py` | NEW — `get_user_models`, `get_user_model`, shared SQL |
| `apps/agent_graph_backend/agent_search/agent_v2/db/__init__.py` | re-export `ModelRow`, `get_user_model`, `get_user_models` |
| `apps/agent_graph_backend/agent_search/tests/db/test_model_registry.py` | NEW — 18 unit tests (shape, conversion, SQL predicates, error paths) |
| `apps/agent_graph_backend/agent_search/tests/db/test_model_registry_isolation.py` | NEW — 5 dedicated cross-tenant / no-interpolation tests |
| `scripts/TAG_55_integration.py` | NEW — 8-case integration smoke (3 static + 5 live-DB) |
| `docs/jira/TAG-55/TAG_55_test.md` | NEW — this file |

## Design Decisions (and why they diverge from the ticket spec)

The TAG-55 ticket text references column names that pre-date the
current Prisma schema. Rather than introduce ghost columns, the
implementation honours the **actual** `packages/database/prisma/schema.prisma`
and documents each divergence here.

| # | Decision | Why |
|---|---|---|
| 1 | Use `created_by_id` (not `user_id`) for owner FK | Real column name in `models` table |
| 2 | Use `enabled` (not `is_active`) for the disable flag | Real column name in `models` table |
| 3 | Join `model_secrets` (not `secret_vault`) via `secret_ref` | Real table + FK; secret_vault was the old name |
| 4 | Expose `secret_version: int \| None` instead of `secret_key_id: str \| None` | `model_secrets.version` is the rotation generation; there is no `key_id` column |
| 5 | Base64-encode BYTEA `encrypted_payload` and `nonce` before returning | `model_secrets.encrypted_payload` / `nonce` are bytea in Postgres; TAG-54's `decrypt_secret` takes base64 strings — encode at the seam, not at every call site |
| 6 | Scope filter via SQL: `scope='TENANT' OR (scope='TEAM' AND team_id IN (SELECT team_id FROM team_members WHERE user_id=$2))` | Real schema has TENANT/TEAM scope only, no per-user model registry; mirrors `apps/api/src/lib/authz.ts` logic |
| 7 | Drop owner check (no `m.created_by_id = $2`) | A user sees models they didn't author, as long as scope + tenant + team membership pass. Ownership is metadata only — same behaviour as the TS gateway |
| 8 | Exclude soft-deleted rows (`m.deleted_at IS NULL`) | Real schema does soft delete; ticket spec omits but it's a footgun if we don't |
| 9 | `ORDER BY display_name ASC` on the list query | Deterministic ordering for tests + stable UI; cheap with the existing `(tenant_id, display_name)` unique index |
| 10 | Handle `public_config` being a `dict` OR a JSON `str` OR `NULL` in `_row_to_model` | asyncpg's jsonb codec is pool-configuration-dependent; the helper degrades gracefully so the test/dev pool and prod pool both work |
| 11 | Single source-of-truth `_VISIBILITY` clause shared by both functions | Prevents WHERE-clause drift between list and single-row paths — the most likely regression vector |
| 12 | `LIMIT 1` on the single-row path | Belt-and-braces against accidentally non-unique (provider, model_identifier) combos in the future |
| 13 | Use Pydantic `protected_namespaces=()` on `ModelRow` | Silences Pydantic v2's noisy warning about field names that start with `model_` (e.g. `model_identifier`) |

## Unit Test Results

```
$ cd apps/agent_graph_backend && pytest agent_search/tests/db/test_model_registry.py agent_search/tests/db/test_model_registry_isolation.py -v

agent_search/tests/db/test_model_registry.py::test_modelrow_fields_match_actual_schema PASSED
agent_search/tests/db/test_model_registry.py::test_row_to_model_base64_encodes_bytea_secrets PASSED
agent_search/tests/db/test_model_registry.py::test_row_to_model_handles_missing_secret PASSED
agent_search/tests/db/test_model_registry.py::test_row_to_model_decodes_json_string_public_config PASSED
agent_search/tests/db/test_model_registry.py::test_row_to_model_handles_invalid_json_public_config PASSED
agent_search/tests/db/test_model_registry.py::test_row_to_model_handles_null_public_config PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_models_returns_list_of_modelrows PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_models_sql_enforces_enabled_and_not_deleted PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_models_sql_includes_team_membership_subquery PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_models_returns_empty_list_when_no_rows PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_model_by_model_id_returns_row PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_model_by_model_id_missing_returns_none PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_model_by_provider_and_identifier_returns_row PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_model_by_provider_only_raises PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_model_by_identifier_only_raises PASSED
agent_search/tests/db/test_model_registry.py::test_get_user_model_with_no_selector_raises PASSED
agent_search/tests/db/test_model_registry.py::test_secret_ciphertext_is_b64_decryptable PASSED
agent_search/tests/db/test_model_registry.py::test_queries_are_select_only_so_write_guard_does_not_trip PASSED
agent_search/tests/db/test_model_registry_isolation.py::test_get_user_model_passes_tenant_id_at_position_1 PASSED
agent_search/tests/db/test_model_registry_isolation.py::test_get_user_models_passes_tenant_id_at_position_1 PASSED
agent_search/tests/db/test_model_registry_isolation.py::test_no_sql_string_interpolation_of_tenant_id PASSED
agent_search/tests/db/test_model_registry_isolation.py::test_no_sql_string_interpolation_of_user_id PASSED
agent_search/tests/db/test_model_registry_isolation.py::test_team_scope_clause_is_present_and_parameterized PASSED

============================= 23 passed in 0.20s ==============================
```

Full suite (regression):

```
$ cd apps/agent_graph_backend && pytest agent_search/tests/ --cov=agent_search/agent_v2/db --cov-report=term-missing
...
agent_search\agent_v2\db\__init__.py             6      0   100%
agent_search\agent_v2\db\model_registry.py      38      0   100%
agent_search\agent_v2\db\models.py              19      0   100%
agent_search\agent_v2\db\pool.py                23      0   100%
agent_search\agent_v2\db\queries.py             25      0   100%
--------------------------------------------------------------------------
TOTAL                                          111      0   100%
============================= 93 passed in 2.87s ==============================
```

**Coverage on TAG-55 paths: 100 %** (model_registry.py, models.py, __init__.py).

## Integration Test Results

```
$ cd apps/agent_graph_backend && DATABASE_URL=postgresql://oppmon:***@localhost:5433/oppmon python ../../scripts/TAG_55_integration.py

[PASS] TC-01 imports clean | ModelRow / get_user_model* on db public surface
[PASS] TC-02 selector required | get_user_model: must pass model_id or (provider + model_identifier)
[PASS] TC-03 SQL predicates | all predicates present
[PASS] TC-04 get_user_models happy path | visible=2 hidden_leaked=0
[PASS] TC-05 cross-tenant returns None | None (isolated)
[PASS] TC-06 (provider, identifier) -> b64 secrets | ct_len=4 nonce_len=24 version=7
[PASS] TC-07 disabled + deleted excluded | disabled=True deleted=True
[PASS] TC-08 team-scope visibility | member_sees=True nonmember_blocked=True

total=8 passed=8 failed=0
```

TC-04..TC-08 hit live Postgres, seed two tenants + a team-scope model +
disabled + soft-deleted rows, run every query path, and roll back via
prefix-DELETE in a `finally`. Without `DATABASE_URL`, they skip cleanly
(counted as PASS with `"skipped"` detail).

## Quality Gate

| Check | Result |
|---|---|
| `ruff check ... --select E,F,W,B,UP,SIM` on new paths | **0 issues** |
| `pyright` on `model_registry.py` + `models.py` | **0 errors** (1 pre-existing warning about missing asyncpg stubs, same as `queries.py`) |
| Secret grep on `agent_v2/db/`, `tests/db/`, `TAG_55_integration.py` | **0 matches** |
| Full pytest suite | **93 / 93 pass** |
| Coverage on new code | **100 %** |

## Known Limitations

- No live cross-tenant test in unit suite — the SQL `tenant_id = $1`
  predicate is asserted via string-match, and the live behaviour is
  exercised in integration TC-05. The unit-level alternative would
  require an embedded Postgres which is heavier than the existing
  asyncpg-mock pattern in `test_queries.py`.
- `secret_version` is plumbed through but never consumed today. TAG-57
  is responsible for picking a key by version when rotation lands.
- `_row_to_model` re-parses `public_config` as JSON when asyncpg returns
  a string. In prod the pool should register a jsonb codec; this is a
  safety net, not the intended fast path.
- TEAM-scope subquery does not currently distinguish `MEMBER` vs `ADMIN`
  team roles. The ticket says "registered models" — every team member
  should see them. If a future ticket restricts to admins, change the
  subquery's `WHERE` and pin the new behaviour with a fresh integration
  test.

## Rollback

Revert this commit. The three new modules and two test files are
self-contained; nothing else in `agent_v2` imports them yet. The DB
schema is untouched.

```
git revert <this-commit-sha>
```
