# TAG-<NUM>: <Short Title> — Test Plan

**Type:** Test Plan
**Status:** Draft | In Review | Approved
**Author:** <name>
**Date:** YYYY-MM-DD
**Ticket:** [docs/jira/TAG-<NUM>-<slug>.md](../TAG-<NUM>-<slug>.md)
**Branch:** `feature/TAG-<NUM>-<slug>`
**Commit:** `<sha>`

---

## Objective

One paragraph. What does this ticket deliver? What is the user-visible
behavior change? Link to the ticket's *Objective* section if helpful.

## Acceptance Criteria Verification

Mirror the ticket's *Acceptance Criteria* and mark each one. If any is
not yet met, explain why and link the follow-up ticket.

- [x] AC1: <statement> — verified by `test_X.py::test_Y` + integration TC-NN.
- [x] AC2: <statement> — verified by …
- [ ] AC3: <statement> — DEFERRED to TAG-<NUM+1> (link).

## Files Touched

```
apps/agent_graph_backend/agent_search/agent_v2/<module>.py          (new)
apps/agent_graph_backend/agent_search/agent_v2/config.py            (edited: +3 fields)
apps/agent_graph_backend/agent_search/tests/test_<module>.py        (new, N tests)
apps/agent_graph_backend/agent_search/tests/conftest.py             (edited: +1 fixture)
apps/agent_graph_backend/requirements-v2.txt                        (edited: +pkg X)
scripts/TAG_<NUM>_integration.py                                    (new)
docs/jira/TAG-<NUM>/TAG_<NUM>_test.md                               (this file)
```

## Decisions

Senior-engineer interpretations made during implementation. One line each.

- Used `asyncpg` pool instead of `psycopg2` because the rest of the service
  is async and `asyncpg` is already a transitive dep via `xxx`.
- Settings field defaults match `apps/api/.env.example` values to keep parity.

## Unit Test Results

```bash
$ cd apps/agent_graph_backend
$ pytest agent_search/tests/ --cov=agent_search --cov-report=term-missing -v

================================ test session starts ================================
...
agent_search/tests/test_<module>.py::test_X PASSED                       [ 25%]
agent_search/tests/test_<module>.py::test_Y PASSED                       [ 50%]
agent_search/tests/test_<module>.py::test_Z PASSED                       [ 75%]
agent_search/tests/test_<module>.py::test_W PASSED                       [100%]

---------- coverage: platform linux, python 3.11.x -----------
Name                                                  Stmts   Miss  Cover
-----------------------------------------------------------------------------
agent_search/agent_v2/<module>.py                       42      4    90%
-----------------------------------------------------------------------------
TOTAL                                                  XXX     YY    ZZ%

================================ N passed in M.MMs =================================
```

**Coverage on new code:** XX % (target ≥ 80 %).

## Integration Test Results

Script: `scripts/TAG_<NUM>_integration.py`

```bash
$ AGENT_GRAPH_URL=http://localhost:8002 python scripts/TAG_<NUM>_integration.py

[PASS] TC-01 /healthz returns ok | HTTP 200
[PASS] TC-02 <name> | <detail>
[PASS] TC-03 <name> | <detail>

total=3 passed=3 failed=0
```

## Quality Gate

```bash
$ ruff check agent_search/agent_v2/<paths>/
All checks passed!

$ pyright agent_search/agent_v2/<paths>/
0 errors, 0 warnings, 0 informations

$ secret grep: no secrets
```

## Known Limitations

- <thing the ticket explicitly defers — link to follow-up>
- <perf characteristic worth documenting>

## Rollback

```bash
git revert <commit-sha>
# OR for a multi-commit branch:
git revert --no-commit <first>..<last> && git commit
```

If a migration ran (rare for this service), document the reverse SQL here.

## Sign-off

- [ ] Code reviewed
- [ ] Unit tests green
- [ ] Integration tests green
- [ ] Quality gate clean
- [ ] Test plan reviewed by …
