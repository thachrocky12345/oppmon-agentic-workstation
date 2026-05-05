# Blame — Trace a Bug to Its Introducing Commit and File a Jira Ticket

Given a file and a broken symbol/variable, finds the commit that removed or broke it,
creates a Jira bug linked to the introducing ticket, assigns it, and optionally fixes it.

---

## Usage

```
/blame <file-path> <symbol> [--fix] [--assignee <display-name>]
```

| Argument | Description |
|---|---|
| `file-path` | Repo-relative path to the file with the bug |
| `symbol` | Variable, function, or pattern that is broken/missing |
| `--fix` | Apply the fix after filing the ticket |
| `--assignee` | Jira display name to assign bug to (default: jeremy) |

---

## Step 1 — Find the introducing commit

```bash
# Who last touched the symbol in this file
cd /c/Projects/ReallyGlobal-Mono
git log --oneline -- <file-path> | head -10

# What each recent commit changed re: the symbol
git log --oneline -10 -- <file-path> | while read hash msg; do
  echo "=== $hash $msg ==="
  git show $hash -- <file-path> | grep "^[+-].*<symbol>" | head -5
done
```

Identify the commit that **removed or broke** the symbol.

---

## Step 2 — Find the Jira ticket for that commit

Check the commit message for a ticket key (`RGDEV-NNN`) or PR number (`#NNN`).

If a PR number is found:
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr view <PR-number> --json title,body,headRefName | jq '{title, branch: .headRefName, body: .body[:300]}'
```

If a Jira key is found directly in the commit message, use it. Otherwise search Jira:
```
searchJiraIssuesUsingJql(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  jql='project = RGDEV AND text ~ "<branch-name or PR title keywords>" ORDER BY created DESC',
  fields=["summary", "status", "assignee"],
  maxResults=5
)
```

---

## Step 3 — Look up assignee account ID

```
lookupJiraAccountId(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  displayName="<assignee>"
)
```

Default assignee account ID for jeremy: `712020:7c6e42f7-f69f-4c14-8db9-c6ea66a05d97`

---

## Step 4 — Create the Jira bug

```
createJiraIssue(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  projectKey="RGDEV",
  issueTypeName="Bug",
  summary="[Bug] <one-line description>",
  description="<what broke, what file, what symbol, what the fix is>",
  assignee_account_id="<account ID from Step 3>"
)
```

Bug description template:
```markdown
**Introduced by:** <commit hash> — <commit message> (PR #NNN / RGDEV-NNN)
**File:** `<file-path>`
**Symbol:** `<symbol>`

**What broke:**
<explain what was removed and why it causes the error>

**Fix:**
<exact code change needed>

**Repro:**
<steps to reproduce — URL, action, error message>
```

---

## Step 5 — Link bug to introducing ticket

```
getIssueLinkTypes(cloudId="92044829-3f40-4908-abaf-e65a65514b79")
```

Use link type "caused by" or "relates to" (whichever exists).

```
createIssueLink(
  cloudId="92044829-3f40-4908-abaf-e65a65514b79",
  inwardIssueKey="<new bug key>",
  outwardIssueKey="<introducing ticket key>",
  linkTypeName="caused by"  // or "relates to"
)
```

---

## Step 6 — Fix (if --fix)

Apply the minimal correct fix to the file. Follow these rules:
- Fix only what broke — do not refactor surrounding code
- If the fix is "restore a removed symbol", restore it to the exact destructure/declaration it was removed from
- Commit: `fix(RGDEV-NNN): restore <symbol> removed in <introducing-commit>`
- Push and run `/sonarcloud-pr-audit` if on a PR branch

---

## Step 7 — Report

```
## Blame Report — <file>:<symbol>

**Introducing commit:** <hash> — <message>
**Introduced by PR:** #NNN
**Jira ticket that introduced it:** RGDEV-NNN
**Bug filed:** RGDEV-NNN (assigned to <assignee>)
**Linked:** RGDEV-NNN (new bug) → caused by → RGDEV-NNN (introducing ticket)
**Fix applied:** yes/no — <description of change>
```

---

## Constants

| Constant | Value |
|---|---|
| Jira Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
| Default assignee | jeremy (`712020:7c6e42f7-f69f-4c14-8db9-c6ea66a05d97`) |
| Monorepo path | `C:\Projects\ReallyGlobal-Mono\` |
| GitHub CLI | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |
