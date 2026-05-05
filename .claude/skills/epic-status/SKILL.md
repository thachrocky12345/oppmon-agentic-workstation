# Epic Status — Jira Epic + Children Payload Builder

Fetches one or more epics and ALL their child tickets, builds a rich structured
payload, then renders it into whatever output format you ask for.

---

## Step 1 — Parse Arguments

```
/epic-status RGDEV-180,RGDEV-195,RGDEV-166 [--output <format>] [--filter <status>]
```

| Argument | Values | Default |
|---|---|---|
| Epic keys | Comma-separated RGDEV-NNN | Required |
| `--output` | `summary` \| `teams` \| `confluence` \| `table` \| `json` | `summary` |
| `--filter` | `todo` \| `inprogress` \| `inreview` \| `done` \| `open` \| `all` | `all` |
| `--assignee` | Display name substring | none |

If no epic keys given → fetch all active (non-Done) epics:
```
searchJiraIssuesUsingJql(jql='project = RGDEV AND issuetype = Epic AND status != Done ORDER BY key ASC')
```

---

## Step 2 — Fetch Data (ALL in parallel)

For each epic key, fire these two calls simultaneously:

### 2a. Epic detail
```
getJiraIssue(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  issueIdOrKey=KEY,
  responseContentFormat="markdown",
  fields=["summary", "status", "description", "priority", "assignee", "labels", "created", "updated"]
)
```

### 2b. All children
```
searchJiraIssuesUsingJql(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  jql="parent = KEY ORDER BY key ASC",
  fields=["summary", "status", "issuetype", "priority", "assignee", "labels", "updated"],
  maxResults=100,
  responseContentFormat="markdown"
)
```

---

## Step 3 — Build the Payload

### Phase Classification

Every child ticket is classified into a **phase** based on its title prefix and content:

| Phase key | Matches | Display label |
|---|---|---|
| `implementation` | `[Backend]`, `[Frontend]`, `[Design]`, no prefix (core build work) | Implementation |
| `testing` | `[QA]`, "Testing", "Test", "End-to-End", "E2E", "QA" | Testing & QA |
| `documentation` | "Handoff", "Document", "ADR", "Architecture Decision", "Epic 2 Handoff" | Documentation |
| `compliance` | "HIPAA", "Compliance", "Security Review" | Compliance & Security |
| `observability` | "Performance", "Observability", "Monitoring", "Alerting", "Latency" | Performance & Observability |

Rules:
- Title prefix `[Backend]`, `[Frontend]`, `[Design]` → always `implementation` (even if In Review)
- Title contains QA/Test keywords → `testing`
- Title contains Documentation/Handoff keywords → `documentation`
- When in doubt, classify as `implementation`

Tickets that are **In Review** AND in the `implementation` phase are flagged as **`ready_for_review`** = true.

### Payload structure

```
EPIC_PAYLOAD = {
  key: "RGDEV-NNN",
  title: "...",
  status: "In Review",
  priority: "Medium",
  jira_url: "https://reallyhq.atlassian.net/browse/RGDEV-NNN",
  description_summary: <first 3 sentences of description>,
  stats: {
    total: N,
    todo: N,
    in_progress: N,
    in_review: N,
    done: N,
    unassigned: N,
    ready_for_review: N,   // implementation tickets in In Review
  },
  phases: {
    implementation: [ ...tickets ],
    testing: [ ...tickets ],
    documentation: [ ...tickets ],
    compliance: [ ...tickets ],
    observability: [ ...tickets ],
  },
  children: [            // flat list, each ticket has a `phase` field
    {
      key: "RGDEV-NNN",
      title: "...",
      type: "Task" | "Bug" | "Story",
      phase: "implementation" | "testing" | "documentation" | "compliance" | "observability",
      ready_for_review: true | false,
      status: "In Review",
      priority: "Medium",
      assignee: "Name" | "Unassigned",
      jira_url: "https://reallyhq.atlassian.net/browse/RGDEV-NNN",
      updated: "2026-03-15",
    },
    ...
  ]
}
```

Apply `--filter` to `children` before rendering:
- `open` = status in (To Do, In Progress, In Review)
- `todo` = To Do only
- `inprogress` = In Progress only
- `inreview` = In Review only
- `done` = Done only
- `all` = no filter

Apply `--assignee` filter as case-insensitive substring match on `assignee`.

---

## Step 4 — Render Output

### `--output summary` (default)
Plain markdown. One section per epic, tickets grouped by phase. Phase sections rendered in this order:
1. **✅ Ready for Review & Testing** — implementation tickets with status In Review
2. **🔨 Implementation — In Progress / To Do** — implementation tickets not yet In Review
3. **🧪 Testing & QA** — testing phase tickets
4. **📋 Documentation** — documentation phase tickets
5. **🔒 Compliance & Security** — compliance phase tickets (if any)
6. **📈 Performance & Observability** — observability phase tickets (if any)

Omit any phase section that has zero tickets. Each phase section has its own sub-table.

