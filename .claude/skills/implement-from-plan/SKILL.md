# Implement From Plan

Reads existing implementation plan comments from Jira tickets and implements
the code directly. No re-planning, no audit phases. Use this when tickets
already have audited plans posted via `/plan-pipeline`.

---

## Step 1 — Parse Arguments

```
/implement-from-plan RGDEV-190,RGDEV-191,RGDEV-193 [--branch <name>] [--repo fe|be|both]
```

| Argument | Values | Default |
|---|---|---|
| Ticket keys | Comma-separated RGDEV-NNN | Required |
| `--branch` | Branch name to create/use | Auto-generated from ticket keys |
| `--repo` | `fe`, `be`, `both` | Infer from ticket prefixes |

---

## Step 2 — Fetch Plans from Jira (ALL in parallel)

For each ticket key, fetch the implementation plan comment:

```
getJiraIssue(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  issueIdOrKey=KEY,
  responseContentFormat="markdown",
  fields=["summary", "status", "comment", "description"]
)
```

Look for a comment whose body starts with `## Implementation Plan`. If no plan comment exists, stop and tell the user to run `/plan-pipeline` first.

---

## Step 3 — Dependency Analysis

Before spawning agents, determine if tickets have file-level dependencies:
- Do multiple tickets write to the same new file? → Run the one that creates it first, then others in parallel
- Do tickets touch completely separate files? → Run all in parallel

Common dependency: multiple tickets adding to a shared `restapis/attribution.ts` or similar. The first ticket creates it; subsequent tickets extend it.

**Execution order:**
- **Batch 1 (parallel):** All tickets with no upstream dependencies
- **Batch 2 (parallel):** All tickets that depend on Batch 1 output

---

## Step 4 — Branch Setup

Check current branch state:
```bash
cd /c/Projects/ReallyGlobal/RG-Frontend  # or Lumy-Backend
git branch --show-current
git status --short
```

If not already on the target branch:
```bash
git checkout main && git pull origin main
git checkout -b <branch-name>
```

Default branch naming: `RGDEV-NNN[-NNN]/short-description`

---

## Step 5 — Spawn Implementation Agents

For each batch, spawn agents in parallel using the Agent tool with `subagent_type: general-purpose`.

Each agent prompt must include:
1. **Repo path** and **branch** already checked out
2. **Full plan text** extracted from the Jira comment (paste it in — don't tell the agent to fetch it)
3. **Codebase reading instructions** — which existing files to read first for patterns
4. **File list** — exactly which files to create or modify
5. **TypeScript check** — `npx tsc --noEmit` after implementation, fix errors in new files only
6. **Commit instructions** — stage only the new/modified files, commit with `feat(RGDEV-NNN): description`
7. **Report back** — files created, type errors fixed, commit hash

---

## Step 6 — After All Agents Complete

```bash
# Pull Sonar results
/sonarcloud-pr-audit fe <pr-number>  # after pushing
```

Then create the PR:
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr create --title "feat(RGDEV-NNN,NNN): description" --body "..."
```

---

## Step 7 — Transition Jira Tickets

For each implemented ticket, get the "In Review" transition ID and apply it:

```
getTransitionsForJiraIssue(cloudId="92044829-3f40-4908-abaf-e65a65514b79", issueIdOrKey=KEY)
transitionJiraIssue(cloudId="92044829-3f40-4908-abaf-e65a65514b79", issueIdOrKey=KEY, transitionId=ID)
```

---

## Rules

- **Never re-plan.** If a plan exists, implement it. Don't question the plan unless it references a file that has since moved.
- **Read before writing.** Agent must read 2-3 existing files for patterns before touching the codebase.
- **Type errors in new files only.** Don't fix pre-existing type errors in unchanged files.
- **One commit per ticket.** Commit message: `feat(RGDEV-NNN): <ticket title in lowercase>`
- **No stubs.** Implement fully — no TODO comments, no placeholder returns.
- **Teal is `#469BA7`.** Match existing brand color usage.

---

## Constants

| Constant | Value |
|---|---|
| Backend path | `C:\Projects\ReallyGlobal\Lumy-Backend` |
| Frontend path | `C:\Projects\ReallyGlobal\RG-Frontend` |
| Jira Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
| Jira base URL | `https://reallyhq.atlassian.net/browse/` |
