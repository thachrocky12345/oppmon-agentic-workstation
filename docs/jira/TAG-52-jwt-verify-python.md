# TAG-52: Mirror Arkon JWT Verification in Python

## Description

**Suggested Points:** 2
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Verify HS256 JWTs issued by `apps/api` (the Express backend) inside `agent_search`
using the **same shared secret**, so a single login session in the OppMon web app
authenticates against both `/api/*` (Express) and `/solve` (Python).

## Objective

Build a `verify_jwt(token: str) -> JWTClaims` function in
`agent_v2/auth/jwt.py` that:

- Uses `PyJWT` with `algorithms=["HS256"]` only (reject `none`, `RS*`, `ES*`).
- Pulls the secret from `settings.jwt_secret` (env `JWT_SECRET`).
- Validates `exp`, `iat`, and `iss` (`"oppmon"` by convention — confirm against the
  Express signer in `apps/api/src/lib/jwt.ts`).
- Returns a typed `JWTClaims(sub: str, tenant_id: str, role: str, exp: int, iat: int)`.
- Raises `AuthError` (subclass of `HTTPException(401)`) on any failure, with `detail`
  scrubbed of token contents.

## Requirements

### Schema (mirror `packages/shared/src/types.ts`)

```python
# agent_v2/auth/types.py
from pydantic import BaseModel

class JWTClaims(BaseModel):
    sub: str               # user id (cuid2)
    tenant_id: str
    role: str              # "ADMIN" | "MEMBER" | "VIEWER" — string, validated later
    email: str | None = None
    exp: int
    iat: int
```

### Verifier

```python
# agent_v2/auth/jwt.py
import jwt as pyjwt
from .types import JWTClaims
from ..config import settings

class AuthError(Exception):
    def __init__(self, reason: str):
        self.reason = reason

def verify_jwt(token: str) -> JWTClaims:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET not configured")
    try:
        payload = pyjwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub"]},
            issuer="oppmon",
        )
    except pyjwt.ExpiredSignatureError:
        raise AuthError("token expired")
    except pyjwt.InvalidTokenError as e:
        raise AuthError("invalid token")
    return JWTClaims(**payload)
```

### Config

```python
# agent_v2/config.py additions
jwt_secret: str = ""        # MUST equal apps/api's JWT_SECRET
jwt_issuer: str = "oppmon"  # only used to cross-check apps/api
```

### Dependencies

```
PyJWT==2.10.1
```

## Implementation Notes

- **Do not** import `cryptography` for HS256; PyJWT's pure-Python HMAC is sufficient
  and avoids a heavy native dep on the slim image.
- Compare token claims against `apps/api/src/lib/jwt.ts` — fields and issuer string must
  match exactly. If `apps/api` omits `iss`, drop it from `options.require` here too.
- Never log the token. Log only `sub` after verification succeeds.
- TAG-65 adds a deploy-time test that signs a token with `apps/api`'s secret and decodes
  it here, asserting `JWT_SECRET` parity in swarm.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/auth/test_jwt.py` | round-trip with pyjwt | decodes to expected claims |
| `tests/auth/test_jwt.py` | wrong secret | raises `AuthError` |
| `tests/auth/test_jwt.py` | expired token | raises `AuthError("token expired")` |
| `tests/auth/test_jwt.py` | `alg=none` token | raises `AuthError` |
| `tests/auth/test_jwt.py` | `RS256` token signed by attacker | raises `AuthError` |
| `tests/auth/test_jwt.py` | empty `JWT_SECRET` | raises `RuntimeError`, not 200 |

## Acceptance Criteria

- [ ] A token signed by `apps/api/src/lib/jwt.ts` decodes successfully in Python.
- [ ] All five negative tests pass.
- [ ] `JWT_SECRET` never appears in logs (grep test in CI).
- [ ] `alg=none` is explicitly rejected.

## Dependencies

**Blocks:** TAG-53
**Depends on:** none

## Risk Factors

| Risk | Mitigation |
|---|---|
| Algorithm-confusion attack (HS256 with attacker-controlled public key) | `algorithms=["HS256"]` is a hard whitelist. |
| Secret drift between Express and Python | TAG-65 swarm deploy parity check. |
| Token contents in error responses | `AuthError` carries only a generic reason string. |
