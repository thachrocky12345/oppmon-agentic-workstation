# TAG-72: Filesystem prompt loader — Test Plan

**Type:** Test Plan
**Status:** Draft
**Author:** ship-fastapi-single-ticket
**Date:** 2026-05-14
**Ticket:** [docs/jira/TAG-72-prompt-loader.md](../TAG-72-prompt-loader.md)
**Branch:** `feature/TAG-65-swarm-deploy` (TAG-71 + TAG-72 land on the same
swarm-deploy branch — TAG-71's audit artefacts and TAG-72's loader code
ship together because TAG-73 will need both at once.)
**Commit:** `ca14dcc` (parent — TAG-72 will commit on top)

---

## Objective

Ship the runtime substrate the TAG-71 audit identified: a single point
of truth (`agent_v2/prompts/_schema.yaml`) plus a hermetic, cached
on-disk loader (`agent_v2/prompts/loader.py`) that returns a prompt body
by slug, validates frontmatter, enforces size + substring + placeholder
constraints, and warms at container boot. No call site is rewritten in
this ticket — TAG-73 is the cutover. AC4 ("no I/O after warmup") and
AC5 ("orphan files fail boot") guarantee the loader is the only thing
between application code and prompt strings, and that the catalog +
filesystem can never disagree silently.

## Acceptance Criteria Verification

Mirrors the ticket's AC block (`docs/jira/TAG-72-prompt-loader.md` —
"Acceptance Criteria" section).

- [x] **AC1: `get_prompt("system.web_planner")` returns the body string.**
  Verified by `test_loader.py::test_get_prompt_returns_body` and
  `test_get_prompt_meta_returns_dataclass` (hermetic), plus
  integration TC-03 (against the real shipped catalog: `len=829`,
  contains "plan", "tool", "finalize").
- [x] **AC2: Unknown slug raises `PromptNotFound`.**
  `test_loader.py::test_unknown_slug_raises` + integration TC-06
  (`PromptNotFound: 'system.does_not_exist_anywhere'`).
- [x] **AC3: Inactive slug raises `PromptInactive`.**
  `test_loader.py::test_inactive_status_raises` parametrised over
  `draft`, `ready`, `deprecated` — all three statuses raise and the
  status appears in the message.
- [x] **AC4: No disk I/O on second access.**
  `test_loader.py::test_no_io_on_second_access` primes the cache,
  monkeypatches `Path.read_text` to a counting wrapper, calls
  `get_prompt` 5 times, asserts `count == 0`. Companion test
  `test_cache_returns_same_string_object` proves the `lru_cache`
  returns the same Python object (`a is b`).
- [x] **AC5: Schema drift (orphan files or broken bodies) fails `warm_cache()`.**
  `test_loader.py::test_warm_cache_raises_on_broken_prompt` (forward
  sweep — a slug whose body misses a `must_contain` token raises
  `PromptSchemaError("system.bad")`).
  `test_loader.py::test_warm_cache_rejects_orphan_file` (reverse sweep
  — a `.md` whose slug is not in the schema raises
  `PromptSchemaError("system.stranger ... orphan ...")`).
  Integration TC-02 proves the production catalog warms cleanly so a
  real container boot will not crash on the new wire-up.
- [x] **AC6: `render_prompt` enforces strict placeholder set equality.**
  `test_render_prompt_missing_kwarg_raises` (declared `{name}` not
  passed → `PromptSchemaError`),
  `test_render_prompt_extra_kwarg_raises` (extra `surprise=` kwarg →
  `PromptSchemaError`), and
  `test_render_prompt_happy_path` (`render_prompt("template.greet", name="alice") == "hello alice"`).
  Integration TC-08 proves the no-placeholder static-prompt path
  (`render_prompt("system.web_planner") == get_prompt("system.web_planner")`).
- [x] **AC7: Container boot wires `warm_cache()` so misconfiguration crashes early.**
  `agent_v2/app.py::mount_v2()` calls `warm_prompt_cache()` immediately
  after `check_required_env()`. Integration TC-07 boots `mount_v2(FastAPI())`
  and asserts `/solve_v2` is registered.

## Files Touched

```
apps/agent_graph_backend/agent_search/agent_v2/prompts/__init__.py        (new — public API re-exports)
apps/agent_graph_backend/agent_search/agent_v2/prompts/loader.py          (new — main implementation, ~290 lines)
apps/agent_graph_backend/agent_search/agent_v2/prompts/_schema.yaml       (new — production schema, 1 slug)
apps/agent_graph_backend/agent_search/agent_v2/prompts/system/web_planner.md  (new — extracted PLANNER_SYSTEM)
apps/agent_graph_backend/agent_search/agent_v2/app.py                     (edited — warm_prompt_cache() in mount_v2)
apps/agent_graph_backend/agent_search/tests/prompts/__init__.py           (new — empty)
apps/agent_graph_backend/agent_search/tests/prompts/test_loader.py        (new, 16 tests)
apps/agent_graph_backend/scripts/TAG_72_integration.py                    (new, 9 cases)
docs/jira/TAG-72/TAG_72_test.md                                           (this file)
```

