# TAG-64: Integration Tests + Eval Entries for /solve — Test Plan

**Type:** Test Plan
**Status:** Draft
**Author:** TAG-64 build session
**Date:** 2026-05-14
**Ticket:** [docs/jira/TAG-64-eval-and-integration.md](../TAG-64-eval-and-integration.md)
**Branch:** `feature/TAG-64-integration-eval`
**Base commit:** `ca14dcc` (TAG-60 landed)

---

## Objective

TAG-64 closes the integration-and-evaluation gap for the corpus-search
chat path delivered across TAG-58 → TAG-63. It ships:

1. A **deterministic, in-process integration suite** (`agent_search/tests/integration/`)
   that drives the real FastAPI app via `httpx.ASGITransport`, replaces the
   `PgCorpusSearch` impl with a recorded `StubCorpus`, and pins
   `LLMClient` to `FakeLLMClient.scripted(...)`. 12 test cases cover the
   wire contract (`/solve_v2` snapshot regression), auth (401/401/403),
   request validation (422), mode dispatch (corpus / web / hybrid-skip /
   hybrid-fallthrough), refusal-text fidelity, citation emission, and the
   two secret-handling invariants (canary not in logs, canary not in
   error frames).
2. A **Postgres-bound cross-tenant SQL test** (`test_cross_tenant_model_403_with_db`)
   gated behind `requires_postgres` so the hermetic suite stays
   sandbox-safe while CI can opt into a real database by setting
   `DATABASE_URL` and seeding `fixtures/seed_two_tenants.sql`.
3. An **out-of-process integration smoke** (`scripts/TAG_64_integration.py`)
   that verifies the test surface itself before merge — imports stable,
   seed SQL present, encrypted fixture parses, SSE snapshot bookends
   stable, eval extension well-formed, all 12 ticket cases discoverable,
   no secret-shaped strings on the new test surface, and the CI workflow
   wires pytest correctly.
4. A **corpus-mode eval extension** (`evals/corpus-questions.json`) with
   5 grounded entries (citations required) and 5 OOD entries (verbatim
   refusal required), ready for the offline judge to score against the
   gates in `docs/jira/TAG-64-eval-and-integration.md`
   (citation precision ≥ 0.95; refusal recall ≥ 0.90).
5. A **CI workflow** (`.github/workflows/agent-search-tests.yml`) that
   gates merges to `main` on the hermetic pytest path, the
   out-of-process smoke, ruff on the new test surface, and a regex
   secret-grep with the documented canary allow-list. A second
   `workflow_dispatch`-only job runs the full Postgres-backed path
   against a `pgvector/pgvector:pg16` service container.

No production code in `agent_search/agent_v2/` is touched by this
ticket — TAG-64 is test infrastructure only.

## Acceptance Criteria Verification

Mirrors the AC table in `docs/jira/TAG-64-eval-and-integration.md`.

- [x] **AC1 — Integration suite covers 12 cases end-to-end.**
      `agent_search/tests/integration/test_solve_e2e.py::test_tc01..test_tc12`.
      All pass against the patched in-process app
      (`12 passed, 1 skipped`).
- [x] **AC2 — /solve_v2 SSE shape preserved.**
      `test_tc01_solve_v2_sse_shape_unchanged` snapshots event types
      against `snapshots/solve_v2.json` (`planner:STREAM_ING →
      planner:ANSWER_ING → planner:END`).
- [x] **AC3 — Auth gating (401 unauthenticated, 401 bad-JWT, 403
      cross-tenant).**
      `test_tc02_solve_no_auth_returns_401`,
      `test_tc03_solve_bad_jwt_returns_401`,
      `test_tc04_cross_tenant_model_returns_403_generic`. The 403 test
      additionally asserts the body is the generic
      `_MSG_NOT_AVAILABLE` text and does not leak `"not found"` /
      `"does not exist"`.
- [x] **AC4 — Mode-dispatch invariants.**
      `test_tc05_no_grounding_source_returns_422` (web_fallback=false +
      collection_ids=[] ⇒ 422);
      `test_tc06_corpus_mode_returns_citations` (corpus path emits
      `[[doc:chunk]]`);
      `test_tc08_web_mode_matches_solve_v2_shape` (web path SSE parity);
      `test_tc09_hybrid_corpus_complete_skips_web` (no
      `run_web_solve` call when corpus answer is complete);
      `test_tc10_hybrid_corpus_partial_invokes_web` (falls through to
      web on UNANSWERED).
- [x] **AC5 — Verbatim refusal on OOD.**
      `test_tc07_corpus_out_of_corpus_emits_refusal` matches
      `REFUSAL_TEXT` exactly.
- [x] **AC6 — Secret handling.**
      `test_tc11_plaintext_api_key_absent_from_logs` (canary
      `sk-secret-canary-do-not-log` in `SecretStr` never appears in
      `caplog` or any SSE frame);
      `test_tc12_decrypted_secret_absent_from_error_frame` (forced
      error path; canary absent from error frame).
- [x] **AC7 — Real-DB cross-tenant SQL gate available behind a marker.**
      `test_cross_tenant_model_403_with_db` exists; skips
      automatically when `DATABASE_URL` is unset; CI opts in via the
      `pytest-with-postgres` job dispatched on demand.
- [x] **AC8 — Eval extension shipped.**
      `evals/corpus-questions.json` contains 10 entries — 5
      `category=grounded` with `expected_citations[]`, 5
      `category=ood` with `expected_refusal=true`.
- [x] **AC9 — CI gates merges to `main`.**
      `.github/workflows/agent-search-tests.yml` runs pytest + smoke +
      ruff + secret-grep on every PR; Postgres job is opt-in via
      `workflow_dispatch`.
- [x] **AC10 — Quality gate clean on new surface.**
      Ruff 0 issues, pyright 0 errors, secret-grep 0 hits, coverage
      76 % (above 70 % CI bar).

## Files Touched

```
.github/workflows/agent-search-tests.yml                                         (new)
apps/agent_graph_backend/agent_search/tests/integration/__init__.py              (new)
apps/agent_graph_backend/agent_search/tests/integration/conftest.py              (new)
apps/agent_graph_backend/agent_search/tests/integration/test_solve_e2e.py        (new, 13 tests)
apps/agent_graph_backend/agent_search/tests/integration/fixtures/seed_two_tenants.sql           (new)
apps/agent_graph_backend/agent_search/tests/integration/fixtures/seed_models_with_ts_encryption.json (new)
apps/agent_graph_backend/agent_search/tests/integration/snapshots/solve_v2.json  (new)
apps/agent_graph_backend/scripts/TAG_64_integration.py                           (new, 8 TCs)
evals/corpus-questions.json                                                      (new, 10 entries)
docs/jira/TAG-64/TAG_64_test.md                                                  (this file)
```

Zero production code touched in `agent_search/agent_v2/` for TAG-64.

## Decisions

Senior-engineer interpretations made during implementation.

- **In-process by default; DB-bound by opt-in.** The hermetic suite
  uses `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))` so
  the contributor pipeline runs in any sandbox with no
  service-container dependency. The single real-DB test
  (`test_cross_tenant_model_403_with_db`) is decorated with
  `@requires_postgres`, which skips unless `DATABASE_URL` is set.
- **Stub at the dispatcher seam, not the SQL layer.** The dispatcher
  exposes `orchestrator.modes._build_corpus_search` as the corpus
  factory. The integration `stub_corpus_factory` fixture
  monkeypatches that single function so the in-process app routes
  through `StubCorpus`. This mirrors the TAG-62 dispatch seam and
  keeps the patch surface to one symbol.
