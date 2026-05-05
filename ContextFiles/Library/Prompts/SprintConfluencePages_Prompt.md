# Sprint Confluence Pages — Replication Prompt

Use this prompt to instruct a new agent to create the sprint status + implementation guide Confluence pages for a new set of tickets.

---

## Prompt

You are creating two Confluence pages documenting a completed sprint for the ReallyGlobal engineering team. The sprint is: **[DESCRIBE THE SPRINT — e.g. "the attribution engine + booking link sprint covering RGDEV-183 through RGDEV-186"]**.

**Consolidated PR:** [GITHUB PR URL — e.g. https://github.com/reallyhq/Lumy-Backend/pull/1243]
**Tickets:** [COMMA-SEPARATED LIST — e.g. RGDEV-183, RGDEV-184, RGDEV-185, RGDEV-186]
**Branch:** [BRANCH NAME — e.g. attribution-master]

---

### Step 1 — Fetch all Jira tickets in parallel

For each ticket, call:
```
getJiraIssue(cloudId="92044829-3f40-4908-abaf-e65a65514b79", issueIdOrKey=KEY, responseContentFormat="markdown", fields=["summary","status","assignee","priority"])
```

---

### Step 2 — Read the PR description from GitHub

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr view <PR-NUMBER> --json title,body,commits
```

Extract: list of tickets, critical findings, migrations, new env vars.

---

### Step 3 — Read the git log for context

```bash
cd /c/Projects/ReallyGlobal/Lumy-Backend
git log --oneline origin/main..<branch>
```

---

### Step 4 — Create the root page (Sprint Status)

```
createConfluencePage(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  spaceId="98447",
  parentId="98566",
  title="<Topic> — Sprint Status",
  contentFormat="markdown",
  body=<content>
)
```

The root page must contain:
1. **What shipped** — table with one row per ticket: Jira link, one-line summary, status "In Review"
2. **Pull request** — link to the consolidated PR, commit count, migration count
3. **Action required** — addressed to reviewers, with 2-3 bullet points on the most critical findings (security issues, revenue bugs, data integrity gaps — not just feature descriptions)
4. **Key reference table** — e.g. fee structure, new endpoints summary, or config values — whatever is most relevant to this sprint
5. **Sub-pages** link

---

### Step 5 — Create the sub-page (Implementation Guide)

Use the root page ID from Step 4 as `parentId`.

```
createConfluencePage(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  spaceId="98447",
  parentId=<root-page-id>,
  title="Implementation Guide — <branch> (PR #NNNN)",
  contentFormat="markdown",
  body=<content>
)
```

The implementation guide must contain, for each ticket:
- Jira link + one-paragraph description
- New models (if any)
- New endpoints table (method, path, description) — one table per ticket
- Key fix section — if the audit surfaced a critical bug, explain it in plain English: what was wrong, why it mattered, how it was fixed

Then at the bottom:
- **Migrations** — list every new migration file
- **QA checklist** — interactive Confluence task list (use `ac:task-list` ADF format or markdown `- [ ]`), grouped by feature area: Setup, Attribution flow, Fee logic, Security, Test suite
- **Environment variables** — table of every new or corrected env var with the correct value and a "Notes" column explaining why it changed

---

### Step 6 — Output Teams message

After both pages are created, print this Teams message ready to paste:

```
**<Topic> sprint is ready for review.**

<1-2 sentences: what this sprint delivers and why it matters to the product.>

Tickets in this PR:
• [RGDEV-NNN](https://reallyhq.atlassian.net/browse/RGDEV-NNN) — <one-line summary>
• [RGDEV-NNN](https://reallyhq.atlassian.net/browse/RGDEV-NNN) — <one-line summary>
• (one line per ticket)

Three things to know before you review:
• <Most critical finding — one line, plain English>
• <Second critical finding>
• <Third critical finding>

📄 Sprint status + QA checklist: <root-page-url>
🔀 PR: <github-pr-url>
```

Keep the Teams message under 200 words total.

---

### Constants

| Constant | Value |
|---|---|
| Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
| Jira base URL | `https://reallyhq.atlassian.net/browse/` |
| Confluence base URL | `https://reallyhq.atlassian.net/wiki` |
| Space ID | `98447` |
| Homepage ID (parent) | `98566` |
| GitHub BE repo | `reallyhq/Lumy-Backend` |
| GitHub FE repo | `reallyhq/RG-Frontend` |
| GitHub CLI path | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |

---

### Quality rules

- Every Jira ticket number must be a hyperlink to `https://reallyhq.atlassian.net/browse/RGDEV-NNN`
- The PR link must point to the consolidated branch PR, not individual ticket PRs
- The "Action required" critical findings must describe actual bugs (security holes, revenue leakage, data integrity gaps) — not feature additions
- The QA checklist must be actionable: each item is something a reviewer can verify in under 5 minutes
- The env var table must include every variable introduced or corrected in this branch — if a dev bootstraps from `.env.example` after this merges, they should not need to look anywhere else
