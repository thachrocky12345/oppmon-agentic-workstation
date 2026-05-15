# TAG-63 — Test Plan

## Objective

Thread prior conversation turns into the planner so a follow-up question
like *"and what about the 2024 numbers?"* resolves against the prior
turn's subject. Add a bounded trim policy (`MAX_TURNS=8`,
`MAX_TURN_CHARS=4_000`, `MAX_TOTAL_CHARS=16_000`) and a best-effort
summariser fall-back so unbounded histories cannot melt token budgets.
The legacy `/solve_v2` `inputs: str` shape is byte-identical to today
— the new behaviour rides on the new `question` + `history` parameter
pair used by `/solve`.

## Acceptance Criteria (from ticket)

- [x] `/solve_v2` output unchanged on identical inputs (regression
  test in `tests/orchestrator/test_solve_v2.py` and 4 explicit
  legacy-shape assertions in `tests/orchestrator/test_planner_history.py`).
- [x] `/solve` resolves follow-up questions correctly — TAG-64 will
  add the live eval; this ticket ships the seam plus
  `test_follow_up_question_sees_prior_turn_in_llm_messages` which
  asserts on the *shape* of the LLM call.
- [x] History trimming bounded; no unbounded context growth
  (`trim_history` caps both turns and per-message chars; `too_long`
  triggers summariser when the trimmed list still busts the total
  budget).
- [x] Summariser uses tenant's LLM, not a hard-coded one
  (`safe_summarize_oldest_half(llm=self._llm, ...)` inside
  `PlannerAgent.run`).

## Files Touched

**New:**
- `apps/agent_graph_backend/agent_search/agent_v2/memory/history.py`
- `apps/agent_graph_backend/agent_search/tests/memory/__init__.py`
- `apps/agent_graph_backend/agent_search/tests/memory/test_history.py`
- `apps/agent_graph_backend/agent_search/tests/orchestrator/test_planner_history.py`
- `apps/agent_graph_backend/scripts/TAG_63_integration.py`
- `docs/jira/TAG-63/TAG_63_test.md` (this file)

**Modified:**
- `apps/agent_graph_backend/agent_search/agent_v2/memory/__init__.py`
  — re-export the new history surface (`trim_history`, `too_long`,
  `summarize_oldest_half`, `safe_summarize_oldest_half`,
  `MAX_TURNS`, `MAX_TURN_CHARS`, `MAX_TOTAL_CHARS`).
- `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/planner.py`
  — `PlannerAgent.run` signature: added `question` + `history`
  keyword-only params, kept legacy `inputs` for `/solve_v2`,
  rejects ambiguous combinations. Threads trimmed history
  between system prompt and current user message; emits a
  `warning_event` when the summariser falls back. Added private
  `_history_from_inputs()` adapter for the legacy `list[dict]` shape.
- `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/web_mode.py`
  — `/solve` path now passes
  `question=req.messages[-1].content, history=req.messages[:-1]`
  instead of the old `inputs=[{...}]` list (which discarded everything
  but the final user message).
- `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/modes.py`
  — `run_corpus_solve` applies the same `trim_history` +
  `safe_summarize_oldest_half` policy to its inline history
  threading so corpus and web modes observe identical history bounds.

## Unit Test Results

```
$ pytest agent_search/tests/memory/ agent_search/tests/orchestrator/test_planner_history.py -v
============================= test session starts =============================
collected 16 items

memory/test_history.py::test_trim_history_keeps_last_n_pairs             PASSED
memory/test_history.py::test_trim_history_preserves_leading_system_message PASSED
memory/test_history.py::test_trim_history_per_message_char_truncation    PASSED
memory/test_history.py::test_trim_history_empty_input_is_noop            PASSED
memory/test_history.py::test_trim_history_idempotent                     PASSED
memory/test_history.py::test_too_long_under_budget_returns_false         PASSED
memory/test_history.py::test_too_long_over_budget_returns_true           PASSED
memory/test_history.py::test_summarizer_called_once_when_total_too_long  PASSED
memory/test_history.py::test_summarizer_handles_empty_llm_response       PASSED
memory/test_history.py::test_safe_summarize_falls_back_to_raw_trim_on_error PASSED
memory/test_history.py::test_safe_summarize_success_returns_summary_plus_newer PASSED
orchestrator/test_planner_history.py::test_follow_up_question_sees_prior_turn_in_llm_messages PASSED
orchestrator/test_planner_history.py::test_legacy_inputs_string_shape_threads_no_history PASSED
orchestrator/test_planner_history.py::test_legacy_inputs_list_shape_derives_history PASSED
orchestrator/test_planner_history.py::test_both_inputs_and_question_rejected PASSED
orchestrator/test_planner_history.py::test_neither_inputs_nor_question_rejected PASSED

============================== 16 passed in 1.23s ==============================
```

Full-suite regression run (163 prior + 16 new = 179 tests):

