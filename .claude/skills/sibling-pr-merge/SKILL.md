---
name: sibling-pr-merge
description: Merge sibling branches (multiple PRs targeting the same base) into a single local integration branch and open one consolidated PR. Use when multiple feature branches are parallel children of the same parent and need to be reviewed/merged together.
argument-hint: [base-branch] [ticket-branch-1] [ticket-branch-2] ...
---

# Sibling PR Merge

Consolidates N sibling branches into one local `<topic>-master` branch with merge commits, opens a single PR, and closes the individual PRs.

**When to use**: Multiple tickets (e.g. RGDEV-183, 184, 185, 186) have their own PRs all targeting the same base branch. Rather than reviewing and merging each one sequentially, create one consolidated branch that shows the full integrated diff.

---

## Step 1 — Parse arguments

From the invocation, extract:
- **Base branch**: the branch all siblings target (e.g. `RGDEV-205/checkout-flow-final`)
- **Sibling branches**: the list of branches to merge in (e.g. `RGDEV-183/attribution-window`, `RGDEV-184/dynamic-fee-calculation`, ...)
- **Topic name**: a short slug for the integration branch (e.g. `attribution`, `payments`, `onboarding`)
- **Individual PR numbers**: find them with `gh pr list --json number,headRefName`

If arguments are ambiguous, infer from context: look at open PRs targeting the base branch.

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
cd /c/Projects/ReallyGlobal/Lumy-Backend

# List open PRs to find siblings
gh pr list --json number,title,headRefName,baseRefName \
  --jq '.[] | select(.baseRefName == "<base-branch>") | "\(.number) [\(.headRefName)] \(.title)"'
```

---

## Step 2 — Determine merge order

Sibling branches that share files will conflict. Order matters:

1. **Read each branch's changed files**: `git diff --name-only <base>..<branch>`
2. **Identify dependency order**: if branch A adds a function that branch B calls, A goes first
3. **Default order**: ticket number ascending (183 → 184 → 185 → 186)

---

## Step 3 — Create the integration branch

```bash
cd /c/Projects/ReallyGlobal/Lumy-Backend
git checkout <base-branch>
git checkout -b <topic>-master
```

---

## Step 4 — Merge siblings in order

For each branch:

```bash
git merge --no-ff <branch> -m "Merge <branch> into <topic>-master"
```

If there are conflicts, resolve them following these rules:

### Conflict resolution rules

| Situation | Resolution |
|---|---|
| Same function edited by two branches — one adds more checks | **Keep the superset** (more complete version with all checks) |
| Same function edited by two branches — one adds error handling | Keep the version with error handling |
| Both branches add the same function with different implementations | Keep the earlier branch's version if it handles more edge cases; otherwise take the later |
| **Add/add conflict on the same new file (both created it)** | **Merge the content**: keep all unique classes/functions from both sides; deduplicate imports; do not discard either side |
| Same URL route added by both branches | Keep one — they are identical |
| One branch adds a field to a `model.create()` call | Keep HEAD's structure; add the new field kwarg from the incoming branch |
| **DB write with `try/except IntegrityError`** | **Keep the IntegrityError-safe version** — it handles concurrent-create race conditions that the simpler version silently loses |
| One branch catches `IntegrityError`, other doesn't, on the same block | Always keep the `except IntegrityError` handler; it is never wrong to have it |

Always verify: `grep -rn "<<<<<<\|=======\|>>>>>>" <conflicted-files>` returns empty after resolution.

After resolving, commit:
```bash
git add <resolved-files>
git commit -m "Merge <branch> into <topic>-master (resolve conflicts: <brief description>)"
```

---

## Step 5 — Verify the integration branch

```bash
# Check commit history looks right
git log --oneline <base-branch>..<topic>-master

# Basic syntax check (Django projects)
python -m py_compile <key-changed-files> 2>&1

# Check for leftover conflict markers
git diff HEAD | grep -c "^+.*<<<<<<" || echo "clean"
```

---

## Step 6 — Push and open consolidated PR

```bash
git push origin <topic>-master

export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr create \
  --base <base-branch> \
  --head <topic>-master \
  --title "<Topic> engine — <ticket list> merged" \
  --body "$(cat <<'EOF'
## Summary

Consolidated merge of <tickets> on top of `<base-branch>`. Replaces individual PRs <#list> which are being closed in favour of this one.

---

## What's in here

### <TICKET-N> — <Title>
- Key change 1
- Key change 2

### <TICKET-M> — <Title>
- Key change 1

## Migrations
- List any new migration files

## Test plan
- [ ] Run relevant test suites
- [ ] Manual QA steps

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Step 7 — Close individual PRs

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
for pr in <pr-numbers>; do
  gh pr close $pr --comment "Superseded by consolidated PR #<new-pr-number>"
done
```

---

## Step 8 — Report

Output a summary table:

```
| Branch | Commits | Conflicts resolved | Status |
|--------|---------|-------------------|--------|
| RGDEV-183/... | 2 | none | ✅ merged |
| RGDEV-184/... | 1 | utils.py (kept HEAD) | ✅ merged |
| ...
```

Consolidated PR: #<number> — <URL>
Individual PRs closed: #N, #M, #P, #Q

---

## Repo Details

| Repo | Path |
|---|---|
| Backend | `C:\Projects\ReallyGlobal\Lumy-Backend` |
| Frontend | `C:\Projects\ReallyGlobal\RG-Frontend` |
| GitHub CLI | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |
