# TAG-70: Prompt Storage via Notion → Git Sync (EPIC)

## Description

**Suggested Points:** 21 (Epic — rolls up TAG-71 … TAG-77)
**Type:** Epic
**Status:** Open

Externalize every LLM-facing string in `agent_search` (system prompts, tool
descriptions, parameter docs, final-answer templates) out of Python source
and into a `prompts/` directory in this repo. Edits originate in a **Notion**
database; a sync worker turns each edit into a **pull request** against
`prompts/*.md`; deploys ship through the normal release path.

Runtime path is filesystem-only: the agent reads `prompts/<slug>.md` (baked
into the Docker image) on cold start, caches the body in memory, and never
calls Notion. Notion outages and rate limits cannot affect a `/solve` request.

## Why this shape

Three alternatives were considered and rejected:

| Alternative | Why rejected |
|---|---|
| Live Notion fetch + cache | Notion API rate-limits at 3 req/sec/integration; any cold cache miss in burst traffic stalls. Every Notion outage = planner outage. |
| Notion → Postgres cache | Solves the runtime concerns but moves prompt review out of code review. Prompts can ship without an engineer ever seeing the diff. |
| **Notion → Git PR (chosen)** | Edits flow through the same review + CI + deploy gates as code. Audit trail is `git log`. Rollback is `git revert`. No new runtime dep. |

## What "all prompts" means

Per the user decision, the scope is exhaustive — every string the LLM sees:

```
prompts/
├── README.md                        # human guide
├── _schema.yaml                     # required slugs + frontmatter contract
├── system/
│   ├── web_planner.md
│   ├── rag_planner.md
│   └── history_summarizer.md
├── tools/
│   ├── add_node.description.md
│   ├── search_node.description.md           # web mode
│   ├── search_corpus_node.description.md    # RAG mode
│   ├── read_node_answer.description.md
│   └── finalize.description.md
├── parameters/                       # one per tool argument that has free-text doc
│   └── ...
└── templates/
    ├── final_answer_web.md
    └── final_answer_rag.md
```

Tool *names* and JSON-schema *shapes* stay in code (typed). Only the
description and parameter `description` fields are externalized.

## Decisions locked in

| # | Decision | Rationale |
|---|---|---|
| 1 | **Runtime reads filesystem only.** No Notion / Postgres / HTTP at request time. | Predictable latency, no new failure mode in the hot path. |
| 2 | **One file per prompt slug.** No multi-prompt files. | Diffs are easy to read; PRs touch only the slugs that changed. |
| 3 | **Frontmatter is part of the contract.** `slug`, `version`, `status`, `notion_page_id`, `owner`, `updated_at` required. | CI enforces; loader rejects malformed files at startup. |
| 4 | **Version is an integer that monotonically increases.** No semver. | Avoids "is 2.0.1 newer than 1.10.0" arguments in a non-code context. |
| 5 | **Status enum: `draft` / `ready` / `active` / `deprecated`.** Only `active` is loaded at runtime. | Lets editors stage changes in Notion without breaking the agent. |
| 6 | **The sync worker pins exactly one `active` per slug.** Multiple active → CI fails. | Prevents "which one wins" ambiguity. |
| 7 | **Single-tenant for now.** No per-tenant overrides. | Per-tenant prompts are a guardrail problem (jailbreak, size, banned tokens) — separate epic. |
| 8 | **Loader is sync, cached, package-relative.** `get_prompt(slug)` reads from `agent_v2/prompts/` inside the wheel/image. | Tests can monkeypatch; no I/O in the hot path after warmup. |

## Sub-Tickets

| Ticket | Title | Points |
|---|---|---|
| [TAG-71](./TAG-71-prompt-inventory.md)        | Inventory all LLM-facing strings, produce manifest | 2 |
| [TAG-72](./TAG-72-prompt-loader.md)           | `prompts/` directory + filesystem loader + frontmatter parser | 3 |
| [TAG-73](./TAG-73-refactor-planner.md)        | Refactor planner + tool registries onto `get_prompt()` | 3 |
| [TAG-74](./TAG-74-notion-database.md)         | Notion database schema + setup runbook | 2 |
| [TAG-75](./TAG-75-notion-git-sync-worker.md)  | Notion → Git PR sync worker | 5 |
| [TAG-76](./TAG-76-prompt-ci-validation.md)    | CI validation (schema, size, banned tokens, slug completeness) | 3 |
| [TAG-77](./TAG-77-prompt-observability.md)    | Log `prompt_slug` + `version` on every LLM call + ADR | 3 |

**Total:** 21 sub-points (epic budget 21 — no buffer; cut TAG-77's ADR if pressed).

## Critical Non-Negotiables

1. **Runtime never calls Notion.** Loader is filesystem only. Networking from
   `get_prompt()` is a CI-blocking bug.
2. **One `active` per slug.** Enforced by CI (TAG-76).
3. **Every `/solve` trace records the prompt `slug + version` it used.** Without
   this we cannot diagnose "answer changed when nothing in code changed" (TAG-77).
4. **A prompt edit cannot ship without CI green.** No emergency bypass — the
   review gate is the whole point.
5. **No PHI / API keys / customer data in prompts.** TAG-76 grep-guard.

## Cut Lines (NOT in this epic)

- Per-tenant prompt overrides → separate epic.
- A/B prompt experimentation → separate epic; the `version` field is the hook.
- Notion-side approval workflow beyond "Status = ready" → out of scope.
- Anything other than `agent_search` prompts (e.g. `apps/api` LLM routes have
  their own prompts that stay in code for now).
- Prompts in languages other than English.

## Dependencies

**Depends on:**
- TAG-50 epic (specifically TAG-61 amendment: planner ships behind `get_prompt()` indirection so this epic is a swap, not a refactor).

**Blocks:** future per-tenant prompt customization epic.

## Risk Factors

| Risk | Mitigation |
|---|---|
| Editor publishes a prompt that breaks tool-calling format | TAG-76 includes a smoke that loads the prompt and runs one fake-LLM planner turn. CI fails before merge. |
| Notion → Git worker forges a PR with bad content | Worker has a GitHub PAT scoped to `pull_request: write` only, NOT `contents: write` on `main`. All merges are human-gated. |
| Slug drift between Notion and repo (rename in Notion, old file orphaned) | TAG-76 fails CI if `_schema.yaml` and `prompts/` disagree. Worker emits a `[RENAME]` PR with both delete + add. |
| Latency regression from filesystem reads on cold start | Loader uses `functools.lru_cache`; warm-up at `mount_v2()` reads all `active` prompts once. |
| Prompt body contains a real API key by accident | TAG-76 grep guard against `sk-…`, `csk-…`, `tvly-…`, generic high-entropy strings. |
| Notion integration token leaked → attacker can publish prompts | Worker validates HMAC + cross-checks page `last_edited_by` against an allowlist of editor user IDs. |

## Acceptance Criteria (Epic)

- [ ] `agent_search` source contains no inline LLM prompt strings (grep gate in CI).
- [ ] Every prompt slug listed in `_schema.yaml` has exactly one `status: active` file.
- [ ] An edit in Notion to a `status: ready` prompt produces a PR within 5 minutes.
- [ ] Merging the PR + redeploying changes the planner's behavior — verified by an
      eval that flips on prompt content.
- [ ] `/solve` SSE `step` events carry `prompt_slug` and `prompt_version` fields.
- [ ] Notion outage during a `/solve` request: no impact (load-test confirms).
- [ ] ADR merged covering all eight locked-in decisions above.
