# TAG-52 — Mirror Arkon JWT Verification in Python — Test Plan

**Ticket:** [TAG-52](../TAG-52-jwt-verify-python.md)
**Epic:** [TAG-50 Authenticated /solve endpoint](../TAG-50-authenticated-solve-endpoint-epic.md)
**Branch:** `feature/TAG-52-jwt-verify-python`
**Pipeline:** `.claude/skills/build-fastapi-single-ticket/`

## Objective

Port `apps/api/src/lib/jwt.ts:verifyToken` to Python so a JWT minted by the
Express backend authenticates against the FastAPI `/solve` endpoint with the
same shared secret. The verifier whitelists HS256, validates `exp`/`iat`/`iss`,
enforces required claims, and returns a typed `JWTClaims` model. Any failure
raises `AuthError` carrying a short, token-free reason — never leaking token
material into logs or 401 responses.

## Acceptance Criteria

Pulled from `docs/jira/TAG-52-jwt-verify-python.md`:

- [x] **A token signed by `apps/api/src/lib/jwt.ts` decodes successfully in Python.**
      `test_round_trip_decodes_to_claims` + `tc01_round_trip` in the integration
      script mint a token with the same shape Express emits (camelCase `tenantId`,
      embedded `iss: "oppmon"`, HS256) and assert all six fields decode correctly.
- [x] **All five negative tests pass.** Six negative tests in `test_jwt.py` plus
      six in the integration script:
      wrong secret → `AuthError("invalid token")`,
      expired → `AuthError("token expired")`,
      `alg=none` → `AuthError("invalid algorithm")`,
      RS256 attacker → `AuthError("invalid algorithm")`,
      empty `JWT_SECRET` → `RuntimeError`,
      wrong issuer → `AuthError("invalid issuer")`.
- [x] **`JWT_SECRET` never appears in logs.** The single `log.debug(...)` call
      in `verify_jwt` logs only `claims.sub` and `claims.tenant_id` —
      no secret, no raw token. The `_TEST_SECRET` literal lives only in test
      files and is excluded from production code.
- [x] **`alg=none` is explicitly rejected.** `algorithms=["HS256"]` is a hard
      whitelist on the PyJWT call. `test_alg_none_is_rejected` + `tc04_alg_none`
      cover it.

## Files Touched

```
apps/agent_graph_backend/
  agent_search/agent_v2/
    auth/__init__.py                       NEW  — re-exports verify_jwt, AuthError, JWTClaims
    auth/types.py                          NEW  — Pydantic JWTClaims (tenantId alias)
    auth/jwt.py                            NEW  — verify_jwt + AuthError
    config.py                              MOD  — added jwt_secret, jwt_issuer
  agent_search/tests/
    auth/__init__.py                       NEW
    auth/test_jwt.py                       NEW  — 13 tests
  requirements-v2.txt                      MOD  — PyJWT==2.10.1
  .env.example                             MOD  — JWT_SECRET / JWT_ISSUER docs

scripts/
  TAG_52_integration.py                    NEW  — 7-test out-of-process smoke

docs/jira/TAG-52/
  TAG_52_test.md                           NEW  — this file
```

Nothing outside `apps/agent_graph_backend/`, `scripts/`, and `docs/jira/`
was modified.

## Design Decisions

### 1. camelCase wire ↔ snake_case Python

The Express signer (`apps/api/src/lib/jwt.ts:44`) emits `tenantId: payload.tenantId`
unchanged onto the wire. The Python spec (`TAG-52-jwt-verify-python.md`) calls
for `tenant_id: str` in the Pydantic model. Bridging via Pydantic field alias
is the standard fix:

```python
class JWTClaims(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    tenant_id: str = Field(alias="tenantId")
```

`extra="ignore"` drops the `teams`, `tv`, `isSystem` claims Express adds —
TAG-52 is single-tenant identity only; later tickets can extend the model
or add a sibling model with team data.

### 2. `RuntimeError` (not `AuthError`) for empty secret

When `JWT_SECRET` is unset, the deploy is broken. Returning 401 would mask
a configuration bug behind every user complaint. Raising `RuntimeError`
guarantees:

- The FastAPI default 500 handler triggers, healthchecks notice.
- TAG-65's parity check script can detect drift at deploy time.
- The Pydantic-Settings load happens in `_load_settings()`, so the failure
  mode is "verify_jwt() called with empty secret" — easy to grep for in logs.

### 3. Distinct error reasons for distinct PyJWT exceptions

PyJWT raises a tree of `InvalidTokenError` subclasses. Mapping them
individually:

| PyJWT exception | `AuthError.reason` |
|---|---|
| `ExpiredSignatureError` | `"token expired"` |
| `InvalidIssuerError` | `"invalid issuer"` |
| `MissingRequiredClaimError` | `"missing required claim: <name>"` |
| `InvalidAlgorithmError` | `"invalid algorithm"` |
| `InvalidTokenError` (everything else) | `"invalid token"` |
| (Pydantic validation) | `"invalid claims"` |

This gives the web UI enough signal to show "your session expired — please
log in again" without leaking the underlying signature/header internals.

### 4. No `cryptography` runtime dependency for HS256

PyJWT's pure-Python HMAC is sufficient for HS256 (per spec note). The
production `requirements-v2.txt` lists only `PyJWT==2.10.1`. The RS256
attacker test imports `cryptography` to *generate* a malicious token — that
import is test-only and doesn't ship in the slim image.

## Unit Tests

Location: `apps/agent_graph_backend/agent_search/tests/auth/test_jwt.py`

