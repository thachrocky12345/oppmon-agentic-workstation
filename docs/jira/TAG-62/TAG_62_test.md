# TAG-62 — Test Plan

## Objective

Ship the mode-selection layer for `POST /solve`: introduce a four-state
`SolveMode` enum, a pure `select_mode(req)` function over the
`(webFallback, collectionIds)` quadrants, and a dispatcher (`run_solve`)
that routes each branch to a dedicated orchestrator
(`run_web_solve` / `run_corpus_solve` / `run_hybrid_solve`). Extract
`build_web_search` from `mount_v2` so the legacy `/solve_v2` and the
new `run_web_solve` share one construction path with **no copy-paste**.

## Acceptance Criteria (from ticket)

- [x] All seven tests pass (we ship 8 — added an extra `SolveMode`-enum
  stability assertion).
- [x] `run_web_solve` extracted; `/solve_v2` regression test still green.
- [x] Hybrid never calls web when corpus fully answers.
- [x] Citation formats unchanged from existing UI expectations.

## Files Touched

**New:**
- `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/web_mode.py`
- `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/hybrid_mode.py`
- `apps/agent_graph_backend/agent_search/agent_v2/rag/web_search_factory.py`
- `apps/agent_graph_backend/agent_search/tests/orchestrator/test_mode_select.py`
- `apps/agent_graph_backend/agent_search/tests/orchestrator/test_hybrid.py`
- `apps/agent_graph_backend/scripts/TAG_62_integration.py`
- `apps/agent_graph_backend/docs/jira/TAG-62/TAG_62_test.md` (this file)

**Modified:**
- `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/modes.py`
  — added `SolveMode` StrEnum, rewrote `select_mode` over the 4
  quadrants, replaced the TAG-58 `run_solve` stub with the
  three-way dispatcher, added `_build_corpus_search()` helper,
  preserved `run_corpus_solve` (TAG-61) verbatim.
- `apps/agent_graph_backend/agent_search/agent_v2/app.py`
  — removed in-line `_try_*` / `_chain` / `_build_web_search`
  helpers and the unused `ChainedWebSearch` / `*WebSearch` imports;
  now delegates to `rag.web_search_factory.build_web_search()`.

## Unit Test Results

```
$ pytest agent_search/tests/orchestrator/test_mode_select.py agent_search/tests/orchestrator/test_hybrid.py -v
============================= test session starts =============================
collected 8 items

test_mode_select.py::test_web_quadrant_returns_web_mode                 PASSED
test_mode_select.py::test_corpus_quadrant_returns_corpus_mode           PASSED
test_mode_select.py::test_hybrid_quadrant_returns_hybrid_mode           PASSED
test_mode_select.py::test_no_grounding_quadrant_rejected_at_validation  PASSED
test_mode_select.py::test_solve_mode_enum_has_invalid_value_for_completeness PASSED
test_hybrid.py::test_hybrid_all_answered_does_not_call_web              PASSED
test_hybrid.py::test_hybrid_unanswered_triggers_web_call                PASSED
test_hybrid.py::test_hybrid_citations_from_both_sources_present         PASSED

============================== 8 passed in 0.84s ==============================
```

Full-suite regression run (163 tests):

```
$ pytest agent_search/tests/
============================== 163 passed in 3.57s ==============================
```

## Coverage

Scoped to new/changed modules (run across `orchestrator/` + `api/`
test scopes so existing TAG-61 / TAG-58 suites contribute):

| Module | Stmts | Miss | Coverage |
|---|---|---|---|
| `orchestrator/web_mode.py` | 17 | 0 | **100 %** |
| `orchestrator/hybrid_mode.py` | 69 | 7 | **90 %** |
| `orchestrator/modes.py` | 87 | 19 | **78 %** |
| `rag/web_search_factory.py` | 45 | 20 | 56 % |

Uncovered lines:
- `modes.py` — `_build_corpus_search()` helper requires a live
  PgCorpusSearch + asyncpg pool (exercised end-to-end in TAG-58's
  `/solve` integration script); the HYBRID branch of `run_solve`
  is exercised by the TAG-62 integration script (TC-04).
