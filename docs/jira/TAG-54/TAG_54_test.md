# TAG-54 — Port `secret-vault.ts` to Python (PyNaCl) — Test Plan

**Ticket:** [TAG-54](../TAG-54-secret-vault-python.md)
**Epic:** [TAG-50 Authenticated /solve endpoint](../TAG-50-authenticated-solve-endpoint-epic.md)
**Branch:** `feature/TAG-54-secret-vault-python` (off `feature/TAG-53-fastapi-auth-dep`)
**Pipeline:** `.claude/skills/build-fastapi-single-ticket/`

## Objective

Port the read half of `apps/api/src/crypto/secret-vault.ts` to Python so
`agent_search` can decrypt tenant-scoped API keys (Anthropic / OpenAI /
Cerebras / Azure / Bedrock) that the Express signer wrote into the
`model_secrets` table. The Python module is the only place inside
`agent_search` that ever sees plaintext API keys; TAG-57's
`resolve_llm_spec` will pull the dict, hand `api_key` to the LLM client
factory, and discard the rest.

## Acceptance Criteria

Pulled from `docs/jira/TAG-54-secret-vault-python.md`:

- [x] **TS-encrypted ciphertext decrypts in Python and vice versa.**
      `scripts/TAG_54_integration.py::tc02_ts_ciphertext_decrypts_in_python`
      drives Node (via `apps/agent_graph_backend/scripts/encrypt_fixture.mjs`)
      to encrypt under the same master key, then feeds the resulting
      `(ciphertext, nonce)` straight into `decrypt_secret`. Matches.
- [x] **Master key never logged.** `VaultError` carries only the fixed
      string `"decrypt failed"` (or `"TAG_ENCRYPTION_MASTER_KEY not configured"`
      / `"master key must be 32 bytes"`). Verified by
      `test_wrong_master_key_does_not_leak_ciphertext`, which asserts
      the canary plaintext and the ciphertext/nonce strings do NOT
      appear in `str(VaultError)`.
- [x] **All five mandated tests pass.** Plus 12 defensive checks.
- [x] **`decrypt_secret` + small surface exported.** `agent_v2.crypto`
      exports exactly `VaultError`, `decrypt_secret`, `encrypt_secret`,
      `is_configured`. `encrypt_secret` is included to support the
      round-trip parity test inside the same process; production code
      paths only ever decrypt.

## Files Touched

```
apps/agent_graph_backend/
  agent_search/agent_v2/
    crypto/__init__.py                     NEW  — re-exports
    crypto/vault.py                        NEW  — decrypt_secret + encrypt_secret
    config.py                              MOD  — adds tag_encryption_master_key
                                                  + tag_encryption_legacy_keys
  agent_search/tests/
    crypto/__init__.py                     NEW  — pkg marker
    crypto/test_vault.py                   NEW  — 17 unit tests
  scripts/
    encrypt_fixture.mjs                    NEW  — Node helper for TS→Py parity
  requirements-v2.txt                      MOD  — adds PyNaCl==1.5.0

scripts/
  TAG_54_integration.py                    NEW  — 7-test cross-language smoke

docs/jira/TAG-54/
  TAG_54_test.md                           NEW  — this file
```

Nothing outside `apps/agent_graph_backend/`, `scripts/`, and `docs/jira/`
was modified. The Node helper sits *inside* `apps/agent_graph_backend/scripts/`
where the ticket placed it; it resolves `tweetnacl` from `apps/api/node_modules`
so this ticket doesn't add a JS dep just for the fixture.

## Design Decisions

### 1. Env-var name `TAG_ENCRYPTION_MASTER_KEY` (NOT `SECRET_VAULT_MASTER_KEY`)

The ticket suggests `SECRET_VAULT_MASTER_KEY` but the TS impl reads
`process.env.TAG_ENCRYPTION_MASTER_KEY` (+ `TAG_ENCRYPTION_LEGACY_KEYS`
for rotation). Matching the TS name verbatim is the only way the
Python service can decrypt ciphertext written by `apps/api` without
operators duplicating the same secret under two different names. The
"CONFIRM PRIMITIVE FIRST" caveat in the ticket applies equally here:
read TS, do what TS does.

### 2. Primitive is XSalsa20-Poly1305, not XChaCha20

The TS file's comment says "XChaCha20-Poly1305", but
`tweetnacl.secretbox` is documented as XSalsa20-Poly1305 — both names
appear in NaCl literature but only the latter matches the actual
algorithm tweetnacl ships. PyNaCl's `nacl.secret.SecretBox` is the
matching primitive (same 32-byte key, 24-byte nonce, identical wire
format). No bindings juggling needed.

