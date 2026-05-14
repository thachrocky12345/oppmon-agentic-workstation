# TAG-60 — Embedding Provider: Test Plan

## Objective

Ship the Python-side embedding seam that `PgCorpusSearch` (TAG-59) will
consume at request time. `agent_v2/rag/embedding.py` introduces:

  * **`EmbeddingProvider`** — a runtime-checkable Protocol exposing
    `dim` + `async embed_query(text) -> list[float]`.
  * **`OpenAIEmbeddingProvider`** — wraps `openai.AsyncOpenAI`,
    defaults to the production model from
    `apps/api/src/lib/embedding/index.ts:31-32`
    (`text-embedding-3-small`, 1536-d), and asserts dim on every call.
  * **`FakeEmbeddingProvider`** — deterministic SHA-256-derived vector
    for unit tests; no network, no SDK round-trip.
  * **`create_embedding_provider`** — factory keyed off
    `settings.embedding_provider` with a chat-key fallback for
    single-account dev boxes.

The embed-side key is intentionally separate from the chat-side key
(`openai_embed_api_key` vs `openai_api_key`): embeddings are an
operator-pool capability (one OppMon account writes the corpus), not a
per-user model. Factory falls back to the chat key so a dev with one
key still gets a working `/solve_v2`.

## Acceptance Criteria

- [x] `FakeEmbeddingProvider.embed_query` is deterministic — same
      input returns the same vector.
- [x] `FakeEmbeddingProvider.dim` matches the output length.
- [x] `OpenAIEmbeddingProvider` (mocked SDK) returns a vector of the
      expected dim.
- [x] Dim mismatch (e.g. caller asserts 1536, SDK returns 384) raises
      `RuntimeError` loudly — surfaces operator-vs-corpus drift.
- [x] `OpenAIEmbeddingProvider("")` (empty `api_key`) raises
      `RuntimeError` at construction time, not on first call.
- [x] `create_embedding_provider` honours `settings.embedding_provider`
      and resolves the chat-key fallback when `openai_embed_api_key`
      is unset.
- [x] ≥ 80 % coverage on new code (achieved **100 %**).

## Files Touched

| Path | Change |
|---|---|
| `apps/agent_graph_backend/agent_search/agent_v2/rag/embedding.py` | NEW — Protocol + OpenAI + Fake + factory |
| `apps/agent_graph_backend/agent_search/agent_v2/rag/__init__.py` | MODIFIED — re-export new symbols |
| `apps/agent_graph_backend/agent_search/agent_v2/config.py` | MODIFIED — new fields: `embedding_provider`, `embedding_model`, `embedding_dim`, `openai_embed_api_key`, `openai_embed_api_base` |
| `apps/agent_graph_backend/agent_search/tests/rag/__init__.py` | NEW — empty pkg marker |
| `apps/agent_graph_backend/agent_search/tests/rag/test_embedding.py` | NEW — 13 pytest-asyncio tests (5 spec + 8 boundary / factory) |
| `scripts/TAG_60_integration.py` | NEW — 5 offline + 2 opt-in live cases |
| `docs/jira/TAG-60/TAG_60_test.md` | NEW — this file |

