# QA PR — Playwright Functional QA for Pull Requests

## Purpose

Verify a PR's UX changes work correctly before approving. Not a visual diff — a
functional QA pass: read what changed, write targeted Playwright tests for those
flows, run them against the branch in Docker, approve + merge on green.

---

## Invocation

```
/qa-pr [repo] [pr-number]
```

| Arg | Values |
|---|---|
| `repo` | `fe`/`frontend`/`RG-Frontend` or `be`/`backend`/`Lumy-Backend` |
| `pr-number` | Integer |

If repo omitted, infer from CWD. If PR omitted, infer from current branch.

---

## SECURITY RULES — NON-NEGOTIABLE

These rules apply to every spec file written by this skill. Violating any of them
is a blocker. Do not ship a spec that breaks these.

### Never log sensitive material to CI output

**Auth tokens / credentials:**
- Never print, log, or include in assertion messages: JWT tokens, Bearer tokens,
  access tokens, refresh tokens, session cookies, API keys, or any substring thereof
- Never log the value of `localStorage`, `sessionStorage`, or `document.cookie`
- Never assert on the content of an auth header or Authorization field

**PII / PHI:**
- This is a healthcare platform. Authenticated page content may contain protected
  health information (PHI) or personally identifiable information (PII).
- Never dump `page.textContent('body')` or `page.content()` into logs, assertion
  messages, or console output from authenticated routes
- Never log appointment details, provider notes, client profiles, payment records,
  or any user-generated content from behind auth
- When an assertion fails on an authenticated page, log only: the URL, a
  non-sensitive selector name, or a boolean (visible/not visible). Never the content.

**What IS safe to log:**
- URLs and route paths
- Element selectors and role/label text from static UI copy
- Counts (e.g. "expected 3 cards, got 0")
- Boolean presence checks ("expected dialog to be visible: false")

### Auth must be verified before the test proceeds

After calling `login()`, the test must assert a concrete post-auth signal before
continuing. "URL is not /en/login" or "body is non-empty" are not sufficient —
both can be true while the user is still anonymous.

**Acceptable auth signals:**
```ts
// Option A: a route that only exists for authenticated users
await page.waitForURL(/\/(en\/)?dashboard|client-calendar|provider-portal/, { timeout: 15000 });

// Option B: an element that is only rendered for authenticated users
await expect(page.locator('[data-testid="user-menu"]')).toBeVisible({ timeout: 10000 });

// Option C: absence of the login trigger (it disappears post-auth)
await expect(page.locator('[data-testid="login-trigger"]')).not.toBeVisible({ timeout: 10000 });
```

Never use:
```ts
// NOT ACCEPTABLE — passes while anonymous
expect(page.url()).not.toContain('/login');
expect(body).not.toBe('');
```

### Credentials must come from environment variables

Never hardcode email/password values in spec files. Always read from env:

```ts
import { USERS } from '../fixtures/test-accounts';
// USERS.client.email, USERS.client.password — from process.env.E2E_CLIENT_*
// USERS.provider.email, USERS.provider.password — from process.env.E2E_PROVIDER_*
```

Local dev: set values in `.env.e2e.local` (gitignored). CI: set as secrets.
If the env var is absent, the test fails with an auth error — that is correct behaviour.

### Generated artifacts must not be committed

Never commit these to the repo:
- `e2e/report/` — Playwright HTML reports
- `e2e/screenshots/` — captured screenshots
- `playwright-report/` — default Playwright output dir
- `.env.e2e.local` — local credentials

All of the above are gitignored. If git status shows them as untracked, stop and
check `.gitignore` before committing anything.

---

## Step 1 — Read the PR

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
# Get title, body, changed files
gh pr view {PR} -R reallyhq/{REPO} --json title,body,headRefName,files \
  --jq '{title: .title, branch: .headRefName, files: [.files[].path]}'

