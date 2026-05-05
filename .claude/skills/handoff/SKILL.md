---
name: handoff
description: Generate a short, copyable prompt (3-6 sentences) that orients a fresh agent on a ticket — tells it what to do, where the plan lives, which CLAUDE.md indexes to start from, and what branch to use. The receiving agent does its own reading; this is a pointer, not a data dump.
argument-hint: <ticket RGDEV-NNN> [--branch <base-branch>] [--be | --fe]
---

# Handoff — Short Agent Orientation Prompt

Produces a **3-6 sentence copyable prompt** a fresh Claude Code session can
paste in and start working. It points the agent at existing plans, indexes,
and the right branch. It does NOT reproduce content — the agent reads for itself.

---

## Step 1 — Parse Arguments

Extract:
- **Ticket key** — `RGDEV-NNN`
- **Base branch** — `--branch <name>`, or detect from current checkout
- **Scope** — `--be` backend only, `--fe` frontend only, both if omitted

---

## Step 2 — Fetch just enough context (run in parallel)

### 2a. Current branch
```bash
cd /c/Projects/ReallyGlobal/Lumy-Backend && git branch --show-current
```

### 2b. Check if a plan comment exists on the ticket
```
getJiraIssue(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  issueIdOrKey="RGDEV-NNN",
  responseContentFormat="markdown",
  fields=["summary","status","comment","parent"]
)
```
Look only for: ticket summary, status, parent epic key, and whether a
`## Implementation Plan` comment already exists (from `/plan-pipeline`).

---

## Step 3 — Generate the prompt

Write a prompt of **3–6 sentences** covering exactly these points, in order:

1. **What to do** — one sentence: ticket key, ticket title, and the core task
2. **Where the plan is** — if a plan comment exists on the Jira ticket, say so and give the Jira URL. If not, say "No plan exists yet — read the ticket description at <url> to understand the requirements."
3. **Where to start reading** — tell the agent to read `CLAUDE.md` first, then follow the index links for the relevant domain (e.g. `Docs/TopicTagMap.md` for topic-based lookup, or a specific `ContextFiles2/ProductFeatures/` path if obvious from the ticket domain)
4. **Branch** — which branch to check out or cut from
5. **One-line scope reminder** — backend only / frontend only / both

Do NOT include: git log output, file contents, Jira description body, PR lists, or gotcha lists. The receiving agent reads those itself.

---

## Step 4 — Output

Print the 3–6 sentence prompt inside a single code fence. Nothing else.

---

## Example output (for reference — do not copy literally)

```
Implement RGDEV-187 ([Backend] Attribution Notification System): send a
provider email via SendGrid + RQ when their first attributed client books,
hooking into `confirm_attribution_if_eligible()` in `apps/attribution/utils.py`.
The implementation plan is posted as a comment on the Jira ticket at
https://reallyhq.atlassian.net/browse/RGDEV-187 — read that first.
Start by reading `CLAUDE.md`, then follow `Docs/TopicTagMap.md` for
attribution and notifications context.
Cut a new branch off `attribution-master` named `RGDEV-187/attribution-notification`.
Backend only — no frontend changes needed.
```

---

## Constants

| Constant | Value |
|---|---|
| Backend path | `C:\Projects\ReallyGlobal\Lumy-Backend` |
| Jira Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
| Jira base URL | `https://reallyhq.atlassian.net/browse/` |
