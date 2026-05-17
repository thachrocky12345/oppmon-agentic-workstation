# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tests for ``POST /solve`` (TAG-58).

Covers the eight cases mandated by the ticket plus a body-size
defensive check:

    1.  Missing auth header                   → 401
    2.  Invalid (wrong-secret) JWT            → 401
    3.  Model not owned (resolver 403)        → 403
    4.  ``webFallback=false, collectionIds=[]`` → 422
    5.  ``messages[-1].role != "user"``       → 422
    6.  Happy path                            → 200 text/event-stream
    7.  ``/solve_v2`` still mounts (regression)
    8.  Flag off → 404 on /solve

Plus:
    9.  Oversize body → 413 (TAG-58 body cap)

The resolver and LLM-builder are monkeypatched at the import-site
inside ``api.solve`` (Python rebinds names at import; patching
``auth.resolve.resolve_llm_spec`` after import is a no-op). The
orchestrator stub already streams without external deps so the happy
path can run hermetically — no DB, no real LLM.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import httpx
import jwt as pyjwt
import pytest
from fastapi import FastAPI, HTTPException, status
from pydantic import SecretStr

from agent_search.agent_v2 import config as config_mod
from agent_search.agent_v2.api import solve as solve_mod
from agent_search.agent_v2.app import mount_v2
from agent_search.agent_v2.llm.spec import LLMSpec

_SECRET = "test-secret-do-not-use-in-prod"


def _now() -> int:
    return int(dt.datetime.now(dt.UTC).timestamp())


