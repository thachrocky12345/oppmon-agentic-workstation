# TAG-56 — `LLMSpec` Pydantic Schema + `build_client` Adapter: Test Plan

## Objective

Add a typed wire contract — `LLMSpec` — between the model-registry /
auth-resolution layer (TAG-55 + TAG-57+) and the LLM factory shipped in
TAG-49. The schema must guarantee:

1. `api_key` is impossible to leak through `repr`, `model_dump`, or
   `model_dump_json` — it's a `SecretStr`, masked everywhere except the
   single `build_client` unwrap.
2. `provider` is a closed `Literal`. A typo (`"anthrpic"`) fails at
   construction, not deep inside the factory's branch ladder.
3. Key-required providers with empty keys fail at construction time, not
   on first HTTP call.
4. Extra fields (`api_keyy`) are rejected (`extra="forbid"`) so a
   misspelled registry column surfaces as a validation error.

`build_client(spec)` is the single public adapter from `LLMSpec` to a
constructed `LLMClient`. It is the only place
`api_key.get_secret_value()` is called.

## Acceptance Criteria

- [x] `LLMSpec` defined with `provider`, `model`, `api_key (SecretStr)`,
      `api_base`, `extra_headers`, `max_tokens`, `timeout`.
- [x] `Provider` is a closed `Literal` covering every shipped client
      plus the un-ported ones (`azure_openai`, `bedrock`, `ollama`) so
      registry rows validate.
- [x] `extra="forbid"` rejects unknown fields.
- [x] `@model_validator(mode="after")` rejects empty `api_key` for
      key-required providers; allows it for `fake` / `ollama`.
- [x] `repr(spec)` / `model_dump()` / `model_dump_json()` mask the key.
- [x] `build_client(spec)` unwraps the secret once, hands it to
      `create_llm_client_from_spec`, and returns the constructed client.
- [x] Un-ported providers raise a clear `ValueError` from
      `build_client`, not a silent succeed.

## Files Touched

| Path | Change |
|---|---|
| `apps/agent_graph_backend/agent_search/agent_v2/llm/spec.py` | NEW — `LLMSpec`, `Provider`, `build_client`, `_KEYLESS_PROVIDERS` |
| `apps/agent_graph_backend/agent_search/agent_v2/llm/__init__.py` | MODIFIED — re-export `LLMSpec`, `Provider`, `build_client` |
| `apps/agent_graph_backend/agent_search/tests/llm/__init__.py` | NEW — empty package marker |
| `apps/agent_graph_backend/agent_search/tests/llm/test_spec.py` | NEW — 21 unit tests |
| `scripts/TAG_56_integration.py` | NEW — 8-case static smoke (no DB / no network) |
| `docs/jira/TAG-56/TAG_56_test.md` | NEW — this file |

## Design Decisions

| # | Decision | Why |
|---|---|---|
| 1 | `api_key: SecretStr = Field(default=SecretStr(""))` instead of `str` | `SecretStr.__repr__` masks; `model_dump`/`_json` emit `'**********'`. The only legitimate unwrap is `build_client` — and it's audited. |
| 2 | `Provider` keeps `azure_openai`, `bedrock`, `ollama` in the `Literal` despite no factory branch | Registry rows that reference them validate cleanly. `build_client` will fail-fast with `ValueError` from the factory's existing `Unknown provider` arm — the error message names the provider so the operator sees exactly which port is missing. |
| 3 | `_KEYLESS_PROVIDERS = frozenset({"ollama", "fake"})` shared between validator and tests | Single source of truth. A new keyless provider only needs one place updated. |
| 4 | Validator runs `mode="after"` and raises `ValueError` (not `RuntimeError`) | Pydantic converts the `ValueError` into a `ValidationError` automatically, keeping the error type uniform with every other constraint failure. Callers catch `ValidationError`, not a hybrid. |
| 5 | `extra="forbid"` instead of `"ignore"` | A typo in a registry row (`api_keyy`) silently dropping would be a security footgun (no key set, registered model unusable, hard to debug). Forbid surfaces it at construction. |
| 6 | `extra_headers` accepted on the spec but not plumbed into clients yet | TAG-49 audit captured this as a port-pending gap. Keeping the field forward-compat avoids a breaking change when the per-client plumbing lands. The current `build_client` simply drops it — documented in the docstring. |
| 7 | `build_client` is in the same module as `LLMSpec` | Keeps the only `get_secret_value()` call in one auditable place. A `grep get_secret_value agent_v2/` should always return exactly one hit. |
| 8 | Test file lives at `agent_search/tests/llm/test_spec.py` (new dir) | First test under `llm/`; matches the existing `tests/<package>/test_<module>.py` convention seen in `tests/db/`, `tests/auth/`, `tests/crypto/`. |
| 9 | Integration script is static (no DB, no env) | TAG-56 is library-only — the seam is `import` + `construct` + `build_client`. A network-dependent script would add noise without proving anything additional. |
| 10 | Cerebras attr assertion uses private `_model` / `_max_tokens` | TAG-49's `CerebrasClient` stores these as underscore-prefixed instance vars; there's no public accessor. Asserting on the private name is the cheapest pass-through proof we have without changing the client. |

## Unit Test Results

