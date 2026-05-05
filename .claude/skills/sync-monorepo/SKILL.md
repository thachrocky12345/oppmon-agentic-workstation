# Sync Monorepo — Pull latest main from legacy repos into reallyhq/ReallyGlobal

Pulls the latest commits from `reallyhq/Lumy-Backend` and `reallyhq/RG-Frontend`
into the monorepo under `backend/` and `frontend/` respectively. Run this after
open PRs have merged into the legacy repos' main branches.

---

## When to run

- After a batch of PRs merge into the old repos
- Before starting new feature work in the monorepo
- As a one-time catch-up after the initial migration

---

## Step 1 — Parse Arguments

```
/sync-monorepo [--be | --fe | --both]
```

| Argument | Action |
|---|---|
| `--be` | Sync backend only |
| `--fe` | Sync frontend only |
| `--both` (default) | Sync both |

---

## Step 2 — Check monorepo state

```bash
cd /c/Projects/ReallyGlobal-Mono
git status --short
git branch --show-current
```

Must be on `main` with a clean working tree before syncing. If dirty, stop and report.

---

## Step 3 — Fetch latest main from legacy repos

Work entirely in `/tmp/` — never rewrite history on live working trees.

```bash
# Clean up any prior sync artifacts
rm -rf /tmp/sync-be /tmp/sync-fe

# Clone legacy repos (main only, shallow is fine for the delta)
git clone https://github.com/reallyhq/Lumy-Backend /tmp/sync-be
git clone https://github.com/reallyhq/RG-Frontend /tmp/sync-fe

# Rewrite histories into subdirectories
cd /tmp/sync-be && git filter-repo --to-subdirectory-filter backend/ --force
cd /tmp/sync-fe && git filter-repo --to-subdirectory-filter frontend/ --force
```

---

## Step 4 — Merge into monorepo

```bash
cd /c/Projects/ReallyGlobal-Mono

# Add temp remotes
git remote add sync-be /tmp/sync-be 2>/dev/null || git remote set-url sync-be /tmp/sync-be
git remote add sync-fe /tmp/sync-fe 2>/dev/null || git remote set-url sync-fe /tmp/sync-fe

git fetch sync-be
git fetch sync-fe
```

### For backend sync:
```bash
git merge sync-be/main --allow-unrelated-histories -m "chore: sync backend/ from reallyhq/Lumy-Backend main ($(date +%Y-%m-%d))"
```

### For frontend sync:
```bash
git merge sync-fe/main --allow-unrelated-histories -m "chore: sync frontend/ from reallyhq/RG-Frontend main ($(date +%Y-%m-%d))"
```

---

## Step 5 — Handle merge conflicts

Because `git filter-repo` rewrites commit SHAs, git treats every sync as
unrelated histories. Conflicts should be rare (only if monorepo-native commits
touched the same files as legacy repo commits).

If conflicts occur:
- Files under `backend/` → accept the `sync-be` version unless monorepo has intentional changes
- Files under `frontend/` → accept the `sync-fe` version unless monorepo has intentional changes
- `docker-compose.yml`, `CLAUDE.md`, `ContextFiles2/`, `Docs/`, `.claude/` at root → always keep monorepo version (ours)

```bash
# Accept all incoming changes for a subdirectory
git checkout --theirs backend/ && git add backend/
git checkout --theirs frontend/ && git add frontend/

# Keep our root files
git checkout --ours docker-compose.yml CLAUDE.md && git add docker-compose.yml CLAUDE.md

git commit -m "chore: sync monorepo from legacy repos ($(date +%Y-%m-%d)) — resolved conflicts"
```

---

## Step 6 — Clean up and push

```bash
cd /c/Projects/ReallyGlobal-Mono

# Remove temp remotes
git remote remove sync-be
git remote remove sync-fe

# Push to GitHub
export PATH="/c/Program Files/GitHub CLI:$PATH"
git push origin main
```

---

## Step 7 — Verify

```bash
cd /c/Projects/ReallyGlobal-Mono

# Confirm latest BE commit is present
echo "=== Latest backend commits ===" && git log --oneline -- backend/ | head -5

# Confirm latest FE commit is present
echo "=== Latest frontend commits ===" && git log --oneline -- frontend/ | head -5

# Confirm root files intact
ls docker-compose.yml CLAUDE.md ContextFiles2/ Docs/ .claude/
```

Cross-check: the top commit hash in `backend/` should match the latest merge commit on `reallyhq/Lumy-Backend main`.

---

## Step 8 — Report back

```
## Monorepo Sync — YYYY-MM-DD

**Backend synced:** yes/no — N new commits merged
**Frontend synced:** yes/no — N new commits merged
**Conflicts:** none / list of files
**Monorepo HEAD:** <commit hash>
**Push:** ✅ origin/main updated
```

---

## Rules

- **Always work on `/tmp/` clones** — never run `git filter-repo` on the live monorepo or the live legacy checkouts
- **Root files are sacred** — `docker-compose.yml`, `CLAUDE.md`, `ContextFiles2/`, `Docs/`, `.claude/` always keep the monorepo version on conflict
- **Sync is one-way** — legacy repos → monorepo only. Never push monorepo changes back to the legacy repos.
- **Run from `main`** — always sync into main, never a feature branch

---

## Constants

| Constant | Value |
|---|---|
| Monorepo local path | `C:\Projects\ReallyGlobal-Mono\` |
| Monorepo GitHub | `https://github.com/reallyhq/ReallyGlobal` |
| Legacy BE | `https://github.com/reallyhq/Lumy-Backend` |
| Legacy FE | `https://github.com/reallyhq/RG-Frontend` |
| GitHub CLI path | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |
