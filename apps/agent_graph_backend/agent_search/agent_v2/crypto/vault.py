# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Secret-vault decryption — Python mirror of ``apps/api/src/crypto/secret-vault.ts``.

The Express signer stores per-tenant API keys (Anthropic / OpenAI / Cerebras / …)
as XSalsa20-Poly1305 ciphertext under three columns on ``model_secrets``:

  encrypted_payload  bytea  — ciphertext (Poly1305 MAC prepended by tweetnacl)
  nonce              bytea  — 24-byte random nonce
  version            int    — key-rotation generation (metadata only today)

Plaintext is ``JSON.stringify({ api_key: "...", ... })`` — a flat
``dict[str, str]`` of secret fields. The TS impl uses ``nacl.secretbox``
which is XSalsa20-Poly1305 (the in-code comment "XChaCha20" is wrong —
``tweetnacl.secretbox`` does NOT bind to XChaCha; PyNaCl's ``SecretBox``
matches it byte-for-byte).

Master key resolution mirrors TS:
  TAG_ENCRYPTION_MASTER_KEY   — base64 of 32 bytes; required
  TAG_ENCRYPTION_LEGACY_KEYS  — comma-separated base64 keys; tried in order
                                if the current key fails. Lets ops rotate
                                without re-encrypting every row in one shot.

This module is the ONLY place in ``agent_search`` that handles plaintext
API keys. The plaintext leaves here as a ``dict[str, str]`` returned to
``resolve_llm_spec`` (TAG-57) and is then handed to
``create_llm_client_from_spec`` before being discarded.
"""

from __future__ import annotations

import json
from base64 import b64decode

from nacl.exceptions import CryptoError
from nacl.secret import SecretBox

from ..config import settings


class VaultError(Exception):
    """Raised for any vault failure. Never carries plaintext.

    The message is intentionally generic ("decrypt failed") so neither
    the master key nor the ciphertext segments end up in stack traces
    that a downstream FastAPI handler might log.
    """


def _decode_key(b64: str) -> bytes:
    """Decode and validate a base64 master key.

    Raises ``VaultError`` if the input is not valid base64 OR the decoded
    length is not exactly ``SecretBox.KEY_SIZE`` (32) bytes required by
    XSalsa20-Poly1305.
    """
    try:
        key = b64decode(b64)
    except Exception:  # noqa: BLE001 — funnel all decode failures
        raise VaultError(f"master key must be {SecretBox.KEY_SIZE} bytes") from None
    if len(key) != SecretBox.KEY_SIZE:
        raise VaultError(f"master key must be {SecretBox.KEY_SIZE} bytes")
    return key


def _master_key() -> bytes:
    """Resolve the primary master key from settings."""
    raw = settings.tag_encryption_master_key
    if not raw:
        raise VaultError("TAG_ENCRYPTION_MASTER_KEY not configured")
    return _decode_key(raw)


def _legacy_keys() -> list[bytes]:
    """Resolve legacy master keys for rotation fallback.

    Empty / unset → empty list (no fallback). Whitespace and empty
    entries are dropped to match the TS impl's ``.trim() && .length > 0``.
    """
    raw = settings.tag_encryption_legacy_keys
    if not raw:
        return []
    return [_decode_key(part.strip()) for part in raw.split(",") if part.strip()]


def is_configured() -> bool:
    """Return True if a master key is set and decodes to the right length.

    Lets callers decide whether to even attempt a decrypt — e.g. the
    model registry can skip rows when encryption is unconfigured in dev.
    """
    try:
        _master_key()
        return True
    except VaultError:
        return False


def decrypt_secret(
    ciphertext_b64: str,
    nonce_b64: str,
    key_id: str | int | None = None,  # noqa: ARG001 — reserved for rotation
) -> dict[str, str]:
    """Decrypt a ``model_secrets`` row and return the secret payload.

    Tries the current master key first, then every legacy key in order.
    A ``CryptoError`` from any single key is swallowed and the next key
    is tried — only after all keys fail do we raise ``VaultError``.

    ``key_id`` is accepted for forward-compat with a rotation index but
    intentionally unused today: the TS impl picks the right key by
    trial-and-error too, and the ``version`` column on ``model_secrets``
    is metadata only.
    """
    try:
        ct = b64decode(ciphertext_b64)
        nonce = b64decode(nonce_b64)
    except Exception:  # noqa: BLE001 — propagate as VaultError, lose detail on purpose
        raise VaultError("decrypt failed") from None

    for key in (_master_key(), *_legacy_keys()):
        box = SecretBox(key)
        try:
            plaintext = box.decrypt(ct, nonce=nonce)
        except CryptoError:
            continue
        try:
            obj = json.loads(plaintext.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            # Successful AEAD but bad payload shape — somebody encrypted
            # garbage with the right key. Refuse rather than guess.
            raise VaultError("decrypt failed") from exc
        if not isinstance(obj, dict):
            raise VaultError("decrypt failed")
        # Coerce values to str — TS always serializes string values, but
        # be defensive in case a future TS bug stores non-strings.
        return {str(k): str(v) for k, v in obj.items()}

    raise VaultError("decrypt failed")


def encrypt_secret(payload: dict[str, str]) -> tuple[str, str]:
    """Encrypt a payload with the current master key.

    Returns ``(ciphertext_b64, nonce_b64)``. Exists for round-trip
    parity tests and ad-hoc fixture generation; production code in
    ``agent_search`` only ever decrypts. Encryption stays in
    Express/TS for now (writes go through ``apps/api``).
    """
    from base64 import b64encode

    box = SecretBox(_master_key())
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encrypted = box.encrypt(raw)
    return (
        b64encode(encrypted.ciphertext).decode("ascii"),
        b64encode(encrypted.nonce).decode("ascii"),
    )


__all__ = ["VaultError", "decrypt_secret", "encrypt_secret", "is_configured"]
