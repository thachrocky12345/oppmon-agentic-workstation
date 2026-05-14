#!/usr/bin/env python
"""TAG-52 integration smoke test.

This is an out-of-process exercise of `verify_jwt` against tokens minted
exactly the way `apps/api/src/lib/jwt.ts` mints them. It does NOT need a
running FastAPI server — TAG-52 is a library-level deliverable. TAG-53 will
add an over-the-wire smoke once the FastAPI dependency lands.

The seven test cases below cover the acceptance criteria plus a happy-path
round trip mirroring what `apps/api/src/lib/jwt.ts:signToken` emits (camelCase
``tenantId``, embedded ``iss: "oppmon"``, HS256).

Usage:
    cd apps/agent_graph_backend && python ../../scripts/TAG_52_integration.py
"""

from __future__ import annotations

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

# Ensure a known JWT_SECRET BEFORE Settings loads.
_TEST_SECRET = "tag-52-integration-secret"
os.environ["JWT_SECRET"] = _TEST_SECRET
os.environ.setdefault("JWT_ISSUER", "oppmon")

import jwt as pyjwt  # noqa: E402

from agent_search.agent_v2.auth import AuthError, verify_jwt  # noqa: E402
from agent_search.agent_v2.config import settings  # noqa: E402

# Settings caches on import — patch directly for this script.
settings.jwt_secret = _TEST_SECRET
settings.jwt_issuer = "oppmon"


def _now() -> int:
    return int(dt.datetime.now(dt.UTC).timestamp())


def _mint(payload: dict[str, Any], *, secret: str = _TEST_SECRET,
          algorithm: str = "HS256") -> str:
    """Sign a token exactly the way apps/api does."""
    return pyjwt.encode(payload, secret, algorithm=algorithm)


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # --- TC-01 round-trip ------------------------------------------------

    def tc01_round_trip(self) -> None:
        token = _mint({
            "sub": "usr_int01",
            "tenantId": "tnt_int01",
            "role": "MEMBER",
            "email": "alice@example.com",
            "teams": [],
            "tv": 1,
            "iat": _now(),
            "exp": _now() + 3600,
            "iss": "oppmon",
        })
        try:
            claims = verify_jwt(token)
            ok = (
                claims.sub == "usr_int01"
                and claims.tenant_id == "tnt_int01"
                and claims.role == "MEMBER"
            )
            self.rows.append(("round-trip decodes Express-shaped token", ok,
                              f"sub={claims.sub} tenant={claims.tenant_id}"))
        except Exception as e:  # noqa: BLE001
            self.rows.append(("round-trip decodes Express-shaped token",
                              False, f"unexpected exception: {e}"))

    # --- TC-02 wrong secret ---------------------------------------------

    def tc02_wrong_secret(self) -> None:
        token = _mint(
            {
                "sub": "u", "tenantId": "t", "role": "MEMBER",
                "iat": _now(), "exp": _now() + 3600, "iss": "oppmon",
            },
            secret="some-other-secret",
        )
        try:
            verify_jwt(token)
            self.rows.append(("wrong secret rejected", False,
                              "verify_jwt accepted a token signed with a "
                              "different secret"))
        except AuthError as e:
            self.rows.append(("wrong secret rejected", True,
                              f"reason={e.reason!r}"))

    # --- TC-03 expired ---------------------------------------------------

    def tc03_expired(self) -> None:
        token = _mint({
            "sub": "u", "tenantId": "t", "role": "MEMBER",
            "iat": _now() - 7200, "exp": _now() - 3600, "iss": "oppmon",
        })
        try:
            verify_jwt(token)
            self.rows.append(("expired token rejected", False,
                              "verify_jwt accepted an expired token"))
        except AuthError as e:
            ok = e.reason == "token expired"
            self.rows.append(("expired token rejected", ok,
                              f"reason={e.reason!r}"))

    # --- TC-04 alg=none --------------------------------------------------

    def tc04_alg_none(self) -> None:
        token = pyjwt.encode(
            {"sub": "u", "tenantId": "t", "role": "MEMBER",
             "iat": _now(), "exp": _now() + 3600, "iss": "oppmon"},
            key="",
            algorithm="none",  # type: ignore[arg-type]
        )
        try:
            verify_jwt(token)
            self.rows.append(("alg=none rejected", False,
                              "verify_jwt accepted alg=none — "
                              "ALGORITHM CONFUSION!"))
        except AuthError as e:
            self.rows.append(("alg=none rejected", True,
                              f"reason={e.reason!r}"))

    # --- TC-05 RS256 attacker -------------------------------------------

    def tc05_rs256_attacker(self) -> None:
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        token = pyjwt.encode(
            {"sub": "u", "tenantId": "t", "role": "MEMBER",
             "iat": _now(), "exp": _now() + 3600, "iss": "oppmon"},
            pem,
            algorithm="RS256",
        )
        try:
            verify_jwt(token)
            self.rows.append(("RS256 attacker token rejected", False,
                              "verify_jwt accepted RS256 — "
                              "ALGORITHM CONFUSION!"))
        except AuthError as e:
            self.rows.append(("RS256 attacker token rejected", True,
                              f"reason={e.reason!r}"))

    # --- TC-06 empty secret RuntimeError --------------------------------

    def tc06_empty_secret_runtime_error(self) -> None:
        original = settings.jwt_secret
        try:
            settings.jwt_secret = ""
            try:
                verify_jwt("any.token.here")
                self.rows.append(("empty JWT_SECRET raises RuntimeError",
                                  False, "no exception raised"))
            except RuntimeError as e:
                ok = "JWT_SECRET" in str(e)
                self.rows.append(("empty JWT_SECRET raises RuntimeError",
                                  ok, f"msg={str(e)[:60]!r}"))
            except AuthError as e:
                self.rows.append(("empty JWT_SECRET raises RuntimeError",
                                  False,
                                  f"got AuthError (should be RuntimeError): "
                                  f"{e.reason!r}"))
        finally:
            settings.jwt_secret = original

    # --- TC-07 wrong issuer ---------------------------------------------

    def tc07_wrong_issuer(self) -> None:
        token = _mint({
            "sub": "u", "tenantId": "t", "role": "MEMBER",
            "iat": _now(), "exp": _now() + 3600, "iss": "evil-corp",
        })
        try:
            verify_jwt(token)
            self.rows.append(("wrong issuer rejected", False,
                              "verify_jwt accepted iss=evil-corp"))
        except AuthError as e:
            ok = e.reason == "invalid issuer"
            self.rows.append(("wrong issuer rejected", ok,
                              f"reason={e.reason!r}"))

    # --- runner ---------------------------------------------------------

    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name}  {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} "
              f"failed={len(self.rows) - passed}")
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