# Get the diff for changed source files only (exclude migrations, fixtures, tests)
MSYS_NO_PATHCONV=1 gh api repos/reallyhq/{REPO}/pulls/{PR}/files \
  --jq '.[] | select(.filename | test("migration|fixture|__pycache__|.min.js") | not) | .filename'
```

Read the 5–10 most significant changed files to understand:
- Which **pages / routes** are affected
- Which **user-facing flows** changed (auth, booking, search, profile, payments…)
- Which **components** were modified
- Whether the change is additive (new feature) or corrective (bug fix)

---

## Step 2 — Identify QA scenarios

Based on the diff, derive 3–8 targeted test scenarios. Each scenario must:
- Exercise a **specific user action** in the affected flow
- Assert a **concrete observable outcome** (element visible, URL, text, no error toast)
- Be runnable against `http://localhost:3000` (FE) or `http://localhost:8000` (BE)

Examples:
| Change | Scenario |
|---|---|
| New booking flow step | Complete booking wizard to payment screen |
| Attribution discount toggle | Toggle discount on, confirm modal appears once only |
| Console error fix | Navigate to page, assert no console errors |
| Mega-menu | Open mega menu, click a category, assert navigation |
| Auth flow | Log in as client, assert dashboard element visible |

For **BE-only PRs** (no FE changes): write API health scenarios using `curl` or
Playwright's `request` fixture hitting `localhost:8000`. Skip visual assertions.
For BE specs: never print response bodies from authenticated endpoints — check
status codes and non-sensitive field names only.

---

## Step 3 — Spin up the branch in Docker

```bash
# Check out branch
cd /c/Projects/ReallyGlobal/RG-Frontend   # or Lumy-Backend
git fetch origin
git checkout {branch}

# Start stack (rebuild if branch has package changes)
cd /c/Projects/ReallyGlobal
docker compose up -d --build

# Wait for services
sleep 20
curl -sf http://localhost:3000 > /dev/null && echo "FE up" || echo "FE not ready"
curl -sf http://localhost:8000/api/v1/health/ && echo "BE up" || echo "BE not ready"
```

If stack won't start: check `docker logs reallyglobal-backend-1 --tail 30` and
`docker logs reallyglobal-frontend-1 --tail 30`. Fix or document blocker.

---

## Step 4 — Write the Playwright tests

Create a spec file at:
```
RG-Frontend/e2e/qa-pr/pr-{PR}-{slug}.spec.ts
```

Rules:
- Import credentials from `e2e/fixtures/test-accounts.ts` (env vars only — see Security Rules)
- Use `data-testid` selectors where available; fall back to `getByRole` / `getByText`
- Each test must be self-contained (own login / setup)
- Tag every test: `test('description @qa-pr-{PR}', async ...)`
- No `page.waitForTimeout()` — use `waitForSelector` / `waitForURL` / `expect().toBeVisible()`
- After `login()`, assert a concrete auth signal before proceeding (see Security Rules)
- Never dump body content or response payloads from authenticated routes into logs

```ts
import { test, expect } from '@playwright/test';
import { login, USERS } from '../helpers';

test.describe('PR #{PR} — {feature name} @qa-pr-{PR}', () => {
  test('authenticated user sees dashboard after login', async ({ page }) => {
    await login(page, USERS.client.email, USERS.client.password);

    // Verify auth succeeded with a concrete signal — not just "URL is not /login"
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible({ timeout: 10000 });

    // Now test the actual feature
    await page.goto('/en/some-route');
    await expect(page.getByRole('heading', { name: 'Expected heading' })).toBeVisible();
  });

  test('unauthenticated scenario (no login required)', async ({ page }) => {
    await page.goto('/en/search');
    await expect(page.getByRole('main')).toBeVisible();
    // Assert specific feature behaviour — not page.textContent('body')
  });
});
```

---

## Step 5 — Security self-check before running

Before running the tests, verify the spec file against this checklist:

