"""FastAPI auth dependencies.

Single import for any authenticated route under `agent_search`:

    from agent_search.agent_v2.auth import get_current_user

    @app.post("/solve")
    async def solve(req: SolveRequest,
                    user: JWTClaims = Depends(get_current_user)):
        ...

Behavior:
    * Missing ``Authorization`` header        → 401 ``"missing Authorization header"``
    * Malformed header (non-Bearer, no token) → 401 ``"malformed Authorization header"``
    * Valid header, bad token                 → 401 with the ``AuthError.reason``
      ("invalid token" / "token expired" / "invalid issuer" / ...)
    * Role mismatch (``require_role`` only)   → 403 ``"insufficient role"``

The dep is ``async`` even though it does no IO today; TAG-55+ may add a
token-revocation DB lookup (``tv`` against ``auth_users.token_version``)
without forcing every route to change shape.

No cookie support. ``/solve`` is called server-to-server from
``apps/web``'s same-origin proxy at ``/api/graph/solve``, which already
injects the Bearer header per CLAUDE.md.

Header parsing follows RFC 6750 §2.1 (case-insensitive scheme).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Depends, Header, HTTPException, status

from .jwt import AuthError, verify_jwt
from .types import JWTClaims


async def get_current_user(
    authorization: str | None = Header(default=None),
) -> JWTClaims:
    """Resolve the caller's :class:`JWTClaims` from ``Authorization: Bearer …``.

    Raises:
        HTTPException(401): header missing, header malformed, or token
            fails :func:`verify_jwt`. The ``detail`` is a short, fixed
            string — never the token, never PyJWT internals.
    """
    if not authorization:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing Authorization header",
        )

    # Split on the first whitespace run. RFC 6750 specifies a single SP,
    # but real proxies sometimes collapse/expand whitespace; accepting the
    # first space-delimited token is the conservative reading.
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "malformed Authorization header",
        )

    token = parts[1].strip()
    try:
        return verify_jwt(token)
    except AuthError as e:
        # ``AuthError.reason`` is a fixed short string set by verify_jwt.
        # We pass it through verbatim — never raise from `e` here, to keep
        # PyJWT's exception chain out of the FastAPI 401 response body.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, e.reason) from None


def require_role(
    *roles: str,
) -> Callable[[JWTClaims], Awaitable[JWTClaims]]:
    """Return a FastAPI dep that 403s unless ``user.role`` is in ``roles``.

    Example::

        admin_only = require_role("TENANT_ADMIN")

        @router.delete("/users/{uid}")
        async def delete_user(uid: str,
                              user: JWTClaims = Depends(admin_only)):
            ...

    Args:
        *roles: Accepted role strings. Comparison is exact (case-sensitive).
            Match how ``apps/api`` writes them (e.g. ``"TENANT_ADMIN"``,
            ``"MEMBER"``, ``"VIEWER"``).

    Raises:
        HTTPException(403): caller is authenticated but has the wrong role.
    """
    accepted = frozenset(roles)

    async def _dep(
        user: JWTClaims = Depends(get_current_user),
    ) -> JWTClaims:
        if user.role not in accepted:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "insufficient role",
            )
        return user

    return _dep


__all__ = ["get_current_user", "require_role"]
