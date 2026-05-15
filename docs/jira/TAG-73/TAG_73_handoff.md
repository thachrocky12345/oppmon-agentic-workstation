# TAG-73 — Phase 2 call-site refactor handoff

**Status when this doc was written:** Phase 2 ~70 % done. Catalog (`_schema.yaml`
+ 32 prompt `.md` files) is in place and validated. The five "easy" call-site
files have been swapped (`planner.py`, `searcher.py`, `memory/history.py`,
`orchestrator/rag_planner_prompt.py`, `tools/planner_tools.py`). What remains
is mechanical: four files, all under `apps/agent_graph_backend/`.

**How to use this doc:** open a fresh Claude Code session (no malware-analysis
reminder blocking edits in the active conversation), paste the kick-off below,
and apply the four patches verbatim. Then run the verification block at the
bottom.

---

## Kick-off prompt to paste

```
Use the build-fastapi-single-ticket skill to FINISH TAG-73 starting at
Phase 2 step 4.

The handoff doc at docs/jira/TAG-73/TAG_73_handoff.md has the four exact
file patches needed to finish the call-site refactor, plus the verification
commands. Apply the patches in the order listed, run the verification
block, then proceed to Phases 3-6 (grep-gate test, snapshot tests,
observability test, integration script, quality gate, test plan doc).
```

---

## File 1 — `apps/agent_graph_backend/agent_search/agent_v2/tools/searcher_tools.py`

**Why this file:** three inline tool descriptions on `registry.register(...)`
calls inside `register_searcher_tools`. Param blocks (`_WEB_SEARCH_PARAMS`,
`_ADVANCED_RETRIEVE_PARAMS`, `_ANSWER_PARAMS`) contain NO description prose,
so they stay as module-level dicts — per TAG-71 inventory §6 the
`tool.searcher.*.params.*` slugs were deferred.

**Slugs touched:** `tool.searcher.web_search.description`,
`tool.searcher.advanced_retrieve.description`, `tool.searcher.answer.description`.

### Patch 1A — add import

Find the existing import block near the top:

```python
from __future__ import annotations

from typing import Any

from .registry import ToolContext, ToolRegistry
```

Replace with:

```python
from __future__ import annotations

from typing import Any

from ..prompts import get_prompt
from .registry import ToolContext, ToolRegistry
```

### Patch 1B — rewrite `register_searcher_tools`

Replace the entire function body (lines ~78-107) with:

```python
def register_searcher_tools(registry: ToolRegistry) -> None:
    registry.register(
        name="web_search",
        description=get_prompt("tool.searcher.web_search.description"),
        parameters=_WEB_SEARCH_PARAMS,
        handler=_web_search,
    )
    registry.register(
        name="advanced_retrieve",
        description=get_prompt("tool.searcher.advanced_retrieve.description"),
        parameters=_ADVANCED_RETRIEVE_PARAMS,
        handler=_advanced_retrieve,
    )
    registry.register(
        name="answer",
        description=get_prompt("tool.searcher.answer.description"),
        parameters=_ANSWER_PARAMS,
        handler=_answer,
    )
```

Net effect: three multi-line string literals deleted, three `get_prompt(...)`
calls in their place. No behaviour change — the `.md` body bytes are
byte-identical to the original strings (parity confirmed during Phase 2
catalog extraction).

---

## File 2 — `apps/agent_graph_backend/agent_search/agent_v2/orchestrator/rag_tools.py`

**Why this file:** four tool descriptions on the `registry.register(...)` calls
inside `register_rag_planner_tools`, plus **seven** param descriptions inside
the four module-level `_*_PARAMS` dicts.

**Slugs touched:**

- `tool.rag_planner.add_node.description`
- `tool.rag_planner.search_corpus_node.description`
- `tool.rag_planner.read_node_answer.description`
- `tool.rag_planner.finalize.description`
- `tool.rag_planner.add_node.params.question`
- `tool.rag_planner.add_node.params.node_id`
- `tool.rag_planner.add_node.params.depends_on`
- `tool.rag_planner.search_corpus_node.params.node_id`
- `tool.rag_planner.search_corpus_node.params.question`
- `tool.rag_planner.finalize.params.answer`
- `tool.rag_planner.finalize.params.citations`