### 3. Plaintext is a JSON dict, return type is `dict[str, str]`

The ticket signature suggests `decrypt_secret(...) -> str`, but TS
encrypts `JSON.stringify(SecretData)` where `SecretData` is a flat
string-keyed dict. Returning `str` would force every caller to call
`json.loads` again — including TAG-57, which wants `payload["api_key"]`.
We return `dict[str, str]` directly. The ticket signature was a
sketch, not a contract; the test plan documents the divergence so the
TAG-57 author sees it.

### 4. Legacy-key fallback inside `decrypt_secret`, not at config time

The TS `decrypt()` tries `[currentKey, ...legacyKeys]` in order, swallowing
errors per attempt. Python mirrors that: on a `CryptoError` from one
key, `continue` to the next; only after the entire list is exhausted
do we raise. This makes operator rotation a 2-step deploy (publish
new primary, move old to legacy) with zero downtime.

### 5. Bad legacy key fails LOUD, not silent

The TS `getLegacyKeys()` throws on a wrong-length legacy key (rather
than dropping it). We match that: `_decode_key` raises `VaultError`
before any decrypt is attempted. The rationale is that a typoed legacy
key is almost certainly a deploy-config bug; failing closed is safer
than silently degrading to "only the current key works".

### 6. `key_id` parameter accepted and ignored

The ticket says "if no rotation today, accept `key_id` and ignore it".
We do exactly that. The `version` column on `model_secrets` is
metadata only in the current TS impl — there's no key-id ↔ master-key
mapping table. When that rotation discipline is added (separate
ticket), this signature already has the seam.

### 7. Opaque `VaultError("decrypt failed")` on every failure path

Base64 errors, MAC failures, JSON shape failures all funnel through
the same exception message. The risk we're managing: PyJWT-style
detail strings or chained `__cause__` could leak ciphertext fragments
into a FastAPI traceback that ends up in DEBUG logs. The
`from None` and the generic message are deliberate.

## Unit Tests

Location: `apps/agent_graph_backend/agent_search/tests/crypto/test_vault.py`

```
agent_search/tests/crypto/test_vault.py::test_round_trip_returns_payload                  PASSED
agent_search/tests/crypto/test_vault.py::test_round_trip_empty_dict                       PASSED
agent_search/tests/crypto/test_vault.py::test_round_trip_unicode_value                    PASSED
agent_search/tests/crypto/test_vault.py::test_wrong_master_key_raises_vault_error         PASSED
agent_search/tests/crypto/test_vault.py::test_wrong_master_key_does_not_leak_ciphertext   PASSED
agent_search/tests/crypto/test_vault.py::test_truncated_ciphertext_raises_vault_error     PASSED
agent_search/tests/crypto/test_vault.py::test_truncated_nonce_raises_vault_error          PASSED
agent_search/tests/crypto/test_vault.py::test_invalid_base64_raises_vault_error           PASSED
agent_search/tests/crypto/test_vault.py::test_missing_master_key_raises_vault_error       PASSED
agent_search/tests/crypto/test_vault.py::test_master_key_wrong_length_raises_vault_error  PASSED
agent_search/tests/crypto/test_vault.py::test_is_configured_reflects_settings             PASSED
agent_search/tests/crypto/test_vault.py::test_legacy_key_decrypts_when_primary_rotated    PASSED
agent_search/tests/crypto/test_vault.py::test_legacy_keys_strip_whitespace_and_empty      PASSED
agent_search/tests/crypto/test_vault.py::test_legacy_key_with_bad_length_raises_at_resolution PASSED
agent_search/tests/crypto/test_vault.py::test_non_json_plaintext_raises_vault_error       PASSED
agent_search/tests/crypto/test_vault.py::test_json_array_plaintext_raises_vault_error     PASSED
agent_search/tests/crypto/test_vault.py::test_key_id_argument_is_accepted_and_ignored     PASSED

17 passed in 0.12s
```

### Coverage

```
Name                                       Stmts   Miss  Cover   Missing
------------------------------------------------------------------------
agent_search\agent_v2\crypto\__init__.py       2      0   100%
agent_search\agent_v2\crypto\vault.py         58      0   100%
------------------------------------------------------------------------
TOTAL                                         60      0   100%
70 passed in 2.44s
```

