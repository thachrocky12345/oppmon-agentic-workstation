# TAG-53 — FastAPI `Depends(get_current_user)` — Test Plan

**Ticket:** [TAG-53](../TAG-53-fastapi-auth-dep.md)
**Epic:** [TAG-50 Authenticated /solve endpoint](../TAG-50-authenticated-solve-endpoint-epic.md)
**Branch:** `feature/TAG-53-fastapi-auth-dep` (off `feature/TAG-52-jwt-verify-python`)
**Pipeline:** `.claude/skills/build-fastapi-single-ticket/`

## Objective

Expose `get_current_user` as a FastAPI dependency wrapping TAG-52's
`verify_jwt`, plus a `require_role(*roles)` factory for admin-only routes.
Routes downstream of this ticket can authenticate with a single
`user: JWTClaims = Depends(get_current_user)` parameter. The dependency
parses `Authorization: Bearer …` per RFC 6750 (case-insensitive scheme),
emits standardized 401/403 detail strings, and never leaks token contents
into the response body.

## Acceptance Criteria

Pulled from `docs/jira/TAG-53-fastapi-auth-dep.md`:

- [x] **Two-line `Depends(get_current_user)` works on any new route.**
      `tests/auth/test_deps.py::probe_app` mounts both `/whoami` and `/admin`
      using nothing but `Depends(get_current_user)` / `Depends(_require_admin)`
      — proves the dep stands alone with no extra wiring.
- [x] **All five mandated negative/positive cases pass:**
  - [x] Missing header → 401 `"missing Authorization header"`
  - [x] `"Basic xyz"` → 401 `"malformed Authorization header"`
  - [x] `"Bearer "` empty token → 401 `"malformed Authorization header"`
  - [x] Valid JWT → returns `JWTClaims` (sub/tenant_id/role match)
  - [x] `require_role("ADMIN")` with MEMBER token → 403 `"insufficient role"`
- [x] **No token contents leak into error `detail`.**
      `test_invalid_token_response_body_contains_no_token_segments` and
      `tc09_no_token_leak_in_error_body` both split the offending token into
      its three base64url segments and assert none appear in the 401 body.

## Files Touched

```
apps/agent_graph_backend/
  agent_search/agent_v2/
    auth/deps.py                           NEW  — get_current_user + require_role
    auth/__init__.py                       MOD  — re-export new deps
  agent_search/tests/
    auth/test_deps.py                      NEW  — 14 tests

  ruff.toml                                MOD  — extend-immutable-calls for fastapi.*

scripts/
  TAG_53_integration.py                    NEW  — 9-test out-of-process smoke

docs/jira/TAG-53/
  TAG_53_test.md                           NEW  — this file
```

Nothing outside `apps/agent_graph_backend/`, `scripts/`, and `docs/jira/`
was modified. `ruff.toml` lives inside `apps/agent_graph_backend/` and is
edited to teach Ruff that FastAPI's parameter-default function calls
(`Depends`, `Header`, `Query`, …) are idiomatic — this avoids B008 noise
for every future FastAPI ticket.

## Design Decisions

### 1. `parts[1].strip()` rejects whitespace-only tokens

The spec's pseudocode uses `not parts[1]` which would accept
`Authorization: Bearer    ` (just spaces after the scheme). Stripping
trailing whitespace before the empty check rejects this edge case and is
covered by `test_bearer_with_whitespace_only_token_returns_401`.

### 2. `raise … from None` swallows PyJWT's exception chain

By default `raise HTTPException(...) from e` keeps the original
`AuthError` (and the PyJWT cause beneath it) attached as `__cause__`.
FastAPI's traceback middleware would surface those frames in DEBUG logs
where the raw token sometimes appears. `from None` cuts the chain so
nothing past the fixed `AuthError.reason` string reaches the handler.

### 3. Module-level role-guard binding

FastAPI deps are meant to be reusable. Binding `_require_admin =
require_role("TENANT_ADMIN")` at module level (in both the test fixture
and the integration script) keeps Ruff's B008 happy without the
`# noqa` escape hatch. Pattern to reuse in TAG-58 onward.

### 4. `extend-immutable-calls` in `ruff.toml`

`Depends`, `Header`, `Query`, `Path`, `Body`, `Form`, `File`, `Cookie`,
`Security` are all canonical FastAPI parameter wrappers. Adding the full
set now means every future authenticated route writes naturally without
fighting the linter. Documented inline in `ruff.toml`.

### 5. `async def` even though no IO today

