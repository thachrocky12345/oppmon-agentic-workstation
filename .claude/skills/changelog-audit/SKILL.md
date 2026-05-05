---
name: changelog-audit
description: Generate a comprehensive changelog audit across all branches and contributors in both repos. Use when asked to "audit changes", "generate changelog", "what changed", or "branch inventory".
argument-hint: [since-date-or-commit]
---

# Changelog Audit

## Scope
Audit all 4 repo locations:
1. `C:\Projects\ReallyGlobal\Lumy-Backend` (primary)
2. `C:\Projects\ReallyGlobal\RG-Frontend` (primary)
3. `C:\Projects\ReallyGlobal-Infra\Lumy-Backend` (submodule)
4. `C:\Projects\ReallyGlobal-Infra\RG-Frontend` (submodule)

## Data to collect per repo

### Branch inventory
```bash
git branch -a --format='%(refname:short) %(objectname:short) %(creatordate:relative) %(subject)' | head -50
```

### Commit log (all branches)
```bash
git log --all --oneline --graph --since="<date>" | head -100
```

### Per-branch diff stats
```bash
git diff --stat origin/main..origin/<branch>
```

### Contributors
```bash
git log --all --format='%ae' --since="<date>" | sort -u
```

### Cross-repo sync status
Compare HEAD commits between Primary and Infra copies of each repo.

## Output format
Write to `Docs/CHANGELOG-AUDIT.md` organized by:

1. **Executive summary** — total commits, branches, contributors, date range
2. **Branch inventory** — each branch with commit count, last activity, status
3. **Changes by category**:
   - Infrastructure (Docker, CI, config)
   - Models & migrations
   - API (REST + GraphQL)
   - Seed data & fixtures
   - Frontend features
   - Bug fixes
   - Security
4. **Contributor activity** — commits per author
5. **Cross-repo sync status**
6. **Recommendations** — stale branches to clean up, unmerged work

## Parallelization
Launch 4 agents simultaneously (one per repo location) to gather git data, then merge results.
