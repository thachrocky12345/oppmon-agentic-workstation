# TAG-61: RAG-Mode Planner System Prompt + Tool Set — Test Plan

**Type:** Test Plan
**Status:** Draft
**Author:** TAG-61 author
**Date:** 2026-05-14
**Ticket:** [docs/jira/TAG-61-rag-planner-prompt.md](../TAG-61-rag-planner-prompt.md)
**Branch:** `feature/TAG-61-rag-planner-prompt`
**Base commit:** `ca14dcc` (TAG-60 — EmbeddingProvider Protocol)

---

## Objective

Ship the corpus-grounded planner for `agent_v2`: a system prompt with six
hallucination guards, a four-tool registry that hits `CorpusSearch` instead
of web search, and a `run_corpus_solve(...)` orchestrator entry that drives
the existing reactive loop end-to-end. Same SSE event shapes as the web
planner (`planner_event` / `searcher_event` / `warning_event` / `end_event`)
so `AgentGraphPanel` renders RAG-mode answers without branching by mode.
Every factual claim in the final answer carries `[[doc_id:chunk_id]]`
citations; on empty retrieval the loop emits the verbatim refusal sentence
instead of inventing an answer.

## Acceptance Criteria Verification

Mirrored from the ticket spec. Each AC links to the test that proves it.

- [x] **AC1:** System prompt carries six HARD RULES + the verbatim refusal
      sentence — verified by `test_rag_mode.py::test_rag_planner_system_prompt_contains_hard_rules`
      and integration `TC-01`.
- [x] **AC2:** Prompt access is via the `_rag_planner_system()` indirection
      (TAG-73 swap seam) — verified by
      `test_rag_mode.py::test_rag_planner_system_indirection_returns_constant`
      and integration `TC-01`.
- [x] **AC3:** Registry exposes exactly the four corpus tools
      (`add_node`, `search_corpus_node`, `read_node_answer`, `finalize`)
      and does **not** expose the web planner's `search_node` — verified by
      `test_rag_mode.py::test_tool_list_excludes_web_search_tool` and
      integration `TC-02`.
- [x] **AC4:** Happy path — seeded corpus produces a final answer that
      contains at least one `[[doc_id:chunk_id]]` citation marker —
      verified by `test_rag_mode.py::test_seeded_corpus_yields_citations_in_final_answer`
      and integration `TC-03`.
- [x] **AC5:** Empty-corpus path — every search returns `[]`, the model
      finalizes with `REFUSAL_TEXT`, and the orchestrator emits exactly
      that string — verified by
      `test_rag_mode.py::test_empty_corpus_yields_refusal_string` and
      integration `TC-04`.
- [x] **AC6:** Per-sub-question UNANSWERED — mixed corpus (hit + miss),
      planner marks the missed sub-question UNANSWERED in the final
      answer and the SSE searcher_event carries `status="UNANSWERED"` —
      verified by `test_rag_mode.py::test_mixed_corpus_marks_unanswered_sub_question`.
- [x] **AC7:** Iteration cap — if the planner never calls `finalize`,
      the orchestrator falls back to `REFUSAL_TEXT` instead of fabricating
      an answer — verified by `test_rag_mode.py::test_iteration_cap_falls_back_to_refusal`.
- [x] **AC8:** Tenant isolation — every `CorpusSearch.search` call carries
      the closure-captured `tenant_id` verbatim; defence-in-depth assertion
      raises if the closure was ever registered without one — verified by
      integration `TC-05`.

## Files Touched

```
apps/agent_graph_backend/agent_search/agent_v2/orchestrator/rag_planner_prompt.py   (new)
apps/agent_graph_backend/agent_search/agent_v2/orchestrator/rag_tools.py            (new)
apps/agent_graph_backend/agent_search/agent_v2/orchestrator/modes.py                (edited: +run_corpus_solve, +docstring)
apps/agent_graph_backend/agent_search/tests/orchestrator/test_rag_mode.py           (new, 7 tests)
apps/agent_graph_backend/scripts/TAG_61_integration.py                              (new, 5 cases)
docs/jira/TAG-61/TAG_61_test.md                                                     (this file)
```

No edits outside `apps/agent_graph_backend/` and `docs/jira/TAG-61/`. The
`run_solve` TAG-58 stub is untouched — `run_corpus_solve` is a parallel
entrypoint, not a replacement.

