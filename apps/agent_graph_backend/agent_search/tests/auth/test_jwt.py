# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tests for `agent_v2.auth.jwt.verify_jwt`.

Covers the six cases mandated by TAG-52:

    1. Round-trip with a PyJWT-signed token decodes to expected claims.
    2. Wrong secret raises AuthError.
    3. Expired token raises AuthError("token expired").
    4. `alg=none` token is rejected (algorithm confusion).
    5. RS256 token signed by an attacker is rejected.
    6. Empty JWT_SECRET raises RuntimeError (not silent 401).

Plus three additional contract checks:
    - Wrong issuer rejected.
    - Missing required claim (`sub`) rejected.
    - camelCase wire payload (`tenantId`) maps to snake_case attr.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from agent_search.agent_v2.auth import AuthError, JWTClaims, verify_jwt
from agent_search.agent_v2.config import settings

# Use a distinctive value so accidental secret reuse stands out in error msgs.
_TEST_SECRET = "test-secret-do-not-use-in-prod"


def _now() -> int:
    return int(dt.datetime.now(dt.UTC).timestamp())


def _make_payload(**overrides: Any) -> dict[str, Any]:
    """Build a wire-shaped claims dict matching apps/api's signToken output."""
    base: dict[str, Any] = {
        "sub": "usr_abc123",
        "tenantId": "tnt_xyz789",   # camelCase as emitted by Express
        "role": "MEMBER",
        "email": "alice@example.com",
        "teams": [],                # ignored by JWTClaims
        "tv": 1,                    # ignored by JWTClaims
        "iat": _now(),
        "exp": _now() + 3600,
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _set_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default: a populated JWT_SECRET so verify_jwt won't RuntimeError."""
    monkeypatch.setattr(settings, "jwt_secret", _TEST_SECRET)
    monkeypatch.setattr(settings, "jwt_issuer", "oppmon")


# ---- 1) Happy path -------------------------------------------------------


def test_round_trip_decodes_to_claims() -> None:
    """A token signed with HS256 + oppmon issuer decodes to expected claims."""
    payload = _make_payload()
    token = pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256",
                         headers=None)
    # PyJWT.encode doesn't take `issuer=` — embed it as a claim.
    payload_with_iss = {**payload, "iss": "oppmon"}
    token = pyjwt.encode(payload_with_iss, _TEST_SECRET, algorithm="HS256")

    claims = verify_jwt(token)

    assert isinstance(claims, JWTClaims)
    assert claims.sub == "usr_abc123"
    assert claims.tenant_id == "tnt_xyz789"   # camelCase → snake_case
    assert claims.role == "MEMBER"
    assert claims.email == "alice@example.com"
    assert claims.exp == payload["exp"]
    assert claims.iat == payload["iat"]


def test_camelcase_wire_payload_maps_to_snake_case_attr() -> None:
    """Explicit: tenantId on the wire → claims.tenant_id in code."""
    payload = {**_make_payload(), "iss": "oppmon"}
    token = pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256")
    claims = verify_jwt(token)
    # tenantId is the only camelCase-aliased field; the rest are already snake.
    assert claims.tenant_id == payload["tenantId"]


# ---- 2) Wrong secret -----------------------------------------------------


def test_wrong_secret_raises_auth_error() -> None:
    payload = {**_make_payload(), "iss": "oppmon"}
    token = pyjwt.encode(payload, "different-secret", algorithm="HS256")
    with pytest.raises(AuthError) as exc:
        verify_jwt(token)
    assert exc.value.reason == "invalid token"


# ---- 3) Expired ----------------------------------------------------------


def test_expired_token_raises_auth_error() -> None:
    payload = {
        **_make_payload(iat=_now() - 7200, exp=_now() - 3600),
        "iss": "oppmon",
    }
    token = pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256")
    with pytest.raises(AuthError) as exc:
        verify_jwt(token)
    assert exc.value.reason == "token expired"


# ---- 4) alg=none ---------------------------------------------------------


