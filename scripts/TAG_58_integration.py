#!/usr/bin/env python
"""TAG-58 — ``POST /solve`` integration smoke.

Boots the FastAPI app in-process (no separate server, no DB, no real
LLM) and exercises the eight cases from the ticket plus the
body-size cap:

  TC-01  flag off → /solve absent, /solve_v2 present
  TC-02  flag on, no auth → 401
  TC-03  flag on, invalid JWT → 401
  TC-04  flag on, valid JWT, resolver denies → 403
  TC-05  webFallback=false + collectionIds=[] → 422
  TC-06  last message role != "user" → 422
  TC-07  happy path → 200 + text/event-stream + ≥1 data frame
  TC-08  /solve_v2 still mounts (regression)
  TC-09  Content-Length > MAX_BODY_BYTES → 413

The resolver is monkeypatched at the import-site in
``api.solve`` — same idiom as the unit tests. This script doubles
as a "does TAG-58 work end-to-end in one process" demo without any
infrastructure dependency.

Usage:
    cd apps/agent_graph_backend
    python ../../scripts/TAG_58_integration.py
"""

from __future__ import annotations

import asyncio
import datetime as dt
import os
import sys
from typing import Any

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "apps", "agent_graph_backend")
    ),
)

import httpx  # noqa: E402
import jwt as pyjwt  # noqa: E402
from fastapi import FastAPI, HTTPException, status  # noqa: E402
from pydantic import SecretStr  # noqa: E402

from agent_search.agent_v2 import config as config_mod  # noqa: E402
from agent_search.agent_v2.api import solve as solve_mod  # noqa: E402
from agent_search.agent_v2.app import mount_v2  # noqa: E402
from agent_search.agent_v2.llm.spec import LLMSpec  # noqa: E402

_SECRET = "test-secret-do-not-use-in-prod"


def _now() -> int:
    return int(dt.datetime.now(dt.UTC).timestamp())


def _mint(*, secret: str = _SECRET, role: str = "MEMBER") -> str:
    payload: dict[str, Any] = {
        "sub": "usr_tc",
        "tenantId": "tnt_tc",
        "role": role,
        "email": "tc@example.com",
        "iat": _now() - 60,
        "exp": _now() + 3600,
        "iss": "oppmon",
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


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


def _fake_spec() -> LLMSpec:
    return LLMSpec(
        provider="fake",
        model="fake-model",
        api_key=SecretStr(""),
    )


def _set_env_defaults() -> None:
    config_mod.settings.jwt_secret = _SECRET
    config_mod.settings.jwt_issuer = "oppmon"


def _build_app(*, flag: bool, resolver: Any) -> FastAPI:
    config_mod.settings.enable_solve_v3 = flag
    solve_mod.resolve_llm_spec = resolver  # type: ignore[assignment]
    a = FastAPI()
    mount_v2(a)
    return a


async def _ok_resolve(user, *, model, provider):  # noqa: ARG001
    return _fake_spec()


async def _deny_resolve(user, *, model, provider):  # noqa: ARG001
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "model not available for this user",
    )


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []
        _set_env_defaults()

    def _add(self, name: str, ok: bool, detail: str) -> None:
        self.rows.append((name, bool(ok), detail))

    # ---- async helpers ----

    async def _post(
        self,
        app: FastAPI,
        body: dict[str, Any],
        *,
        token: str | None = None,
        extra: dict[str, str] | None = None,
    ) -> httpx.Response:
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if extra:
            headers.update(extra)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as c:
            return await c.post("/solve", json=body, headers=headers)

    # ---- cases ----

    def tc01_flag_off(self) -> None:
        app = _build_app(flag=False, resolver=_ok_resolve)
        paths = {getattr(r, "path", None) for r in app.routes}
        ok = "/solve" not in paths and "/solve_v2" in paths
        self._add("TC-01 flag off hides /solve", ok, f"paths={sorted(p for p in paths if p)}")

    def tc02_no_auth(self) -> None:
        app = _build_app(flag=True, resolver=_ok_resolve)
        r = asyncio.run(self._post(app, _body()))
        self._add("TC-02 no auth -> 401", r.status_code == 401, str(r.status_code))

    def tc03_invalid_jwt(self) -> None:
        app = _build_app(flag=True, resolver=_ok_resolve)
        bad = _mint(secret="not-the-server-secret")
        r = asyncio.run(self._post(app, _body(), token=bad))
        self._add("TC-03 invalid JWT -> 401", r.status_code == 401, str(r.status_code))

    def tc04_model_denied(self) -> None:
        app = _build_app(flag=True, resolver=_deny_resolve)
        r = asyncio.run(self._post(app, _body(), token=_mint()))
        ok = r.status_code == 403 and r.json().get("detail") == "model not available for this user"
        self._add("TC-04 resolver denies -> 403", ok, str(r.status_code))

    def tc05_no_grounding(self) -> None:
        app = _build_app(flag=True, resolver=_ok_resolve)
        r = asyncio.run(
            self._post(
                app,
                _body(webFallback=False, collectionIds=[]),
                token=_mint(),
            )
        )
        self._add("TC-05 no grounding -> 422", r.status_code == 422, str(r.status_code))

    def tc06_last_not_user(self) -> None:
        app = _build_app(flag=True, resolver=_ok_resolve)
        bad_messages = [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]
        r = asyncio.run(
            self._post(
                app,
                _body(messages=bad_messages),
                token=_mint(),
            )
        )
        self._add("TC-06 last role != user -> 422", r.status_code == 422, str(r.status_code))

    def tc07_happy_path(self) -> None:
        app = _build_app(flag=True, resolver=_ok_resolve)

        async def _run() -> tuple[int, str, bool]:
            async with (
                httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app),
                    base_url="http://test",
                ) as c,
                c.stream(
                    "POST",
                    "/solve",
                    json=_body(),
                    headers={"Authorization": f"Bearer {_mint()}"},
                ) as r,
            ):
                ctype = r.headers.get("content-type", "")
                saw = False
                async for line in r.aiter_lines():
                    if line.startswith("data:"):
                        saw = True
                        break
                return r.status_code, ctype, saw

        code, ctype, saw = asyncio.run(_run())
        ok = code == 200 and "text/event-stream" in ctype.lower() and saw
        self._add("TC-07 happy path SSE", ok, f"status={code} ctype={ctype!r} frame={saw}")

    def tc08_solve_v2_regression(self) -> None:
        app = _build_app(flag=True, resolver=_ok_resolve)
        paths = {getattr(r, "path", None) for r in app.routes}
        ok = "/solve_v2" in paths and "/solve" in paths
        self._add("TC-08 /solve_v2 still mounts", ok, f"paths={sorted(p for p in paths if p)}")

    def tc09_oversize_body(self) -> None:
        app = _build_app(flag=True, resolver=_ok_resolve)
        r = asyncio.run(
            self._post(
                app,
                _body(),
                token=_mint(),
                extra={"Content-Length": str(solve_mod.MAX_BODY_BYTES + 1)},
            )
        )
        ok = r.status_code == 413 and r.json().get("detail") == "request body too large"
        self._add("TC-09 oversize body -> 413", ok, str(r.status_code))

    # ---- driver ----

    def run(self) -> int:
        names = [m for m in dir(self) if m.startswith("tc")]
        for name in sorted(names):
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name} | {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} failed={len(self.rows) - passed}")
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
