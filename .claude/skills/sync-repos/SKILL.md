---
name: sync-repos
description: Synchronize the two checkout locations of each repo (ReallyGlobal vs ReallyGlobal-Infra). Use when asked to "sync repos", "pull infra changes", or "sync checkouts".
argument-hint: [be|fe|both|check]
---

# Sync Repo Checkouts

## Context
Two separate git working trees exist for each repo:

| Repo | Primary (Docker) | Infra (submodule) |
|---|---|---|
| Backend | `C:\Projects\ReallyGlobal\Lumy-Backend` | `C:\Projects\ReallyGlobal-Infra\Lumy-Backend` |
| Frontend | `C:\Projects\ReallyGlobal\RG-Frontend` | `C:\Projects\ReallyGlobal-Infra\RG-Frontend` |

**These are DIFFERENT git working trees** on the same remote/branch. Commits in one do NOT appear in the other until fetched.

## Check sync status
```bash
# Backend
cd /c/Projects/ReallyGlobal/Lumy-Backend
git log --oneline -1
cd /c/Projects/ReallyGlobal-Infra/Lumy-Backend
git log --oneline -1
# Compare the HEADs

# Frontend
cd /c/Projects/ReallyGlobal/RG-Frontend
git log --oneline -1
cd /c/Projects/ReallyGlobal-Infra/RG-Frontend
git log --oneline -1
```

## Sync: Infra → Primary (most common)
After committing in the Infra copy, sync to the primary (Docker) copy:

```bash
# Backend
cd /c/Projects/ReallyGlobal/Lumy-Backend
git fetch /c/Projects/ReallyGlobal-Infra/Lumy-Backend docker-dev-v2
git merge FETCH_HEAD --ff-only

# Frontend
cd /c/Projects/ReallyGlobal/RG-Frontend
git fetch /c/Projects/ReallyGlobal-Infra/RG-Frontend docker-dev-v2
git merge FETCH_HEAD --ff-only
```

## Sync: Primary → Infra
```bash
# Backend
cd /c/Projects/ReallyGlobal-Infra/Lumy-Backend
git fetch /c/Projects/ReallyGlobal/Lumy-Backend docker-dev-v2
git merge FETCH_HEAD --ff-only

# Frontend
cd /c/Projects/ReallyGlobal-Infra/RG-Frontend
git fetch /c/Projects/ReallyGlobal/RG-Frontend docker-dev-v2
git merge FETCH_HEAD --ff-only
```

## Rules
- Always use `--ff-only` to avoid accidental merge commits
- If ff-only fails, the copies have diverged — investigate before forcing
- The primary copy under `C:\Projects\ReallyGlobal\` is what docker-compose uses
- The Infra copy is a git submodule — after syncing, also commit the submodule pointer in the parent Infra repo
