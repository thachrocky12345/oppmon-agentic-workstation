# TAG-71: Inventory All LLM-Facing Strings — Manifest

## Description

**Suggested Points:** 2
**Type:** Story / Audit
**Epic:** [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
**Status:** Open

Produce a complete, grep-verified list of every string in `agent_search` that
is sent to an LLM (as a message, a tool description, or a parameter doc).
Without this, TAG-72/73 cannot know what to externalize.

## Required Reading

- `agent_v2/orchestrator/planner.py` — `PLANNER_SYSTEM` and any inline prompts.
- `agent_v2/orchestrator/searcher.py` — searcher system prompt.
- `agent_v2/tools/planner_tools.py`, `searcher_tools.py`, `registry.py` —
  every `ToolDef(description=..., parameters=...)` site.
- `agent_v2/rag/citation.py` — final-answer templates.
- `agent_v2/memory/*.py` — any summarizer/compression prompts.
- TAG-50 epic + TAG-61 — RAG planner prompt and tools are coming; mark them
  as future entries with predicted slugs.

## Open Questions (raise before coding)

1. Are there prompt strings embedded in **test fixtures** that should NOT move
   (because tests assert specific behavior on a frozen prompt)? Flag them.
2. Is `FakeLLMClient.echo()` a prompt source? (No — it bypasses the LLM. Confirm in PR.)
3. Are there f-string templates where a slot is filled at runtime
   (e.g. `f"User asked: {q}"`)? Those need slugs with documented `{placeholder}` tokens.

## Objective

Deliverable: `docs/prompts/inventory.md`, structured as:

| Slug (proposed) | Current location | Kind | Has runtime placeholders? | Notes |
|---|---|---|---|---|
| `system.web_planner` | `agent_v2/orchestrator/planner.py:PLANNER_SYSTEM` | system | none | covers `/solve_v2` + `/solve` web mode |
| `system.rag_planner` | (TAG-61, not yet merged) | system | none | refusal-on-empty rule |
| `system.history_summarizer` | TAG-63 | system | `{turns}` | summarizer turn |
| `tool.add_node.description` | `agent_v2/tools/planner_tools.py:add_node` | tool description | none | |
| `tool.search_node.description` | same | tool description | none | web mode |
| `tool.search_corpus_node.description` | TAG-61 | tool description | none | RAG mode |
| `tool.read_node_answer.description` | same | tool description | none | |
| `tool.finalize.description` | same | tool description | none | |
| `template.final_answer_web` | `agent_v2/rag/citation.py` | output template | `{nodes}`, `{citations}` | |
| `template.final_answer_rag` | TAG-61 | output template | `{nodes}`, `{citations}` | |

## Requirements

### Grep audit

Run and record in the PR:

```bash
# Strings passed to LLMClient.chat() as message content
rg -n 'role="system"' apps/agent_graph_backend/agent_search
rg -n 'ChatMessage\(role=' apps/agent_graph_backend/agent_search
# Tool definitions
rg -n 'ToolDef\(' apps/agent_graph_backend/agent_search
# Triple-quoted strings >200 chars (likely prompts)
rg -n -U '"""[\s\S]{200,}?"""' apps/agent_graph_backend/agent_search
```

Every hit appears in the manifest or has a one-line "not a prompt because…" justification.

### Placeholder audit

For each prompt with `{placeholders}`, document the FULL list of placeholders
and the type/shape of each. TAG-72's loader will validate against this.

### Slug naming rules

- `system.*` for system prompts.
- `tool.<tool_name>.description` for tool top-level descriptions.
- `tool.<tool_name>.params.<arg_name>` for argument descriptions (if any need externalizing).
- `template.*` for output templates.
- All lowercase, dot-separated, no version suffix (version is in frontmatter).

### Deliverables

1. `docs/prompts/inventory.md` with the table above, complete.
2. `docs/prompts/_schema.yaml` (preliminary) — just the slug list at this point.
   Full schema lands in TAG-72.
3. A list of "blockers / decisions needed" inline at the bottom of the inventory.

## Edge Cases

- Strings that are 80% boilerplate but contain a 1-line variable instruction.
  → Externalize the whole thing. No "config strings" carved out of prompts.
- Strings used in BOTH planner and searcher (rare but check).
  → Same slug, referenced from both call sites.
- Strings emitted ONLY in error paths.
  → Out of scope. Errors stay as Python f-strings.

## Tests

This ticket has no runtime tests. Verification is the PR review checklist:

- [ ] `rg` queries from above included in PR description with output.
- [ ] Every hit in `rg` output is either in the manifest or annotated as not-a-prompt.
- [ ] Slug naming follows the rules.
- [ ] Inventory includes prompts that don't exist yet (TAG-61, TAG-63) as forward-references.

## Acceptance Criteria

- [ ] `docs/prompts/inventory.md` merged.
- [ ] `docs/prompts/_schema.yaml` lists every slug from inventory.
- [ ] Reviewer of TAG-72 + TAG-73 confirms no prompt was missed.

## Story Points Justification

2 pts: pure audit + manifest, no code. Most cost is reading carefully and
not missing anything; tooling is `rg`.

## Dependencies

**Depends on:** none (can start immediately).
**Blocks:** TAG-72, TAG-73, TAG-74.

## Risk Factors

| Risk | Mitigation |
|---|---|
| Missed prompt → TAG-73 ships with a hardcoded string still inline | TAG-76 CI gate fails on any string > N chars passed to LLMClient that isn't a `get_prompt()` return value. |
| Slug renamed later, breaking Notion linkage | Slugs reviewed by editor stakeholder before TAG-74 creates Notion DB rows. |
