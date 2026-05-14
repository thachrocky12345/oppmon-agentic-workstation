# TAG-73: Refactor Planner + Tool Registries onto `get_prompt()`

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
**Status:** Open

Replace every inline LLM-facing string in `agent_search` with a `get_prompt()`
call. After this ticket, `rg` for triple-quoted strings >200 chars in the
package should return zero hits inside agent code.

## Required Reading

- TAG-71 inventory (the manifest is your todo list).
- TAG-72 loader API.
- `agent_v2/orchestrator/planner.py` — biggest delta.
- TAG-50 epic, TAG-61 sub-ticket — the RAG planner prompt should land already
  using `get_prompt()`; if it shipped before TAG-72, this ticket retrofits it.

## Open Questions (raise before coding)

1. The planner stitches a system prompt with a question via f-string. Should
   the question be a `{question}` placeholder in the prompt body, or appended
   as a separate user message? **Default:** separate user message (cleaner;
   prompt body has zero placeholders). Confirm before writing.
2. Tool descriptions are passed to the LLM SDK as JSON. If we externalize to
   Markdown, do we strip Markdown formatting before sending? **Default:** no —
   models tolerate light Markdown in tool descriptions; the editor benefits
   from formatting. Confirm.

## Objective

Diff shape per call site:

```python
# Before
PLANNER_SYSTEM = """\
You are a research planner...
"""

class PlannerAgent:
    def __init__(self, ...):
        self._system = PLANNER_SYSTEM

# After
from ..prompts import get_prompt

class PlannerAgent:
    def __init__(self, ...):
        self._system = get_prompt("system.web_planner")
        self._system_slug = "system.web_planner"   # for observability (TAG-77)
```

Same pattern for `system.rag_planner`, `system.history_summarizer`, tool
descriptions, and final-answer templates.

## Requirements

### Files to touch (from TAG-71 inventory, expected set)

- `agent_v2/orchestrator/planner.py`
- `agent_v2/orchestrator/searcher.py`
- `agent_v2/orchestrator/rag_planner_prompt.py` (TAG-61) — delete the constant,
  re-export `get_prompt("system.rag_planner")` if anything imports it.
- `agent_v2/tools/planner_tools.py`
- `agent_v2/tools/searcher_tools.py`
- `agent_v2/tools/rag_tools.py` (TAG-61)
- `agent_v2/rag/citation.py`
- `agent_v2/memory/history.py` (TAG-63)

The TAG-71 inventory is the authoritative list. If you find a string not
in the inventory while doing this refactor, **stop and update TAG-71's
manifest first** — do not silently externalize.

### Tool description wiring

```python
# Before
TOOLS = [
    ToolDef(
        name="search_corpus_node",
        description="Search the user's document collections...",
        parameters={...},
    ),
]

# After
TOOLS = [
    ToolDef(
        name="search_corpus_node",
        description=get_prompt("tool.search_corpus_node.description"),
        parameters={
            "node_id": {"type": "string",
                        "description": get_prompt("tool.search_corpus_node.params.node_id")},
            ...
        },
    ),
]
```

### Final-answer templates

```python
# Before
final = f"## Answer\n\n{synthesis}\n\n## Sources\n{citations}"

# After
final = render_prompt(
    "template.final_answer_rag",
    synthesis=synthesis,
    citations=citations,
)
```

`render_prompt` is the placeholder-aware helper from TAG-72.

### Grep gate

Add to the test suite (or pre-commit):

```python
# tests/prompts/test_no_inline_prompts.py
def test_no_long_triple_quoted_strings_in_agent_code():
    # Walk agent_v2/, except agent_v2/prompts/.
    # Any """ ... """ block whose contents exceed 200 chars OR contains the
    # word "You are" is a failed test.
    ...
```

This is the audit-time backstop in case the manifest missed something.

### Observability hook

Each `LLMClient.chat()` call site logs the `prompt_slug` it just used.
TAG-77 will format and ship this, but plumb the field now:

```python
self._system_slug = "system.web_planner"
# inside .run()
logger.info("planner.chat", extra={"prompt_slug": self._system_slug,
                                   "prompt_version": get_prompt_meta(self._system_slug).version})
```

## Edge Cases

- A tool description has a runtime placeholder (e.g. tenant-specific naming).
  Inventory should have flagged this. Use `render_prompt`.
- The summarizer prompt is short enough that the grep gate's 200-char threshold
  might let it slip back inline. Raise the test threshold to 100 chars to be safe.
- The web planner and `/solve_v2` share the same prompt today. Confirm both
  call sites use `get_prompt("system.web_planner")` — not one source migrated
  and the other left behind.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/orchestrator/test_planner.py` | regression: behavior matches pre-refactor on a fixed input | snapshot |
| `tests/orchestrator/test_searcher.py` | same | snapshot |
| `tests/prompts/test_no_inline_prompts.py` | no triple-quoted strings >100 chars in `agent_v2/` (excl. `prompts/`) | grep |
| `tests/prompts/test_no_inline_prompts.py` | no `f"...You are..."` or `f"...Plan..."` patterns | regex |
| `tests/orchestrator/test_observability.py` | `prompt_slug` and `prompt_version` present on every chat log | mock logger |

## Acceptance Criteria

- [ ] Grep gate passes; no inline prompts remain in agent code.
- [ ] Pre- and post-refactor snapshots match for `/solve_v2`.
- [ ] `/solve` RAG mode still passes TAG-61 eval (refusal-rate ≥ 0.9).
- [ ] Every `LLMClient.chat()` call logs the originating prompt slug.

## Story Points Justification

3 pts: mechanical refactor across ~8 files, but the snapshot regression bar
plus the no-inline-prompts grep gate add real test work.

## Dependencies

**Depends on:** TAG-71, TAG-72.
**Blocks:** TAG-77 (observability needs the slug field plumbed).

## Risk Factors

| Risk | Mitigation |
|---|---|
| Subtle behavior change from whitespace difference (e.g. trailing newline) | Snapshot test on raw `chat()` payload; diff visible in PR. |
| Tool description Markdown breaks a strict model | Smoke against each provider in CI (Anthropic + OpenAI + Cerebras). |
| Refactor touches code that another open PR is editing | Sequencing — merge TAG-71/72 first, then TAG-73 with a clean rebase. |
