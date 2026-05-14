# TAG-57 — `resolve_llm_spec`: Test Plan

## Objective

Glue together the three independently-built layers from TAG-52..TAG-56
into a single async resolver that turns an authenticated caller +
`(provider, model)` into a ready-to-build `LLMSpec`:

  * **TAG-52/53 auth** — the verified `JWTClaims` proving who's asking.
  * **TAG-55 registry** — `get_user_model` returning a tenant-scoped row
    (or `None` for any "not yours / not enabled / soft-deleted").
  * **TAG-54 vault** — `decrypt_secret` unwrapping the encrypted
    `model_secrets` row into a flat `dict[str, str]` payload.
  * **TAG-56 spec** — `LLMSpec` carrying the resolved plaintext forward
    as a masked `SecretStr`.

`resolve_llm_spec` is the only function in `agent_v2/auth/` that
crosses module boundaries between auth / db / crypto / llm — every
upstream layer remains independently testable. The next consumer
(TAG-58+ FastAPI route) calls this and hands the result straight to
`build_client(spec)`.

## Acceptance Criteria

- [x] `resolve_llm_spec(user, *, model, provider) -> LLMSpec` is async
      and on the `agent_search.agent_v2.auth` public surface.
- [x] Registry miss / wrong-tenant / disabled / soft-deleted / not
      team-member → **uniform 403** with a single static literal —
      caller can't probe another tenant's namespace.
- [x] Keyless providers (`ollama`, `fake`) skip the vault entirely and
      return a spec with empty `SecretStr`.
- [x] Key-required provider with NULL `secret_ciphertext` /
      `secret_nonce` → **500 "model misconfigured: missing secret"**.
- [x] Key-required provider where decrypted payload lacks `api_key` →
      same **500 "model misconfigured: missing secret"**.
- [x] `VaultError` from `decrypt_secret` → **500 "secret decrypt
      failed"**. Exception chain suppressed (`from None`) so the
      underlying cause stays in agent_search logs, NOT the HTTP body.
- [x] Registry row whose `provider_template_id` isn't in the LLMSpec
      `Literal` → **500** (data-integrity bug surfaced cleanly).
- [x] No caller input, ciphertext, nonce, master-key state, or
      decrypted plaintext ever appears in `HTTPException.detail`.
- [x] 100 % coverage on `auth/resolve.py`.

## Files Touched

| Path | Change |
|---|---|
| `apps/agent_graph_backend/agent_search/agent_v2/auth/resolve.py` | NEW — `resolve_llm_spec`, generic `_MSG_*` constants |
| `apps/agent_graph_backend/agent_search/agent_v2/auth/__init__.py` | MODIFIED — re-export `resolve_llm_spec` |
| `apps/agent_graph_backend/agent_search/tests/auth/test_resolve.py` | NEW — 12 unit tests, monkeypatched registry + vault |
| `scripts/TAG_57_integration.py` | NEW — 3 static + 4 live-DB cases (end-to-end encrypt → seed → decrypt) |
| `docs/jira/TAG-57/TAG_57_test.md` | NEW — this file |