- **Patch `solve_mod.<name>`, not `auth.resolve.<name>` or
  `modes.<name>`.** Because `api/solve.py` does
  `from auth.resolve import resolve_llm_spec` / `from orchestrator.modes
  import run_solve` at import time, name rebinding is at the importing
  module. Patching the source module is a no-op. The TC-04 / TC-11 /
  TC-12 tests therefore target `solve_mod.resolve_llm_spec`,
  `solve_mod.build_client`, and `solve_mod.run_solve`.
- **Reset `sse_starlette.AppStatus.should_exit_event` per test.**
  `sse-starlette` keeps a process-wide singleton that binds to the
  first event loop touching it. Without the reset in `patched_app`,
  the second SSE test under `pytest-asyncio` raises *"Event ... is
  bound to a different event loop."*
- **Pin `settings.llm_provider = "fake"` via `monkeypatch.setattr`,
  not via `os.environ`.** `Settings()` is constructed at module
  import; setting the env var in a session-autouse fixture is too
  late. The integration `patched_app` writes the field directly.
- **Snapshot the shape, not the content.** The TC-01 regression test
  asserts on `event_types(frames)` (`type:state` tuples), not on
  free-form planner text. This keeps the snapshot stable across
  copywriting and prompt-tuning churn while still catching wire-shape
  regressions.
- **Canary strings include the literal "canary".** TC-11 / TC-12 use
  `sk-secret-canary-do-not-log` and `csk-secret-not-here` so that the
  secret-grep allow-list (`sk-secret-canary|csk-secret-not`) can let
  them through deliberately. Any real-looking key would fail the
  scan.
- **Eval entries minimum metadata.** Each grounded question lists
  `expected_citations[]` (the `[[doc_id:chunk_id]]` markers the
  planner must emit) and `expected_keypoints[]` (substrings the
  judge can grep on). OOD entries set `expected_refusal: true` and
  expect the verbatim `REFUSAL_TEXT`.

## Unit + Integration Test Results

```bash
$ cd apps/agent_graph_backend
$ python -m pytest agent_search/tests/integration/ -v --tb=short

============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.1, pluggy-1.5.0
configfile: pytest.ini
plugins: anyio-4.10.0, asyncio-1.3.0, cov-7.1.0
asyncio: mode=Mode.AUTO
collected 13 items

agent_search/tests/integration/test_solve_e2e.py::test_tc01_solve_v2_sse_shape_unchanged              PASSED [  7%]
agent_search/tests/integration/test_solve_e2e.py::test_tc02_solve_no_auth_returns_401                 PASSED [ 15%]
agent_search/tests/integration/test_solve_e2e.py::test_tc03_solve_bad_jwt_returns_401                 PASSED [ 23%]
agent_search/tests/integration/test_solve_e2e.py::test_tc04_cross_tenant_model_returns_403_generic    PASSED [ 30%]
agent_search/tests/integration/test_solve_e2e.py::test_tc05_no_grounding_source_returns_422           PASSED [ 38%]
agent_search/tests/integration/test_solve_e2e.py::test_tc06_corpus_mode_returns_citations             PASSED [ 46%]
agent_search/tests/integration/test_solve_e2e.py::test_tc07_corpus_out_of_corpus_emits_refusal        PASSED [ 53%]
agent_search/tests/integration/test_solve_e2e.py::test_tc08_web_mode_matches_solve_v2_shape           PASSED [ 61%]
agent_search/tests/integration/test_solve_e2e.py::test_tc09_hybrid_corpus_complete_skips_web          PASSED [ 69%]
agent_search/tests/integration/test_solve_e2e.py::test_tc10_hybrid_corpus_partial_invokes_web         PASSED [ 76%]
agent_search/tests/integration/test_solve_e2e.py::test_tc11_plaintext_api_key_absent_from_logs        PASSED [ 84%]
agent_search/tests/integration/test_solve_e2e.py::test_tc12_decrypted_secret_absent_from_error_frame  PASSED [ 92%]
agent_search/tests/integration/test_solve_e2e.py::test_cross_tenant_model_403_with_db                 SKIPPED [100%]

SKIPPED [1] test_solve_e2e.py:695: Postgres-bound integration test — set DATABASE_URL to enable.
12 passed, 1 skipped in 0.16s
```

