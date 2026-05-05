---
name: plan-pipeline
description: Planning-only pipeline that reads Jira epics/tickets, generates detailed implementation plans for each, and posts the plans as comments back to the tickets. Does NOT implement code. Use when asked to "plan this ticket", "create a plan for", "plan-pipeline", or "generate implementation plans".
argument-hint: [jira-issue-key | epic-key | comma-separated-keys]
---

# Plan Pipeline — Jira Ticket Planning

Generates implementation plans for Jira tickets/epics and posts them as comments. **No code is written.**

---

## Step 1 — Parse Arguments

From `$ARGUMENTS`, extract one or more Jira issue keys (e.g. `RGDEV-180`, `RGDEV-180,RGDEV-181`, or just an epic key).

- If an **Epic** key is provided → fetch the epic + search for all child tickets (`issueType in (Story, Task, Bug) AND "Epic Link" = KEY OR parentEpic = KEY`)
- If individual ticket keys → plan each one
- If no arguments → ask the user which ticket(s) to plan

---

## Step 2 — Fetch Tickets from Jira

For each issue key:

```
getJiraIssue(cloudId="92044829-3f40-4908-abaf-e65a65514b79", issueIdOrKey=KEY, responseContentFormat="markdown")
```

If the issue is an Epic, also run:
```
searchJiraIssuesUsingJql(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  jql='project = RGDEV AND "Epic Link" = KEY ORDER BY created ASC',
  responseContentFormat="markdown"
)
```

Collect: summary, description, acceptance criteria, linked issues, labels, priority.

---

## Step 3 — Codebase Orientation (run in parallel with Step 2)

Before planning, read enough code to give concrete file paths and model names. For each ticket:

- Identify which Django apps are affected (`apps/stripe_integration/`, `apps/care_provider/`, `apps/calendar_functionality/`, etc.)
- Read the relevant `models.py`, `views.py`, `serializers.py`, `urls.py`
- Read relevant frontend pages/components in `RG-Frontend/src/`
- Grep for existing patterns related to the ticket domain

Goal: plans must cite real file paths, real model names, real variable names — not generic descriptions.

---

## Step 4 — Generate Implementation Plan

For each ticket, produce a plan in this structure:

```markdown
## Implementation Plan: [TICKET-KEY] — [Summary]

**Ticket:** [KEY] | **Priority:** [P] | **Status:** [S]
**Epic:** [parent epic if applicable]

---

### Overview
2–3 sentences on what this ticket accomplishes and why it matters to the product.

### Affected Systems
| Layer | Files / Components | Change Type |
|---|---|---|
| Backend model | `apps/X/models.py` — ModelName | New field / New model / Migration |
| Backend API | `apps/X/views.py` — ViewName | New endpoint / Modified logic |
| GraphQL | `apps/graphqlapp/schema.py` | New type / mutation |
| Frontend | `src/pages/X.tsx`, `src/components/Y/` | New UI / Updated form |
| Fixtures | `fixtures/X.json` | Seed data update |
| Tests | `apps/X/tests.py` | Unit + integration |

### Data Model Changes
List every model change with field names and types:
- `NewModel(provider, client, created_at, ...)` — describe purpose
- `ExistingModel` + `new_field = models.ForeignKey(...)` — describe purpose
- Migration: `0XXX_description.py`

### API / Endpoint Changes
- `GET /api/v1/X/` — describe
- `POST /api/v1/X/` — describe request/response shape
- GraphQL: `query/mutation name` — describe

### Frontend Changes
- Component/page changes
- State management (Redux slice / Apollo query)
- UI flows: describe user journey

### Business Logic
Step-by-step description of the core algorithm or rules being implemented. Reference BRD rules explicitly.

### Edge Cases & Guard Rails
Bullet list of edge cases that must be handled:
- [edge case] → [handling]

### Testing Plan
- Unit tests: what to test, where to put them
- Integration tests: which endpoints/flows
- Manual QA steps for Docker dev environment

### Dependencies
- Blocked by: [other tickets if any]
- Blocks: [other tickets if any]
- External services: [Stripe, Twilio, etc. if any]

### Implementation Order
Numbered sequence — the order a developer should implement this to avoid broken intermediate states.

### Estimated Complexity
**Backend:** [Low / Medium / High] — [brief reason]
**Frontend:** [Low / Medium / High] — [brief reason]
**Total:** [story point estimate] story points
```

---

## Step 5 — Post Plan as Jira Comment

For each ticket, post the plan as a comment:

```
addCommentToJiraIssue(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  issueIdOrKey=KEY,
  comment="## Implementation Plan\n\n[full plan markdown]"
)
```

Confirm success for each ticket.

---

## Step 6 — Summary Output

After all plans are posted, output a summary table:

```
| Ticket | Summary | Complexity | Comment Posted |
|--------|---------|------------|----------------|
| RGDEV-X | ... | Medium | ✅ |
```

---

## Rules

- **No code written** — this skill plans only. Refer to `/audit-pipeline` for implementation.
- Plans must cite **real file paths** from the actual codebase, not generic paths.
- Plans must reflect **actual model names** — read the code before writing the plan.
- Flag blockers and dependencies explicitly — do not assume clear runway.
- If a ticket description is too vague to plan, post a comment asking for clarification instead of guessing.
- Keep plans actionable: a developer should be able to start immediately from the plan alone.
- Always read the Epic description even when planning child tickets — context matters.

---

## Repo Paths
| Repo | Path |
|---|---|
| Backend | `C:\Projects\ReallyGlobal\Lumy-Backend` |
| Frontend | `C:\Projects\ReallyGlobal\RG-Frontend` |
| Jira Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