def _mint(
    *,
    sub: str = "usr_solve_test",
    tenant_id: str = "tnt_solve_test",
    role: str = "MEMBER",
    secret: str = _SECRET,
    issuer: str = "oppmon",
) -> str:
    payload: dict[str, Any] = {
        "sub": sub,
        "tenantId": tenant_id,
        "role": role,
        "email": "alice@example.com",
        "iat": _now() - 60,
        "exp": _now() + 3600,
        "iss": issuer,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def _enable_flag_and_jwt(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default: flag ON, all TAG-65 required env vars populated.

    The four `check_required_env()` vars (JWT_SECRET, TAG_ENCRYPTION_MASTER_KEY,
    DATABASE_URL, OPENAI_EMBED_API_KEY-or-fallback) MUST be non-empty when
    `enable_solve_v3=True`, otherwise `mount_v2()` raises SystemExit at app
    construction time. Tests pass test-only sentinels here so the app boots;
    individual tests override values as needed.
    """
    monkeypatch.setattr(config_mod.settings, "enable_solve_v3", True)
    monkeypatch.setattr(config_mod.settings, "jwt_secret", _SECRET)
    monkeypatch.setattr(config_mod.settings, "jwt_issuer", "oppmon")
    monkeypatch.setattr(
        config_mod.settings, "tag_encryption_master_key", "test-master-key"
    )
    monkeypatch.setattr(config_mod.settings, "database_url", "postgresql://test")
    # openai_api_key is already set in tests/conftest.py session fixture, but
    # pin it here so the order-of-monkeypatch doesn't matter.
    monkeypatch.setattr(config_mod.settings, "openai_api_key", "test-openai-key")


@pytest.fixture
def fake_spec() -> LLMSpec:
    """A ``fake``-provider spec (keyless, no real API call)."""
    return LLMSpec(
        provider="fake",
        model="fake-model",
        api_key=SecretStr(""),
    )


@pytest.fixture
def app_with_solve(
    monkeypatch: pytest.MonkeyPatch, fake_spec: LLMSpec
) -> FastAPI:
    """Fresh app, /solve mounted, resolver patched to succeed."""
    async def _ok_resolve(user, *, model, provider):  # noqa: ARG001
        return fake_spec

    monkeypatch.setattr(solve_mod, "resolve_llm_spec", _ok_resolve)

    a = FastAPI()
    mount_v2(a)
    return a


def _body(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "messages": [{"role": "user", "content": "what is 2+2?"}],
        "model": "fake-model",
        "provider": "fake",
        "enableTools": False,
        "webFallback": True,
        "collectionIds": [],
    }
    base.update(overrides)
    return base


async def _client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ---- 1) Missing auth ----------------------------------------------------


async def test_no_auth_returns_401(app_with_solve: FastAPI) -> None:
    async with await _client(app_with_solve) as c:
        r = await c.post("/solve", json=_body())
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


# ---- 2) Invalid JWT -----------------------------------------------------


async def test_invalid_jwt_returns_401(app_with_solve: FastAPI) -> None:
    bad = _mint(secret="not-the-server-secret")
    async with await _client(app_with_solve) as c:
        r = await c.post(
            "/solve",
            json=_body(),
            headers={"Authorization": f"Bearer {bad}"},
        )
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


# ---- 3) Model not owned (resolver 403) ----------------------------------


async def test_model_not_owned_returns_403(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _deny_resolve(user, *, model, provider):  # noqa: ARG001
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "model not available for this user",
        )

    monkeypatch.setattr(solve_mod, "resolve_llm_spec", _deny_resolve)
    a = FastAPI()
    mount_v2(a)

    token = _mint()
    async with await _client(a) as c:
        r = await c.post(
            "/solve",
            json=_body(),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == status.HTTP_403_FORBIDDEN
    assert r.json()["detail"] == "model not available for this user"


# ---- 4) webFallback=false + empty collectionIds -------------------------


async def test_no_grounding_source_returns_422(
    app_with_solve: FastAPI,
) -> None:
    token = _mint()
    async with await _client(app_with_solve) as c:
        r = await c.post(
            "/solve",
            json=_body(webFallback=False, collectionIds=[]),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ---- 5) Last message not from user --------------------------------------


async def test_last_message_must_be_user_returns_422(
    app_with_solve: FastAPI,
) -> None:
    token = _mint()
    async with await _client(app_with_solve) as c:
        r = await c.post(
            "/solve",
            json=_body(
                messages=[
                    {"role": "user", "content": "hi"},
                    {"role": "assistant", "content": "hello"},
                ]
            ),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ---- 6) Happy path ------------------------------------------------------


async def test_happy_path_returns_sse_stream(
    app_with_solve: FastAPI,
) -> None:
    """200 + text/event-stream content-type + at least one data frame."""
    token = _mint()
    async with (
        await _client(app_with_solve) as c,
        c.stream(
            "POST",
            "/solve",
            json=_body(),
            headers={"Authorization": f"Bearer {token}"},
        ) as r,
    ):
        assert r.status_code == status.HTTP_200_OK
        ctype = r.headers["content-type"].lower()
        assert "text/event-stream" in ctype
        # Pull the first frame so the generator actually runs.
        saw_data = False
        async for line in r.aiter_lines():
            if line.startswith("data:"):
                saw_data = True
                break
        assert saw_data, "expected at least one SSE data frame"


# ---- 7) /solve_v2 regression -------------------------------------------


async def test_solve_v2_still_mounts(app_with_solve: FastAPI) -> None:
    """The legacy route must not be touched by TAG-58."""
    paths = {getattr(r, "path", None) for r in app_with_solve.routes}
    assert "/solve_v2" in paths
    assert "/solve" in paths


# ---- 8) Flag off → 404 -------------------------------------------------


async def test_flag_off_solve_returns_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config_mod.settings, "enable_solve_v3", False)

    a = FastAPI()
    mount_v2(a)

    paths = {getattr(r, "path", None) for r in a.routes}
    assert "/solve" not in paths
    assert "/solve_v2" in paths  # still there

    token = _mint()
    async with await _client(a) as c:
        r = await c.post(
            "/solve",
            json=_body(),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == status.HTTP_404_NOT_FOUND


# ---- 9) Oversize body --------------------------------------------------


async def test_oversize_body_returns_413(
    app_with_solve: FastAPI,
) -> None:
    """Content-Length above MAX_BODY_BYTES is rejected before parsing."""
    token = _mint()
    # Fake a giant Content-Length without sending a giant body — the
    # check runs off the header, which is the realistic DoS vector.
    async with await _client(app_with_solve) as c:
        r = await c.post(
            "/solve",
            json=_body(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Length": str(solve_mod.MAX_BODY_BYTES + 1),
            },
        )
    assert r.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    assert r.json()["detail"] == "request body too large"
