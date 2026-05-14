---
name: build-fastapi-single-ticket
description: End-to-end implementation pipeline for a single backend ticket in apps/agent_graph_backend (Python + FastAPI + async). Load context, build code, write pytest unit tests, write an httpx integration script, run a quality gate, and produce a test-plan markdown. Use when asked to "ship TAG-XXX", "implement FastAPI ticket end-to-end", "build this agent_search ticket", or when the user names a TAG-* ticket and wants the full deliverable (code + tests + script + quality + test plan).
---

# Build FastAPI Single Ticket

Canonical pipeline for shipping one backend ticket in
`apps/agent_graph_backend/` (Python 3.11+, FastAPI, async). Adapted from
`build-backend-single-ticket` (which targets Django/DRF) to match this
service's async/Pydantic/SSE conventions.

## The Six Phases (in order)

```
1. Context  →  2. Build  →  3. Unit tests  →  4. Integration script  →  5. Quality gate  →  6. Test plan doc
```

Do not skip phases. Do not reorder. Each phase has a green-light gate before
moving to the next.

## Fresh-Agent Bootstrap (read this first if context was just cleared)

When invoked on a ticket like `TAG-51`, do these four discovery steps
**before** Phase 1. They take a few seconds and prevent foot-guns:

1. **Read the canonical workspace map**: `CLAUDE.md` (root) — confirms
   the snake_case DB convention, the reference-only directory, and the
   `apps/agent_graph_backend/` scope.
2. **Confirm the service builds and starts**:
   ```bash
   docker ps --filter "name=graph-agent" --format "{{.Names}}"
   # OR locally:
   cd apps/agent_graph_backend && python -c "from agent_search.agent_v2.app import mount_v2; print('imports OK')"
   ```
3. **Confirm or create a feature branch** at repo root:
   ```bash
   git status --short
   git rev-parse --abbrev-ref HEAD
   ```
   If on `main` or `dev`, branch off: `git checkout -b feature/TAG-<NUM>-<slug>`.
