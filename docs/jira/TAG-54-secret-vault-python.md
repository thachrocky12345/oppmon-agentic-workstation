# TAG-54: Port `secret-vault.ts` to Python (pynacl)

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Decrypt provider API keys stored in `secret_vault` rows the same way
`apps/api/src/crypto/secret-vault.ts` does. Required so `agent_search` can use a
tenant's registered Anthropic / OpenAI / Cerebras / Azure / Bedrock key without
that key ever sitting in plaintext at rest.

## Objective

Function:

```python
def decrypt_secret(ciphertext_b64: str, nonce_b64: str, key_id: str) -> str
```

that takes a row's stored fields and returns the plaintext API key, with the
**same XChaCha20-Poly1305 envelope and master-key derivation** as the TS impl.

## Requirements

### Algorithm parity

`apps/api/src/crypto/secret-vault.ts` (read-only ref) uses:

- Master key from env `SECRET_VAULT_MASTER_KEY` (32 bytes, base64).
- Per-record `nonce` (24 bytes, random per encrypt) stored alongside ciphertext.
- AEAD: XChaCha20-Poly1305 (via `tweetnacl.secretbox` — actually XSalsa20-Poly1305;
  **CONFIRM** which primitive the TS impl uses before writing Python).
- Optional `key_id` for rotation (maps to a versioned master key — read the TS
  impl to confirm; if no rotation today, accept `key_id` and ignore it).

### Implementation

`agent_v2/crypto/vault.py`:

```python
from base64 import b64decode
from nacl.secret import SecretBox
from nacl.exceptions import CryptoError
from ..config import settings

class VaultError(Exception): ...

def _master_key() -> bytes:
    if not settings.secret_vault_master_key:
        raise VaultError("SECRET_VAULT_MASTER_KEY not configured")
    k = b64decode(settings.secret_vault_master_key)
    if len(k) != SecretBox.KEY_SIZE:
        raise VaultError(f"master key must be {SecretBox.KEY_SIZE} bytes")
    return k

def decrypt_secret(ciphertext_b64: str, nonce_b64: str, key_id: str | None = None) -> str:
    box = SecretBox(_master_key())
    try:
        plaintext = box.decrypt(
            b64decode(ciphertext_b64),
            nonce=b64decode(nonce_b64),
        )
    except CryptoError:
        raise VaultError("decrypt failed")
    return plaintext.decode("utf-8")
```

### Config

```python
secret_vault_master_key: str = ""   # base64, 32 bytes
```

### Dependencies

```
PyNaCl==1.5.0
```

### Round-trip parity test

The CI test that proves Python and TS interop:

1. Run a tiny Node script that calls `encryptSecret("hello")` from
   `apps/api/src/crypto/secret-vault.ts`, prints the resulting `{ciphertext, nonce}` JSON.
2. Pytest reads that JSON, calls `decrypt_secret(...)`, asserts `== "hello"`.

Place the Node helper at `apps/agent_graph_backend/scripts/encrypt_fixture.mjs`.
CI workflow runs `node ...` then `pytest tests/crypto/test_vault.py::test_decrypt_ts_ciphertext`.

## Implementation Notes

- **CONFIRM PRIMITIVE FIRST.** If the TS impl uses `crypto_secretbox` (XSalsa20),
  Python `SecretBox` matches. If TS uses XChaCha20 specifically (e.g. via
  `nacl.crypto_secretbox_xchacha20poly1305_*`), use `nacl.bindings.crypto_secretbox_xchacha20poly1305_open`
  instead. Read `secret-vault.ts` first; do not guess.
- Master key in memory: do not log, do not re-`b64encode` for traces. PyNaCl wipes
  the key when the box is garbage-collected.
- This module is the ONLY place in `agent_search` that handles plaintext API keys.
  `resolve_llm_spec` (TAG-57) decrypts once, hands the string to
  `create_llm_client_from_spec()`, and discards.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/crypto/test_vault.py` | round-trip with self-generated ciphertext | matches |
| `tests/crypto/test_vault.py` | decrypt TS-encrypted fixture | matches "hello" |
| `tests/crypto/test_vault.py` | wrong master key | `VaultError("decrypt failed")` |
| `tests/crypto/test_vault.py` | truncated ciphertext | `VaultError("decrypt failed")` |
| `tests/crypto/test_vault.py` | missing env | `VaultError("SECRET_VAULT_MASTER_KEY not configured")` |

## Acceptance Criteria

- [ ] TS-encrypted ciphertext decrypts in Python and vice versa.
- [ ] Master key never logged.
- [ ] All five tests pass in CI.
- [ ] `decrypt_secret` is the only public function exported from `agent_v2.crypto.vault`.

## Dependencies

**Blocks:** TAG-55, TAG-57
**Depends on:** none (but TAG-51 should be merged first for ordering)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Algorithm mismatch with TS | Read TS impl before coding; fail CI on round-trip mismatch. |
| Plaintext key leaked in trace/exception | `VaultError` carries no plaintext; no `repr` of plaintext anywhere. |
| Master key rotation breaks decrypts | `key_id` accepted now; rotation policy is a separate ticket. |