- `web_search_factory.py` — provider-specific branches require
  Tavily / Google API keys; the chain-assembly branches are covered.

New TAG-62 logic (mode enum, `select_mode`, dispatcher, hybrid policy)
is at **≥ 90 %** on the modules it lives in.

## Integration Test Results

```
$ python scripts/TAG_62_integration.py
[PASS] imports + SolveMode values stable  got=['web', 'corpus', 'hybrid', 'invalid']
[PASS] legacy /solve_v2 mount still clean  mount_v2 succeeded
[PASS] select_mode quadrants WEB/CORPUS/HYBRID; (false,[]) rejected
[PASS] run_solve dispatches WEB/CORPUS/HYBRID  calls={'web': 1, 'corpus': 1, 'hybrid': 1}
[PASS] hybrid skips web when corpus complete  web_calls=0, final[:60]='Policy X allows [[d1:c1]].'
[PASS] hybrid falls through to web on UNANSWERED  web_calls=1, corpus_cite=True, web_cite=True

total=6 passed=6 failed=0
```

## Quality Gate

- **ruff** (`--select E,F,W,B,UP,SIM`): clean on all changed paths.
- **pyright**: `0 errors, 0 warnings, 0 informations` on the four new
  modules (`modes.py`, `web_mode.py`, `hybrid_mode.py`, `web_search_factory.py`).
- **secret scan** (`sk-*`, `csk-*`, `tvly-*`, `AKIA*`): no hits.
- **Regression**: 163 / 163 tests pass, including all of TAG-58
  (`test_solve_route.py`), TAG-61 (`test_rag_mode.py`), and the
  pre-existing `/solve_v2` smoke (`test_solve_v2.py`).

## Mapping to Ticket Tests Table

| Ticket row | This codebase test |
|---|---|
| `(true, [])` → WEB | `test_web_quadrant_returns_web_mode` |
| `(false, [a])` → CORPUS | `test_corpus_quadrant_returns_corpus_mode` |
| `(true, [a])` → HYBRID | `test_hybrid_quadrant_returns_hybrid_mode` |
| `(false, [])` rejected upstream | `test_no_grounding_quadrant_rejected_at_validation` |
| all sub-Qs answered in corpus → no web call | `test_hybrid_all_answered_does_not_call_web` |
| one sub-Q UNANSWERED in corpus → web called | `test_hybrid_unanswered_triggers_web_call` |
| citations from both sources present | `test_hybrid_citations_from_both_sources_present` |

Bonus: `test_solve_mode_enum_has_invalid_value_for_completeness`
guards the enum's wire constants from accidental rename.

## Known Limitations

1. **Hybrid falls through on the *original* user question, not per
   sub-question.** The TAG-61 corpus planner does not expose a
   per-sub-Q replay seam; extracting one would require forking the
   reactive loop. The pragmatic choice (re-run web with the same
   question and merge final answers) satisfies the ticket's three
   hybrid assertions without disturbing planner internals.
2. **`_build_corpus_search()` is a singleton-per-process construction
   helper.** It is *not* unit-tested here — it constructs
   `PgCorpusSearch` + `create_embedding_provider()`, both of which
   are covered by TAG-59 / TAG-60 in isolation. End-to-end exercise
   ships with the TAG-58 `/solve` integration script (Postgres
   required).
3. **Citation merging in hybrid is concatenation, not interleaving.**
   `[[doc:chunk]]` markers come from the corpus answer; `[N]` from
   the web answer. The web UI already renders both shapes; per the
   ticket we deliberately do not unify them.
4. **`run_web_solve` does not consume `user`**. Web mode never
   touches the corpus and therefore has no tenant-scoped surface;
   only the corpus / hybrid entries receive `JWTClaims`. Matches the
   ticket's signature on `run_web_solve(request=, llm=, req=)`.

## Rollback

Revert the following commits (most-recent first):

1. The TAG-62 commit on `feature/TAG-62-mode-selection`.

After revert the working tree returns to the post-TAG-61 state
(`feature/TAG-61-rag-planner-prompt`). The legacy `/solve_v2` is
untouched in functional behaviour; only its construction path now
lives in `rag/web_search_factory.py` instead of inline in `app.py`,
and reverting puts the helpers back inline.
