"""Tests for ``agent_v2.crypto.vault``.

Mirrors the five test cases listed in TAG-54 plus a few defensive
checks. The cross-language round-trip (TS encrypt → Python decrypt)
lives in ``scripts/TAG_54_integration.py`` because it needs a Node
runtime; this file is pure Python.
"""

from __future__ import annotations

import json
from base64 import b64decode, b64encode

import pytest
from nacl.secret import SecretBox
from nacl.utils import random as nacl_random

from agent_search.agent_v2.config import settings
from agent_search.agent_v2.crypto import (
    VaultError,
    decrypt_secret,
    encrypt_secret,
    is_configured,
)

# Two distinct test keys — fixed so re-running tests is deterministic
# without leaking anything secret. These are *test* keys; never used
# anywhere in prod.
_KEY_A = b"\x11" * SecretBox.KEY_SIZE
_KEY_B = b"\x22" * SecretBox.KEY_SIZE
_KEY_A_B64 = b64encode(_KEY_A).decode("ascii")
_KEY_B_B64 = b64encode(_KEY_B).decode("ascii")


@pytest.fixture(autouse=True)
def _vault_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test runs with key A active and no legacy keys."""
    monkeypatch.setattr(settings, "tag_encryption_master_key", _KEY_A_B64)
    monkeypatch.setattr(settings, "tag_encryption_legacy_keys", "")


# ---- 1) Self round-trip --------------------------------------------------


def test_round_trip_returns_payload() -> None:
    payload = {"api_key": "sk-roundtrip", "org": "tnt_1"}
    ct, nonce = encrypt_secret(payload)
    assert decrypt_secret(ct, nonce) == payload


def test_round_trip_empty_dict() -> None:
    ct, nonce = encrypt_secret({})
    assert decrypt_secret(ct, nonce) == {}


def test_round_trip_unicode_value() -> None:
    payload = {"api_key": "sk-café-ünïcode-✓"}
    ct, nonce = encrypt_secret(payload)
    assert decrypt_secret(ct, nonce) == payload


# ---- 2) Wrong master key -------------------------------------------------


def test_wrong_master_key_raises_vault_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ct, nonce = encrypt_secret({"api_key": "sk-victim"})
    monkeypatch.setattr(settings, "tag_encryption_master_key", _KEY_B_B64)
    with pytest.raises(VaultError, match="decrypt failed"):
        decrypt_secret(ct, nonce)


def test_wrong_master_key_does_not_leak_ciphertext(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The VaultError message must never carry token / ciphertext bytes."""
    ct, nonce = encrypt_secret({"api_key": "sk-leak-canary"})
    monkeypatch.setattr(settings, "tag_encryption_master_key", _KEY_B_B64)
    with pytest.raises(VaultError) as info:
        decrypt_secret(ct, nonce)
    msg = str(info.value)
    assert "sk-leak-canary" not in msg
    assert ct not in msg
    assert nonce not in msg


# ---- 3) Truncated ciphertext ---------------------------------------------


def test_truncated_ciphertext_raises_vault_error() -> None:
    ct, nonce = encrypt_secret({"api_key": "sk-trunc"})
    # Drop the last 5 bytes — corrupts Poly1305 MAC.
    bad_ct = b64encode(b64decode(ct)[:-5]).decode("ascii")
    with pytest.raises(VaultError, match="decrypt failed"):
        decrypt_secret(bad_ct, nonce)


def test_truncated_nonce_raises_vault_error() -> None:
    ct, nonce = encrypt_secret({"api_key": "sk-trunc-nonce"})
    bad_nonce = b64encode(b64decode(nonce)[:10]).decode("ascii")
    with pytest.raises(VaultError, match="decrypt failed"):
        decrypt_secret(ct, bad_nonce)


def test_invalid_base64_raises_vault_error() -> None:
    """Non-b64 input is funneled through the same opaque error."""
    with pytest.raises(VaultError, match="decrypt failed"):
        decrypt_secret("not!base64!!", "also-not-b64")


# ---- 4) Missing env ------------------------------------------------------


def test_missing_master_key_raises_vault_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "tag_encryption_master_key", "")
    ct = b64encode(b"x" * 40).decode("ascii")
    nonce = b64encode(b"y" * 24).decode("ascii")
    with pytest.raises(VaultError, match="TAG_ENCRYPTION_MASTER_KEY not configured"):
        decrypt_secret(ct, nonce)