Per the spec: TAG-55+ may add an `auth_users.token_version` lookup for
revocation. Defining the dep as `async` now means downstream callsites
(TAG-58's `/solve`, future admin routes) don't have to re-shape when that
DB call lands.

## Unit Tests

Location: `apps/agent_graph_backend/agent_search/tests/auth/test_deps.py`

```
agent_search/tests/auth/test_deps.py::test_missing_authorization_header_returns_401              PASSED
agent_search/tests/auth/test_deps.py::test_basic_auth_scheme_returns_401                         PASSED
agent_search/tests/auth/test_deps.py::test_bearer_with_empty_token_returns_401                   PASSED
agent_search/tests/auth/test_deps.py::test_bearer_only_no_token_returns_401                      PASSED
agent_search/tests/auth/test_deps.py::test_bearer_with_whitespace_only_token_returns_401         PASSED
agent_search/tests/auth/test_deps.py::test_valid_bearer_token_returns_claims                     PASSED
agent_search/tests/auth/test_deps.py::test_lowercase_bearer_scheme_accepted                      PASSED
agent_search/tests/auth/test_deps.py::test_expired_token_returns_401_with_reason                 PASSED
agent_search/tests/auth/test_deps.py::test_wrong_secret_token_returns_401                        PASSED
agent_search/tests/auth/test_deps.py::test_require_role_returns_403_for_wrong_role               PASSED
agent_search/tests/auth/test_deps.py::test_require_role_accepts_matching_role                    PASSED
agent_search/tests/auth/test_deps.py::test_require_role_accepts_any_of_multiple                  PASSED
agent_search/tests/auth/test_deps.py::test_require_role_still_401s_when_token_missing            PASSED
agent_search/tests/auth/test_deps.py::test_invalid_token_response_body_contains_no_token_segments PASSED

14 passed in 0.56s
```

### Coverage

```
Name                                     Stmts   Miss  Cover   Missing
----------------------------------------------------------------------
agent_search\agent_v2\auth\__init__.py       4      0   100%
agent_search\agent_v2\auth\deps.py          24      0   100%
agent_search\agent_v2\auth\jwt.py           33      0   100%
agent_search\agent_v2\auth\types.py         11      0   100%
----------------------------------------------------------------------
TOTAL                                       72      0   100%
53 passed in 1.58s
```

**100% line coverage** on `agent_v2/auth/`. Full suite: 53 passing (TAG-51
DB tests + TAG-52 JWT tests + TAG-53 deps tests + orchestrator).

## Integration Test

Location: `scripts/TAG_53_integration.py`

```
$ python scripts/TAG_53_integration.py
[PASS] missing Authorization -> 401  status=401
[PASS] Basic scheme -> 401 malformed  status=401
[PASS] empty Bearer -> 401 malformed  status=401
[PASS] valid Bearer -> claims echoed  status=200 body={'sub': 'usr_int53_ok', 'role': 'MEMBER'}
[PASS] lowercase bearer (RFC 6750)  status=200
[PASS] expired token -> 401 'token expired'  status=401
[PASS] require_role wrong role -> 403  status=403
[PASS] require_role match -> 200  status=200
[PASS] no token segments in 401 body  no leak

total=9 passed=9 failed=0
```

The script spins up a throwaway FastAPI app via `httpx.ASGITransport`
(in-process; no external server needed) because TAG-53 doesn't yet wire
the dep into any production route — TAG-58 does that on `/solve`. When
TAG-58 lands, the same matrix points at the live service via
`AGENT_GRAPH_URL`.

## Quality Gate

| Check | Scope | Result |
|---|---|---|
| `ruff check` | `agent_v2/auth/`, `tests/auth/`, `scripts/TAG_53_integration.py` | All checks passed |
| `pyright` | `agent_v2/auth/`, `tests/auth/` | 0 errors, 0 warnings |
| Secret grep | TAG-53 paths | No matches |
| Full unit suite | `agent_search/tests/` | 53 passed |

## Known Limitations

1. **No token revocation check (`tv`).** The Express signer embeds `tv`
   (token version) and bumps it on password change / role change.
   `get_current_user` does not yet read `auth_users.token_version` and
   compare. This is deferred to TAG-55+ (model registry queries) which
   introduces the DB read pattern. Until then, agent_search trusts the
   JWT until `exp` regardless of upstream revocation.

2. **`require_role` is exact-match, not hierarchical.** Express's
   `hasTeamRole` treats `ADMIN` as a superset of `MEMBER`/`VIEWER`. The
   Python guard does not — you must explicitly list every accepted role.
   For TAG-58's `/solve` this is fine (single role accepted); for any
   admin-only route, list both `TENANT_ADMIN` and any team-admin variant.

3. **No `WWW-Authenticate` response header.** RFC 6750 §3 recommends
   401s carry `WWW-Authenticate: Bearer realm="…", error="invalid_token"`.
   Skipping this is fine for the same-origin proxy at
   `apps/web/src/app/api/graph/solve/route.ts` (it only inspects status
   codes), but should be added if any third-party client ever hits
   `/solve` directly.

4. **No cookie-based fallback.** As designed — `/solve` is exclusively
   server-to-server from the Next.js proxy. Cookie support would require
   a different attack-surface review (CSRF, SameSite, etc.) and is
   intentionally out of scope.

## Rollback

Revert this commit on `feature/TAG-53-fastapi-auth-dep`. The dep is not
yet referenced by `mount_v2` or any route in `app.py`, so reverting
removes the helper without touching `/solve_v2`. The
`ruff.toml::extend-immutable-calls` block is purely lint config — safe
to leave or revert separately.

## Verified-on

- Python: 3.13.5
- FastAPI: 0.115.6
- PyJWT: 2.10.1
- httpx: 0.28.1
- pytest: 8.4.1
- ruff: applied via project default config
- pyright: applied via project default config
- Platform: win32

## Next Ticket

TAG-54 — Port `apps/api/src/crypto/secret-vault.ts` to Python with PyNaCl
so the model registry queries (TAG-55) can decrypt the per-model API
keys cached in `secret_vault`.
