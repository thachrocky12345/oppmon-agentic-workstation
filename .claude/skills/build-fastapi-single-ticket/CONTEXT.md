# Phase 1 — Load Context (Ranked Checklist)

Read these in order. Stop after each one and decide whether the next is
worth reading for the ticket at hand.

## Tier 1 — Always read

1. **The ticket spec**: `docs/jira/TAG-<NUM>-*.md`.
   - Read the whole file. Note: *Objective*, *Requirements*, *Acceptance
     Criteria*, *Dependencies*, *Files Touched* (if pre-listed).
   - The "Blocks" section names downstream tickets — do not break their seams.
2. **`CLAUDE.md` (repo root)** — confirms scope (apps/agent_graph_backend/),
   snake_case DB convention, reference-only directory rule.
3. **The README**: `apps/agent_graph_backend/README.md` — local run, docker.
4. **Settings module**: `apps/agent_graph_backend/agent_search/agent_v2/config.py`
   — every env var the service reads. Add new fields here, not elsewhere.

## Tier 2 — Read if the ticket touches the matching subsystem

| Subsystem | Files |
|---|---|
| LLM provider/client | `agent_v2/llm/base.py` (Protocol), `agent_v2/llm/factory.py`, one concrete impl (e.g. `anthropic_client.py`) |
| FastAPI route / SSE | `agent_v2/app.py` (`mount_v2(app)`), `agent_v2/orchestrator/sse.py` |
| Planner / Searcher | `agent_v2/orchestrator/planner.py`, `searcher.py`, `loop.py`, `graph.py` |
| RAG / retrieval | `agent_v2/rag/retriever.py`, `hybrid_search.py`, `web_search.py`, `citation.py` |
| Tools | `agent_v2/tools/planner_tools.py`, `searcher_tools.py`, `registry.py` |
| Memory | `agent_v2/memory/conversational.py`, `tool_log.py` |
| Guardrails | `agent_v2/guardrails/constitution.py` |
| Auth / DB pool / corpus search | Don't exist yet — new modules per TAG-50 epic |

## Tier 3 — Read for cross-cutting concerns

- **Wire contract** (if endpoint changes): `docs/solve-v2.md` (if present).
- **Prior ticket's test plan**: `docs/jira/TAG-<NUM-1>/TAG_<NUM-1>_test.md`
  — for tone and structure to mirror.
- **Predecessor's code**: if the ticket says "Depends on: TAG-X", read the
  module(s) TAG-X created. Don't re-derive their decisions.
- **`apps/api/src/lib/`** for TS reference patterns when porting (e.g.
  `apps/api/src/crypto/secret-vault.ts` for TAG-54, `apps/api/src/lib/jwt.ts`
  for TAG-52, `apps/api/src/lib/search/` for TAG-59). The Python port must
  produce byte-equivalent results where applicable.

## Stop-and-ask triggers

Ask the user only when one of these is true:

- Ticket text contradicts existing code in a way only a human can resolve
  (e.g. "use the existing `XYZ` helper" but no such helper exists).
- A required dependency ticket is still open (TAG-50 "depends on TAG-49" —
  if TAG-49 is open, surface that, don't guess).
- The ticket asks for a secret/credential that isn't in `.env.example` AND
  isn't documented.
- The ticket's acceptance criteria are mutually exclusive with another
  open ticket (e.g. two tickets both want to own the same module path).

For anything else, apply the most reasonable senior-engineer interpretation,
note it in the test plan's "Decisions" section, and proceed.

## Audit-only tickets

If the ticket's status is "Done (findings captured)" or "Spike", skip
Phases 2–5. Produce only:

- A verification report at `docs/jira/TAG-<NUM>/TAG_<NUM>_verification.md`
  that re-runs the audit against current `main`, flags any drift, and
  proposes a follow-up ticket if findings have stale.

## Integration script reference scaffold

Use this as the starting shape; specialize per ticket:

```python
#!/usr/bin/env python
"""TAG-<NUM> — <one-line description> integration smoke.

Run:
    cd apps/agent_graph_backend
    python -m agent_search.v2_server &
    AGENT_GRAPH_URL=http://localhost:8002 python scripts/TAG_<NUM>_integration.py
"""
from __future__ import annotations
import os
import sys
import httpx

BASE_URL = os.getenv("AGENT_GRAPH_URL", "http://localhost:8002")
TIMEOUT = 30.0


class Runner:
    def __init__(self) -> None:
        self.base = BASE_URL
        self.client = httpx.Client(timeout=TIMEOUT)
        self.rows: list[tuple[str, bool, str]] = []

    # ---- test cases -------------------------------------------------

    def tc01_healthz(self) -> None:
        r = self.client.get(f"{self.base}/healthz")
        ok = r.status_code == 200 and r.json().get("status") == "ok"
        self.rows.append(("TC-01 /healthz returns ok", ok, f"HTTP {r.status_code}"))

    # def tc02_<your-next-case>(self) -> None: ...

    # ---- runner -----------------------------------------------------

    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            try:
                getattr(self, name)()
            except Exception as exc:  # noqa: BLE001 — top-level reporter
                self.rows.append((name, False, f"EXCEPTION: {exc!r}"))
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            print(f"{'[PASS]' if ok else '[FAIL]'} {name} | {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} failed={len(self.rows) - passed}")
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
```
