---
name: dev-status
description: Show the current state of both repos (RG-Frontend and Lumy-Backend) — open PRs with review/merge status, branch ahead/behind main, dirty files, stashes, unpushed commits, Docker health, and Redis cache warmth. Use when asked for "dev status", "repo status", "PR status", "what needs review", "are my repos clean", or "what branch am I on".
argument-hint: [full|repos|docker|prs]
---

## Quick run

```bash
bash /c/Projects/ReallyGlobal/dev-status.sh
```

This covers everything below automatically. Only read further if you need to run a specific section manually or interpret the output.

# Dev Status Snapshot

Run all sections unless an argument narrows scope. Report findings with ✓ / ⚠ / ✗ indicators.

---

## 1. Repo Status — RG-Frontend

```bash
cd /c/Projects/ReallyGlobal/RG-Frontend
git fetch --quiet 2>/dev/null

BRANCH=$(git branch --show-current)
AHEAD_ORIGIN=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo "?")
BEHIND_ORIGIN=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "?")
AHEAD_MAIN=$(git rev-list --count "origin/main..HEAD" 2>/dev/null || echo "?")
BEHIND_MAIN=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo "?")
DIRTY=$(git status --short)
STASHES=$(git stash list)
UNPUSHED=$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null)

echo "Branch: $BRANCH"
echo "vs origin/$BRANCH: +$AHEAD_ORIGIN / -$BEHIND_ORIGIN"
echo "vs main: +$AHEAD_MAIN / -$BEHIND_MAIN"
echo "Dirty files: $(echo "$DIRTY" | grep -c . || echo 0)"
echo "$DIRTY"
echo "Stashes: $(echo "$STASHES" | grep -c . || echo 0)"
echo "$STASHES"
echo "Unpushed commits:"
echo "$UNPUSHED"
```

Flag if:
- `BEHIND_MAIN > 20` → ⚠ "Significantly behind main — consider rebasing"
- `DIRTY` non-empty → ⚠ list files
- `STASHES` non-empty → ⚠ list stashes
- `AHEAD_ORIGIN > 0` → ⚠ "Commits not pushed to origin"

---

## 2. Repo Status — Lumy-Backend

```bash
cd /c/Projects/ReallyGlobal/Lumy-Backend
git fetch --quiet 2>/dev/null

BRANCH=$(git branch --show-current)
AHEAD_ORIGIN=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo "?")
BEHIND_ORIGIN=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "?")
AHEAD_MAIN=$(git rev-list --count "origin/main..HEAD" 2>/dev/null || echo "?")
BEHIND_MAIN=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo "?")
DIRTY=$(git status --short)
STASHES=$(git stash list)
UNPUSHED=$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null)

echo "Branch: $BRANCH"
echo "vs origin/$BRANCH: +$AHEAD_ORIGIN / -$BEHIND_ORIGIN"
echo "vs main: +$AHEAD_MAIN / -$BEHIND_MAIN"
echo "Dirty files: $(echo "$DIRTY" | grep -c . || echo 0)"
echo "$DIRTY"
echo "Stashes: $(echo "$STASHES" | grep -c . || echo 0)"
echo "$STASHES"
echo "Unpushed commits:"
echo "$UNPUSHED"
```

Apply same flags as RG-Frontend.

---

## 3. Open PRs (both repos)

Requires `gh` CLI. Run for each repo:

```bash
# RG-Frontend
cd /c/Projects/ReallyGlobal/RG-Frontend
BRANCH=$(git branch --show-current)
gh pr list --head "$BRANCH" --json number,title,state,reviewDecision,url \
  --jq '.[] | "#\(.number) [\(.state)] \(.reviewDecision // "pending") — \(.title)\n  \(.url)"'

# Lumy-Backend
cd /c/Projects/ReallyGlobal/Lumy-Backend
BRANCH=$(git branch --show-current)
gh pr list --head "$BRANCH" --json number,title,state,reviewDecision,url \
  --jq '.[] | "#\(.number) [\(.state)] \(.reviewDecision // "pending") — \(.title)\n  \(.url)"'
```

If no PRs exist for the current branch, note it explicitly.

Also check for any open PRs requiring review (not just current branch):
```bash
gh pr list --json number,title,state,reviewDecision,headRefName,url \
  --jq '.[] | select(.reviewDecision == "REVIEW_REQUIRED") | "#\(.number) [\(.headRefName)] — \(.title)\n  \(.url)"'
```

---

## 4. Docker Stack Health

```bash
CONTAINERS=(reallyglobal-frontend-1 reallyglobal-backend-1 reallyglobal-db-1 reallyglobal-redis-1 reallyglobal-rqworker-1)
for c in "${CONTAINERS[@]}"; do
  STATE=$(docker inspect --format='{{.State.Status}}' "$c" 2>/dev/null)
  if [ "$STATE" = "running" ]; then
    echo "✓ $c"
  elif [ -z "$STATE" ]; then
    echo "✗ $c — not found"
  else
    echo "✗ $c — $STATE"
  fi
done
```

---

## 5. Redis Cache Warmth

```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py shell -c \
  "from django.core.cache import cache; d=cache.get('providers:full'); print(len(d) if d else 0)"
```

- `> 0` → ✓ "providers:full — N providers cached"
- `0` → ⚠ "providers:full — COLD (first landing page load will warm it automatically)"

---

## Output Format

Present as a structured report:

```
── RG-Frontend ─────────────────────────────────
  Branch:  docker-dev-v2
  Origin:  ✓ up to date
  vs main: +12 / -0
  Tree:    ✓ clean
  Stashes: ✗ 1 stash — stash@{0}: WIP on ...
  PRs:     #42 [OPEN] pending — Add working hours feature
           https://github.com/...

── Lumy-Backend ────────────────────────────────
  Branch:  RGDEV-13
  Origin:  ⚠ 4 commits not pushed
  vs main: +4 / -0
  Tree:    ⚠ 2 uncommitted files
  Stashes: ✓ none
  PRs:     none for this branch

── Docker Stack ────────────────────────────────
  ✓ reallyglobal-frontend-1
  ✓ reallyglobal-backend-1
  ✓ reallyglobal-db-1
  ✓ reallyglobal-redis-1
  ✓ reallyglobal-rqworker-1
  Cache:   ✓ providers:full — 47 providers

── Quick Actions ───────────────────────────────
  Warm cache:    docker exec reallyglobal-backend-1 python manage.py shell -c "from apps.manage_pages.tasks import refresh_provider_caches; refresh_provider_caches()"
  Restart stack: cd /c/Projects/ReallyGlobal && docker compose down && docker compose up -d
  Full status:   bash /c/Projects/ReallyGlobal/dev-status.sh
```

---

## Notes

- **Stash warning is critical** — stashes are often forgotten critical fixes (e.g. the `FILTER_BASED_ON_AVAILABILITY` fix stashed on `docker-dev-v2`)
- **`BEHIND_MAIN > 20`** usually means a long-running feature branch that will have painful merge conflicts
- **Cache COLD after restart** is expected — the resolver now self-heals on first request, but it takes ~5-10s
- **No PRs for current branch** is expected during active development; flag if a branch has been open >2 days without a PR
- Always run `MSYS_NO_PATHCONV=1` prefix for docker exec on Windows (Git Bash mangles paths otherwise)