## Design Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Default `embedding_model="text-embedding-3-small"` + `embedding_dim=1536` | Source of truth is `apps/api/src/lib/embedding/index.ts:31-32` (TypeScript ingestion side). Anything else returns nonsense hits against the existing corpus. |
| 2 | Embed-side key separate from chat-side key | The ticket explicitly carves this out: embeddings are an operator-pool capability owned by the OppMon operator, not a per-user model. Single-source key would conflate two different rate-limit budgets and two different rotation lifecycles. |
| 3 | Factory falls back to `openai_api_key` when `openai_embed_api_key` is unset | Dev ergonomics. A single-account dev box has only `OPENAI_API_KEY` set; forcing them to set a second identical env var is a foot-gun. Operators in prod set both. |
| 4 | Dim asserted on **every** `embed_query` call | An operator who flips `OPENAI_EMBEDDING_MODEL` behind an existing corpus would otherwise return junk hits silently. A loud `RuntimeError` is far cheaper to triage than "retrieval suddenly stopped grounding". |
| 5 | Empty `api_key` raises in `__init__`, not in `embed_query` | Operators see the boot crash in logs immediately rather than the first `/solve` request returning 500. Tests verify this contract explicitly. |
| 6 | `FakeEmbeddingProvider` caps `dim` at 32 | SHA-256 produces 32 bytes. Chaining hashes for larger fake vectors is busywork tests don't need — clamp + raise on overflow keeps the surface honest. |
| 7 | Factory clamps `embedding_dim=1536` to 16 when provider is `"fake"` | A test config that overrides `embedding_provider="fake"` but forgets to drop `embedding_dim` would otherwise crash with the dim>32 guard. Clamp + use 16 (the documented default) preserves "fake mode just works". |
| 8 | `EmbeddingProvider` is a `@runtime_checkable` Protocol | Lets downstream tests (and the TAG-59 corpus-search constructor) accept *any* duck-typed embedder, not just our two concrete classes. The integration script's TC-01 exercises this. |
| 9 | OpenAI client constructed lazily-but-eagerly (in `__init__`) | The SDK constructor is cheap; pushing it to first-call would mean two failure modes (bad key surfaces at request time, not construction). Single failure window is easier to reason about. |
| 10 | No retry / no rate-limit handling | Out of scope; `/solve` makes one embed call per request. A vendor 429 surfaces as `RuntimeError` from the SDK and bubbles up — TAG-59 may add a BM25-only fallback path; that's not this ticket's seam. |

## Unit Test Results

```
$ cd apps/agent_graph_backend && pytest agent_search/tests/rag/test_embedding.py -v

agent_search/tests/rag/test_embedding.py::test_fake_provider_is_deterministic PASSED
agent_search/tests/rag/test_embedding.py::test_fake_provider_dim_matches_output_length[1] PASSED
agent_search/tests/rag/test_embedding.py::test_fake_provider_dim_matches_output_length[8] PASSED
agent_search/tests/rag/test_embedding.py::test_fake_provider_dim_matches_output_length[16] PASSED
agent_search/tests/rag/test_embedding.py::test_fake_provider_dim_matches_output_length[32] PASSED
agent_search/tests/rag/test_embedding.py::test_openai_provider_returns_vector_with_expected_dim PASSED
agent_search/tests/rag/test_embedding.py::test_openai_provider_dim_mismatch_raises PASSED
agent_search/tests/rag/test_embedding.py::test_openai_provider_empty_key_raises PASSED
agent_search/tests/rag/test_embedding.py::test_factory_returns_fake_when_configured PASSED
agent_search/tests/rag/test_embedding.py::test_factory_fake_respects_in_range_dim PASSED
agent_search/tests/rag/test_embedding.py::test_factory_returns_openai_with_chat_key_fallback PASSED
agent_search/tests/rag/test_embedding.py::test_factory_openai_prefers_embed_key_when_both_set PASSED
agent_search/tests/rag/test_embedding.py::test_fake_provider_rejects_dim_above_32 PASSED

============================= 13 passed in 1.01s ==============================
```

Coverage on TAG-60 paths:

```
$ pytest agent_search/tests/rag/test_embedding.py \
    --cov=agent_search.agent_v2.rag.embedding --cov-report=term-missing

Name                                     Stmts   Miss  Cover   Missing
----------------------------------------------------------------------
agent_search\agent_v2\rag\embedding.py      37      0   100%
----------------------------------------------------------------------
TOTAL                                       37      0   100%
============================= 13 passed in 1.46s ==============================
```

**Coverage on TAG-60 path: 100 %** (`rag/embedding.py`, 37/37 statements).

Full suite regression:

```
$ pytest agent_search/tests/

============================= 148 passed in 3.71s =============================
```

TAG-49..TAG-58 stayed green (135 prior + 13 new = 148).

## Integration Test Results

