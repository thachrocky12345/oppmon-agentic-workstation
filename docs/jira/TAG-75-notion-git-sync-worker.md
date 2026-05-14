# TAG-75: Notion → Git PR Sync Worker

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
**Status:** Open

The actual sync mechanism. Detect Notion edits, render to `prompts/<slug>.md`
with frontmatter, and open a pull request. No direct commits to `main`.

## Required Reading

- TAG-72 frontmatter contract.
- TAG-74 Notion DB schema + integration token location.
- `.github/workflows/` — existing CI patterns this worker piggybacks on.
- Notion API: pages.retrieve, databases.query, blocks.children.list.

## Open Questions (raise before coding)

1. Should the worker run as **GitHub Actions scheduled workflow** (every N min)
   or as a **standalone webhook receiver service**? Webhooks are lower latency
   but require hosted infra; scheduled is dead simple but lags by the schedule
   interval. **Default:** scheduled (5-min cron) for v1; webhook is a follow-up.
2. Should the worker run as Python or Node? **Default:** Python — matches
   `agent_search` and reuses the loader for validation.
3. PR target branch: `main` directly, or a `prompt-staging` branch?
   **Default:** `main`. CI gates are the safety net.

## Objective

A GitHub Actions workflow `.github/workflows/notion-prompt-sync.yml` that runs
every 5 minutes, fetches all Notion rows with `Status in {ready, active}`,
diffs against `prompts/` on `main`, and opens a PR if anything changed.

## Requirements

### Workflow

```yaml
name: notion-prompt-sync
on:
  schedule: [{ cron: "*/5 * * * *" }]
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write             # for branch push
      pull-requests: write        # for opening PR
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r apps/agent_graph_backend/requirements-v2.txt
      - run: pip install notion-client==2.2.1
      - env:
          NOTION_PROMPT_SYNC_TOKEN: ${{ secrets.NOTION_PROMPT_SYNC_TOKEN }}
          NOTION_DATABASE_ID:       ${{ secrets.NOTION_PROMPT_DATABASE_ID }}
          GH_TOKEN:                 ${{ secrets.GITHUB_TOKEN }}
        run: python scripts/notion_prompt_sync.py
```

### Script

`scripts/notion_prompt_sync.py`:

```python
def main():
    rows = fetch_notion_rows(status_in={"ready", "active"})
    rows = enforce_one_active_per_slug(rows)        # CI-side check happens too
    rows = filter_by_editor_allowlist(rows)         # _editors.yaml
    rendered = {row["slug"]: render_markdown(row) for row in rows}
    repo_state = read_existing_prompts()
    diff = compute_diff(rendered, repo_state)
    if not diff:
        print("no changes"); return
    branch = f"notion-sync/{utcnow_iso_compact()}"
    write_files(diff, branch)
    pr_url = open_pr(branch, body=format_pr_body(diff))
    print(f"opened {pr_url}")
```

### Render rules

```
---
slug: {row.Slug}
version: {row.Version}
status: {row.Status}
notion_page_id: {row.id}
owner: {row.Owner.email}
updated_at: {row.last_edited_time}
placeholders: []           # carried from _schema.yaml, not Notion
---

{page_body_as_plain_text}
```

- Page body: extract via `blocks.children.list`, concatenate paragraph/text
  blocks, strip headings/dividers/callouts. Markdown formatting INSIDE
  paragraphs is preserved.
- `placeholders` field is sourced from `_schema.yaml`, NOT Notion. Editors
  don't manage placeholders.

### PR body

```markdown
## Notion → Git sync — 2026-04-12T14:32Z

### Changed
- `system.rag_planner` v2 → v3 (active) — alice@example.com
- `tool.search_corpus_node.description` v1 → v2 (active) — alice@example.com

### Diff summary
- system.rag_planner: +12 / -4 lines

### Notion sources
- [system.rag_planner](https://notion.so/<page_id>)
- [tool.search_corpus_node.description](https://notion.so/<page_id>)

CI must pass before merge. After merge, deploy via the normal release flow.
```

### Allowlist enforcement