4. **Locate the ticket spec** and any dependencies it declares:
   - `docs/jira/TAG-<NUM>-*.md` — the spec
   - The "Depends on" section names blocking tickets — confirm they're done
   - The "Blocks" section tells you who depends on you (don't break their seams)

Then proceed to Phase 1. The four reference files in this skill folder
(this SKILL.md + CONTEXT.md + TESTING.md + QUALITY.md + TESTPLAN_TEMPLATE.md)
contain everything the agent needs.

## Phase 1 — Load Context

Before writing any code, read the inputs that constrain the design.
See [CONTEXT.md](CONTEXT.md) for the ranked checklist.

Minimum reading:
- The ticket spec (`docs/jira/TAG-<NUM>-*.md`)
- The wire contract (`docs/solve-v2.md` if the ticket touches `/solve_v2`)
- The relevant module(s) in `apps/agent_graph_backend/agent_search/agent_v2/`
- `requirements-v2.txt` — confirm needed packages exist or plan to add them
- The prior ticket's test plan (if exists, for tone)
- For any ticket that touches LLM clients: `agent_v2/llm/base.py`,
  `agent_v2/llm/factory.py`, and one concrete client (e.g. `anthropic_client.py`)

Stop and ask only if a hard contradiction exists between the ticket text
and the codebase. Otherwise apply the most reasonable senior-engineer
assumption and proceed.

**Audit-only tickets** (status "Done (findings captured)" or "Spike"):
skip Phases 2–5. Go straight to Phase 6 and write a verification report
that confirms the audit findings still hold against the current code,
or amend the ticket with a fresh "Verified-on" timestamp.

## Phase 2 — Build

Scope is `apps/agent_graph_backend/agent_search/` only. Touch the minimum
surface area:

- **New module per concern** under `agent_v2/`:
  - LLM provider → `agent_v2/llm/<provider>_client.py` (follow `base.py` Protocol)
  - DB pool → `agent_v2/db/pool.py`
  - Auth dep → `agent_v2/auth/jwt.py`, `agent_v2/auth/deps.py`
  - Corpus search → `agent_v2/rag/corpus_search.py`
  - Prompts → `agent_v2/prompts/<slug>.md` + `agent_v2/prompts/loader.py`
- **Wire factories** in the existing factory files; never bypass them.
- **Settings** go in `agent_v2/config.py` (Pydantic `Settings`). Add fields
  with sane defaults; never read `os.environ` directly in business code.
- **FastAPI routes** mount via `app.py`'s `mount_v2(app)` — never define
  routes outside this entrypoint.
- **Async everywhere** the request path touches. Sync helpers OK for
  pure-logic modules; use `asyncio.to_thread` for unavoidable sync I/O.
- **No secrets in code**, `.env.example`, or test fixtures. Use env vars
  resolved via `Settings`.

Green-light gate:
```bash
cd apps/agent_graph_backend
python -c "from agent_search.agent_v2.app import mount_v2; from fastapi import FastAPI; mount_v2(FastAPI()); print('OK')"
```
And if the ticket adds a new endpoint, the server actually starts:
```bash
python -m agent_search.v2_server &  # smoke; kill after /healthz returns 200
curl -fsS http://localhost:8002/healthz
```

## Phase 3 — Unit Tests (pytest + pytest-asyncio)

Location: `apps/agent_graph_backend/agent_search/tests/test_<module>.py`.
One test file per non-trivial module. Aim for >80 % coverage of the
new/changed code.

If this is the first test in the service, create:
- `agent_search/tests/__init__.py` (empty)
- `agent_search/tests/conftest.py` (fixtures — see TESTING.md)
- `pytest.ini` at `apps/agent_graph_backend/pytest.ini` with:
  ```ini
  [pytest]
  asyncio_mode = auto
  testpaths = agent_search/tests
  ```

Patterns this service must use (full reference in [TESTING.md](TESTING.md)):

- `@pytest.mark.asyncio` on async tests, OR set `asyncio_mode = auto` and
  just write `async def test_*`.
- `monkeypatch.setenv("KEY", "val")` **before** importing modules that read
  `Settings()` at module level.
- `unittest.mock.AsyncMock` (not `MagicMock`) for awaited mocks.
- `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))` for in-process
  endpoint tests. Use `httpx.AsyncClient(base_url="http://test")` for
  out-of-process tests.
- For SSE: iterate `response.aiter_lines()`; assert on `event:` / `data:` frames.
- Inject `LLMClient` and `WebSearch` via Protocol — use `FakeLLMClient`
  (already in `agent_v2/llm/fake_client.py`) in tests.

Green-light gate:
```bash
cd apps/agent_graph_backend
pip install pytest pytest-asyncio httpx                # idempotent
pytest agent_search/tests/ -v                           # 0 failures, 0 errors
pytest agent_search/tests/ --cov=agent_search --cov-report=term-missing
```
Coverage on the new/changed code ≥ 80 %. Existing tests still pass.

## Phase 4 — Integration Test Script

One script per ticket: `scripts/TAG_<NUM>_integration.py`.

This is an **out-of-process smoke** — it talks to a running FastAPI server
over HTTP. It is NOT a substitute for unit tests; it proves the wire works.

The script must:

1. Default `BASE_URL = os.getenv("AGENT_GRAPH_URL", "http://localhost:8002")`.
2. Use `httpx.Client` (sync) or `httpx.AsyncClient` (async, for SSE streams).
3. Numbered `tcNN_*` methods; each appends a `(name, passed, detail)` row.
4. Wipe / seed any state via dedicated endpoints OR a DB-level fixture script.
5. Print `[PASS]/[FAIL] TC-NN: ...` per test and a
   `total=N passed=N failed=N` summary.
6. Exit non-zero on any failure.

Reference scaffold (full template in CONTEXT.md):

```python
#!/usr/bin/env python
"""TAG-<NUM> integration smoke."""
import os, sys, httpx

class Runner:
    def __init__(self):
        self.base = os.getenv("AGENT_GRAPH_URL", "http://localhost:8002")
        self.client = httpx.Client(timeout=30)
        self.rows: list[tuple[str, bool, str]] = []

    def tc01_healthz(self):
        r = self.client.get(f"{self.base}/healthz")
        self.rows.append(("healthz returns 200", r.status_code == 200, r.text[:80]))

    def run(self) -> int:
        for name in [m for m in dir(self) if m.startswith("tc")]:
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            print(f"{'[PASS]' if ok else '[FAIL]'} {name}  {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} failed={len(self.rows)-passed}")
        return 0 if passed == len(self.rows) else 1

if __name__ == "__main__":
    sys.exit(Runner().run())
```

Green-light gate: `total=N passed=N failed=0`. Capture the full stdout —
you paste it into Phase 6.

## Phase 5 — Quality Gate

This service has no Sonar. Run a tight, fast, repo-local quality bar
on the changed paths only. Full recipes in [QUALITY.md](QUALITY.md).

```bash
cd apps/agent_graph_backend

# Coverage (already from Phase 3)
pytest agent_search/tests/ --cov=agent_search --cov-report=term-missing -q

# Lint — install once, run on changed code
pip install ruff
ruff check agent_search/agent_v2/<your-paths>/ --select E,F,W,B,UP,SIM

# Type check (optional but encouraged)
pip install pyright
pyright agent_search/agent_v2/<your-paths>/

# Secret grep — every push should pass this
grep -rEn 'sk-[A-Za-z0-9]{20,}|csk-[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' agent_search/ && exit 1 || echo "no secrets"
```

Fix every issue in the new/changed code; do not touch unrelated existing
violations (file a follow-up ticket if you spot one).

After fixing, re-run Phases 3 and 4 — the fixes must not regress tests.

Green-light gate: `ruff check` 0 issues on changed paths; `pyright` 0 errors
on changed paths (warnings OK if documented); coverage ≥ 80 %; no secret
matches; unit + integration suites still green.

## Phase 6 — Test Plan Doc

Path: `docs/jira/TAG-<NUM>/TAG_<NUM>_test.md`. Create the folder if it
doesn't exist. Use [TESTPLAN_TEMPLATE.md](TESTPLAN_TEMPLATE.md).

Fill in:
- Objective (one paragraph)
- Acceptance criteria from the ticket (mirror them, mark each ✅/❌)
- Files touched (paths only)
- Unit test results (paste of `pytest -v` output)
- Coverage % (from `--cov` output)
- Integration test results (paste of script output)
- Quality gate (ruff, pyright, secrets summary)
- Known limitations
- Rollback steps (which commits to revert)

Final deliverable: code + unit tests + integration script + 0 critical
quality issues + test plan markdown. That is "done".

## Anti-patterns

- Pushing without running unit + integration tests locally first.
- Reading `os.environ[...]` outside `config.py` — always go through `Settings`.
- Defining FastAPI routes outside `mount_v2(app)` — breaks the contract.
- Skipping `AsyncMock` and using `MagicMock` for awaited coroutines (silently passes; doesn't actually mock).
- Hardcoding `localhost:8002` in tests — always read from env with a default.
- Implementing stubs for downstream tickets. Leave the seam (e.g.
  `get_prompt(slug)` returning a constant on day one) and let the next ticket
  fill it in.
- Touching files outside `apps/agent_graph_backend/` AND `scripts/` AND
  `docs/jira/`. If you must, justify in the test plan's "Files Touched".
- Storing test API keys in `.env.example` or fixtures. Use `LLM_PROVIDER=fake`.

## User Kickoff Prompt (paste this after `/clear`)

The user can paste this verbatim with the ticket number filled in to start
a fresh session:

```
Use the build-fastapi-single-ticket skill to ship TAG-<NUM>.

Run the Fresh-Agent Bootstrap (discover service health, branch, ticket spec
+ dependencies), then walk Phases 1–6 in order. The ticket spec is at
docs/jira/TAG-<NUM>-*.md.

Final deliverable: code in apps/agent_graph_backend/agent_search/, pytest
tests in agent_search/tests/, integration script at
scripts/TAG_<NUM>_integration.py, ruff/pyright clean on changed paths,
≥80% coverage on new code, and test plan at
docs/jira/TAG-<NUM>/TAG_<NUM>_test.md.
```

If the user just says *"ship TAG-<NUM>"* without pasting the prompt, treat
that as equivalent to the above and start the bootstrap immediately.

## See Also

- [CONTEXT.md](CONTEXT.md) — what to read before coding
- [TESTING.md](TESTING.md) — pytest-asyncio patterns, FakeLLMClient, SSE testing
- [QUALITY.md](QUALITY.md) — ruff, pyright, secret grep recipes
- [TESTPLAN_TEMPLATE.md](TESTPLAN_TEMPLATE.md) — test-plan markdown skeleton
- `docs/jira/TAG-49-provider-integration-audit.md` — reference audit ticket
- `apps/agent_graph_backend/agent_search/agent_v2/llm/base.py` — LLMClient Protocol
- `apps/agent_graph_backend/agent_search/agent_v2/llm/fake_client.py` — test LLM
- `apps/agent_graph_backend/agent_search/agent_v2/app.py` — `mount_v2(app)` entrypoint
- `apps/agent_graph_backend/README.md` — local run + docker