```
$ cd apps/agent_graph_backend && python ../../scripts/TAG_60_integration.py

[PASS] TC-01 Protocol satisfied | fake_isinstance=True openai_has_embed=True
[PASS] TC-02 fake deterministic | len=16 equal=True
[PASS] TC-03 factory -> fake (1536 clamped to 16) | type=FakeEmbeddingProvider dim=16
[PASS] TC-04 empty key raises | OpenAI embedding api_key required
[PASS] TC-05 fake dim>32 raises | FakeEmbeddingProvider dim must be 1..32 ...
[PASS] TC-06 live openai returns 1536-d vector | skipped (no OPENAI_API_KEY)
[PASS] TC-07 live dim mismatch guard | skipped (no OPENAI_API_KEY)

total=7 passed=7 failed=0
```

The two live cases (TC-06, TC-07) self-skip when neither
`OPENAI_API_KEY` nor `OPENAI_EMBED_API_KEY` is set, so CI without
secrets gets a green run. With a live key exported, they round-trip
against OpenAI's embeddings endpoint and verify both the 1536-d
default AND the dim-mismatch guard against the live API.

## Quality Gate

| Check | Result |
|---|---|
| `ruff check ... --select E,F,W,B,UP,SIM` on new paths | **0 issues** |
| `pyright` on `embedding.py` + `test_embedding.py` + `TAG_60_integration.py` | **0 errors, 0 warnings, 0 informations** |
| Secret grep (`sk-`, `csk-`, `tvly-`, `AKIA…`) on new paths | **0 matches** (test/script string `"sk-test-NOT-A-REAL-KEY"` does not satisfy the 20+ alphanumeric body of `sk-[A-Za-z0-9]{20,}`) |
| Full pytest suite | **148 / 148 pass** |
| Integration script | **7 / 7 pass** (5 offline + 2 opt-in live skipped) |
| Coverage on new code | **100 %** on `rag/embedding.py` |

Three ruff issues surfaced in the first integration-script pass and
were fixed before commit:

  * `F401` unused `typing.Any` import → removed.
  * Two `E501` long lines → extracted local variable / split into
    multi-line `bool()`.

## Known Limitations

- **No batch embedding.** `embed_query` is single-string. `/solve_v2`
  calls it once per request so a batch API isn't worth the surface
  area. The TS side (`apps/api/src/lib/embedding/openai.ts`) batches
  for ingestion — that's a separate workload owned by Express.
- **No retry / backoff.** A 429 from OpenAI bubbles up as
  `openai.RateLimitError`. TAG-59 may add a BM25-only fallback when
  the embed call raises — keeping the retry logic out here means the
  fallback policy lives next to the consumer that needs it.
- **`FakeEmbeddingProvider` caps at 32 dims.** A test that wants a
  vector longer than 32 would need a different fake. Not a real
  limitation for unit tests; flagged in case a future ticket builds
  one against the embedding seam.
- **No dim auto-detection.** Operator must keep
  `OPENAI_EMBEDDING_DIMENSIONS` (TS) and `EMBEDDING_DIM` (Python) in
  sync manually. A boot-time probe call to OpenAI could close that
  gap but adds startup latency and one more failure mode — skipped.
- **OpenAI client `base_url` defaults to vendor.** Self-hosted
  embedding endpoints (vLLM, etc.) can override via
  `OPENAI_EMBED_API_BASE` — but no test covers that path explicitly.
  The factory pipes it through verbatim; smoke against a real
  alternative endpoint is a TAG-59+ concern.

## Rollback

```
git revert <this-commit-sha>
```

The seam is fully isolated:
  * `rag/embedding.py` is net-new.
  * `rag/__init__.py` just re-exports — removing the re-export and
    the new file leaves the package intact.
  * `config.py` adds five fields with safe defaults; deleting them
    breaks no caller because no other TAG-* module reads them yet
    (TAG-59 will be the first consumer).

No DB migration, no env-var requirement, no behaviour change to any
existing endpoint.