```
agent_search/tests/auth/test_jwt.py::test_round_trip_decodes_to_claims                  PASSED
agent_search/tests/auth/test_jwt.py::test_camelcase_wire_payload_maps_to_snake_case_attr PASSED
agent_search/tests/auth/test_jwt.py::test_wrong_secret_raises_auth_error                PASSED
agent_search/tests/auth/test_jwt.py::test_expired_token_raises_auth_error               PASSED
agent_search/tests/auth/test_jwt.py::test_alg_none_is_rejected                          PASSED
agent_search/tests/auth/test_jwt.py::test_rs256_token_signed_by_attacker_is_rejected    PASSED
agent_search/tests/auth/test_jwt.py::test_empty_jwt_secret_raises_runtime_error         PASSED
agent_search/tests/auth/test_jwt.py::test_wrong_issuer_rejected                         PASSED
agent_search/tests/auth/test_jwt.py::test_missing_sub_rejected                          PASSED
agent_search/tests/auth/test_jwt.py::test_missing_exp_rejected                          PASSED
agent_search/tests/auth/test_jwt.py::test_payload_missing_tenant_id_rejected            PASSED
agent_search/tests/auth/test_jwt.py::test_garbage_token_rejected                        PASSED
agent_search/tests/auth/test_jwt.py::test_auth_error_reason_is_short_and_token_free     PASSED

13 passed in 0.25s
```

### Coverage

```
Name                                     Stmts   Miss  Cover   Missing
----------------------------------------------------------------------
agent_search\agent_v2\auth\__init__.py       3      0   100%
agent_search\agent_v2\auth\jwt.py           33      0   100%
agent_search\agent_v2\auth\types.py         11      0   100%
agent_search\agent_v2\db\__init__.py         4      0   100%
agent_search\agent_v2\db\pool.py            23      0   100%
agent_search\agent_v2\db\queries.py         25      0   100%
----------------------------------------------------------------------
TOTAL                                       99      0   100%
39 passed in 1.25s
```

**100% line coverage** on the new TAG-52 code. Existing TAG-51 tests still pass.

## Integration Test

Location: `scripts/TAG_52_integration.py`

```
$ python scripts/TAG_52_integration.py
[PASS] round-trip decodes Express-shaped token  sub=usr_int01 tenant=tnt_int01
[PASS] wrong secret rejected  reason='invalid token'
[PASS] expired token rejected  reason='token expired'
[PASS] alg=none rejected  reason='invalid algorithm'
[PASS] RS256 attacker token rejected  reason='invalid algorithm'
[PASS] empty JWT_SECRET raises RuntimeError  msg='JWT_SECRET is not configured. agent_search cannot verify tok'
[PASS] wrong issuer rejected  reason='invalid issuer'

total=7 passed=7 failed=0
```

The integration script mints tokens with `pyjwt.encode(...)` mirroring the
exact shape `apps/api/src/lib/jwt.ts:signToken` produces — same algorithm,
same issuer, same camelCase `tenantId`. A future TAG-65 swarm-deploy check
will repeat the round trip across container boundaries to detect
`JWT_SECRET` drift.

## Quality Gate

| Check | Scope | Result |
|---|---|---|
| `ruff check` | `agent_v2/auth/`, `tests/auth/`, `scripts/TAG_52_integration.py` | All checks passed |
| `pyright` | `agent_v2/auth/` | 0 errors, 0 warnings |
| `pyright` | `tests/auth/` | 0 errors, 0 warnings |
| Secret grep | TAG-52 paths | No matches |
| Full test suite | `agent_search/tests/` | 39 passed in 0.98s |

## Known Limitations

1. **Issuer is config-driven but the test fixture hard-codes `"oppmon"`.**
   `JWTClaims` does not validate the issuer claim itself — PyJWT handles that
   via the `issuer=` decode option. If `apps/api` ever changes the issuer
   string, both sides must move together. TAG-65 will codify the parity check.

2. **No team/role enforcement here.** `JWTClaims.role` is a free-form string.
   TAG-53 will add a `require_role("ADMIN" | ...)` factory dependency on top.
   Don't gate on `claims.role` directly in business code yet.

3. **No `tv` (token-version) revocation.** Express bumps `tv` on password
   change and refuses stale tokens. Python does not check `tv` against
   `auth_users.token_version` — that requires a DB lookup and is deferred
   to TAG-55+ once the model registry queries land. Until then, agent_search
   trusts the JWT until `exp` regardless of upstream revocation events.

4. **`alg=none` test on PyJWT 2.10.1 quirk.** PyJWT accepts `key=""` for the
   `none` algorithm but rejects `key=None`. The test passes `key=""` and the
   type-checker comment is `# type: ignore[arg-type]`. This is a PyJWT API
   quirk, not a verifier bug.

## Rollback

Revert this commit on `feature/TAG-52-jwt-verify-python` (or revert the merge
when it lands). The verifier is not yet wired into any FastAPI route —
TAG-53 (`get_current_user`) does that — so reverting TAG-52 alone leaves
`/solve_v2` untouched and only removes the helper module.

## Verified-on

- Python: 3.13.5
- PyJWT: 2.10.1
- pytest: 8.4.1
- ruff: 0.x (project default via `apps/agent_graph_backend/ruff.toml`)
- pyright: 1.x (project default via `apps/agent_graph_backend/pyrightconfig.json`)
- Platform: win32

## Next Ticket

TAG-53 — FastAPI auth dependency wraps `verify_jwt` in a `get_current_user`
dependency + `require_role` factory and parses the `Authorization: Bearer …`
header per RFC 6750.
