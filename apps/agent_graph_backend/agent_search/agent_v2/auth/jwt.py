# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""HS256 JWT verifier — mirrors `apps/api/src/lib/jwt.ts`.

Contract:
    - Algorithm whitelist is ``["HS256"]``. ``alg=none`` / ``RS*`` / ``ES*``
      tokens are rejected before signature verification — this defeats the
      classic algorithm-confusion attack.
    - Secret comes from ``settings.jwt_secret`` (env ``JWT_SECRET``). The
      Express signer reads the same env var. TAG-65 deploys a swarm-time
      parity check; locally, drift between the two services is the most
      common silent failure mode.
    - Issuer is fixed to ``settings.jwt_issuer`` (default ``"oppmon"``) and
      matches the constant in ``apps/api/src/lib/jwt.ts``.
    - Required claims: ``exp``, ``iat``, ``sub`` — enforced by PyJWT via the
      ``options.require`` list.

Errors:
    - ``RuntimeError`` if ``JWT_SECRET`` is empty (treat as a config bug, not
      an auth failure — never silently 401 a misconfigured deploy).
    - ``AuthError`` on every other failure. The ``reason`` attribute is a
      short, generic string suitable for HTTP 401 ``detail``. Token contents
      MUST NOT appear in the message — that's how secrets and PII leak into
      logs and error pages.

Logging policy:
    - Never log the raw token.
    - After a successful verify, callers may log ``claims.sub`` (cuid2) and
      ``claims.tenant_id`` for request correlation; both are non-secret.
"""

from __future__ import annotations

import logging
from typing import Any

import jwt as pyjwt

from ..config import settings
from .types import JWTClaims

log = logging.getLogger(__name__)


class AuthError(Exception):
    """Raised when a JWT fails verification.

    Carries only a short, generic ``reason`` — callers should map this to
    HTTP 401 with the reason as the ``WWW-Authenticate`` error description.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def verify_jwt(token: str) -> JWTClaims:
    """Verify an HS256 JWT and return the typed claims.

    Args:
        token: Compact-serialized JWT (three base64url-encoded segments).

    Returns:
        JWTClaims populated from the decoded payload. Wire-format camelCase
        (e.g. ``tenantId``) is mapped to snake_case attrs via Pydantic
        aliases.

    Raises:
        RuntimeError: ``JWT_SECRET`` is not configured. This is a deploy
            misconfiguration, not an auth failure.
        AuthError: signature invalid, token expired, wrong issuer, missing
            required claims, disallowed algorithm, malformed token, or
            payload that doesn't match :class:`JWTClaims`.
    """
    if not settings.jwt_secret:
        # Fail loudly — a swarm pod with no secret should not silently
        # accept or reject; it should crash and surface in healthchecks.
        raise RuntimeError(
            "JWT_SECRET is not configured. agent_search cannot verify "
            "tokens issued by apps/api without it. Set JWT_SECRET in the "
            "shell that runs `docker stack deploy` (see TAG-65)."
        )

    try:
        payload: dict[str, Any] = pyjwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub"]},
            issuer=settings.jwt_issuer,
        )
    except pyjwt.ExpiredSignatureError as e:
        # Distinct message lets the UI prompt for re-login instead of a
        # generic "auth failed".
        raise AuthError("token expired") from e
    except pyjwt.InvalidIssuerError as e:
        raise AuthError("invalid issuer") from e
    except pyjwt.MissingRequiredClaimError as e:
        # PyJWT phrasing is fine here — names the missing claim, which is
        # not secret.
        raise AuthError(f"missing required claim: {e.claim}") from e
    except pyjwt.InvalidAlgorithmError as e:
        # Algorithm confusion attempt (alg=none, RS256-with-pubkey-as-secret).
        raise AuthError("invalid algorithm") from e
    except pyjwt.InvalidTokenError as e:
        # Catch-all for invalid signature, malformed token, decode errors.
        # NEVER include the token or pyjwt's full message — they may echo
        # token fragments. The string we attach here is what reaches the
        # client.
        raise AuthError("invalid token") from e

    try:
        claims = JWTClaims(**payload)
    except (TypeError, ValueError) as e:
        # Payload decoded but didn't match the expected shape (e.g. missing
        # `tenantId`, wrong types). Treat as auth failure, not a 500.
        raise AuthError("invalid claims") from e

    log.debug("jwt verified: sub=%s tenant=%s", claims.sub, claims.tenant_id)
    return claims


__all__ = ["AuthError", "verify_jwt"]