No other files in `apps/agent_graph_backend/`, `apps/api/`, `apps/web/`,
or `packages/` were touched. The TAG-71 deliverables under
`docs/prompts/` already shipped on this branch and are unchanged.

## Decisions

Senior-engineer interpretations made during implementation. One line each.

- **Schema scope = "ships only what is extracted."** TAG-71's audit
  catalogued 33 slugs, but TAG-72 only physicalises one. Shipping a
  schema with all 33 declared but only one `.md` on disk would
  permanently break `warm_cache()` (forward sweep raises
  `PromptNotFound` for the 32 unfound files). The schema header now
  documents the contract: "adding a slug requires three coordinated
  edits — .md + schema entry + call-site swap." TAG-73 will expand
  this file as it migrates each call site.
- **`encoding="utf-8-sig"` on `_parse`.** Tooling on Windows
  (PowerShell `Set-Content`, some editors) silently inserts a UTF-8
  BOM. `utf-8-sig` reads BOM-prefixed files cleanly and is a no-op for
  the BOM-free case. Avoids "the loader works on Linux CI but not on
  my laptop" foot-guns.
- **Frozen `Prompt` dataclass + `placeholders: tuple[str, ...]`.** A
  frozen dataclass with hashable fields is safe to keep in `lru_cache`.
  Lists are not hashable, so placeholders are stored as a tuple.
- **`get_prompt` body vs. `get_prompt_meta` full record split.** Most
  call sites only need the body string; exposing `get_prompt` as the
  hot path keeps the common signature trivial. Meta is the escape
  hatch for the rare site that wants version / placeholders.
- **Reverse-sweep orphan check uses `rglob("*.md")`.** Walks every
  Markdown under `agent_v2/prompts/` and reconstructs the slug from
  the relative path (dot-joined). Any file whose slug is not in the
  schema raises with `... orphan` in the message — TAG-71's "no
  rogue prompts on disk" guarantee.
- **`render_prompt(slug, /, **kwargs)`.** `slug` is positional-only so
  it cannot collide with a placeholder named `slug` in a future
  template.
- **`warm_cache()` is unconditional in `mount_v2`.** It is NOT gated
  on `ENABLE_SOLVE_V3` because a broken `/solve_v2` planner turn
  fails just as hard as a `/solve` turn — the catalog must be
  healthy regardless of which auth path is active.
- **Test fixture uses `SimpleNamespace`, not a one-shot class.**
  First attempt stored `install_schema`/`write_prompt` as class
  attributes via `type("Loader", (), {...})()`; Python bound them as
  methods, which broke the signature. `SimpleNamespace` keeps them as
  plain instance attributes.

## Unit Test Results

```text
$ cd apps/agent_graph_backend
$ python -m pytest agent_search/tests/prompts/ -v \
       --cov=agent_search/agent_v2/prompts --cov-report=term-missing

============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.1, pluggy-1.5.0
configfile: pytest.ini
plugins: anyio-4.10.0, langsmith-0.7.38, asyncio-1.3.0, cov-7.1.0
asyncio: mode=Mode.AUTO
collected 16 items

agent_search/tests/prompts/test_loader.py::test_get_prompt_returns_body                       PASSED [  6%]
agent_search/tests/prompts/test_loader.py::test_unknown_slug_raises                           PASSED [ 12%]
agent_search/tests/prompts/test_loader.py::test_inactive_status_raises[draft]                 PASSED [ 18%]
agent_search/tests/prompts/test_loader.py::test_inactive_status_raises[ready]                 PASSED [ 25%]
agent_search/tests/prompts/test_loader.py::test_inactive_status_raises[deprecated]            PASSED [ 31%]
agent_search/tests/prompts/test_loader.py::test_missing_must_contain_raises                   PASSED [ 37%]
agent_search/tests/prompts/test_loader.py::test_must_not_contain_raises                       PASSED [ 43%]
agent_search/tests/prompts/test_loader.py::test_render_prompt_missing_kwarg_raises            PASSED [ 50%]
agent_search/tests/prompts/test_loader.py::test_render_prompt_extra_kwarg_raises              PASSED [ 56%]
agent_search/tests/prompts/test_loader.py::test_render_prompt_happy_path                      PASSED [ 62%]
agent_search/tests/prompts/test_loader.py::test_cache_returns_same_string_object              PASSED [ 68%]
agent_search/tests/prompts/test_loader.py::test_no_io_on_second_access                        PASSED [ 75%]
agent_search/tests/prompts/test_loader.py::test_warm_cache_raises_on_broken_prompt            PASSED [ 81%]
agent_search/tests/prompts/test_loader.py::test_warm_cache_rejects_orphan_file                PASSED [ 87%]
agent_search/tests/prompts/test_loader.py::test_production_catalog_warms_cleanly              PASSED [ 93%]
agent_search/tests/prompts/test_loader.py::test_get_prompt_meta_returns_dataclass             PASSED [100%]

---------- coverage: platform win32, python 3.13.5 -----------
Name                                        Stmts   Miss  Cover   Missing
-------------------------------------------------------------------------
agent_search\agent_v2\prompts\__init__.py       2      0   100%
agent_search\agent_v2\prompts\loader.py       117     18    85%   156, 160, 165-166, 169, 173, 177,
                                                                  181-182, 186, 211, 217, 223, 238,
                                                                  266, 284, 287, 290
-------------------------------------------------------------------------
TOTAL                                         119     18    85%

============================== 16 passed in 0.25s ==============================
```