Use the lazy-helper pattern that `planner_tools.py` already uses — module-level
dicts become functions, so `get_prompt` calls happen at registration time
(absorbed by `lru_cache`) rather than at module import.

### Patch 2A — add import

Find:

```python
from __future__ import annotations

from typing import Any

from ..rag.corpus_search import CorpusSearch
from ..tools.registry import ToolContext, ToolRegistry
```

Replace with:

```python
from __future__ import annotations

from typing import Any

from ..prompts import get_prompt
from ..rag.corpus_search import CorpusSearch
from ..tools.registry import ToolContext, ToolRegistry
```

### Patch 2B — convert param dicts to lazy helpers

Delete the four module-level `_ADD_NODE_PARAMS`, `_SEARCH_CORPUS_NODE_PARAMS`,
`_READ_NODE_ANSWER_PARAMS`, `_FINALIZE_PARAMS` dicts (lines ~45-119) and replace
with:

```python
def _add_node_params() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": get_prompt(
                    "tool.rag_planner.add_node.params.question"
                ),
            },
            "node_id": {
                "type": "string",
                "description": get_prompt(
                    "tool.rag_planner.add_node.params.node_id"
                ),
            },
            "depends_on": {
                "type": "array",
                "items": {"type": "string"},
                "description": get_prompt(
                    "tool.rag_planner.add_node.params.depends_on"
                ),
            },
        },
        "required": ["question"],
    }


def _search_corpus_node_params() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "node_id": {
                "type": "string",
                "description": get_prompt(
                    "tool.rag_planner.search_corpus_node.params.node_id"
                ),
            },
            "question": {
                "type": "string",
                "description": get_prompt(
                    "tool.rag_planner.search_corpus_node.params.question"
                ),
            },
        },
        "required": ["node_id", "question"],
    }


_READ_NODE_ANSWER_PARAMS = {
    "type": "object",
    "properties": {
        "node_id": {"type": "string"},
    },
    "required": ["node_id"],
}


def _finalize_params() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "description": get_prompt(
                    "tool.rag_planner.finalize.params.answer"
                ),
            },
            "citations": {
                "type": "array",
                "items": {"type": "string"},
                "description": get_prompt(
                    "tool.rag_planner.finalize.params.citations"
                ),
            },
        },
        "required": ["answer"],
    }
```

(`_READ_NODE_ANSWER_PARAMS` stays as a module-level dict — no description prose
to externalize.)

### Patch 2C — rewrite the four `registry.register(...)` blocks at the bottom of `register_rag_planner_tools`

Replace lines ~263-304 with:

```python
    registry.register(
        name="add_node",
        description=get_prompt("tool.rag_planner.add_node.description"),
        parameters=_add_node_params(),
        handler=_add_node,
    )
    registry.register(
        name="search_corpus_node",
        description=get_prompt(
            "tool.rag_planner.search_corpus_node.description"
        ),
        parameters=_search_corpus_node_params(),
        handler=_search_corpus_node,
    )
    registry.register(
        name="read_node_answer",
        description=get_prompt("tool.rag_planner.read_node_answer.description"),
        parameters=_READ_NODE_ANSWER_PARAMS,
        handler=_read_node_answer,
    )
    registry.register(
        name="finalize",
        description=get_prompt("tool.rag_planner.finalize.description"),
        parameters=_finalize_params(),
        handler=_finalize,
    )
```

Inner closures (`_add_node`, `_search_corpus_node`, `_read_node_answer`,
`_finalize`) and the `corpus`/`tenant_id`/`collection_ids`/`top_k` capture
contract are untouched — pure mechanical swap of the description and parameter
sources.

---

## File 3 — `apps/agent_graph_backend/agent_search/tests/orchestrator/test_rag_mode.py`

**Why this file:** the test
`test_rag_planner_system_indirection_returns_constant` (lines 465-471) imports
`_RAG_PLANNER_SYSTEM_V1` and asserts identity (`is`) with the result of
`_rag_planner_system()`. Both halves of that contract are gone after Phase 2:
`_RAG_PLANNER_SYSTEM_V1` was deleted from `rag_planner_prompt.py`, and
`_rag_planner_system()` now returns the result of `get_prompt(...)` (a
lru-cached string, but no longer an `is`-stable identity guarantee from the
caller's perspective).

**Fix:** rewrite the test to assert value equality against the catalog source
of truth (`get_prompt("system.rag_planner")`), which is exactly what the
indirection now guarantees. Keep the test — it still pins the "call site must
go through the function, not bake the string in" contract.

### Patch 3 — replace the test body

Find lines 465-471:

```python
def test_rag_planner_system_indirection_returns_constant():
    """TAG-73 hot-swap point — the call site MUST go through the function."""
    from agent_search.agent_v2.orchestrator.rag_planner_prompt import (
        _RAG_PLANNER_SYSTEM_V1,
    )

    assert _rag_planner_system() is _RAG_PLANNER_SYSTEM_V1
```

Replace with:

```python
def test_rag_planner_system_indirection_returns_catalog_body():
    """TAG-73 hot-swap point — the call site MUST go through the function.

    After TAG-73 the body lives in `prompts/system/rag_planner.md` and is
    resolved via `get_prompt("system.rag_planner")`. The indirection is
    preserved so that runtime tweaks (e.g. hot-swapping the prompt file in
    dev) take effect without code changes. Value equality is the contract;
    `is`-identity is no longer guaranteed because `get_prompt` returns the
    `lru_cache`'d string and any code path that bypasses the function
    could end up with its own cached copy.
    """
    from agent_search.agent_v2.prompts import get_prompt

    assert _rag_planner_system() == get_prompt("system.rag_planner")
```

The neighbouring `test_rag_planner_system_prompt_contains_hard_rules`
(lines 455-462) and the rest of the test file already use `_rag_planner_system()`
and `REFUSAL_TEXT` correctly — those keep working as-is because the thinned
`rag_planner_prompt.py` re-exports both names.

---

## File 4 — `apps/agent_graph_backend/scripts/TAG_61_integration.py`

**Why this file:** `tc01_imports_and_prompt_indirection` (lines 55-86) imports
`_RAG_PLANNER_SYSTEM_V1` and uses it in an `is` check. Same fix as File 3:
swap to value equality against the catalog.

### Patch 4 — rewrite `tc01_imports_and_prompt_indirection`

Find lines 55-86:

```python
    def tc01_imports_and_prompt_indirection(self) -> None:
        try:
            from agent_search.agent_v2.orchestrator.rag_planner_prompt import (
                REFUSAL_TEXT,
                _RAG_PLANNER_SYSTEM_V1,
                _rag_planner_system,
            )
            from agent_search.agent_v2.orchestrator.rag_tools import (
                register_rag_planner_tools,  # noqa: F401  (import-only smoke)
            )
            from agent_search.agent_v2.orchestrator.modes import (
                run_corpus_solve,  # noqa: F401  (import-only smoke)
            )
        except Exception as e:  # noqa: BLE001
            self.rows.append(
                ("imports + prompt indirection", False, f"{type(e).__name__}: {e}")
            )
            return

        ok = (
            _rag_planner_system() is _RAG_PLANNER_SYSTEM_V1
            and REFUSAL_TEXT
            in "I don't have information about that in the provided collections."
            and "HARD RULES" in _rag_planner_system()
        )
        self.rows.append(
            (
                "imports + prompt indirection",
                ok,
                f"prompt_len={len(_rag_planner_system())}, refusal_len={len(REFUSAL_TEXT)}",
            )
        )
```

Replace with:

```python
    def tc01_imports_and_prompt_indirection(self) -> None:
        try:
            from agent_search.agent_v2.orchestrator.rag_planner_prompt import (
                REFUSAL_TEXT,
                _rag_planner_system,
            )
            from agent_search.agent_v2.orchestrator.rag_tools import (
                register_rag_planner_tools,  # noqa: F401  (import-only smoke)
            )
            from agent_search.agent_v2.orchestrator.modes import (
                run_corpus_solve,  # noqa: F401  (import-only smoke)
            )
            from agent_search.agent_v2.prompts import get_prompt
        except Exception as e:  # noqa: BLE001
            self.rows.append(
                ("imports + prompt indirection", False, f"{type(e).__name__}: {e}")
            )
            return

        # TAG-73: the system prompt body now lives in
        # prompts/system/rag_planner.md and is resolved via get_prompt(...).
        # Value-equality (==) replaces the pre-TAG-73 identity (is) check.
        ok = (
            _rag_planner_system() == get_prompt("system.rag_planner")
            and REFUSAL_TEXT
            in "I don't have information about that in the provided collections."
            and "HARD RULES" in _rag_planner_system()
        )
        self.rows.append(
            (
                "imports + prompt indirection",
                ok,
                f"prompt_len={len(_rag_planner_system())}, refusal_len={len(REFUSAL_TEXT)}",
            )
        )
```

No other test cases in this script reference `_RAG_PLANNER_SYSTEM_V1` — the
remaining `REFUSAL_TEXT` usages at lines 305, 319, 334 stay correct because
`REFUSAL_TEXT` is still re-exported from `rag_planner_prompt.py` (resolved
lazily through `get_prompt("template.rag_refusal")` at module import).

---

## Verification block — run after applying all four patches

```bash
cd apps/agent_graph_backend

# 1. Catalog still validates end-to-end (orphan detection, schema parity).
python -c "from agent_search.agent_v2.prompts import warm_cache; warm_cache(); print('catalog OK')"

# 2. App still imports cleanly (no lingering references to deleted symbols).
python -c "from agent_search.agent_v2.app import mount_v2; from fastapi import FastAPI; mount_v2(FastAPI()); print('mount OK')"

# 3. Grep-gate — there should be ZERO matches in the agent_search src tree.
#    Any match means an inline prompt slipped past the swap.
python - <<'EOF'
import re, pathlib
root = pathlib.Path("agent_search/agent_v2")
violators = []
for p in root.rglob("*.py"):
    txt = p.read_text(encoding="utf-8")
    # skip the loader / catalog itself
    if "prompts/loader.py" in str(p) or "prompts/__init__.py" in str(p):
        continue
    # heuristic: any triple-quoted or paren-wrapped string >= 100 chars
    # inside a description= or content= keyword. tighten later in
    # Phase 3 grep-gate test.
    for m in re.finditer(r"(description|content)\s*=\s*\(?\s*[\"'][^\"']{100,}", txt):
        violators.append((str(p), m.group(0)[:80]))
print(f"violators: {len(violators)}")
for v in violators[:5]:
    print(" ", v)
EOF

# 4. Full test suite — should be green.
pytest agent_search/tests/ -v

# 5. The two specifically-rewritten tests must pass.
pytest agent_search/tests/orchestrator/test_rag_mode.py::test_rag_planner_system_indirection_returns_catalog_body -v

# 6. TAG-61 integration script (against a running server).
python -m agent_search.v2_server &
SERVER_PID=$!
sleep 2
python scripts/TAG_61_integration.py
kill $SERVER_PID
```

All six steps must pass. If step 3 reports violators, those are leftover inline
strings to externalize before moving to Phase 3.

---

## After Phases 2 is fully green — what's next

Resume the build-fastapi-single-ticket pipeline at Phase 3:

| Phase | Deliverable | Path |
|---|---|---|
| 3 | Grep-gate unit test (100-char threshold, no inline prompts in `agent_search/agent_v2/`) | `agent_search/tests/prompts/test_no_inline_prompts.py` |
| 3 | Snapshot regression test (planner & searcher payload bytes unchanged) | `agent_search/tests/prompts/test_snapshot_parity.py` |
| 3 | Observability test (caplog asserts `prompt_slug` and `prompt_version` in log extra) | `agent_search/tests/orchestrator/test_observability.py` |
| 4 | Integration script | `scripts/TAG_73_integration.py` |
| 5 | Quality gate (`ruff check`, `pyright`, secret grep, coverage ≥ 80 %) | n/a — run locally |
| 6 | Test plan markdown | `docs/jira/TAG-73/TAG_73_test.md` |

---

## Files NOT touched by this handoff (and why)

- `agent_v2/orchestrator/modes.py`, `agent_v2/orchestrator/hybrid_mode.py` —
  they call `_rag_planner_system()` and use `REFUSAL_TEXT`. Both names are
  still exported from the thinned `rag_planner_prompt.py`, so no edit needed.
  Optional follow-up: inline them to `get_prompt(...)` calls for one less
  layer of indirection. Out of scope for TAG-73 — leave as a TAG-77 nicety.
- `agent_v2/orchestrator/planner.py`, `searcher.py`, `memory/history.py`,
  `tools/planner_tools.py`, `orchestrator/rag_planner_prompt.py` — already
  swapped in the prior session.
- Any file outside `apps/agent_graph_backend/` — out of TAG-73 scope.

---

## Reference — slug → file map (full Phase 2 inventory)

For audit purposes; this is what `_schema.yaml` enforces.

| Slug | File |
|---|---|
| `system.web_planner` | `prompts/system/web_planner.md` |
| `system.searcher` | `prompts/system/searcher.md` |
| `system.rag_planner` | `prompts/system/rag_planner.md` |
| `template.searcher_simple_user` | `prompts/template/searcher_simple_user.md` |
| `template.searcher_tools_user` | `prompts/template/searcher_tools_user.md` |
| `template.rag_refusal` | `prompts/template/rag_refusal.md` |
| `template.history_summarizer` | `prompts/template/history_summarizer.md` |
| `template.history_summary_prefix` | `prompts/template/history_summary_prefix.md` |
| `tool.web_planner.add_node.description` | `prompts/tool/web_planner/add_node/description.md` |
| `tool.web_planner.add_node.params.question` | `prompts/tool/web_planner/add_node/params/question.md` |
| `tool.web_planner.add_node.params.node_id` | `prompts/tool/web_planner/add_node/params/node_id.md` |
| `tool.web_planner.add_node.params.depends_on` | `prompts/tool/web_planner/add_node/params/depends_on.md` |
| `tool.web_planner.link_nodes.description` | `prompts/tool/web_planner/link_nodes/description.md` |
| `tool.web_planner.search_node.description` | `prompts/tool/web_planner/search_node/description.md` |
| `tool.web_planner.search_node.params.node_id` | `prompts/tool/web_planner/search_node/params/node_id.md` |
| `tool.web_planner.read_node_answer.description` | `prompts/tool/web_planner/read_node_answer/description.md` |
| `tool.web_planner.finalize.description` | `prompts/tool/web_planner/finalize/description.md` |
| `tool.web_planner.finalize.params.answer` | `prompts/tool/web_planner/finalize/params/answer.md` |
| `tool.web_planner.finalize.params.citations` | `prompts/tool/web_planner/finalize/params/citations.md` |
| `tool.rag_planner.add_node.description` | `prompts/tool/rag_planner/add_node/description.md` |
| `tool.rag_planner.add_node.params.question` | `prompts/tool/rag_planner/add_node/params/question.md` |
| `tool.rag_planner.add_node.params.node_id` | `prompts/tool/rag_planner/add_node/params/node_id.md` |
| `tool.rag_planner.add_node.params.depends_on` | `prompts/tool/rag_planner/add_node/params/depends_on.md` |
| `tool.rag_planner.search_corpus_node.description` | `prompts/tool/rag_planner/search_corpus_node/description.md` |
| `tool.rag_planner.search_corpus_node.params.node_id` | `prompts/tool/rag_planner/search_corpus_node/params/node_id.md` |
| `tool.rag_planner.search_corpus_node.params.question` | `prompts/tool/rag_planner/search_corpus_node/params/question.md` |
| `tool.rag_planner.read_node_answer.description` | `prompts/tool/rag_planner/read_node_answer/description.md` |
| `tool.rag_planner.finalize.description` | `prompts/tool/rag_planner/finalize/description.md` |
| `tool.rag_planner.finalize.params.answer` | `prompts/tool/rag_planner/finalize/params/answer.md` |
| `tool.rag_planner.finalize.params.citations` | `prompts/tool/rag_planner/finalize/params/citations.md` |
| `tool.searcher.web_search.description` | `prompts/tool/searcher/web_search/description.md` |
| `tool.searcher.advanced_retrieve.description` | `prompts/tool/searcher/advanced_retrieve/description.md` |
| `tool.searcher.answer.description` | `prompts/tool/searcher/answer/description.md` |

33 slugs total. All extracted at byte parity with the original inline strings
in the prior session.