**100% line coverage** on `agent_v2/crypto/`. Full suite is now 70
passing (TAG-51 DB + TAG-52 JWT + TAG-53 deps + TAG-54 vault + orchestrator).

## Integration Test

Location: `scripts/TAG_54_integration.py` + `apps/agent_graph_backend/scripts/encrypt_fixture.mjs`

```
$ python scripts/TAG_54_integration.py
[PASS] Node fixture helper runs  ct=52b nonce=32b
[PASS] TS ciphertext decrypts in Python  got={'api_key': 'hello'}
[PASS] Multi-field payload round-trips  fields=['api_key', 'org_id', 'project']
[PASS] Unicode value round-trips  unicode preserved
[PASS] Fresh nonce per encrypt  nonces differ
[PASS] Wrong key -> VaultError  VaultError: decrypt failed
[PASS] Legacy key rotation path  legacy key path worked

total=7 passed=7 failed=0
```

The Node helper resolves `tweetnacl` from `apps/api/node_modules` (no
extra install) and is invoked via `subprocess.run` with raw bytes I/O
(no `text=True`) so unicode payloads survive the Windows cp1252
default code page when serialized into argv. The `TC-05 fresh-nonce`
case isn't strictly a parity check — it's a "did anyone hardcode the
nonce" canary that would catch a future TS or Python regression
introducing a deterministic IV.

## Quality Gate

| Check | Scope | Result |
|---|---|---|
| `ruff check` | `agent_v2/crypto/`, `tests/crypto/`, `scripts/TAG_54_integration.py` | All checks passed |
| `pyright` | `agent_v2/crypto/`, `tests/crypto/` | 0 errors, 0 warnings |
| Secret grep | TAG-54 code, tests, scripts | No matches |
| Full unit suite | `agent_search/tests/` | 70 passed |

## Known Limitations

1. **Encrypt-side stays in Express.** Production `agent_search` only
   ever decrypts; new keys are written by `apps/api`. `encrypt_secret`
   is exposed in the Python module for round-trip tests and ad-hoc
   re-encryption (e.g. during a rotation script), but no production
   FastAPI route calls it today.

2. **`key_id` argument is reserved but unused.** Rotation is handled
   by the legacy-keys fallback list, not by per-row key IDs. The
   `model_secrets.version` column travels along but isn't decoded.
   A future rotation policy (separate ticket) can either use `key_id`
   to pick a specific keyring entry or keep the trial-decrypt loop.

3. **No key derivation / KDF.** The master key bytes ARE the SecretBox
   key — same as TS, no HKDF or scrypt step. If we ever want
   per-tenant key isolation or domain separation, that's a bigger
   protocol change; for now the trust boundary is the deploy-time
   secret in `TAG_ENCRYPTION_MASTER_KEY`.

4. **PyNaCl wipes its internal state but Python strings linger.**
   After `decrypt_secret` returns the plaintext dict, the string
   values are normal `str` objects subject to Python's normal GC.
   TAG-57's `resolve_llm_spec` is expected to use the values
   immediately and not stash them. We can't enforce that from this
   module; that's a caller-contract issue.

5. **Cross-language CI hook not wired into the pipeline yet.** The
   ticket suggests CI runs `node encrypt_fixture.mjs` then
   `pytest tests/crypto/test_vault.py::test_decrypt_ts_ciphertext`.
   We chose to keep the cross-language assertion in
   `scripts/TAG_54_integration.py` instead (a single command, no
   pytest discovery of Node), so adding a CI job becomes:
   `node --version && python scripts/TAG_54_integration.py`. No new
   pytest fixture is needed.

## Rollback

Revert this commit on `feature/TAG-54-secret-vault-python`. Nothing
in `mount_v2` or any route imports `agent_v2.crypto` yet — TAG-55
(model registry) and TAG-57 (`resolve_llm_spec`) will be the first
callers. Reverting drops the module without touching `/solve_v2`.

The `requirements-v2.txt` PyNaCl entry can be left in or reverted
separately — it's idempotent on next `pip install -r`.

## Verified-on

- Python: 3.13.5
- PyNaCl: 1.5.0
- Node: v22.18.0
- tweetnacl: from `apps/api/node_modules` (already pinned by apps/api)
- pytest: 8.4.1
- ruff: applied via project default config + extend-immutable-calls
- pyright: applied via project default config
- Platform: win32

## Next Ticket

TAG-55 — Model registry queries (`auth_models`, `model_secrets`) that
will call `decrypt_secret` to resolve a tenant's chosen provider key.