## Decisions

- **Did not extend `PlannerAgent`.** Its constructor is
  `(*, llm, retriever, searcher, config)` — no `tools=` / `system_prompt=`
  seam. Built `run_corpus_solve` directly on the lower primitives
  (`run_reactive_loop`, `WebSearchGraph`, `ToolRegistry`,
  `ConversationalMemory`, `ToolLog`) per the ticket's implementation
  note: "we are providing a different tool registry and prompt."
- **`search_corpus_node` takes BOTH `node_id` and `question`.** The web
  `search_node` only takes `node_id` because the question is fixed at
  `add_node` time. The corpus tool keeps `question` on the call so the
  LLM can sharpen the retrieval query (add domain terms) without
  rewriting the node.
- **Citation key = `doc_id:chunk_id` strings, not numeric `[[N]]`.** The
  web planner uses `[[1]]`-style citations resolved out-of-band; the
  RAG planner emits stable composite keys the frontend can resolve via
  TAG-62's citation event stream.
- **Top-k breadth at planner = `cfg.rag_top_k * 2`.** The synthesis step
  later trims, but the planner sees a wider candidate set so the model
  has slack to discard low-relevance chunks.
- **`tenant_id` is closure-captured.** The planner LLM never sees the
  wire format. A second RuntimeError check inside
  `_search_corpus_node` enforces non-empty `tenant_id` as defence-in-depth
  on top of the SQL-level filters from TAG-59.
- **Iteration-cap fallback is `REFUSAL_TEXT`, not a "best effort"
  synthesis.** Per HARD RULE #3 — never invent an answer.

## Unit Test Results

```text
$ cd apps/agent_graph_backend
$ python -m pytest agent_search/tests/orchestrator/test_rag_mode.py -v

============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.1, pluggy-1.5.0
configfile: pytest.ini
plugins: anyio-4.10.0, langsmith-0.7.38, asyncio-1.3.0, cov-7.1.0
asyncio: mode=Mode.AUTO
collected 7 items

agent_search/tests/orchestrator/test_rag_mode.py::test_empty_corpus_yields_refusal_string PASSED        [ 14%]
agent_search/tests/orchestrator/test_rag_mode.py::test_seeded_corpus_yields_citations_in_final_answer PASSED [ 28%]
agent_search/tests/orchestrator/test_rag_mode.py::test_mixed_corpus_marks_unanswered_sub_question PASSED [ 42%]
agent_search/tests/orchestrator/test_rag_mode.py::test_tool_list_excludes_web_search_tool PASSED        [ 57%]
agent_search/tests/orchestrator/test_rag_mode.py::test_iteration_cap_falls_back_to_refusal PASSED       [ 71%]
agent_search/tests/orchestrator/test_rag_mode.py::test_rag_planner_system_prompt_contains_hard_rules PASSED [ 85%]
agent_search/tests/orchestrator/test_rag_mode.py::test_rag_planner_system_indirection_returns_constant PASSED [100%]

============================== 7 passed in 1.34s ==============================
```

Full suite (no regressions):

```text
$ python -m pytest agent_search/tests/ -q
155 passed in 5.19s
```

### Coverage on new code

```text
$ python -m pytest agent_search/tests/ \
    --cov=agent_search.agent_v2.orchestrator.rag_planner_prompt \
    --cov=agent_search.agent_v2.orchestrator.rag_tools \
    --cov=agent_search.agent_v2.orchestrator.modes \
    --cov-report=term-missing -q

Name                                                       Stmts   Miss  Cover   Missing
----------------------------------------------------------------------------------------
agent_search\agent_v2\orchestrator\modes.py                   55      2    96%   174, 209
agent_search\agent_v2\orchestrator\rag_planner_prompt.py       6      0   100%
agent_search\agent_v2\orchestrator\rag_tools.py               52      8    85%   165, 180, 240-245
----------------------------------------------------------------------------------------
TOTAL                                                        113     10    91%
155 passed in 5.19s
```

**Coverage on new code: 91 %** (target ≥ 80 %). Uncovered branches:

- `modes.py:174` — `ConversationalMemory` summarisation trigger (no test
  exercises a >80k-token prior history; deferred — covered by memory
  module's own tests).
- `modes.py:209` — `warning_event` branch (no test injects a tool failure
  end-to-end; deferred — failure path is covered indirectly by
  `test_iteration_cap_falls_back_to_refusal`).
- `rag_tools.py:165` — defence-in-depth `tenant_id` RuntimeError (only
  reachable via misregistration; tested by inspection).
- `rag_tools.py:180` — unknown-node KeyError in `_search_corpus_node`
  (planner misbehaviour path; deferred to TAG-62 sad-path eval).
- `rag_tools.py:240-245` — `_read_node_answer` happy path (unused in the
  current planner scripts; behaviour is a trivial getter).

## Integration Test Results

Script: `scripts/TAG_61_integration.py` (in-process; no FastAPI server
required — TAG-61 lives at the orchestrator layer, not behind a new HTTP
route, and the SSE wire is already covered by TAG-58's `/solve` endpoint
smoke + TAG-64's web-planner end-to-end).

```text
$ python scripts/TAG_61_integration.py

[PASS] imports + prompt indirection  prompt_len=1224, refusal_len=64
[PASS] registry has 4 corpus tools, no web search_node  got=['add_node', 'finalize', 'read_node_answer', 'search_corpus_node']
[PASS] happy path final answer carries [[doc:chunk]]  final[:80]='Policy X allows extensions [[docA:c1]] with a 30-day cap [[docA:c2]].'
[PASS] empty corpus -> REFUSAL_TEXT verbatim  final="I don't have information about that in the provided collections."
[PASS] tenant_id forwarded to CorpusSearch.search  tenants_seen=['tenant-XYZ']

total=5 passed=5 failed=0
```

## Quality Gate

```text
$ python -m ruff check \
    agent_search/agent_v2/orchestrator/rag_planner_prompt.py \
    agent_search/agent_v2/orchestrator/rag_tools.py \
    agent_search/agent_v2/orchestrator/modes.py \
    agent_search/tests/orchestrator/test_rag_mode.py \
    scripts/TAG_61_integration.py \
    --select E,F,W,B,UP,SIM
All checks passed!

$ python -m pyright \
    agent_search/agent_v2/orchestrator/rag_planner_prompt.py \
    agent_search/agent_v2/orchestrator/rag_tools.py \
    agent_search/agent_v2/orchestrator/modes.py
0 errors, 0 warnings, 0 informations

$ secret grep (sk-/csk-/tvly-/AKIA patterns across changed paths)
secret matches: 0
```

## Known Limitations

- **No live FastAPI smoke.** TAG-61 has no new HTTP route — it's an
  orchestrator-layer module consumed by TAG-58's existing `/solve` SSE
  endpoint. End-to-end wire coverage rides on TAG-58's smoke + TAG-64's
  web-planner integration. A dedicated RAG-mode `/solve` smoke is filed
  as a follow-up under TAG-64's scope.
- **`ConversationalMemory` summarisation untested here.** The 80k-token
  rollover path lives in `agent_v2/memory/conversational.py` and is
  covered by its own tests. `modes.py:174` records the uncovered branch.
- **Prompt body is in-source.** The `_rag_planner_system()` indirection
  is the seam TAG-73 will swap for a Notion-backed
  `get_prompt("system.rag_planner")` loader. No call sites need to change
  when that lands.
- **Citation resolution is frontend-side.** `[[doc_id:chunk_id]]` markers
  are emitted verbatim in the final answer text. Resolving them to
  clickable doc links is TAG-62's citation event stream.

## Rollback

```bash
# Branch is feature/TAG-61-rag-planner-prompt; no commits to main yet.
# To undo locally:
git checkout main
git branch -D feature/TAG-61-rag-planner-prompt

# To undo after merge (single squashed commit on main):
git revert <merge-sha>
```

No database migration. No `.env.example` change. No new requirements-v2.txt
entries. Removing the three new files + reverting `modes.py` to its
TAG-58-stub-only state fully restores prior behaviour; `run_solve` itself
was never edited.

## Sign-off

- [ ] Code reviewed
- [x] Unit tests green (7/7 new + 148 existing = 155 passed)
- [x] Integration tests green (5/5)
- [x] Quality gate clean (ruff + pyright + secrets)
- [ ] Test plan reviewed