```markdown
## RGDEV-NNN — Epic Title [STATUS]
> One-sentence description.

**Progress:** ░░░░░░░░░░ X/N done (X%)
**Breakdown:** 🔴 To Do: N | 🟡 In Progress: N | 🔵 In Review: N | ✅ Done: N | 🚀 Ready for Review: N

### ✅ Ready for Review & Testing
| Ticket | Title | Assignee |
|--------|-------|----------|
| [RGDEV-NNN](url) | [Backend] Title | jeremy |

### 🔨 Implementation — In Progress / To Do
| Ticket | Title | Status | Assignee |
|--------|-------|--------|----------|
| [RGDEV-NNN](url) | [Frontend] Title | 🔴 To Do | Unassigned |

### 🧪 Testing & QA  *(next phase)*
| Ticket | Title | Status | Assignee |
|--------|-------|--------|----------|
| [RGDEV-NNN](url) | [QA] Title | 🔴 To Do | Unassigned |

### 📋 Documentation  *(next phase)*
| Ticket | Title | Status | Assignee |
|--------|-------|--------|----------|
| [RGDEV-NNN](url) | Handoff Title | 🔴 To Do | Unassigned |
```

---

### `--output table`
Compact multi-epic table, sorted by status then key:

```markdown
| Epic | Ticket | Title | Type | Status | Assignee | Updated |
|------|--------|-------|------|--------|----------|---------|
| RGDEV-180 | RGDEV-181 | [Backend] External Referral... | Task | In Review | Unassigned | 2026-03-15 |
```

---

### `--output teams`
Microsoft Teams Adaptive Card JSON. Paste into Incoming Webhook or Power Automate.
One card per epic. Structure:

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "RGDEV-NNN — Epic Title",
      "weight": "Bolder",
      "size": "Medium"
    },
    {
      "type": "TextBlock",
      "text": "Status: In Review | X/N done (X%)",
      "wrap": true
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "To Do", "value": "N" },
        { "title": "In Progress", "value": "N" },
        { "title": "In Review", "value": "N" },
        { "title": "Done", "value": "N" }
      ]
    },
    {
      "type": "Table",
      "columns": [
        { "width": 1 }, { "width": 3 }, { "width": 1 }, { "width": 1 }
      ],
      "rows": [
        {
          "type": "TableRow",
          "cells": [
            { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Ticket", "weight": "Bolder" }] },
            { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Title", "weight": "Bolder" }] },
            { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Status", "weight": "Bolder" }] },
            { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Assignee", "weight": "Bolder" }] }
          ]
        }
        // ... one row per child ticket
      ]
    },
    {
      "type": "ActionSet",
      "actions": [
        {
          "type": "Action.OpenUrl",
          "title": "Open in Jira",
          "url": "https://reallyhq.atlassian.net/browse/RGDEV-NNN"
        }
      ]
    }
  ]
}
```

Wrap multiple epics in an array: `[ card1, card2, card3 ]`

---

### `--output confluence`
Creates or updates a Confluence page in the Team Hub space (space ID `98447`).

Page title: `Epic Status — RGDEV-NNN, RGDEV-NNN [YYYY-MM-DD]`
Parent page: Confluence homepage `98566` (or pass `--parent PAGE_ID`)

Page body (Confluence storage format via `createConfluencePage` or `updateConfluencePage`):

Use `createConfluencePage` with `markdown` body type.

Content structure per epic:
```markdown
# RGDEV-NNN — Epic Title

**Status:** In Review | **Priority:** Medium | **Updated:** 2026-03-15
**Jira:** https://reallyhq.atlassian.net/browse/RGDEV-NNN

> Description summary (2-3 sentences)

## Progress
X of N tickets complete (X%)
🔴 To Do: N | 🟡 In Progress: N | 🔵 In Review: N | ✅ Done: N

## Tickets

| Ticket | Title | Type | Status | Assignee |
|--------|-------|------|--------|----------|
| [RGDEV-NNN](url) | Title | Task | In Review | jeremy |

---
```

After creating the page, output the Confluence URL.

---

### `--output json`
Dump the raw `EPIC_PAYLOAD` array as pretty-printed JSON. No rendering — maximum
flexibility for piping into other tools.

---

## Step 5 — Output

Always print a one-line recap at the end:

```
Fetched N epics, M total tickets. Rendered as [format]. Filter: [filter].
```

If `--output confluence`: also print the page URL.
If `--output teams`: remind user to paste the JSON into their Teams webhook.

---

## Rules

- Always fetch children even if epic has 0 — just render an empty table with a note.
- `--filter open` is the most useful default for standup/Teams posts — suggest it if not specified.
- Never truncate ticket titles in table outputs — wrap is fine, truncation is not.
- Jira URLs always follow the pattern: `https://reallyhq.atlassian.net/browse/RGDEV-NNN`
- Progress bar uses block chars: `█` per done ticket, `░` per remaining (10-char bar, scaled).
- If an epic has a parent epic itself, show the grandparent key as context.
- Status label mapping for display:
  - `To Do` → 🔴 To Do
  - `In Progress` → 🟡 In Progress
  - `In Review` → 🔵 In Review
  - `Done` → ✅ Done

---

## Constants

| Constant | Value |
|---|---|
| Jira Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
| Jira base URL | `https://reallyhq.atlassian.net/browse/` |
| Confluence Space | `98447` (Team Hub) |
| Confluence Homepage | `98566` |