```
$ pytest agent_search/tests/
============================== 179 passed in 3.61s ==============================
```

## Coverage

Scoped to new/changed modules:

| Module | Stmts | Miss | Coverage |
|---|---|---|---|
| `memory/history.py` | 60 | 0 | **100 %** |
| `orchestrator/planner.py` | 123 | 31 | **75 %** |

Average across the two new/changed files: **83 %**. Uncovered lines in
`planner.py` are the existing searcher fan-out branches
(`_run_searcher`, citation re-numbering, graph state updates) which
are exercised by the pre-existing `test_solve_v2.py` integration
tests; the TAG-63 test surface uses the `finalize`-first script to
keep the focus on history threading.

## Integration Test Results

```
$ python scripts/TAG_63_integration.py
[PASS] imports + module surface stable  MAX_TURNS=8 MAX_TURN_CHARS=4000 MAX_TOTAL_CHARS=16000
[PASS] mount_v2 still mounts /solve_v2  routes=['/docs', '/docs/oauth2-redirect', '/openapi.json', '/redoc', '/solve_v2']
[PASS] trim_history empty/under/over/truncation  trimmed_len=16 truncated_len=4000
[PASS] safe_summarize falls back on LLM error  warning='history summariser failed: rate limited'
[PASS] planner threads history into LLM call  roles=['system', 'user', 'assistant', 'user'] last_content='follow up'
[PASS] legacy inputs=str threads no history (regression)  users=1 assts=0

total=6 passed=6 failed=0
```

## Quality Gate

- **ruff** (`--select E,F,W,B,UP,SIM`): clean on all changed paths.
- **pyright**: `0 errors, 0 warnings, 0 informations` on the four
  changed/new modules (`history.py`, `planner.py`, `web_mode.py`,
  `modes.py`).
- **secret scan** (`sk-*`, `csk-*`, `tvly-*`, `AKIA*`): no hits.
- **Regression**: 179 / 179 tests pass, including the full TAG-58
  (`test_solve_route.py`), TAG-61 (`test_rag_mode.py`), TAG-62
  (`test_mode_select.py`, `test_hybrid.py`), and the legacy
  `/solve_v2` smoke (`test_solve_v2.py`).

## Mapping to Ticket Tests Table

| Ticket row | This codebase test |
|---|---|
| `trim_history` keeps last N turns | `test_trim_history_keeps_last_n_pairs` |
| per-message char truncation | `test_trim_history_per_message_char_truncation` |
| no history → no-op | `test_trim_history_empty_input_is_noop` |
| summariser called when total too long | `test_summarizer_called_once_when_total_too_long` |
| follow-up question resolves prior context | `test_follow_up_question_sees_prior_turn_in_llm_messages` |
| `/solve_v2` regression | `test_legacy_inputs_string_shape_threads_no_history` + existing `test_solve_v2.py` |

Bonus:
- `test_trim_history_preserves_leading_system_message` — system-prompt
  exemption is a documented behaviour, not just an accident.
- `test_trim_history_idempotent` — defence against accidental double-trim.
- `test_safe_summarize_falls_back_to_raw_trim_on_error` — risk-table
  mitigation #3.
- `test_both_inputs_and_question_rejected` /
  `test_neither_inputs_nor_question_rejected` — guard against
  ambiguous planner invocations.

## Known Limitations

1. **`run_corpus_solve` still passes the trimmed history one turn at
   a time into `ConversationalMemory`.** The token-accounting layer
   in `ConversationalMemory` is unchanged; we rely on the upstream
   `trim_history` + summariser to keep totals bounded. A future
   ticket can collapse this into a single composed message list, but
   the current shape preserves the TAG-61 prompt structure verbatim.
2. **Summariser uses the user's LLM key, not a cheaper hosted
   model.** This is *by design* per the ticket — billing attribution
   stays clean — but a long, summariser-heavy session can be more
   expensive than the raw trim. The fall-back path emits a
   `warning_event` so operators see when the summariser fired.
3. **The summariser is invoked sequentially, not streamed.** It
   blocks the planner's first `STREAM_ING` event by one round-trip
   when it fires. We accept the latency hit because the alternative
   (interleaving) leaks summariser tokens into the SSE wire shape.
4. **`/solve_v2` `inputs: list[dict]` still discards history.** The
   ticket only commits to `inputs: str` regression. Threading
   history through the `list[dict]` path is now technically a
   one-line change (`_history_from_inputs` already returns the
   correct prefix) — but the web UI uses `/solve` (TAG-58), not the
   list shape of `/solve_v2`, so we left the list-shape behaviour
   alone to keep blast radius small.

## Rollback

Revert the following commit:

1. The TAG-63 commit on `feature/TAG-63-history`.

After revert the working tree returns to the post-TAG-62 state
(`feature/TAG-62-mode-selection`). `/solve_v2` is functionally
unchanged either way; `/solve` returns to ignoring history.