### Full agent_search suite (regression)

```bash
$ python -m pytest agent_search/tests/ --cov=agent_search/agent_v2 --cov-report=term-missing -q

........................................................................ [ 37%]
...................................................s.................... [ 75%]
................................................                         [100%]

Name                                                       Stmts   Miss  Cover
----------------------------------------------------------------------------------------
agent_search\agent_v2\api\solve.py                            40      3    92%
agent_search\agent_v2\app.py                                  47      4    91%
agent_search\agent_v2\auth\deps.py                            24      0   100%
agent_search\agent_v2\auth\jwt.py                             33      0   100%
agent_search\agent_v2\auth\resolve.py                         31      0   100%
agent_search\agent_v2\crypto\vault.py                         58      0   100%
agent_search\agent_v2\db\model_registry.py                    38      0   100%
agent_search\agent_v2\db\pool.py                              23      0   100%
agent_search\agent_v2\llm\fake_client.py                      28      1    96%
agent_search\agent_v2\llm\spec.py                             24      0   100%
agent_search\agent_v2\memory\history.py                       60      0   100%
agent_search\agent_v2\orchestrator\graph.py                  128     12    91%
agent_search\agent_v2\orchestrator\hybrid_mode.py             69      6    91%
agent_search\agent_v2\orchestrator\modes.py                   94     11    88%
agent_search\agent_v2\orchestrator\sse.py                     13      1    92%
agent_search\agent_v2\orchestrator\web_mode.py                18      0   100%
agent_search\agent_v2\rag\citation.py                         21      0   100%
agent_search\agent_v2\rag\embedding.py                        37      0   100%
... (clients & retriever paths intentionally lower — see "Coverage notes")
----------------------------------------------------------------------------------------
TOTAL                                                       1987    471    76%

191 passed, 1 skipped in 9.78s
```

**Coverage on new code:** N/A — TAG-64 adds tests only, no new
production code. The 76 % is the overall `agent_search/agent_v2/`
coverage with the new integration suite included, comfortably above
the `--cov-fail-under=70` CI gate.

**Coverage notes:** The remaining 24 % gap is concentrated in concrete
LLM client adapters (`anthropic_client.py` 28 %, `openai_client.py`
39 %), the live `web_search.py` (27 %), the production
`PgCorpusSearch` (`corpus_search.py` 50 %), and the live retriever
(`retriever.py` 33 %). These are intentionally bypassed by the
"real DB, fake LLM" charter — exercising them requires real API
credentials and network egress, which the hermetic suite forbids. The
opt-in `pytest-with-postgres` CI job partially closes the
`corpus_search.py` gap. The remaining LLM / web-search adapter
coverage is owned by TAG-49 (provider audit) and TAG-50 (eval gates).

## Out-of-Process Integration Smoke

Script: `apps/agent_graph_backend/scripts/TAG_64_integration.py`

```bash
$ cd apps/agent_graph_backend
$ python scripts/TAG_64_integration.py

[PASS] integration conftest imports + symbols stable   tenants=[tnt_alpha,tnt_beta] model=fake-model provider=fake jwt_secret_len=43
[PASS] seed SQL present + two-tenant rows complete     path=seed_two_tenants.sql bytes=7330
[PASS] TS-encrypted fixture parses + oracle present    rows=2 ids=['msec_alpha', 'msec_beta']
[PASS] SSE snapshot present + bookend frames stable    events=['planner:STREAM_ING', 'planner:ANSWER_ING', 'planner:END']
[PASS] eval extension well-formed (5+5 split)          grounded=5 ood=5
[PASS] test_solve_e2e.py contains all 12 tcNN_* cases  ticks=[1..12]
[PASS] no secrets in new test surface (regex grep)     scanned tests/integration + evals + this script
[PASS] CI workflow runs pytest agent_search/tests/     path=.github\workflows\agent-search-tests.yml

total=8 passed=8 failed=0
```

