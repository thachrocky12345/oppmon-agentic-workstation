"""Tests for `agent_v2.auth.deps.get_current_user` and `require_role`.

Covers TAG-53's five mandatory cases plus several defensive checks:

    1. Missing Authorization header               → 401 "missing Authorization header"
    2. Authorization: "Basic xyz"                 → 401 "malformed Authorization header"
    3. Authorization: "Bearer " (empty token)     → 401 "malformed Authorization header"
    4. Valid Bearer JWT                           → 200 with claims.sub on body
    5. require_role("ADMIN") with MEMBER token    → 403 "insufficient role"

Plus:
    - Lowercase `bearer` (RFC 6750 §2.1) accepted.
    - Expired token surfaces AuthError.reason verbatim, not the token.
    - `require_role` accepts the role when it matches.
    - No part of the raw JWT appears in any 401/403 body.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import httpx
import jwt as pyjwt
import pytest
from fastapi import Depends, FastAPI, status

from agent_search.agent_v2.auth import (
    JWTClaims,
    get_current_user,
    require_role,
)
from agent_search.agent_v2.config import settings

_TEST_SECRET = "test-secret-do-not-use-in-prod"


def _now() -> int:
    return int(dt.datetime.now(dt.UTC).timestamp())


def _mint(
    *,
    role: str = "MEMBER",
    expired: bool = False,
    secret: str = _TEST_SECRET,
    issuer: str = "oppmon",
    sub: str = "usr_dep_test",
    tenant_id: str = "tnt_dep_test",
) -> str:
    payload: dict[str, Any] = {
        "sub": sub,
        "tenantId": tenant_id,
        "role": role,
        "email": "alice@example.com",
        "iat": _now() - 60,
        "exp": _now() - 30 if expired else _now() + 3600,
        "iss": issuer,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def _jwt_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", _TEST_SECRET)
    monkeypatch.setattr(settings, "jwt_issuer", "oppmon")


# Bind role-guard factory calls at module load so B008 (function-call default)
# stays clean. FastAPI deps are designed to be reusable singletons.
_require_admin = require_role("TENANT_ADMIN")
_require_admin_or_member = require_role("TENANT_ADMIN", "MEMBER")


@pytest.fixture
def probe_app() -> FastAPI:
    """A throwaway FastAPI app with one protected route + one role-gated route.

    We use this instead of `mount_v2` so the test is hermetic — no DB, no
    SSE, no orchestrator wiring. Just exercises `Depends(get_current_user)`
    and `Depends(require_role(...))`.
    """
    app = FastAPI()

    @app.get("/whoami")
    async def whoami(user: JWTClaims = Depends(get_current_user)) -> dict[str, str]:
        return {"sub": user.sub, "tenant_id": user.tenant_id, "role": user.role}

    @app.get("/admin")
    async def admin_only(
        user: JWTClaims = Depends(_require_admin),
    ) -> dict[str, str]:
        return {"sub": user.sub}

    @app.get("/multi")
    async def multi_role(
        user: JWTClaims = Depends(_require_admin_or_member),
    ) -> dict[str, str]:
        return {"sub": user.sub}

    return app


async def _client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ---- 1) Missing header --------------------------------------------------


async def test_missing_authorization_header_returns_401(probe_app: FastAPI) -> None:
    async with await _client(probe_app) as client:
        r = await client.get("/whoami")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "missing Authorization header"


# ---- 2) Wrong scheme ---------------------------------------------------


async def test_basic_auth_scheme_returns_401(probe_app: FastAPI) -> None:
    async with await _client(probe_app) as client:
        r = await client.get(
            "/whoami",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "malformed Authorization header"


# ---- 3) Empty Bearer token ---------------------------------------------


async def test_bearer_with_empty_token_returns_401(probe_app: FastAPI) -> None:
    async with await _client(probe_app) as client:
        r = await client.get("/whoami", headers={"Authorization": "Bearer "})
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "malformed Authorization header"


async def test_bearer_only_no_token_returns_401(probe_app: FastAPI) -> None:
    """No space after `Bearer` → split produces a single part → malformed."""
    async with await _client(probe_app) as client:
        r = await client.get("/whoami", headers={"Authorization": "Bearer"})
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "malformed Authorization header"


async def test_bearer_with_whitespace_only_token_returns_401(probe_app: FastAPI) -> None:
    async with await _client(probe_app) as client:
        r = await client.get(
            "/whoami",
            headers={"Authorization": "Bearer    "},
        )
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "malformed Authorization header"


# ---- 4) Valid token -----------------------------------------------------


async def test_valid_bearer_token_returns_claims(probe_app: FastAPI) -> None:
    token = _mint(sub="usr_valid", tenant_id="tnt_valid", role="MEMBER")
    async with await _client(probe_app) as client:
        r = await client.get(
            "/whoami",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["sub"] == "usr_valid"
    assert body["tenant_id"] == "tnt_valid"
    assert body["role"] == "MEMBER"


async def test_lowercase_bearer_scheme_accepted(probe_app: FastAPI) -> None:
    """RFC 6750 §2.1 makes the scheme case-insensitive."""
    token = _mint(sub="usr_lc")
    async with await _client(probe_app) as client:
        r = await client.get(
            "/whoami",
            headers={"Authorization": f"bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["sub"] == "usr_lc"


# ---- 5) Token-level failures pass through verify_jwt --------------------


async def test_expired_token_returns_401_with_reason(probe_app: FastAPI) -> None:
    token = _mint(expired=True)
    async with await _client(probe_app) as client:
        r = await client.get(
            "/whoami",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "token expired"


async def test_wrong_secret_token_returns_401(probe_app: FastAPI) -> None:
    token = _mint(secret="some-other-secret")
    async with await _client(probe_app) as client:
        r = await client.get(
            "/whoami",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "invalid token"


# ---- 6) require_role rejects mismatched role ----------------------------


async def test_require_role_returns_403_for_wrong_role(probe_app: FastAPI) -> None:
    token = _mint(role="MEMBER")  # but /admin requires TENANT_ADMIN
    async with await _client(probe_app) as client:
        r = await client.get(
            "/admin",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == status.HTTP_403_FORBIDDEN
    assert r.json()["detail"] == "insufficient role"


async def test_require_role_accepts_matching_role(probe_app: FastAPI) -> None:
    token = _mint(role="TENANT_ADMIN", sub="usr_admin")
    async with await _client(probe_app) as client:
        r = await client.get(
            "/admin",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["sub"] == "usr_admin"


async def test_require_role_accepts_any_of_multiple(probe_app: FastAPI) -> None:
    """`require_role("A", "B")` admits either role."""
    token = _mint(role="MEMBER", sub="usr_multi")
    async with await _client(probe_app) as client:
        r = await client.get(
            "/multi",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["sub"] == "usr_multi"


async def test_require_role_still_401s_when_token_missing(probe_app: FastAPI) -> None:
    """Role guard composes after get_current_user — no token means 401, not 403."""
    async with await _client(probe_app) as client:
        r = await client.get("/admin")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert r.json()["detail"] == "missing Authorization header"


# ---- 7) Defensive: no token contents leak into errors -------------------


async def test_invalid_token_response_body_contains_no_token_segments(
    probe_app: FastAPI,
) -> None:
    token = _mint(expired=True)
    async with await _client(probe_app) as client:
        r = await client.get(
            "/whoami",
            headers={"Authorization": f"Bearer {token}"},
        )
    body_text = r.text
    for segment in token.split("."):
        assert segment not in body_text, "token segment leaked into 401 body"
