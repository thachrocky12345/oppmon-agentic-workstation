---
name: sprint-confluence-pages
description: Create a Confluence sprint status root page + implementation guide sub-page for a set of tickets/PRs, then output a Teams message with review request. Use when asked to "publish sprint docs", "create confluence pages", "document this sprint", or "write up the review request".
argument-hint: [PR-number] [ticket1,ticket2,...] or just invoke and the skill will discover open PRs
---

# Sprint Confluence Pages

Creates two Confluence pages and outputs a Teams message ready to paste.

**Page 1 — Sprint Status** (root): Ticket table with Jira links, PR link, fee/key facts, call to action. Audience: PM + dev team.

**Page 2 — Implementation Guide** (sub-page): Full technical detail per ticket — endpoint tables, key fixes, migrations, interactive QA checklist, env var requirements. Audience: reviewer + QA.

---

## Step 1 — Gather inputs (run in parallel)

### 1a. Identify the PR and consolidated branch
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
cd /c/Projects/ReallyGlobal/Lumy-Backend

# Find the consolidation PR (attribution-master style)
gh pr list --json number,title,headRefName,baseRefName,url \
  --jq '.[] | select(.baseRefName == "main") | "#\(.number) \(.headRefName) — \(.title)\n  \(.url)"'
```

If a specific PR number was provided as an argument, use that. Otherwise use the most recent open PR targeting `main`.

### 1b. Get the list of tickets
From the PR body or branch name, extract ticket numbers (e.g. `RGDEV-183`, `RGDEV-184`).

If the PR body contains a ticket list, parse it. Otherwise infer from the branch commit history:
```bash
git log --oneline origin/main..attribution-master | grep -oE 'RGDEV-[0-9]+' | sort -u
```

### 1c. Fetch all Jira tickets in parallel
For each ticket:
```
getJiraIssue(cloudId="92044829-3f40-4908-abaf-e65a65514b79", issueIdOrKey=KEY, fields=["summary","status","assignee","priority"])
```

### 1d. Get Confluence space
```
getConfluenceSpaces(cloudId="92044829-3f40-4908-abaf-e65a65514b79", type="global")
```
Use space ID `98447` (Team Hub) and parent page ID `98566` (homepage) unless another space is specified.

---

## Step 2 — Create root page (Sprint Status)

```
createConfluencePage(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  spaceId="98447",
  parentId="98566",
  title="<Topic> — Sprint Status",
  contentFormat="markdown",
  body=<see template below>
)
```

### Root page template

```markdown
## What shipped

<N> tickets implemented, audited, and consolidated into a single PR ready for review.

| Ticket | Summary | Status |
|--------|---------|--------|
| [RGDEV-NNN](https://reallyhq.atlassian.net/browse/RGDEV-NNN) | <one-line summary> | In Review |
...

---

## Pull request

All <N> tickets are consolidated into a single branch (`<branch-name>`) targeting `main`.

**[PR #NNNN — <title>](<github-url>)**

<N> commits · <N> new migrations · Needs review and approval before merge.

---

## Action required

**Reviewers:** Please review PR #NNNN and complete the QA checklist on the Implementation Guide sub-page before approving.

Key areas that warrant close attention:
- **<Critical finding 1>** — <one sentence explanation>
- **<Critical finding 2>** — <one sentence explanation>
- **<Critical finding 3>** — <one sentence explanation>

---

## <Key reference table — e.g. Fee structure, API surface, Config values>

| <col1> | <col2> |
|--------|--------|
| <row>  | <row>  |

---

## Sub-pages
- [Implementation Guide — <branch> (PR #NNNN)](<confluence-url>)
```

---

## Step 3 — Create sub-page (Implementation Guide)

Use the root page ID from Step 2 as `parentId`.

```
createConfluencePage(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  spaceId="98447",
  parentId=<root-page-id>,
  title="Implementation Guide — <branch> (PR #NNNN)",
  contentFormat="markdown",
  body=<see template below>
)
```

### Implementation guide template

```markdown
## Overview

**Branch:** `<branch>` → `main`
**PR:** [#NNNN](<github-url>)
**Commits:** <N>
**New migrations:** <N>
**New Django apps:** `apps/<app>/`, ...

---

## Tickets in this branch

### [RGDEV-NNN](<jira-url>) — <Title>

<2-3 sentence description of what this ticket does and why it matters.>

**Key files:** `apps/<app>/models.py`, `apps/<app>/views.py`

**New models:** `ModelA`, `ModelB` *(if any)*

**New endpoints:** *(if any)*

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/<path>/` | <description> |

**Key fix / Critical finding:** *(if audit surfaced something important)*
<Explain the bug/gap that was found and how it was resolved.>

---

*(repeat for each ticket)*

---

## Migrations

Run on deploy:

\```
python manage.py migrate
\```

New migration files:
- `apps/<app>/migrations/<file>.py`
- ...

---

## QA checklist

Before approving PR #NNNN, verify the following:

**Setup**
- [ ] Pull `<branch>` locally
- [ ] Verify `.env.example` has correct non-zero values for fee/config variables
- [ ] `docker compose up --build` — migrations run clean, seed completes

**<Feature area 1>**
- [ ] <specific verification step>
- [ ] <specific verification step>

**<Feature area 2>**
- [ ] <specific verification step>

**Test suite**
\```bash
python manage.py test apps.<app1> apps.<app2>
\```

---

## Environment variables required

Ensure these are set in production before deploying:

| Variable | Value | Notes |
|----------|-------|-------|
| `VAR_NAME` | `value` | New — <why it's needed> |
| `VAR_NAME` | `value` | Was wrong — <what changed> |
```

---

## Step 4 — Output Teams message

After both pages are created, print the following Teams message ready to paste:

```
**<Topic> sprint is ready for review.**

<1-2 sentences on what shipped — what problem it solves, not a list of tickets.>

Tickets in this PR:
• [RGDEV-NNN](https://reallyhq.atlassian.net/browse/RGDEV-NNN) — <one-line summary>
• [RGDEV-NNN](https://reallyhq.atlassian.net/browse/RGDEV-NNN) — <one-line summary>
• (one line per ticket)

Three things to know before you review:
• <Critical finding 1 — one line>
• <Critical finding 2 — one line>
• <Critical finding 3 — one line>

📄 Sprint status + QA checklist: <root-page-url>
🔀 PR #NNNN: <github-pr-url>
```

---

## Rules

- **Jira links must use** `https://reallyhq.atlassian.net/browse/RGDEV-NNN` format
- **GitHub PR link must be** the consolidated `attribution-master`-style PR, not individual ticket PRs
- **QA checklist must use Confluence task list format** (interactive checkboxes, not markdown `- [ ]`)
- **Critical findings section** must highlight actual bugs found in audit (security, revenue, data integrity) — not just "feature was added"
- **Teams message must be ≤ 150 words** — concise, scannable in 10 seconds
- **Both pages must be created** before outputting the Teams message

## Confluence / Jira constants

| Constant | Value |
|---|---|
| Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
| Jira base URL | `https://reallyhq.atlassian.net/browse/` |
| Confluence base URL | `https://reallyhq.atlassian.net/wiki` |
| Space ID | `98447` (Team Hub) |
| Space key | `TH` |
| Homepage ID | `98566` |
| GitHub org/repo (BE) | `reallyhq/Lumy-Backend` |
| GitHub org/repo (FE) | `reallyhq/RG-Frontend` |