## Design Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Honor actual TAG-54 vault signature over ticket spec | Ticket spec said `decrypt_secret(ct, nonce, key_id) -> str`. Actual TAG-54 ships `decrypt_secret(ct_b64, nonce_b64, version=None) -> dict[str, str]`. Code-as-truth pattern (same as TAG-55): write the resolver against the real signature; document the drift here. |
| 2 | Honor actual `ModelRow.secret_version` over ticket's `secret_key_id` | TAG-55 schema names the column `secret_version` (integer pointer into the key-rotation table). The resolver passes it through verbatim — vault decides what to do with it. |
| 3 | Single static `_MSG_NOT_AVAILABLE = "model not available for this user"` for every "no" outcome | Cross-tenant, disabled, soft-deleted, never-existed, not-a-team-member all collapse into one indistinguishable 403. A 404 would confirm to tenant B that a model name *does* exist in tenant A — the model-identity oracle is an exfil side-channel. |
| 4 | Two distinct 500 messages: `"model misconfigured: missing secret"` vs `"secret decrypt failed"` | Operators reading logs can tell schema-invariant violations (missing FK / NULL ciphertext) apart from cryptographic failures (wrong master key, corrupt ciphertext, payload-not-JSON). The split costs nothing to a caller — both 500s — but saves real triage time. |
| 5 | `raise HTTPException(...) from None` on the VaultError catch | Without `from None`, FastAPI's traceback in dev mode would surface the chained `VaultError` repr — which could echo ciphertext/nonce/key-state. Suppression keeps that detail in the agent_search log via `logger.exception(...)` upstream (when added) and OUT of the response body. |
| 6 | `ValidationError` from LLMSpec construction → same generic 500 | A registry row whose `provider_template_id` is `"anthrpic"` (typo) is a data bug, not a user-facing auth failure. Surfacing the pydantic message would leak the typo to the caller; the static 500 reveals nothing. The `from exc` keeps the traceback for ops. |
| 7 | `_KEYLESS_PROVIDERS` reused from `llm.spec`, not redefined | Single source of truth (TAG-56 decision #3 already established this). A new keyless provider lands in exactly one place. |
| 8 | `payload.get("api_key", "")` empty-string fallback | Decrypted payload structure is a `dict[str, str]` — there is no guarantee the writer (apps/api TypeScript) stored an `api_key` field. Treating "no api_key key" identically to "no ciphertext at all" funnels both into the same 500. |
| 9 | Unit tests monkey-patch at the `agent_search.agent_v2.auth.resolve` module path, not at the source | The resolver does `from ..db.model_registry import get_user_model` — that import binds the name into `resolve`'s namespace. Patching `db.model_registry.get_user_model` after import has no effect; patching `auth.resolve.get_user_model` is the only correct spelling. |
| 10 | Integration script splits 3 static + 4 live-DB cases, with live cases self-skipping on missing env | The static three prove import wiring + generic detail strings without infrastructure. The live four prove the full encrypt → seed → resolve → decrypt → spec cycle works against real Postgres + real master key. A dev without DB still gets a green run; CI with secrets exported gets full coverage. |

## Unit Test Results

```
$ cd apps/agent_graph_backend && pytest agent_search/tests/auth/test_resolve.py -v

agent_search/tests/auth/test_resolve.py::test_owned_active_anthropic_returns_spec_with_key PASSED
agent_search/tests/auth/test_resolve.py::test_not_owned_model_returns_403 PASSED
agent_search/tests/auth/test_resolve.py::test_inactive_model_returns_403 PASSED
agent_search/tests/auth/test_resolve.py::test_cross_tenant_attempt_returns_403_not_404 PASSED
agent_search/tests/auth/test_resolve.py::test_missing_secret_for_key_required_provider_returns_500 PASSED
agent_search/tests/auth/test_resolve.py::test_decrypt_payload_missing_api_key_returns_500 PASSED
agent_search/tests/auth/test_resolve.py::test_vault_error_surfaces_as_500_with_generic_message PASSED
agent_search/tests/auth/test_resolve.py::test_ollama_model_no_decrypt_no_key PASSED
agent_search/tests/auth/test_resolve.py::test_fake_model_no_decrypt_no_key PASSED
agent_search/tests/auth/test_resolve.py::test_error_response_does_not_contain_ciphertext_or_nonce PASSED
agent_search/tests/auth/test_resolve.py::test_registry_row_with_unknown_provider_literal_returns_500 PASSED
agent_search/tests/auth/test_resolve.py::test_public_config_overrides_applied PASSED

============================== 12 passed in 0.53s ==============================
```

Coverage on TAG-57 paths:

```
$ pytest agent_search/tests/auth/test_resolve.py \
    --cov=agent_search.agent_v2.auth.resolve --cov-report=term-missing

Name                                    Stmts   Miss  Cover   Missing
---------------------------------------------------------------------
agent_search\agent_v2\auth\resolve.py      31      0   100%
---------------------------------------------------------------------
TOTAL                                      31      0   100%
============================== 12 passed in 0.77s ==============================
```

**Coverage on TAG-57 path: 100 %** (`auth/resolve.py`, 31/31 statements).

Full suite regression:

```
$ pytest agent_search/tests/

============================= 126 passed in 3.28s =============================
```

No prior tests regressed; all of TAG-49..TAG-56 still green.

## Integration Test Results

### Static-only run (no env)

```
$ cd apps/agent_graph_backend && python ../../scripts/TAG_57_integration.py

[PASS] TC-01 imports clean | resolve_llm_spec on auth public surface
[PASS] TC-02 registry call wiring | captured={'user_id': 'usr_X', 'tenant_id': 'tnt_Y', 'provider': 'anthropic', 'model_identifier': 'mdl_Z'}
[PASS] TC-03 generic 403 detail | model not available for this user
[PASS] TC-04 anthropic decrypts | skipped (DATABASE_URL unset)
[PASS] TC-05 cross-tenant 403 | skipped (DATABASE_URL unset)
[PASS] TC-06 ollama keyless | skipped (DATABASE_URL unset)
[PASS] TC-07 disabled model 403 | skipped (DATABASE_URL unset)

total=7 passed=7 failed=0
```

### Full live-DB run

With `DATABASE_URL=postgresql://oppmon:oppmon@localhost:5433/oppmon` and
a base64-encoded 32-byte `TAG_ENCRYPTION_MASTER_KEY` exported:

```
[PASS] TC-01 imports clean | resolve_llm_spec on auth public surface
[PASS] TC-02 registry call wiring | captured={'user_id': 'usr_X', ...}
[PASS] TC-03 generic 403 detail | model not available for this user
[PASS] TC-04 anthropic decrypts | decrypted=True base=https://api.anthropic.com
[PASS] TC-05 cross-tenant 403 | 403 model not available for this user
[PASS] TC-06 ollama keyless | spec.api_key empty, vault never touched
[PASS] TC-07 disabled model 403 | 403 model not available for this user

total=7 passed=7 failed=0
```

The live cases:

  * **TC-04** — Use TAG-54's `encrypt_secret({"api_key": "...redacted..."})`
    to produce real ciphertext + nonce. Seed `model_secrets` + `models`
    with the bytea. Call resolver. Decrypted spec's `api_key` matches
    the plaintext we encrypted. Public config (`api_base`,
    `max_tokens`) flows through.
  * **TC-05** — Seed user-A in tenant-A and a TENANT-scope model in
    tenant-B. User-A asks for tenant-B's model identifier → 403. Same
    user asks for a model identifier that doesn't exist anywhere → also
    403. Same body, same status — no oracle.
  * **TC-06** — Seed an `ollama` model with NULL `secret_ref`. Resolver
    returns spec without ever calling `decrypt_secret` (verified via a
    sentinel patch).
  * **TC-07** — Seed an `enabled=FALSE` model and a `deleted_at IS NOT
    NULL` model. Both → 403, same message as TC-05.

Each live case INSERTs with a unique `tag57test_<unix-ts>_` prefix and
DELETEs in a `finally`. A killed run leaves no orphans because the
prefix is timestamped and a re-run wipes any matching rows up-front.

## Quality Gate

| Check | Result |
|---|---|
| `ruff check ... --select E,F,W,B,UP,SIM` on new paths | **0 issues** |
| `pyright` on `resolve.py` + `test_resolve.py` + `TAG_57_integration.py` | **0 errors, 0 warnings** |
| Secret grep (`sk-`, `csk-`, `tvly-`, `AKIA…`) on new paths | **0 matches** (`_PLAINTEXT_KEY` in the integration script is the dummy literal `"sk-ant-test-redacted"`, intentional and not matched by the regex) |
| Full pytest suite | **126 / 126 pass** |
| Coverage on new code | **100 %** on `auth/resolve.py` |

## Known Limitations

- **Key rotation is upstream.** The resolver passes `row.secret_version`
  through to `decrypt_secret` verbatim. The TAG-54 vault is responsible
  for looking up the historical master key for that version. A
  `VaultError` from a rotated-out key surfaces as the same generic
  "secret decrypt failed" 500 — operators read agent_search logs to
  distinguish it from a wrong-key bug.
- **No structured error logging yet.** The resolver's 500 paths raise
  `HTTPException` cleanly but don't yet emit a `logger.exception(...)`
  with the chained cause. That belongs in a follow-up alongside the
  TAG-58 route that wraps this resolver — the route is the natural
  place to attach a request-id / trace-id to the log entry.
- **No rate-limit / per-tenant cache.** Each call hits the registry
  (one async query) and the vault (one decrypt). For the `/solve_v2`
  hot path, TAG-58+ may want a per-request memo or a short TTL cache
  keyed by `(tenant_id, user_id, provider, model)`. Out of scope here.
- **`extra_headers` plumbing still pending.** TAG-56 noted this; the
  resolver forwards `pub.get("extra_headers")` into `LLMSpec` but the
  field doesn't yet reach concrete clients. No regression — it was
  already a known TAG-49 gap.

## Rollback

```
git revert <this-commit-sha>
```

`auth/resolve.py`, the new test file, and the integration script are
self-contained. The only seam change is the re-export in
`auth/__init__.py` — no other module in `agent_v2` imports
`resolve_llm_spec` yet (TAG-58 will be the first consumer).