Unlike previous TAG-XX smokes this one is a **wire-fitness check on
the test surface itself**, not on a running server — it has no
`AGENT_GRAPH_URL` dependency. The full HTTP wire is exercised by the
12 in-process integration tests above.

## Quality Gate

### ruff (new test surface)

```bash
$ ruff check agent_search/tests/integration/ scripts/TAG_64_integration.py --select E,F,W,B,UP,SIM
All checks passed!
```

10 pre-existing auto-fixable issues were resolved via `--fix`
(unused imports, nested-`with` SIM117). The 12 integration tests
re-ran green after the autofixes.

### pyright (new test surface)

```bash
$ python -m pyright agent_search/tests/integration/ scripts/TAG_64_integration.py
0 errors, 0 warnings, 0 informations
```

One pyright `reportOptionalMemberAccess` was fixed by adding an
explicit None-narrow on the `re.match(...)` result inside
`TAG_64_integration.py::tc06_pytest_discovery` (the assertion just
before guarantees the match is non-None; pyright cannot infer that
from the regex alone).

### Secret grep

```bash
$ python -c "scan agent_search/tests/integration/ + scripts/TAG_64_integration.py"
no secrets
```

Pattern: `sk-[A-Za-z0-9]{20,}|csk-[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}`
Allow-list: `sk-secret-canary|csk-secret-not` (the TC-11 / TC-12
canaries deliberately included in the suite).

The CI workflow runs the same scan in its `Secret scan (regex grep)`
step.

## Known Limitations

- **No real-API integration test in CI by default.** Hitting Anthropic /
  OpenAI / Tavily from CI requires production-grade credentials, which
  are not provisioned to PR builders. Tracked under TAG-49's
  "provider integration audit" follow-up.
- **`test_cross_tenant_model_403_with_db` is skipped on contributor
  pushes.** Contributors who want to exercise it locally must run
  `psql -f agent_search/tests/integration/fixtures/seed_two_tenants.sql`
  and export `DATABASE_URL`. Documented in
  `agent_search/tests/integration/conftest.py`. CI runs it via the
  `workflow_dispatch` job with `with-postgres: true`.
- **Eval scoring is offline / manual today.** The new
  `evals/corpus-questions.json` entries are scored by the existing
  `evals/scripts/judge.ts` harness; no live gating in CI yet. Adding
  a CI step that fails the build below `citation precision ≥ 0.95` /
  `refusal recall ≥ 0.90` is the natural follow-up — left to its own
  ticket so the eval harness can be tuned without blocking integration
  merges.
- **Snapshot file is a single shape.** A future change that
  legitimately adds `searcher:*` events to the `/solve_v2` stream
  (e.g. for graph-mode rework) will need to update
  `snapshots/solve_v2.json`. The snapshot test prints a clear diff
  on failure so the rewrite is one-line.
- **No mutation testing.** The 12-case suite is structurally
  comprehensive but does not (yet) include `mutmut` /
  `cosmic-ray` runs. Out of scope for TAG-64.

## Rollback

The ticket adds files only — no edits to production modules — so
rollback is a clean revert of the staging tree:

```bash
# Remove the new test surface
git rm -r apps/agent_graph_backend/agent_search/tests/integration/
git rm    apps/agent_graph_backend/scripts/TAG_64_integration.py
git rm    evals/corpus-questions.json
git rm    .github/workflows/agent-search-tests.yml
git rm -r docs/jira/TAG-64/
git commit -m "Revert TAG-64: integration suite + eval entries"
```

No DB migration ran. The hermetic CI job will simply no longer execute;
existing PR gates on `main` are unchanged.

## Sign-off

- [ ] Code reviewed
- [x] Unit + integration tests green (12 passed, 1 skipped; full suite 191 passed, 1 skipped)
- [x] Out-of-process smoke green (8/8)
- [x] Quality gate clean (ruff, pyright, secret-grep)
- [ ] Test plan reviewed