def test_master_key_wrong_length_raises_vault_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bad = b64encode(b"\x00" * 16).decode("ascii")
    monkeypatch.setattr(settings, "tag_encryption_master_key", bad)
    ct = b64encode(b"x" * 40).decode("ascii")
    nonce = b64encode(b"y" * 24).decode("ascii")
    with pytest.raises(VaultError, match="must be 32 bytes"):
        decrypt_secret(ct, nonce)


def test_is_configured_reflects_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    assert is_configured() is True
    monkeypatch.setattr(settings, "tag_encryption_master_key", "")
    assert is_configured() is False
    monkeypatch.setattr(settings, "tag_encryption_master_key", "not-base64!")
    # b64decode is lenient — best-effort check is "decoded to 32 bytes",
    # which a junk string won't satisfy.
    assert is_configured() is False


# ---- 5) Legacy key rotation fallback ------------------------------------


def test_legacy_key_decrypts_when_primary_rotated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ciphertext written with key A still decrypts after rotation to key B
    as long as A is moved to TAG_ENCRYPTION_LEGACY_KEYS."""
    ct, nonce = encrypt_secret({"api_key": "sk-pre-rotation"})

    # Operator rotates: B becomes primary, A is preserved as legacy.
    monkeypatch.setattr(settings, "tag_encryption_master_key", _KEY_B_B64)
    monkeypatch.setattr(settings, "tag_encryption_legacy_keys", _KEY_A_B64)

    assert decrypt_secret(ct, nonce) == {"api_key": "sk-pre-rotation"}


def test_legacy_keys_strip_whitespace_and_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ct, nonce = encrypt_secret({"api_key": "sk-ws"})
    monkeypatch.setattr(settings, "tag_encryption_master_key", _KEY_B_B64)
    # Whitespace + empty entries should be dropped, real key retained.
    monkeypatch.setattr(
        settings,
        "tag_encryption_legacy_keys",
        f"  ,  {_KEY_A_B64}  ,  ",
    )
    assert decrypt_secret(ct, nonce) == {"api_key": "sk-ws"}


def test_legacy_key_with_bad_length_raises_at_resolution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An invalid legacy key surfaces immediately, not silently skipped —
    matches the TS impl that throws on bad legacy key length."""
    ct, nonce = encrypt_secret({"api_key": "sk-bad-legacy"})
    monkeypatch.setattr(settings, "tag_encryption_master_key", _KEY_B_B64)
    monkeypatch.setattr(
        settings,
        "tag_encryption_legacy_keys",
        b64encode(b"too-short").decode("ascii"),
    )
    with pytest.raises(VaultError, match="must be 32 bytes"):
        decrypt_secret(ct, nonce)


# ---- 6) Defensive payload shape -----------------------------------------


def test_non_json_plaintext_raises_vault_error() -> None:
    """A row encrypted with the right key but garbage plaintext still
    fails closed — we refuse to guess what it was supposed to be."""
    box = SecretBox(_KEY_A)
    nonce = nacl_random(SecretBox.NONCE_SIZE)
    encrypted = box.encrypt(b"\x00\x01\x02 not json", nonce=nonce)
    ct = b64encode(encrypted.ciphertext).decode("ascii")
    nonce_b64 = b64encode(encrypted.nonce).decode("ascii")
    with pytest.raises(VaultError, match="decrypt failed"):
        decrypt_secret(ct, nonce_b64)


def test_json_array_plaintext_raises_vault_error() -> None:
    """Plaintext that decodes to a JSON array, not an object, is refused."""
    box = SecretBox(_KEY_A)
    nonce = nacl_random(SecretBox.NONCE_SIZE)
    encrypted = box.encrypt(json.dumps(["not", "a", "dict"]).encode(), nonce=nonce)
    ct = b64encode(encrypted.ciphertext).decode("ascii")
    nonce_b64 = b64encode(encrypted.nonce).decode("ascii")
    with pytest.raises(VaultError, match="decrypt failed"):
        decrypt_secret(ct, nonce_b64)


def test_key_id_argument_is_accepted_and_ignored() -> None:
    """``key_id`` is reserved for rotation but must not affect decrypt today."""
    payload = {"api_key": "sk-keyid"}
    ct, nonce = encrypt_secret(payload)
    assert decrypt_secret(ct, nonce, key_id=1) == payload
    assert decrypt_secret(ct, nonce, key_id="v1") == payload
    assert decrypt_secret(ct, nonce, key_id=None) == payload
