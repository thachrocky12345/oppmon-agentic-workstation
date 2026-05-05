---
name: build-check
description: Check GitHub Actions build status after a push. Shows all CI checks, waits for pending runs, surfaces failed step logs, and reports pass/fail. Use when asked to "check build", "did the build pass", "CI status", "check checks", or automatically after any git push.
argument-hint: [repo] [pr-number-or-branch] [--wait | --now]
---

# Build Check — GitHub Actions CI Status

## MANDATORY: Auto-Run After Every Push

After any `git push`, run this skill **automatically** without being asked:

1. Fetch the current check status for the pushed branch/PR
2. If any checks are still running, wait and poll until they complete (or timeout)
3. Report pass/fail for every check
4. If any check failed: show the failing step name + last 50 lines of log
5. If TypeScript or lint checks failed: diagnose and fix

Do NOT wait for the user to ask. This pairs with `sonarcloud-pr-audit` — run both after every push.

---

## Step 1 — Parse Arguments

```
/build-check [repo] [pr-number-or-branch] [--wait | --now]
```

| Argument | Values | Default |
|---|---|---|
| `repo` | `be`, `backend` → Lumy-Backend · `fe`, `frontend` → RG-Frontend | Infer from CWD |
| `pr-number-or-branch` | PR number or branch name | Infer from current branch |
| `--wait` | Poll until all checks complete (default) | Default |
| `--now` | Report current state immediately, no polling | Only when user specifies |

**Infer repo from CWD:**
- Path contains `Lumy-Backend` → `reallyhq/Lumy-Backend`
- Path contains `RG-Frontend` → `reallyhq/RG-Frontend`

**Infer PR from current branch:**
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr view --json number,headRefName,baseRefName \
  --jq '"PR #\(.number): \(.headRefName) → \(.baseRefName)"'
```

---

## Step 2 — Fetch Check Status

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr checks {PR} -R reallyhq/{REPO}
```

Parse output into this table:

| Check | Status | Duration | URL |
|---|---|---|---|
| SonarCloud Code Analysis | pass | 39s | https://sonarcloud.io |
| build | fail | 1m12s | https://github.com/... |
| typecheck | pending | — | — |

**Status values:** `pass` ✅ · `fail` ❌ · `pending` ⏳ · `skipped` ⊘

---

## Step 3 — Poll Until Complete (--wait mode)

If any check is `pending`:

```bash
# Poll every 20 seconds, max 15 retries (5 minutes total)
for i in $(seq 1 15); do
  export PATH="/c/Program Files/GitHub CLI:$PATH"
  STATUS=$(gh pr checks {PR} -R reallyhq/{REPO})
  # Check if any "pending" remains
  echo "$STATUS" | grep -q "pending" || break
  sleep 20
done
```

After 5 minutes: report whatever state exists and note which checks are still pending.

---

## Step 4 — Get Failed Run Logs

For each ❌ failed check:

### 4a. Find the run ID
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh run list -R reallyhq/{REPO} --branch {BRANCH} --limit 5 \
  --json databaseId,name,status,conclusion,createdAt \
  --jq '.[] | "\(.databaseId) \(.name) \(.status) \(.conclusion)"'
```

### 4b. Get failing step summary
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh run view {RUN_ID} -R reallyhq/{REPO}
```

### 4c. Get log for each failed job step
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh run view {RUN_ID} -R reallyhq/{REPO} --log-failed 2>&1
```

Extract the last 60 lines of each failed step's output. Look for:
- Error messages (lines with `error`, `Error`, `ERROR`, `✗`, `FAIL`)
- File:line references
- Stack traces

---

## Step 5 — Diagnose Failures

Map failing check names to common causes:

| Check name | Common failures | Where to look |
|---|---|---|
| `typecheck` / `check-types` | New TS errors in changed files | Run `yarn check-types` locally |
| `lint` / `eslint` | ESLint rule violations | Run `yarn lint` locally |
| `build` | Import errors, missing modules, TS compile errors | Full build log |
| `test` | Failing unit/integration tests | Test output in log |
| `SonarCloud` | Quality gate conditions | See `sonarcloud-pr-audit` skill |
| `ci` / `django-tests` | Python test failures, missing migrations | `python manage.py test` output |
| `migrate-check` | Missing migration file | Run `makemigrations --check` |

### Frontend (RG-Frontend) — common root causes
- **TS7006 "implicitly has any type"**: missing type annotation on callback param
- **TS2786 "cannot be used as JSX component"**: third-party icon library type mismatch — add `as any` cast
- **TS2322 type mismatch**: wrong prop type — read the component interface
- **Module not found**: new file not created, or wrong relative path
- **ESLint `react-hooks/exhaustive-deps`**: missing dep in `useEffect`/`useCallback`

### Backend (Lumy-Backend) — common root causes
- **ImportError**: missing `from x import y` at top of file
- **MigrationError**: model changed without `makemigrations`
- **AttributeError in tests**: wrong field/method name
- **AssertionError**: test expectation changed with new code

---

## Step 6 — Fix Failures

If the failure is in a file touched by the current PR, fix it:

1. Read the file at the reported line
2. Apply the minimal fix based on the error message
3. Run the check locally to confirm fix:
   - Frontend typecheck: `yarn check-types` (in Docker or local)
   - Frontend lint: `yarn lint`
   - Backend tests: `python manage.py test apps.{app}` (via Docker exec)
4. Commit:
   ```bash
   git add {changed files}
   git commit -m "fix(ci): resolve {check-name} failure — {brief description}"
   ```
5. Push:
   ```bash
   git push
   ```
6. After push: re-run **this skill** automatically to confirm the fix landed.

**Do NOT fix failures in files outside the current PR's changed files** — those are pre-existing and not your responsibility.

---

## Step 7 — Report

```
## Build Check — PR #{PR} ({REPO}) @ {BRANCH}

| Check | Status | Duration |
|---|---|---|
| typecheck | ✅ pass | 45s |
| lint | ✅ pass | 12s |
| build | ❌ FAIL | 1m20s |
| SonarCloud | ✅ pass | 39s |

### ❌ Failed: build

**Step:** `Run yarn build`
**Error:**
```
src/containers/booking-link/BookingLinkPanel.tsx:41:45 - error TS7006: Parameter 'action' implicitly has an 'any' type.
```

**Action taken:** Fixed and pushed in commit abc1234.

---

**Overall: ❌ 1 of 4 checks failed. Fix pushed — re-running.**
```

If all pass:
```
## Build Check — PR #{PR} ({REPO}) @ {BRANCH}

✅ All N checks passed.
```

---

## Timing Guidelines

| Scenario | What to do |
|---|---|
| Push just completed | Wait 10s, then fetch checks |
| All checks pending | Poll every 20s up to 5 min |
| Mix of pass + pending | Keep polling until no pending |
| All complete | Report immediately |
| Timeout (5 min) | Report current state + note which are still running |
| All pass + SonarCloud pending | Trigger `sonarcloud-pr-audit` to handle Sonar separately |

---

## Constants

| Constant | Value |
|---|---|
| Backend repo | `reallyhq/Lumy-Backend` |
| Frontend repo | `reallyhq/RG-Frontend` |
| GitHub CLI path | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |
| Backend path | `C:\Projects\ReallyGlobal\Lumy-Backend` |
| Frontend path | `C:\Projects\ReallyGlobal\RG-Frontend` |
| Docker backend exec | `MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py` |
| Max poll wait | 5 minutes (15 × 20s) |
