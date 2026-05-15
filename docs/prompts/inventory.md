# LLM-Facing String Inventory (TAG-71)

**Scope:** every string sent verbatim to an LLM (or formatted with placeholders
before being sent) by code under
`apps/agent_graph_backend/agent_search/agent_v2/`.

**Audited at:** repo HEAD on branch `feature/TAG-59-corpus-search`.

**Audit ticket:** [`docs/jira/TAG-71-prompt-inventory.md`](../jira/TAG-71-prompt-inventory.md)

**Epic:** [TAG-70 Prompt Storage + Notion-as-Source-of-Truth](../jira/TAG-70-prompt-storage-notion-epic.md)

This file is the **read-only manifest** that the TAG-72 frontmatter parser and
TAG-73 refactor will use to know what to extract. It is intentionally *not* a
loader — there is no Python that imports this. It exists so a reviewer (and the
TAG-72/73 implementer) can confirm one-to-one mapping between slug and code
site before any extraction happens.

---

## 1. Naming convention (proposed — locks in at TAG-72)

```
<kind>.<scope>.<name>[.<arg>]
```

| Token | Values | Example |
|---|---|---|
| `kind` | `system` \| `template` \| `tool` | `tool.web_planner.add_node.description` |
| `scope` | `web_planner` \| `rag_planner` \| `searcher` \| `history` (or absent for unambiguous system prompts) | `system.web_planner` |
| `name` | tool name (`add_node`) or template id (`searcher_simple_user`) | |
| `arg` | only for `tool.*.params.<arg>` slugs | `tool.web_planner.add_node.params.question` |

**Rules (taken verbatim from TAG-71):**

