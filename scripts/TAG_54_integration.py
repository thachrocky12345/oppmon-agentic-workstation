#!/usr/bin/env python
"""TAG-54 integration smoke — cross-language secret vault round-trip.

Proves the ciphertext format written by ``apps/api/src/crypto/secret-vault.ts``
(via ``tweetnacl.secretbox``) decrypts byte-for-byte in
``agent_v2.crypto.vault`` (via PyNaCl ``SecretBox``).

The Node helper at ``apps/agent_graph_backend/scripts/encrypt_fixture.mjs``
encrypts a payload with the same master key and prints
``{ciphertext, nonce, plaintext}``. This script:

  1. Picks a random 32-byte master key.
  2. For each fixture payload, invokes the Node helper to encrypt.
  3. Feeds (ciphertext, nonce) to ``decrypt_secret`` and asserts the
     returned dict equals the fixture's ``plaintext``.

Negative cases (wrong key, truncated ciphertext, missing env) live in
the pytest suite — they don't need the Node helper to be meaningful.
This script is exclusively about cross-language parity, which is the
one thing pytest cannot prove on its own.

Run from repo root::

    node --version    # any v18+ works
    python scripts/TAG_54_integration.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from base64 import b64encode
from pathlib import Path
from secrets import token_bytes

# Make agent_search importable when running from repo root.
_ROOT = Path(__file__).resolve().parents[1]
_BACKEND = _ROOT / "apps" / "agent_graph_backend"
_NODE_HELPER = _BACKEND / "scripts" / "encrypt_fixture.mjs"

if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Establish a master key BEFORE Settings is constructed.
_TEST_KEY_B64 = b64encode(token_bytes(32)).decode("ascii")
os.environ["TAG_ENCRYPTION_MASTER_KEY"] = _TEST_KEY_B64

from agent_search.agent_v2.config import settings  # noqa: E402
from agent_search.agent_v2.crypto import decrypt_secret  # noqa: E402

# Settings was loaded at import time; patch in-process to avoid env races.
settings.tag_encryption_master_key = _TEST_KEY_B64
settings.tag_encryption_legacy_keys = ""


def _node_encrypt(payload: dict[str, str]) -> tuple[str, str, dict[str, str]]:
    """Invoke the Node helper to encrypt ``payload`` with the test key.

    Uses raw bytes I/O (no ``text=True``) so unicode payloads survive
    the Windows console code page. Node's argv on Windows is UTF-16
    when passed bytes, and the JSON we parse back is always UTF-8.
    """
    env = {**os.environ, "TAG_ENCRYPTION_MASTER_KEY": _TEST_KEY_B64}
    proc = subprocess.run(  # noqa: S603 — args are constants from this file
        ["node", str(_NODE_HELPER), json.dumps(payload)],  # noqa: S607 — node on PATH
        capture_output=True,
        env=env,
        timeout=15,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"node helper failed (rc={proc.returncode}): "
            f"{proc.stderr.decode('utf-8', errors='replace').strip()}"
        )
    data = json.loads(proc.stdout.decode("utf-8"))
    return data["ciphertext"], data["nonce"], data["plaintext"]


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # --- TC-01 ----------------------------------------------------------

    def tc01_node_helper_runs(self) -> None:
        try:
            ct, nonce, plain = _node_encrypt({"api_key": "sk-tc01"})
            ok = bool(ct) and bool(nonce) and plain == {"api_key": "sk-tc01"}
            detail = f"ct={len(ct)}b nonce={len(nonce)}b"
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"node helper error: {exc}"
        self.rows.append(("Node fixture helper runs", ok, detail))

    # --- TC-02 ----------------------------------------------------------

    def tc02_ts_ciphertext_decrypts_in_python(self) -> None:
        try:
            ct, nonce, expected = _node_encrypt({"api_key": "hello"})
            got = decrypt_secret(ct, nonce)
            ok = got == expected
            detail = f"got={got}" if ok else f"got={got} expected={expected}"
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"decrypt error: {exc}"
        self.rows.append(("TS ciphertext decrypts in Python", ok, detail))

    # --- TC-03 ----------------------------------------------------------

    def tc03_multi_field_payload_round_trips(self) -> None:
        payload = {
            "api_key": "sk-multi",
            "org_id": "org_42",
            "project": "proj_alpha",
        }
        try:
            ct, nonce, expected = _node_encrypt(payload)
            got = decrypt_secret(ct, nonce)
            ok = got == expected
            detail = f"fields={sorted(got.keys())}" if ok else f"got={got}"
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"error: {exc}"
        self.rows.append(("Multi-field payload round-trips", ok, detail))

    # --- TC-04 ----------------------------------------------------------

    def tc04_unicode_value_round_trips(self) -> None:
        # Unicode payload kept in the variable but the `detail` output
        # stays ASCII so the Windows cp1252 console doesn't choke.
        payload = {"api_key": "sk-caf\u00e9-\u00fcn\u00efcode-\u2713"}
        try:
            ct, nonce, expected = _node_encrypt(payload)
            got = decrypt_secret(ct, nonce)
            ok = got == expected
            detail = "unicode preserved" if ok else "MISMATCH (see test for payload)"
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"error: {type(exc).__name__}"
        self.rows.append(("Unicode value round-trips", ok, detail))

    # --- TC-05 ----------------------------------------------------------

    def tc05_each_encrypt_uses_fresh_nonce(self) -> None:
        """tweetnacl.randomBytes must produce a fresh nonce per call,
        otherwise we have a key-reuse catastrophe. Encrypt the same
        payload twice and assert the nonces differ."""
        try:
            ct1, nonce1, _ = _node_encrypt({"api_key": "sk-nonce"})
            ct2, nonce2, _ = _node_encrypt({"api_key": "sk-nonce"})
            ok = nonce1 != nonce2 and ct1 != ct2
            detail = "nonces differ" if ok else "REUSED NONCE — CRITICAL"
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"error: {exc}"
        self.rows.append(("Fresh nonce per encrypt", ok, detail))

    # --- TC-06 ----------------------------------------------------------

    def tc06_wrong_python_key_rejects_ts_ciphertext(self) -> None:
        """Rotate the Python master key without updating legacy keys —
        the TS-emitted ciphertext must fail to decrypt with a clean
        VaultError, not silently return garbage."""
        ct, nonce, _ = _node_encrypt({"api_key": "sk-rotate"})
        bad_key = b64encode(token_bytes(32)).decode("ascii")
        old_primary = settings.tag_encryption_master_key
        settings.tag_encryption_master_key = bad_key
        try:
            decrypt_secret(ct, nonce)
            ok, detail = False, "decrypt succeeded with WRONG KEY"
        except Exception as exc:  # noqa: BLE001
            ok = type(exc).__name__ == "VaultError"
            detail = f"{type(exc).__name__}: {exc}"
        finally:
            settings.tag_encryption_master_key = old_primary
        self.rows.append(("Wrong key -> VaultError", ok, detail))

    # --- TC-07 ----------------------------------------------------------

    def tc07_legacy_key_rotation_path(self) -> None:
        """After rotation: new primary + old primary in legacy list →
        ciphertext written under the OLD key still decrypts."""
        ct, nonce, expected = _node_encrypt({"api_key": "sk-legacy"})
        new_primary = b64encode(token_bytes(32)).decode("ascii")
        old_primary = settings.tag_encryption_master_key
        try:
            settings.tag_encryption_master_key = new_primary
            settings.tag_encryption_legacy_keys = old_primary
            got = decrypt_secret(ct, nonce)
            ok = got == expected
            detail = "legacy key path worked" if ok else f"got={got}"
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"error: {exc}"
        finally:
            settings.tag_encryption_master_key = old_primary
            settings.tag_encryption_legacy_keys = ""
        self.rows.append(("Legacy key rotation path", ok, detail))

    # --- runner ---------------------------------------------------------

    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name}  {detail}")
        print(
            f"\ntotal={len(self.rows)} passed={passed} "
            f"failed={len(self.rows) - passed}"
        )
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
