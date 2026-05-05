---
name: branch-merge
description: Merge feature branches into a target branch with conflict resolution. Use when asked to "merge branch", "consolidate branches", "cherry-pick", or "integrate feature".
argument-hint: [source-branch] [into target-branch]
---

# Branch Merge Workflow

## Pre-merge checklist
1. Ensure target branch is clean: `git status`
2. Ensure target branch is up to date: `git pull origin <target>`
3. Review what the source branch brings: `git log --oneline origin/<source> --not origin/<target> | head -20`
4. Check for potential conflicts: `git diff origin/<target>...origin/<source> --stat`

## Merge strategies

### Full merge (preferred for feature branches)
```bash
git checkout <target>
git merge origin/<source> --no-ff -m "Merge origin/<source>: <description>"
```

### Cherry-pick (for individual commits from a branch)
```bash
git checkout <target>
git cherry-pick <commit-hash> --no-commit  # stage without committing
# Review changes, then:
git commit -m "Cherry-pick <source>: <description>"
```

### Squash merge (flatten branch history)
```bash
git checkout <target>
git merge --squash origin/<source>
git commit -m "Merge origin/<source>: <description>"
```

## Conflict resolution patterns

### RTK builder pattern (commonSlice, userSlice, etc.)
Old `extraReducers` map syntax may conflict with new builder pattern:
```javascript
// OLD (may exist in source branch):
extraReducers: { [thunk.pending.type]: handler }
// NEW (target branch pattern):
extraReducers: (builder) => { builder.addCase(thunk.pending, handler) }
```
Always convert to builder pattern. Watch for undefined thunks — they crash with `addCase`.

### Import conflicts
Take the union of all imports from both sides. Remove duplicates.

### Package.json / yarn.lock
After merge: `yarn install` to regenerate lockfile. Don't try to manually merge lockfiles.

## Post-merge checklist
1. `git log --oneline -5` — verify merge commit looks right
2. Build check: `yarn build` (frontend) or `dotnet build` / `python manage.py check` (backend)
3. Check for duplicate code that both branches may have added independently
4. Update `Docs/MERGE-HISTORY.md` if maintaining merge documentation

## Recording merge history
If maintaining a merge log (see `Docs/MERGE-HISTORY.md`):
```markdown
### [branch-name] → [target] (YYYY-MM-DD)
**What it brought**: feature X, fix Y, component Z
**Conflicts**: file1.ts (took theirs), file2.ts (manual merge)
**Post-merge fixes**: added missing import, fixed type error
```
