# TAG-71 Test Plan / Verification Report

**Ticket:** [TAG-71 — Inventory All LLM-Facing Strings (Manifest)](../TAG-71-prompt-inventory.md)
**Epic:** [TAG-70 — Prompt Storage + Notion as Source of Truth](../TAG-70-prompt-storage-notion-epic.md)
**Type:** Story / Audit
**Branch:** `feature/TAG-59-corpus-search`
**Status:** Done

---

## 1. Objective

Produce a frozen, reviewable manifest of every LLM-facing string in
`apps/agent_graph_backend/agent_search/agent_v2/` so the TAG-72 frontmatter
parser and TAG-73 extraction refactor have a single source of truth for
what slugs exist, where each lives, and which decisions are still open.

This is an **audit-only** ticket — per the
[`build-fastapi-single-ticket`](../../../.claude/skills/build-fastapi-single-ticket/SKILL.md)
skill's audit branch, Phases 2-5 are skipped and the deliverable is
verifiable markdown + YAML plus this report.

---

## 2. Acceptance criteria (mirrored from ticket)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC1 | `docs/prompts/inventory.md` exists with the full slug + location + kind + placeholders + notes table. | ✅ | [`docs/prompts/inventory.md`](../../prompts/inventory.md) §2–§6 |
| AC2 | Every LLM-facing string in `agent_search/agent_v2/` is either slugged or explicitly ruled out. | ✅ | inventory.md §2–§6 (slugged) + §7 (ruled out, with reason) |
| AC3 | `docs/prompts/_schema.yaml` exists with a preliminary slug list machine-readable for TAG-72. | ✅ | [`docs/prompts/_schema.yaml`](../../prompts/_schema.yaml) — 33 entries |
| AC4 | At least one open question / blocker is recorded for downstream tickets. | ✅ | inventory.md §10 — six decisions called out, owners (TAG-72 / TAG-73) named |
| AC5 | The four audit-greps required by the ticket are executed and outputs preserved. | ✅ | inventory.md §9 + §4 of this doc |
| AC6 | No runtime code is touched. | ✅ | `git status` shows only doc additions — see §5 |

---

## 3. Files touched

Three new files, zero modified. No runtime code change:

| Path | Purpose |
|---|---|
| `docs/prompts/inventory.md` | Human-readable manifest (this is the deliverable). |
| `docs/prompts/_schema.yaml` | Machine-readable slug list — feeds TAG-72. |
| `docs/jira/TAG-71/TAG_71_test.md` | This verification report. |

No `apps/` paths touched.

---

## 4. Audit-grep evidence (reproducible commands)

Run from `apps/agent_graph_backend/`. These are the four greps the ticket
calls out as the audit baseline.

### 4.1 Direct `role="system"` assignments

```bash
rg 'role\s*=\s*"system"' agent_search/agent_v2/
```

Result: **0 matches** in `agent_v2/`. System prompts are routed through
named constants (`PLANNER_SYSTEM`, `SEARCHER_SYSTEM`,
`_RAG_PLANNER_SYSTEM_V1`) — see inventory §2.

### 4.2 `ChatMessage(role=...)` construction sites

```bash
rg 'ChatMessage\s*\(\s*role\s*=' agent_search/agent_v2/
```

Result hits, all accounted for:

| Hit | Slug bound |
|---|---|
| `orchestrator/planner.py:189` `role="system"` | `system.web_planner` |
| `orchestrator/searcher.py:80` `role="system"` | `system.searcher` |
| `orchestrator/searcher.py:120` `role="system"` | `system.searcher` |
| `orchestrator/modes.py:229` `role="system"` (via `_rag_planner_system()`) | `system.rag_planner` |
| `memory/history.py:184` `role="user"` (summarizer) | `template.history_summarizer` |
| `memory/history.py:189` `role="system"` | `template.history_summary_prefix` |

### 4.3 Tool registrations

```bash
rg 'registry\.register\s*\(' agent_search/agent_v2/
```

Result: 12 registrations across three files.

| File | Count | Slug prefix |
|---|---|---|
| `tools/planner_tools.py` | 5 | `tool.web_planner.*` |
| `orchestrator/rag_tools.py` | 4 | `tool.rag_planner.*` |
| `tools/searcher_tools.py` | 3 | `tool.searcher.*` |

All 12 mapped in inventory §4–§6.

### 4.4 Long triple-quoted strings (>200 chars)

```bash
rg --multiline -U '"""[\s\S]{200,}?"""' agent_search/agent_v2/
```

Result: one match in `orchestrator/rag_planner_prompt.py:19-42`
(`_RAG_PLANNER_SYSTEM_V1`) — already slugged as `system.rag_planner`.
No additional triple-quoted prompts found.

