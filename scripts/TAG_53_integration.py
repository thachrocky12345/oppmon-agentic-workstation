#!/usr/bin/env python
"""TAG-53 integration smoke for the FastAPI auth dependency.

TAG-53 does not yet wire `get_current_user` into any production route (TAG-58
will, on `/solve`). To prove the dep works end-to-end over HTTP, this script
spins up a throwaway FastAPI app with one protected route and one role-gated
route, then drives it via ``httpx.ASGITransport``. No external server, no
DB required.

When TAG-58 lands and exposes ``/solve``, the same matrix below can be
pointed at the live service via ``AGENT_GRAPH_URL``.

Run from repo root::

    python scripts/TAG_53_integration.py
"""

from __future__ import annotations

import asyncio
import datetime as dt
import os
import sys
from pathlib import Path
from typing import Any

# Make agent_search importable when running from repo root.
_ROOT = Path(__file__).resolve().parents[1]
_BACKEND = _ROOT / "apps" / "agent_graph_backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Set the secret BEFORE Settings is read by verify_jwt.
_TEST_SECRET = "tag-53-integration-secret"
os.environ["JWT_SECRET"] = _TEST_SECRET
os.environ.setdefault("JWT_ISSUER", "oppmon")

import httpx  # noqa: E402
import jwt as pyjwt  # noqa: E402
from fastapi import Depends, FastAPI  # noqa: E402

from agent_search.agent_v2.auth import (  # noqa: E402
    JWTClaims,
    get_current_user,
    require_role,
)
from agent_search.agent_v2.config import settings  # noqa: E402

# Settings loaded at import; patch in-process to avoid env races.
settings.jwt_secret = _TEST_SECRET
settings.jwt_issuer = "oppmon"


def _now() -> int:
    return int(dt.datetime.now(dt.UTC).timestamp())


def _mint(
    *,
    role: str = "MEMBER",
    expired: bool = False,
    issuer: str = "oppmon",
    sub: str = "usr_int53",
) -> str:
    payload: dict[str, Any] = {
        "sub": sub,
        "tenantId": "tnt_int53",
        "role": role,
        "email": "alice@example.com",
        "iat": _now() - 60,
        "exp": _now() - 30 if expired else _now() + 3600,
        "iss": issuer,
    }
    return pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256")


# Bind role-guard factory call at module load to keep ruff B008 clean.
_require_admin = require_role("TENANT_ADMIN")


def _build_app() -> FastAPI:
    app = FastAPI()

    @app.get("/whoami")
    async def whoami(user: JWTClaims = Depends(get_current_user)) -> dict[str, str]:
        return {"sub": user.sub, "role": user.role}

    @app.get("/admin")
    async def admin(
        user: JWTClaims = Depends(_require_admin),
    ) -> dict[str, str]:
        return {"sub": user.sub}

    return app


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []
        self.app = _build_app()

    async def _request(self, path: str, headers: dict[str, str] | None = None) -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app),
            base_url="http://test",
        ) as client:
            return await client.get(path, headers=headers or {})

    # --- TC-01 ----------------------------------------------------------

    async def tc01_missing_header_returns_401(self) -> None:
        r = await self._request("/whoami")
        ok = r.status_code == 401 and r.json().get("detail") == "missing Authorization header"
        self.rows.append(("missing Authorization -> 401", ok, f"status={r.status_code}"))

    # --- TC-02 ----------------------------------------------------------

    async def tc02_basic_scheme_returns_401(self) -> None:
        r = await self._request(
            "/whoami", headers={"Authorization": "Basic dXNlcjpwYXNz"}
        )
        ok = (
            r.status_code == 401
            and r.json().get("detail") == "malformed Authorization header"
        )
        self.rows.append(("Basic scheme -> 401 malformed", ok, f"status={r.status_code}"))

    # --- TC-03 ----------------------------------------------------------

    async def tc03_empty_bearer_returns_401(self) -> None:
        r = await self._request("/whoami", headers={"Authorization": "Bearer "})
        ok = (
            r.status_code == 401
            and r.json().get("detail") == "malformed Authorization header"
        )
        self.rows.append(("empty Bearer -> 401 malformed", ok, f"status={r.status_code}"))

    # --- TC-04 ----------------------------------------------------------

    async def tc04_valid_token_returns_claims(self) -> None:
        token = _mint(sub="usr_int53_ok", role="MEMBER")
        r = await self._request(
            "/whoami", headers={"Authorization": f"Bearer {token}"}
        )
        body = r.json() if r.status_code == 200 else {}
        ok = (
            r.status_code == 200
            and body.get("sub") == "usr_int53_ok"
            and body.get("role") == "MEMBER"
        )
        self.rows.append(
            ("valid Bearer -> claims echoed", ok, f"status={r.status_code} body={body}")
        )

    # --- TC-05 ----------------------------------------------------------

    async def tc05_lowercase_bearer_accepted(self) -> None:
        token = _mint(sub="usr_int53_lc")
        r = await self._request(
            "/whoami", headers={"Authorization": f"bearer {token}"}
        )
        ok = r.status_code == 200 and r.json().get("sub") == "usr_int53_lc"
        self.rows.append(("lowercase bearer (RFC 6750)", ok, f"status={r.status_code}"))

    # --- TC-06 ----------------------------------------------------------

    async def tc06_expired_token_returns_401(self) -> None:
        token = _mint(expired=True)
        r = await self._request(
            "/whoami", headers={"Authorization": f"Bearer {token}"}
        )
        ok = r.status_code == 401 and r.json().get("detail") == "token expired"
        self.rows.append(
            ("expired token -> 401 'token expired'", ok, f"status={r.status_code}")
        )

    # --- TC-07 ----------------------------------------------------------

    async def tc07_require_role_rejects_wrong_role(self) -> None:
        token = _mint(role="MEMBER")
        r = await self._request(
            "/admin", headers={"Authorization": f"Bearer {token}"}
        )
        ok = r.status_code == 403 and r.json().get("detail") == "insufficient role"
        self.rows.append(
            ("require_role wrong role -> 403", ok, f"status={r.status_code}")
        )

    # --- TC-08 ----------------------------------------------------------

    async def tc08_require_role_accepts_match(self) -> None:
        token = _mint(role="TENANT_ADMIN", sub="usr_admin")
        r = await self._request(
            "/admin", headers={"Authorization": f"Bearer {token}"}
        )
        ok = r.status_code == 200 and r.json().get("sub") == "usr_admin"
        self.rows.append(("require_role match -> 200", ok, f"status={r.status_code}"))

    # --- TC-09 ----------------------------------------------------------

    async def tc09_no_token_leak_in_error_body(self) -> None:
        token = _mint(expired=True)
        r = await self._request(
            "/whoami", headers={"Authorization": f"Bearer {token}"}
        )
        body_text = r.text
        leaks = [seg for seg in token.split(".") if seg in body_text]
        ok = not leaks
        self.rows.append(
            (
                "no token segments in 401 body",
                ok,
                "no leak" if ok else f"LEAKED: {leaks}",
            )
        )

    # --- runner ---------------------------------------------------------

    async def _run_async(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            await getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name}  {detail}")
        print(
            f"\ntotal={len(self.rows)} passed={passed} "
            f"failed={len(self.rows) - passed}"
        )
        return 0 if passed == len(self.rows) else 1

    def run(self) -> int:
        return asyncio.run(self._run_async())


if __name__ == "__main__":
    sys.exit(Runner().run())