```
$ cd apps/agent_graph_backend && pytest agent_search/tests/llm/test_spec.py -v

agent_search/tests/llm/test_spec.py::test_repr_does_not_contain_plaintext_key PASSED
agent_search/tests/llm/test_spec.py::test_model_dump_masks_key PASSED
agent_search/tests/llm/test_spec.py::test_model_dump_json_masks_key PASSED
agent_search/tests/llm/test_spec.py::test_get_secret_value_returns_plaintext PASSED
agent_search/tests/llm/test_spec.py::test_empty_api_key_rejected_for_anthropic PASSED
agent_search/tests/llm/test_spec.py::test_empty_api_key_rejected_for_openai PASSED
agent_search/tests/llm/test_spec.py::test_empty_api_key_rejected_for_cerebras PASSED
agent_search/tests/llm/test_spec.py::test_empty_api_key_ok_for_fake PASSED
agent_search/tests/llm/test_spec.py::test_empty_api_key_ok_for_ollama PASSED
agent_search/tests/llm/test_spec.py::test_unknown_provider_rejected_by_literal PASSED
agent_search/tests/llm/test_spec.py::test_extra_fields_forbidden PASSED
agent_search/tests/llm/test_spec.py::test_defaults_applied PASSED
agent_search/tests/llm/test_spec.py::test_build_client_anthropic_returns_anthropic_client PASSED
agent_search/tests/llm/test_spec.py::test_build_client_cerebras_returns_cerebras_client PASSED
agent_search/tests/llm/test_spec.py::test_build_client_openai_with_api_base_override PASSED
agent_search/tests/llm/test_spec.py::test_build_client_openai_compatible_alias PASSED
agent_search/tests/llm/test_spec.py::test_build_client_fake_no_key_required PASSED
agent_search/tests/llm/test_spec.py::test_build_client_unported_provider_raises[azure_openai] PASSED
agent_search/tests/llm/test_spec.py::test_build_client_unported_provider_raises[bedrock] PASSED
agent_search/tests/llm/test_spec.py::test_build_client_unported_provider_raises[ollama] PASSED
agent_search/tests/llm/test_spec.py::test_build_client_passes_through_max_tokens_and_timeout PASSED

============================= 21 passed in 2.27s ==============================
```

Full suite (regression):

```
$ pytest agent_search/tests/ --cov=agent_search/agent_v2/llm --cov-report=term-missing

Name                                            Stmts   Miss  Cover   Missing
-----------------------------------------------------------------------------
agent_search\agent_v2\llm\__init__.py               5      0   100%
agent_search\agent_v2\llm\base.py                  30      0   100%
agent_search\agent_v2\llm\cerebras_client.py        7      0   100%
agent_search\agent_v2\llm\spec.py                  24      0   100%
...
============================= 114 passed in 4.77s =============================
```

**Coverage on TAG-56 paths: 100 %** (`spec.py`, `llm/__init__.py`).
Uncovered lines elsewhere in `llm/` belong to TAG-49's client
implementations and are out of scope for this ticket.

## Integration Test Results

```
$ cd apps/agent_graph_backend && python ../../scripts/TAG_56_integration.py

[PASS] TC-01 imports clean | LLMSpec/Provider/build_client on public surface
[PASS] TC-02 secret hygiene | repr / model_dump / model_dump_json all masked
[PASS] TC-03 keyless construction | fake + ollama construct with empty SecretStr
[PASS] TC-04 empty key rejected | anthropic/openai/cerebras/azure_openai/bedrock all rejected
[PASS] TC-05 unknown provider rejected | Literal guard fires on typo
[PASS] TC-06 extra fields rejected | extra='forbid' catches misspell
[PASS] TC-07 build_client dispatch | anthropic/cerebras/openai/openai_compatible/fake all map correctly
[PASS] TC-08 unported providers raise | azure_openai/bedrock/ollama all raise ValueError

total=8 passed=8 failed=0
```

No DB, no network, no env vars required. Runs in <1 s.

## Quality Gate

| Check | Result |
|---|---|
| `ruff check ... --select E,F,W,B,UP,SIM` on new paths | **0 issues** |
| `pyright` on `spec.py` + `test_spec.py` + `TAG_56_integration.py` | **0 errors, 0 warnings** |
| Secret grep (`sk-`, `csk-`, `tvly-`, `AKIA…`) on new paths | **0 matches** |
| Full pytest suite | **114 / 114 pass** |
| Coverage on new code | **100 %** |

## Known Limitations

- `extra_headers` is accepted on the spec but the current
  `build_client` does not plumb it through to any concrete client. This
  is forward-compat for TAG-49's gap audit; a follow-up ticket will
  thread it through each client's `__init__`.
- The `secret_version` / key-rotation story is not part of TAG-56 —
  `LLMSpec.api_key` holds the resolved plaintext for a single
  construction. Rotation belongs upstream in the registry resolver
  (TAG-57+).
- `azure_openai`, `bedrock`, and `ollama` validate at the schema level
  but `build_client` raises `ValueError` (factory's `Unknown provider:`)
  because TAG-49 didn't port them. This is intentional fail-fast — the
  message names the provider so the operator can locate the missing
  client port.

## Rollback

The two new modules (`spec.py`, `tests/llm/test_spec.py`) and the
integration script are self-contained. The only seam change is the
re-export in `llm/__init__.py` — nothing else in `agent_v2` imports
`LLMSpec` yet (TAG-57+ will be the first consumer).

```
git revert <this-commit-sha>
```