- [ ] No hardcoded email or password strings (only `USERS.xxx.email` / `USERS.xxx.password`)
- [ ] No `console.log` of token values, localStorage, sessionStorage, or cookie content
- [ ] No `page.textContent('body')` used in a log, assertion message, or `console.log` on an authenticated route
- [ ] No `page.content()` called and its result logged or included in assertion messages
- [ ] After every `login()` call, a concrete auth signal is asserted before continuing
- [ ] No response body from an authenticated API endpoint is logged or printed
- [ ] No `e2e/report/`, `e2e/screenshots/`, or `.env.e2e.local` in `git status --short`

If any item fails, fix it before proceeding.

---

## Step 6 — Run the tests

```bash
cd /c/Projects/ReallyGlobal/RG-Frontend

# Run only the QA-PR spec
npx playwright test e2e/qa-pr/pr-{PR}-*.spec.ts \
  --reporter=list \
  --grep "@qa-pr-{PR}" 2>&1
```

If a test **fails**:
1. Read the error + screenshot
2. Determine: is this a **pre-existing issue** (present on main too?) or a **regression introduced by this PR**?
   ```bash
   # Quick check: run same test against main
   git stash
   git checkout main
   npx playwright test e2e/qa-pr/pr-{PR}-*.spec.ts --grep "@qa-pr-{PR}" 2>&1
   git checkout {branch}
   git stash pop
   ```
3. If regression → file it as a finding; do NOT approve
4. If pre-existing → document it; proceed with approval

---

## Step 7 — Report + Approve

### If all tests pass:

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr review {PR} -R reallyhq/{REPO} --approve \
  --body "$(cat <<'EOF'
QA passed via automated Playwright suite.

**Scenarios tested:**
- [list each test name and result]

**Spec file:** e2e/qa-pr/pr-{PR}-{slug}.spec.ts
**Branch:** {branch}
**Stack:** Docker localhost:3000 / :8000
**Result:** {N} passed / 0 failed

Approving.
EOF
)"
```

Then merge:
```bash
gh pr merge {PR} -R reallyhq/{REPO} --squash --delete-branch 2>&1
```

### If tests fail (regression found):

Post a comment with the failure details but do NOT approve:
```bash
gh pr comment {PR} -R reallyhq/{REPO} --body "QA FAILED — regression found: [details]"
```

---

## Step 8 — Commit the spec file

After merging the PR, commit the QA spec to main so it becomes part of the
permanent regression suite:

```bash
cd /c/Projects/ReallyGlobal/RG-Frontend
git checkout main && git pull
git add e2e/qa-pr/pr-{PR}-*.spec.ts
git commit -m "test(qa): add Playwright QA spec for PR #{PR} — {feature}"
git push
```

Verify `git status` shows nothing else staged — do not commit report/ or screenshots/.

---

## Dev account credentials

Credentials are read from environment variables — never hardcoded.

Set them in `RG-Frontend/.env.e2e.local` (gitignored):
```
E2E_CLIENT_EMAIL=mia.torres@example.com
E2E_CLIENT_PASSWORD=<dev seed password>
E2E_PROVIDER_EMAIL=sofia.martinez@example.com
E2E_PROVIDER_PASSWORD=<dev seed password>
PLAYWRIGHT_BASE_URL=http://localhost:3000
E2E_BACKEND_URL=http://localhost:8000
```

The seed password for dev accounts is set by the `DEV_PASSWORD` env var in
`docker-compose.yml` (default: `DevPassword123!`). Never put production passwords here.

---

## Constants

| | |
|---|---|
| FE URL | http://localhost:3000 |
| BE URL | http://localhost:8000 |
| FE repo | reallyhq/RG-Frontend |
| BE repo | reallyhq/Lumy-Backend |
| Spec dir | RG-Frontend/e2e/qa-pr/ |
| Playwright config | RG-Frontend/playwright.config.ts |
| Docker compose | C:\Projects\ReallyGlobal\docker-compose.yml |