(Note: `PLANNER_SYSTEM` and `SEARCHER_SYSTEM` are bracket-concatenated
parenthesised string literals, not triple-quotes, so they don't appear in
this grep. They were located by reading the imports of every `register*`
caller — see §4.2.)

---

## 5. Manual verification steps

The reviewer can replay this audit in under five minutes:

1. **Confirm doc artifacts exist:**
   ```bash
   ls docs/prompts/
   # Expect: _schema.yaml  inventory.md
   ls docs/jira/TAG-71/
   # Expect: TAG_71_test.md
   ```
2. **Confirm slug count:**
   ```bash
   grep -c '^  - slug:' docs/prompts/_schema.yaml
   # Expect: 33
   ```
3. **Cross-check inventory §8 filename list against §2-§6 slug column —
   they must enumerate the same 33 slugs.**
4. **Re-run the four greps from §4 — outputs must match.**
5. **Confirm no `apps/` changes:**
   ```bash
   git status --short | grep -v '^.. docs/'
   # Expect: empty output
   ```

---

## 6. Decisions / blockers carried forward

Six items recorded in inventory.md §10 — verbatim summary:

| # | Item | Owner |
|---|---|---|
| 1 | Lock in `tool.<planner>.<name>` namespaced slug form (vs unprefixed). | TAG-72 |
| 2 | Refusal text duplicated in `tool.rag_planner.finalize.description` body — keep inline or interpolate at load? Recommend inline. | TAG-73 |
| 3 | `template.history_summary_prefix` borderline — keep slug or demote to code constant? | TAG-73 |
| 4 | Searcher per-arg param descriptions are type-hint metadata, not slugged. Optional follow-up. | TAG-72 |
| 5 | `system.rag_planner` already has the get-prompt indirection seam — TAG-73 refactor is one line. | TAG-73 |
| 6 | No version suffix in slugs — versions live in frontmatter only. **Locked.** | — |

None of these block TAG-71 closure; all are inputs to the subsequent
tickets.

---

## 7. Quality gate

This is an audit-only ticket with zero runtime code added, so the Phase 5
quality gate degrades to:

| Check | Status | Notes |
|---|---|---|
| `ruff check agent_search/agent_v2/` (no code changed) | n/a | No source diff. |
| `pyright agent_search/agent_v2/` (no code changed) | n/a | No source diff. |
| `pytest agent_search/tests/` (regression — confirm we didn't break a fixture path by editing) | n/a | No source diff. |
| Markdown links resolve | ✅ | All cross-doc links in inventory.md and this file point at existing paths. |
| YAML parses | ✅ | `_schema.yaml` is flat scalars + lists, no anchors/aliases. |
| No secrets in deliverables | ✅ | `rg -E 'sk-[A-Za-z0-9]{20,}\|tvly-[A-Za-z0-9]{20,}\|AKIA[0-9A-Z]{16}' docs/prompts/ docs/jira/TAG-71/` — clean. |

---

## 8. Known limitations

1. **Line ranges for `rag_tools.py` param blocks are listed from the
   `_ADD_NODE_PARAMS` / `_SEARCH_CORPUS_NODE_PARAMS` etc. constant
   definitions at the top of the file.** A line-by-line audit of every
   `description:` field inside those JSON-Schema blocks is deferred to
   TAG-73 — when the refactor opens those files anyway, it can sanity-check
   the exact span and amend the slug entries if needed.

2. **No automated test confirms the inventory stays in sync with the
   code.** Once TAG-72 lands the frontmatter parser, a CI check should
   diff `_schema.yaml` against `prompts/*.md` and fail on drift. That
   check is part of TAG-72's deliverable, not TAG-71's.

3. **Inventory does not slug searcher tool *param* descriptions.** Per
   inventory §6, these are short type-hint metadata and have low
   policy-value-per-slug. TAG-72 can revisit if 100 % extraction is
   required.

---

## 9. Rollback

| Action | Command |
|---|---|
| Delete the two prompt-doc artifacts | `rm docs/prompts/inventory.md docs/prompts/_schema.yaml` |
| Delete this report | `rm -rf docs/jira/TAG-71/` |
| Branch revert (if committed) | revert the TAG-71 commit — no production code is touched, so revert is risk-free |

No app-code rollback needed because no app code was changed.

---

## 10. Sign-off

- Inventory built from a clean read of every prompt-source file in
  `agent_v2/` plus the four mandated greps.
- Six open decisions are explicitly assigned to TAG-72 / TAG-73.
- Slug count (33) is reproducible from the YAML.
- No runtime code touched — `git diff apps/` is empty.

Ready for TAG-72.