- lowercase, dot-separated, no version suffix (`v1`/`v2` live in frontmatter).
- one slug ↔ one file once TAG-72 lands.
- if the same body appears at two sites with different intent, give it two
  slugs (don't dedupe).
- if the same body appears at two sites with the **same** intent, give it
  one slug and reference it from both call sites.

---

## 2. System prompts

| Slug | Location | Placeholders | Notes |
|---|---|---|---|
| `system.web_planner` | `agent_v2/orchestrator/planner.py:30-43` (`PLANNER_SYSTEM`) | — | Web-mode planner system message. Bracket-concatenated string literal (not a triple-quote). Loaded once per request at `planner.py:189`. |
| `system.searcher` | `agent_v2/orchestrator/searcher.py:23-30` (`SEARCHER_SYSTEM`) | — | Sub-agent system message. Loaded at `searcher.py:80` (simple mode) and `searcher.py:120` (tools mode). |
| `system.rag_planner` | `agent_v2/orchestrator/rag_planner_prompt.py:19-42` (`_RAG_PLANNER_SYSTEM_V1`) | — | RAG-mode planner. 6 hard rules for citation-only answers. **Already has the get-prompt indirection seam** via `_rag_planner_system()` at line 45, called from `modes.py:229` — TAG-73 swap is a one-line change. |

---

## 3. Templates (user-side strings with placeholders)

| Slug | Location | Placeholders | Notes |
|---|---|---|---|
| `template.searcher_simple_user` | `agent_v2/orchestrator/searcher.py:84-88` | `{question}`, `{context}` | Simple-mode user prompt for the searcher sub-agent. Currently an inline f-string; TAG-73 will replace with `get_prompt("template.searcher_simple_user").format(question=..., context=...)`. |
| `template.searcher_tools_user` | `agent_v2/orchestrator/searcher.py:124-128` | `{question}` | Tools-mode user prompt. Inline f-string. |
| `template.rag_refusal` | `agent_v2/orchestrator/rag_planner_prompt.py:48-50` (`REFUSAL_TEXT`) | — | Verbatim refusal sentence (`"I don't have information about that in the provided collections."`). **Also embedded inside** the description of `tool.rag_planner.finalize` (see §5) — keep one canonical slug. |
| `template.history_summarizer` | `agent_v2/memory/history.py:63-67` (`_SUMMARISER_PROMPT`) | — (concatenated, not formatted) | Instruction handed to the summarizer LLM. The transcript is concatenated after a `\n\n` separator at `history.py:182`. Keep the slug body as the *instruction* only; concatenation stays in code. |
| `template.history_summary_prefix` | `agent_v2/memory/history.py:69` (`_SUMMARY_PREFIX`) | — | `"[Earlier turns, summarized]"` — borderline; it never reaches the LLM as a standalone send, but it *is* the system-message body the planner sees on subsequent turns. Flag it; final extract/no-extract call goes to TAG-73. |

---

## 4. Tool descriptions — web planner (`planner_tools.py`)

The `description` field on each `registry.register(...)` call, keyed by tool name.

| Slug | Location | Placeholders | Notes |
|---|---|---|---|
| `tool.web_planner.add_node.description` | `planner_tools.py:155-164` | — | |
| `tool.web_planner.link_nodes.description` | `planner_tools.py:165-173` | — | |
| `tool.web_planner.search_node.description` | `planner_tools.py:174-183` | — | |
| `tool.web_planner.read_node_answer.description` | `planner_tools.py:184-191` | — | |
| `tool.web_planner.finalize.description` | `planner_tools.py:192-201` | — | |

Per-parameter `description` fields (JSON-Schema bodies). These are
LLM-facing in the same way as tool descriptions — the LLM reads them when
choosing args.

| Slug | Location |
|---|---|
| `tool.web_planner.add_node.params.question` | `planner_tools.py:23-26` |
| `tool.web_planner.add_node.params.node_id` | `planner_tools.py:27-33` |
| `tool.web_planner.add_node.params.depends_on` | `planner_tools.py:34-40` |
| `tool.web_planner.search_node.params.node_id` | `planner_tools.py:56-60` |
| `tool.web_planner.finalize.params.answer` | `planner_tools.py:74-80` |
| `tool.web_planner.finalize.params.citations` | `planner_tools.py:81-88` |

(`_LINK_NODES_PARAMS` and `_READ_NODE_ANSWER_PARAMS` have no `description`
fields — pure typed args, no LLM-facing text. They are intentionally omitted
from the slug list.)

---

## 5. Tool descriptions — RAG planner (`rag_tools.py`)

Different bodies from web planner, **different slugs** per the §1 rule
("two sites with different intent → two slugs"). The collision points are
`add_node`, `read_node_answer`, and `finalize`.

| Slug | Location | Placeholders | Notes |
|---|---|---|---|
| `tool.rag_planner.add_node.description` | `rag_tools.py:263-271` | — | Different body from `tool.web_planner.add_node.description` — this one mentions "atomic searchable parts of the corpus", web variant mentions parallel search. |
| `tool.rag_planner.search_corpus_node.description` | `rag_tools.py:272-283` | — | Mentions `status=OK` / `status=UNANSWERED` and HARD RULE #2. |
| `tool.rag_planner.read_node_answer.description` | `rag_tools.py:284-292` | — | |
| `tool.rag_planner.finalize.description` | `rag_tools.py:293-304` | — | **Embeds `template.rag_refusal` verbatim** in its body. TAG-73 decision needed: (a) keep the prose literal inside this description; (b) interpolate at load time. Recommend (a) — descriptions are read by the LLM once per turn, server-side interpolation adds coupling. |

Per-parameter descriptions:

| Slug | Location |
|---|---|
| `tool.rag_planner.add_node.params.question` | `rag_tools.py:47-53` |
| `tool.rag_planner.add_node.params.node_id` | `rag_tools.py:54-60` |
| `tool.rag_planner.add_node.params.depends_on` | `rag_tools.py:61-65` |
| `tool.rag_planner.search_corpus_node.params.node_id` | `rag_tools.py:73-76` |
| `tool.rag_planner.search_corpus_node.params.question` | `rag_tools.py:77-84` (TAG-73 reconciliation: inventory v0 missed this one — `_SEARCH_CORPUS_NODE_PARAMS` has descriptions on **both** node_id and question.) |
| `tool.rag_planner.finalize.params.answer` | `rag_tools.py:100-107` |
| `tool.rag_planner.finalize.params.citations` | `rag_tools.py:109-115` |

> **TAG-73 reconciliation note:** inventory v0 listed
> `tool.rag_planner.read_node_answer.params.node_id` here. The audit
> assumed every param block had a `description:` field; in fact
> `_READ_NODE_ANSWER_PARAMS` does **not** (it's just
> `{"type": "string"}`). Slug dropped at extraction time. Net count
> unchanged (one removed, one added — `search_corpus_node.params.question`).

(Exact param-block line ranges to be confirmed in TAG-73 — listed `rag_tools.py`
constants are `_ADD_NODE_PARAMS`, `_SEARCH_CORPUS_NODE_PARAMS`,
`_READ_NODE_ANSWER_PARAMS`, `_FINALIZE_PARAMS`. The audit confirmed each
contains `description:` fields for the listed args.)

---

## 6. Tool descriptions — searcher (`searcher_tools.py`)

| Slug | Location | Placeholders | Notes |
|---|---|---|---|
| `tool.searcher.web_search.description` | `searcher_tools.py:79-87` | — | |
| `tool.searcher.advanced_retrieve.description` | `searcher_tools.py:88-97` | — | |
| `tool.searcher.answer.description` | `searcher_tools.py:98-107` | — | |

The `_WEB_SEARCH_PARAMS` / `_ADVANCED_RETRIEVE_PARAMS` / `_ANSWER_PARAMS`
blocks have minimal per-arg descriptions; what's there is short typed metadata
not LLM-policy prose. Audit recommendation: **defer extraction to a later
ticket**; not worth a per-arg slug for one-line type hints. Flagged here, not
slugged.

---

## 7. Non-prompts (confirmed NOT in scope)

These were considered and ruled out — recorded so the reviewer doesn't ask:

| String / location | Why out of scope |
|---|---|
| `agent_v2/guardrails/constitution.py:23-28` (`_INJECTION_PATTERNS`) | Regex patterns used to scan user input. Never sent to the LLM. |
| `agent_v2/guardrails/constitution.py:41-43` (injection-warning string) | Pino-style log/SSE warning to the *client*, not to the LLM. |
| `agent_v2/guardrails/constitution.py:60` (fabricated-URL string) | Same — operator/client warning, not LLM-facing. |
| `agent_v2/rag/citation.py` | Pure Pydantic types. No strings. |
| `agent_v2/orchestrator/modes.py` (any literal) | Only `system.rag_planner` is sourced here, via call to `_rag_planner_system()`. No own prompts. |
| Test fixtures and stub LLM client (`agent_v2/llm/fake_client.py`, `tests/**`) | Test scaffolds. Per TAG-71 §"Edge cases": "flag them, don't extract." None found that mock production prompts; tests use opaque strings like `"hi"`. |
| `tools/registry.py:42` (`ToolDef` class) | Type definition, not a prompt. |
| `llm/base.py:42` (`ToolDef` Protocol) | Same. |

---

## 8. Slug ↔ filename mapping (TAG-72 reference)

Once TAG-72 lands, each slug below becomes one file under
`apps/agent_graph_backend/agent_search/agent_v2/prompts/`. Filename is the
slug with `.md` suffix:

```
prompts/
  system.web_planner.md
  system.searcher.md
  system.rag_planner.md
  template.searcher_simple_user.md
  template.searcher_tools_user.md
  template.rag_refusal.md
  template.history_summarizer.md
  template.history_summary_prefix.md
  tool.web_planner.add_node.description.md
  tool.web_planner.link_nodes.description.md
  tool.web_planner.search_node.description.md
  tool.web_planner.read_node_answer.description.md
  tool.web_planner.finalize.description.md
  tool.web_planner.add_node.params.question.md
  tool.web_planner.add_node.params.node_id.md
  tool.web_planner.add_node.params.depends_on.md
  tool.web_planner.search_node.params.node_id.md
  tool.web_planner.finalize.params.answer.md
  tool.web_planner.finalize.params.citations.md
  tool.rag_planner.add_node.description.md
  tool.rag_planner.search_corpus_node.description.md
  tool.rag_planner.read_node_answer.description.md
  tool.rag_planner.finalize.description.md
  tool.rag_planner.add_node.params.question.md
  tool.rag_planner.add_node.params.node_id.md
  tool.rag_planner.add_node.params.depends_on.md
  tool.rag_planner.search_corpus_node.params.node_id.md
  tool.rag_planner.read_node_answer.params.node_id.md
  tool.rag_planner.finalize.params.answer.md
  tool.rag_planner.finalize.params.citations.md
  tool.searcher.web_search.description.md
  tool.searcher.advanced_retrieve.description.md
  tool.searcher.answer.description.md
```

**Count: 33 slugs.** Matches the per-section totals: 3 system + 5 templates
+ 5 web-tool descriptions + 6 web-tool params + 4 rag-tool descriptions
+ 7 rag-tool params + 3 searcher-tool descriptions = 33.

---

## 9. Audit-grep evidence (reproducible)

The four greps the ticket mandates, run against this branch:

```bash
# (run from apps/agent_graph_backend/)

# 9.1 Direct role="system" assignments
rg 'role\s*=\s*"system"' agent_search/agent_v2/
# Result: 0 matches in agent_v2/. (Test files have a few; not in scope.)

# 9.2 ChatMessage(role= ...) construction sites
rg 'ChatMessage\s*\(\s*role\s*=' agent_search/agent_v2/
# Result: planner.py:189 (system+PLANNER_SYSTEM), searcher.py:80/120,
#         modes.py:229, history.py:184/189. All accounted for above.

# 9.3 Tool registrations
rg 'registry\.register\s*\(' agent_search/agent_v2/
# Result: planner_tools.py × 5, rag_tools.py × 4, searcher_tools.py × 3 = 12.
#         All 12 mapped to slugs in §4-6.

# 9.4 Long triple-quoted strings (>200 chars)
rg --multiline -U '"""[\s\S]{200,}?"""' agent_search/agent_v2/
# Result: only rag_planner_prompt.py:19 (already slugged as system.rag_planner).
```

No additional strings were found beyond the inventory above.

---

## 10. Blockers / decisions needed (for TAG-72 + TAG-73)

1. **Namespace prefix in slugs.** This inventory uses `tool.<planner>.<name>`
   (e.g. `tool.web_planner.add_node.description`) to handle the
   `web_planner` vs `rag_planner` collision on `add_node`/`finalize`/
   `read_node_answer`. The TAG-71 spec's *sample* table uses the
   unprefixed form (`tool.add_node.description`). Recommend: lock in the
   prefixed form, since the unprefixed form would force a "discriminator"
   field in the frontmatter and break the "one slug = one file" rule.
   **Decision owner: TAG-72.**

2. **Refusal text embedded in `tool.rag_planner.finalize.description`.**
   The body of that description contains the exact sentence stored at
   `template.rag_refusal`. Two options:
   - (a) Keep the prose literal in the description and accept that the
     refusal text appears in two files; sync is a CI lint.
   - (b) Interpolate at load time (`description: "...{{template.rag_refusal}}..."`).
   Recommend (a) — descriptions are static at boot, interpolation adds
   coupling. **Decision owner: TAG-73.**

3. **`template.history_summary_prefix` borderline.** `"[Earlier turns,
   summarized]"` is a short label, not a prompt body. It *does* end up
   inside an LLM-visible system message (`history.py:189`), so the audit
   conservatively slugs it. If TAG-73 decides this is config (not content),
   move it back to a Python constant and drop the slug from `_schema.yaml`.
   **Decision owner: TAG-73.**

4. **Searcher per-arg param descriptions.** `_WEB_SEARCH_PARAMS` &c. have
   short `"description":` strings (e.g. `"Search query string."`). The audit
   does NOT slug these because the text is type-hint metadata, not policy
   prose. If TAG-72 wants 100% extraction, add 5-7 more slugs of the form
   `tool.searcher.<name>.params.<arg>`. **Decision owner: TAG-72.**

5. **`system.rag_planner` already has TAG-73's indirection seam.**
   `_rag_planner_system()` is the only function call site. TAG-73's refactor
   for this slug is a one-line change inside that function; no callers to
   update. Document this so the TAG-73 author doesn't write a wider PR.
   **Decision owner: TAG-73.**

6. **No version suffix in slugs.** Confirmed against ticket: versions
   (`v1`/`v2`) live in frontmatter (TAG-72), not in slug names. The
   existing `_RAG_PLANNER_SYSTEM_V1` constant name is internal; the slug
   stays `system.rag_planner`. **Decision: locked.**

---

## 11. Acceptance checklist (against TAG-71 §"Acceptance Criteria")

- [x] `docs/prompts/inventory.md` exists with the full slug + location + kind
      + placeholders + notes table.
- [x] Every LLM-facing string in `agent_search/agent_v2/` is either listed or
      explicitly ruled out in §7.
- [x] `docs/prompts/_schema.yaml` exists with the preliminary slug list
      (TAG-72 will turn it into canonical schema).
- [x] At least one open question / blocker recorded in §10.
- [x] Four mandated greps run with output recorded (§9).
- [x] No runtime code touched.