`prompts/_editors.yaml`:

```yaml
allowed_editors:
  - alice@example.com
  - bob@example.com
```

Rows whose `Last Edited By` is NOT in the allowlist are SKIPPED with a warning
in the workflow log. A separate row in the daily digest (TAG-77) surfaces them
to the engineering channel.

### Rename and delete handling

- **Rename in Notion** (Slug property edited): worker sees an "orphan slug" (file
  exists, no row points at it) AND a "new slug" (row exists, no file yet). It
  opens a PR with both `git mv` (delete old, create new). CI flags this with
  a `[RENAME]` label and requires the engineer to confirm the slug isn't
  referenced elsewhere.
- **Delete in Notion**: only allowed if the row's previous status was
  `deprecated`. Otherwise the worker refuses.
- **Status flipped `active` → `deprecated`**: worker treats it like a delete
  candidate — opens a PR removing the file. CI checks that another `active`
  row exists for the same slug (otherwise the loader would crash on startup).

### Idempotency

The same Notion state at minute 5 and minute 10 must produce the same
filesystem output. If a PR is already open with the same content, the worker
skips opening another (matches on branch name prefix `notion-sync/` + content
hash).

## Edge Cases

- Notion API rate limit (429) → exponential backoff, fail the workflow run
  (next cron will retry).
- Notion returns truncated block list → follow pagination cursor; assert all
  blocks fetched before rendering.
- Page body contains a Notion mention or inline database link → render as plain
  text fallback (`@person` → `@person`), do not follow.
- Network failure mid-sync → no partial state on disk (write to tempfile + rename).
- Two cron runs overlap → use a GitHub concurrency group:
  `concurrency: { group: notion-prompt-sync, cancel-in-progress: false }`.
- Editor pastes a real API key into a prompt → TAG-76's CI grep catches it.
  Worker does NOT pre-scan (we want the PR to exist so the bad edit is visible
  to security).

## Tests

| File | Test | Assertion |
|---|---|---|
| `scripts/tests/test_render.py` | Notion row → expected `.md` file | byte-equal |
| `scripts/tests/test_render.py` | page body with headings → stripped | matches |
| `scripts/tests/test_diff.py` | identical state → no diff | `compute_diff == {}` |
| `scripts/tests/test_diff.py` | one slug bumped → one file in diff | |
| `scripts/tests/test_diff.py` | rename detected | both delete+add present |
| `scripts/tests/test_allowlist.py` | unknown editor → row skipped | |
| `scripts/tests/test_one_active.py` | two active for same slug → workflow fails | |
| `scripts/tests/test_idempotent.py` | re-run with same Notion state → no new PR | branch reused |

## Acceptance Criteria

- [ ] Workflow runs on 5-min schedule + manually.
- [ ] First run on day zero produces NO PR (seed matches).
- [ ] An editor changes a `ready` row → PR appears within 5 min, CI green.
- [ ] Engineer merges PR → next deploy ships the new prompt.
- [ ] An unknown editor's change is logged but no PR opened.
- [ ] All 8 unit tests pass.
- [ ] Concurrency group prevents overlapping runs.

## Story Points Justification

5 pts: real integration work — Notion API pagination, GitHub PR creation,
rename detection, idempotency, allowlist. Each piece is small; together they
add up.

## Dependencies

**Depends on:** TAG-72, TAG-74.
**Blocks:** TAG-76 (which adds the merge-gate CI).

## Risk Factors

| Risk | Mitigation |
|---|---|
| Worker token compromised → attacker opens malicious PRs | Token scoped to `pull_request:write` and `contents:write` on a branch namespace only; main is protected and requires human approval. |
| Editor mistake spams the team with PRs every 5 min | Idempotency check; if the same content is pending, no new PR. |
| Notion API breaking change | Pin `notion-client` version; renovate-bot PRs upgrades with a manual review. |
| Worker takes >5 min and overlaps with next run | `concurrency` group serializes. |
| Sync silently dropping a row due to filter bug | TAG-77 daily digest surfaces row counts; mismatch with Notion total triggers alert. |
