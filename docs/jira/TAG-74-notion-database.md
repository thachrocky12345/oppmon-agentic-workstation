# TAG-74: Notion Database Schema + Setup Runbook

## Description

**Suggested Points:** 2
**Type:** Story / DevOps
**Epic:** [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
**Status:** Open

Create the Notion database that prompt editors will use, with properties that
map 1:1 to the frontmatter contract in TAG-72. Document the integration token,
permissions, and the editor onboarding flow.

## Required Reading

- TAG-70 epic, "Decisions locked in" (especially status enum and one-active-per-slug).
- TAG-71 manifest — defines the row set.
- TAG-72 loader — defines the frontmatter contract.
- Notion API reference: `https://developers.notion.com/reference/intro`
  (linked here for the engineer; do not copy contents into the repo).

## Open Questions (raise before coding)

1. Which Notion workspace owns the database? Is there an existing OppMon
   workspace, or do we create one? Capture in the runbook.
2. Should prompt editors be members of the existing OppMon Notion workspace,
   or a sub-workspace? Affects who can grant the integration access.
3. Does the org already have a Notion integration token policy (vault, rotation)?
   If yes, follow it; if no, document a 90-day rotation cadence in TAG-77's ADR.

## Objective

A live Notion database named **"Prompt Library — agent_search"** with the schema
below, accessible to the GitHub Actions workflow via a workspace integration.

## Requirements

### Database properties

| Property | Type | Required | Notes |
|---|---|---|---|
| `Name` | Title | yes | Human label. Free-form. |
| `Slug` | Text | yes, unique | Must match a slug in `_schema.yaml`. CI rejects unknown slugs. |
| `Version` | Number (integer) | yes | Monotonically increasing per slug. |
| `Status` | Select | yes | `draft` / `ready` / `active` / `deprecated`. |
| `Owner` | Person | yes | Editor responsible for this slug. |
| `Tags` | Multi-select | no | e.g. `system`, `tool`, `template`. |
| `Reuse Notes` | Text | no | Markdown notes for editors, NOT shipped to runtime. |
| `Last Edited` | Last edited time | auto | Used to detect changes. |
| `Last Edited By` | Last edited by | auto | Used for the allowlist check (TAG-75). |
| `Notion Page ID` | Formula or text | auto | Echoes `id(page)` — copied into frontmatter. |

### Page body convention

The page **body** (not a property) is the prompt content itself. Editors write
plain text (Markdown allowed, but kept minimal — see TAG-73's tool-description
note). The sync worker (TAG-75) extracts page body and renders to
`prompts/<slug>.md`.

Headings, callouts, embedded files: **stripped on sync**. Editors are told this
in the database template.

### Integration

1. In the workspace admin, create a Notion internal integration:
   - Name: `agent_search-prompt-sync`
   - Capabilities: Read content, no insert, no update, no comments.
   - Workspace scope: only the Prompt Library page.
2. Share the database with the integration.
3. Copy the integration token to a 1Password / vault item:
   `NOTION_PROMPT_SYNC_TOKEN`.
4. Add the same value to GitHub Actions repo secrets so TAG-75's worker can
   read it.

### Database template (Notion-side)

A page template inside the database, used when an editor clicks "+ New":

```
Slug: <leave blank, fill from list>
Version: 1
Status: draft
Owner: <self>

[Place prompt body below this divider; do not edit above]
---
```

This template is for editor ergonomics only — the sync worker reads property
values directly, not the template scaffold.

### Onboarding runbook

`docs/runbooks/notion-prompt-editor-onboarding.md`:

1. How to request access (Slack channel? Jira service desk?).
2. How to clone an existing prompt as a starting point.
3. Status workflow (`draft` → `ready` → wait for sync PR → `active`).
4. How to verify a prompt landed in production (TAG-77 dashboards).
5. How to roll back: switch the newer version's status to `deprecated` and an
   older version's status to `active`; sync worker opens a revert PR.

### Editor allowlist

The runbook lists named users who may edit prompts. The sync worker (TAG-75)
cross-checks `Last Edited By` against this list and refuses to open PRs from
unknown users (defense in depth against a compromised integration token).

The allowlist lives in `prompts/_editors.yaml` (in this repo), versioned and
reviewed like any other code.

## Edge Cases

- Editor creates two `active` rows for the same slug → TAG-76 CI fails; runbook
  describes the resolution (mark one as `deprecated`).
- Editor sets `Status = active` without going through `ready` → allowed; warned
  in the runbook but not blocked. The sync worker treats it the same.
- Editor renames a slug → produces a delete + add PR. The runbook strongly
  discourages renames; recommends `deprecated` + new slug.
- Editor deletes a row → sync worker opens a PR removing the file ONLY if the
  row was already `deprecated`. Active deletions are refused (CI fail).

## Tests

This is a setup ticket — verification is manual:

- [ ] Database created with all properties from the table.
- [ ] Template page exists.
- [ ] Integration token issued and stored.
- [ ] Editor allowlist file `prompts/_editors.yaml` committed (empty list OK initially).
- [ ] Runbook covers all five sections above.

## Acceptance Criteria

- [ ] Live Notion database with N rows = len(slugs from TAG-71 inventory),
      one per slug, populated by importing the current prompt content from the
      repo (this is the seed — same content both sides on day zero).
- [ ] Integration token in vault and GitHub Actions secret.
- [ ] Editor onboarding runbook merged.
- [ ] Allowlist file merged.
- [ ] One non-engineer test edit through the full flow (TAG-75 will validate the PR side).

## Story Points Justification

2 pts: no code, but coordinating workspace access + writing the runbook + the
seed import is real work.

## Dependencies

**Depends on:** TAG-71, TAG-72.
**Blocks:** TAG-75.

## Risk Factors

| Risk | Mitigation |
|---|---|
| Integration token leaked | 90-day rotation; vault-stored; allowlist is the second factor. |
| Editor accidentally edits a `deprecated` row thinking it's live | Notion view filters default to `Status != deprecated`. |
| Notion database schema drift | TAG-75 worker fetches schema at startup and asserts the property set matches; fails fast. |
