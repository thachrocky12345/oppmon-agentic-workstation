# TAG-53: FastAPI `Depends(get_current_user)`

## Description

**Suggested Points:** 2
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Expose `get_current_user` as a FastAPI dependency that any route under `/solve`
(and future authenticated routes) can `Depends()` on. Centralizes the
`Authorization: Bearer …` parsing and turns failures into the standardized
401/403 responses.

## Objective

Single import for downstream routes:

```python
@router.post("/solve")
async def solve(req: SolveRequest, user: JWTClaims = Depends(get_current_user)):
    ...
```

## Requirements

### Implementation

`agent_v2/auth/deps.py`:

```python
from fastapi import Depends, Header, HTTPException, status
from .jwt import verify_jwt, AuthError
from .types import JWTClaims

async def get_current_user(authorization: str | None = Header(default=None)) -> JWTClaims:
    if not authorization:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing Authorization header")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "malformed Authorization header")
    try:
        return verify_jwt(parts[1])
    except AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, e.reason)

def require_role(*roles: str):
    """Optional role guard, used later by admin routes."""
    async def _dep(user: JWTClaims = Depends(get_current_user)) -> JWTClaims:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return user
    return _dep
```

### Behavior

- Header missing → 401 `"missing Authorization header"`.
- Header malformed → 401 `"malformed Authorization header"`.
- Token invalid/expired → 401 with the AuthError reason.
- Role mismatch (when `require_role` is used) → 403 `"insufficient role"`.

## Implementation Notes

- Header parsing is case-insensitive on `bearer` (RFC 6750).
- No cookie support — `/solve` is called server-to-server from `apps/web`'s same-origin
  proxy at `/api/graph/solve` (per CLAUDE.md), which already injects the Bearer header.
- The dep is async even though it does no IO today, so TAG-55 can later add a DB lookup
  for token revocation without changing every callsite.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/auth/test_deps.py` | missing header → 401 | response.status_code == 401 |
| `tests/auth/test_deps.py` | `"Basic xyz"` → 401 | malformed |
| `tests/auth/test_deps.py` | `"Bearer "` empty token → 401 | malformed |
| `tests/auth/test_deps.py` | valid JWT → returns `JWTClaims` | sub matches signed value |
| `tests/auth/test_deps.py` | `require_role("ADMIN")` w/ MEMBER token → 403 | |

## Acceptance Criteria

- [ ] Two-line `Depends(get_current_user)` works on any new route.
- [ ] All five tests pass.
- [ ] No token contents leak into error `detail`.

## Dependencies

**Depends on:** TAG-52
**Blocks:** TAG-58

## Risk Factors

| Risk | Mitigation |
|---|---|
| Reflected token in error response | Only the parsed `AuthError.reason` (a fixed string) is forwarded. |
| Header injection from upstream proxy | FastAPI normalizes header parsing; we re-validate format. |