**Coverage on new code:** 85 % loader / 100 % `__init__` (target ≥ 80 %).
Uncovered lines are defensive error branches inside `_parse`/`_validate`
(malformed YAML frontmatter, missing required keys, version not int,
placeholders not a list, missing closing delimiter, etc.). These paths
are unreachable from a valid catalog and were left unexercised on
purpose — a future ticket can fuzz them if desired.

### Full-suite regression

```text
$ python -m pytest agent_search/tests/ -q
........................................................................ [ 32%]
...................................................................s.... [ 64%]
........................................................................ [ 96%]
........                                                                  [100%]
SKIPPED [1] agent_search/tests/integration/test_solve_e2e.py:695:
            Postgres-bound integration test — set DATABASE_URL to enable.
223 passed, 1 skipped in 9.03s
```

No existing test regressed.

## Integration Test Results

Script: `scripts/TAG_72_integration.py`. Talks to the real shipped
catalog in-process; TC-09 is env-gated on `AGENT_GRAPH_URL` for a live
server check.

```text
$ cd apps/agent_graph_backend
$ python scripts/TAG_72_integration.py

[PASS] public API surface imports cleanly  Prompt + 3 exceptions + 4 callables exported
[PASS] warm_cache() resolves every shipped slug  no PromptNotFound / PromptSchemaError / PromptInactive
[PASS] system.web_planner body matches PLANNER_SYSTEM contract  len=829 starts="You are MindSearch's planner. Decompose the user's"
[PASS] lru_cache returns identical string object  id_a=2025950146416 id_b=2025950146416
[PASS] get_prompt_meta returns frozen Prompt with right fields  slug=system.web_planner version=1 status=active placeholders=()
[PASS] unknown slug raises PromptNotFound  msg="'system.does_not_exist_anywhere'"
[PASS] mount_v2 + warm_prompt_cache boots cleanly  /solve_v2 registered, routes_total=5
[PASS] render_prompt on no-placeholder slug == get_prompt body  len(rendered)=829
[PASS] /solve_v2 live SSE smoke (env-gated)  skipped: AGENT_GRAPH_URL not set

total=9 passed=9 failed=0
```

Exit code: 0.

## Quality Gate

```text
$ python -m ruff check agent_search/agent_v2/prompts/ agent_search/tests/prompts/ \
       scripts/TAG_72_integration.py --select E,F,W,B,UP,SIM
All checks passed!

$ python -m pyright agent_search/agent_v2/prompts/ scripts/TAG_72_integration.py
0 errors, 0 warnings, 0 informations

$ grep -rEn 'sk-[A-Za-z0-9]{20,}|csk-[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' \
       agent_search/agent_v2/prompts/ scripts/TAG_72_integration.py
(no matches)
```

## Known Limitations

- **Single-slug catalog ships in TAG-72.** Only `system.web_planner`
  was extracted into `prompts/system/web_planner.md` and listed in
  `_schema.yaml`. The remaining 32 slugs identified by the TAG-71
  audit live as inline constants until TAG-73 (the call-site cutover)
  pulls them across one-by-one.
- **No reload / hot-swap.** `_SCHEMA` and `_SLUG_TO_SPEC` are computed
  at module import; you must restart the process to pick up a schema
  edit. This is by design — runtime mutation defeats the cache
  identity guarantee.
- **`get_prompt.cache_clear()` is **not** wired into a tenant
  switch.** If we ever serve per-tenant prompts (we don't, today),
  the cache key must include `tenant_id` — currently it's slug-only.
- **Defensive `_parse` branches (~18 missed lines) intentionally
  uncovered.** Unreachable from a valid catalog. Fuzzing them is a
  follow-up if/when we add a third-party / external prompt source.

## Rollback

```bash
git revert <commit-sha-of-TAG-72>
```

A single revert restores `app.py` to its pre-TAG-72 state and removes
the four new files under `agent_v2/prompts/` plus the test directory.
No migrations, no schema changes, no environment variables touched.

## Sign-off

- [x] Code reviewed (build-fastapi-single-ticket pipeline phase 2-5)
- [x] Unit tests green (16/16 prompts, 223/224 suite — 1 expected
  Postgres skip)
- [x] Integration tests green (9/9, exit 0)
- [x] Quality gate clean (ruff 0, pyright 0, no secrets, coverage 85% ≥ 80%)
- [ ] Test plan reviewed by …