def test_alg_none_is_rejected() -> None:
    """A token with `alg: none` must NOT be accepted under any circumstances."""
    payload = {**_make_payload(), "iss": "oppmon"}
    # PyJWT requires explicit key=None for the 'none' algorithm.
    token = pyjwt.encode(payload, key="", algorithm="none")  # type: ignore[arg-type]
    with pytest.raises(AuthError):
        verify_jwt(token)


# ---- 5) RS256 attacker ---------------------------------------------------


def test_rs256_token_signed_by_attacker_is_rejected() -> None:
    """Classic algorithm-confusion attack: attacker signs with RS256 hoping the
    verifier treats their public key as an HMAC secret."""
    payload = {**_make_payload(), "iss": "oppmon"}
    rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = rsa_key.private_bytes(
        encoding=__import__("cryptography").hazmat.primitives.serialization.Encoding.PEM,
        format=__import__("cryptography").hazmat.primitives.serialization.PrivateFormat.PKCS8,
        encryption_algorithm=__import__("cryptography").hazmat.primitives.serialization.NoEncryption(),
    )
    token = pyjwt.encode(payload, pem, algorithm="RS256")
    with pytest.raises(AuthError):
        verify_jwt(token)


# ---- 6) Empty JWT_SECRET → RuntimeError, not 401 -------------------------


def test_empty_jwt_secret_raises_runtime_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Operator error must surface as a 500/crash, never a silent reject."""
    monkeypatch.setattr(settings, "jwt_secret", "")
    payload = {**_make_payload(), "iss": "oppmon"}
    # Don't even need to sign — we should bail before decode is attempted.
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        verify_jwt("any.token.here")


# ---- 7) Wrong issuer rejected -------------------------------------------


def test_wrong_issuer_rejected() -> None:
    payload = {**_make_payload(), "iss": "evil-corp"}
    token = pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256")
    with pytest.raises(AuthError) as exc:
        verify_jwt(token)
    assert exc.value.reason == "invalid issuer"


# ---- 8) Missing required claim ------------------------------------------


def test_missing_sub_rejected() -> None:
    payload = _make_payload()
    del payload["sub"]
    payload["iss"] = "oppmon"
    token = pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256")
    with pytest.raises(AuthError) as exc:
        verify_jwt(token)
    assert "missing required claim" in exc.value.reason
    assert "sub" in exc.value.reason


def test_missing_exp_rejected() -> None:
    payload = _make_payload()
    del payload["exp"]
    payload["iss"] = "oppmon"
    token = pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256")
    with pytest.raises(AuthError):
        verify_jwt(token)


# ---- 9) Payload doesn't match JWTClaims shape ----------------------------


def test_payload_missing_tenant_id_rejected() -> None:
    """A valid signature with a wrong-shape payload still raises AuthError,
    not a 500 — Pydantic validation errors are mapped to `invalid claims`."""
    payload = {
        "sub": "u",
        # tenantId omitted
        "role": "MEMBER",
        "iat": _now(),
        "exp": _now() + 3600,
        "iss": "oppmon",
    }
    token = pyjwt.encode(payload, _TEST_SECRET, algorithm="HS256")
    with pytest.raises(AuthError) as exc:
        verify_jwt(token)
    assert exc.value.reason == "invalid claims"


# ---- 10) Malformed token -------------------------------------------------


def test_garbage_token_rejected() -> None:
    with pytest.raises(AuthError):
        verify_jwt("not-a-jwt-at-all")


# ---- 11) AuthError surface --------------------------------------------


def test_auth_error_reason_is_short_and_token_free() -> None:
    """Defensive check: AuthError messages never include the raw token."""
    token = pyjwt.encode(
        {**_make_payload(), "iss": "evil-corp"},
        _TEST_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(AuthError) as exc:
        verify_jwt(token)
    # The token has three dot-separated base64 segments; none of them should
    # leak into the reason string.
    for segment in token.split("."):
        assert segment not in exc.value.reason
    # Reason is short — under 80 chars is plenty for any of our codes.
    assert len(exc.value.reason) < 80
