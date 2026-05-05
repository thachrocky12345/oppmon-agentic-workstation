---
name: pr-review-fix
description: Full PR review comment resolution pipeline — triage comments, plan, dual-audit the plan, implement, dual-audit the implementation, QA against the ticket, run Playwright, and produce a post-mortem for every fix. Use when asked to "fix PR review comments", "resolve PR feedback", "address review", or "work through PR comments".
argument-hint: [repo] [pr-number]   e.g. be 1246  |  fe 1260  |  https://github.com/reallyhq/Lumy-Backend/pull/1246
---

# PR Review Fix Pipeline

## Overview: 11 phases, up to 14 agents

Takes a PR's review comments from start to fully-resolved: triage → plan → plan-audit → plan-fix → implement → impl-audit → impl-fix → QA → Playwright → post-mortem.

Every fixed issue ends with a documented triple: **Problem / Solution / Why it was missed**.

---

## Step 0 — Parse Arguments

```
/pr-review-fix [repo] [pr-number]
/pr-review-fix [github-pr-url]
```

| Argument | Resolution |
|---|---|
| `be`, `backend`, `Lumy-Backend` | repo = `reallyhq/Lumy-Backend`, local = `C:\projects\ReallyGlobal\Lumy-Backend` |
| `fe`, `frontend`, `RG-Frontend` | repo = `reallyhq/RG-Frontend`, local = `C:\projects\ReallyGlobal\RG-Frontend` |
| GitHub URL | Parse repo + PR number from URL |
| No args | Infer from CWD + `gh pr view --json number` |

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr view --json number,headRefName,baseRefName,body,title
```

---

## Status Table (maintain throughout)

Update after each phase completes. Print after each update.

```
| Phase | Agent | Role | Status | Notes |
|-------|-------|------|--------|-------|
| 0  | TRIAGE        | Pull + categorize all PR comments          | ⬜ Pending | -- |
| 1a | PLANNER       | Draft implementation plan from comments    | ⬜ Pending | -- |
| 1b | AUDIT-PLAN-A  | Create security/correctness audit prompt   | ⬜ Pending | -- |
| 1c | AUDIT-PLAN-B  | Create completeness/edge-case audit prompt | ⬜ Pending | -- |
| 2a | PLAN-AUDITOR-A| Execute security/correctness plan audit    | ⬜ Pending | -- |
| 2b | PLAN-AUDITOR-B| Execute completeness/edge-case plan audit  | ⬜ Pending | -- |
| 3  | PLAN-MERGE    | Merge both plan audits → corrected plan    | ⬜ Pending | -- |
| 4  | IMPLEMENTER   | Execute corrected plan (worktree)          | ⬜ Pending | -- |
| 5a | IMPL-AUDIT-A  | Security/correctness audit of implementation| ⬜ Pending | -- |
| 5b | IMPL-AUDIT-B  | Regression/edge-case audit of implementation| ⬜ Pending | -- |
| 6  | IMPL-FIX      | Apply implementation audit fixes           | ⬜ Pending | -- |
| 7  | QA            | QA against Jira ticket + PR test plan      | ⬜ Pending | -- |
| 8  | PLAYWRIGHT    | Run relevant Playwright tests              | ⬜ Pending | -- |
| 9  | POST-MORTEM   | Document every fix: Problem/Solution/Missed| ⬜ Pending | -- |
| 10 | HARNESS-UPDATE| Write missed patterns back into skill/CLAUDE.md/memory | ⬜ Pending | -- |
```

---

## Phase 0 — TRIAGE (1 agent, sequential)

**Goal:** Pull ALL review signals from the PR and produce a structured breakdown.

### Collect data

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"

# PR metadata + body
gh pr view {PR} -R {REPO} --json title,body,headRefName,baseRefName,labels

# Issue comments (e.g. SonarCloud, CI bots)
gh api repos/{REPO}/issues/{PR}/comments \
  --jq '.[] | {author: .user.login, body: .body, url: .html_url}'

# Inline review comments (file:line)
gh api repos/{REPO}/pulls/{PR}/comments \
  --jq '.[] | {author: .user.login, path: .path, line: .line, body: .body, url: .html_url}'

# Review summaries (CHANGES_REQUESTED, APPROVED, COMMENTED)
gh api repos/{REPO}/pulls/{PR}/reviews \
  --jq '.[] | {author: .user.login, state: .state, body: .body}'
```

If the PR body references a Jira ticket (e.g. `RGDEV-211`), extract the ticket key.

### Structure the output

Build a **Triage Document** saved to `/tmp/pr-{PR}-triage.md`:

```markdown
# PR #{PR} Triage — {REPO}

## PR Context
- Branch: {headRef} → {baseRef}
- Jira: {ticket-key} (if found)
- Overall review state: CHANGES_REQUESTED / APPROVED

## Comment Breakdown

### 🔴 BLOCKERS ({n})
For each:
- **File:** `path/to/file.py:line`
- **Reviewer:** @username
- **Comment:** (full text)
- **Fix required:** (one-sentence summary)

### 🟠 ISSUES ({n})
(same format)

### 🟡 SUGGESTIONS ({n})
(same format)

### ⚪ NITS ({n})
(same format)

### ℹ️ BOT / CI COMMENTS
(SonarCloud gate result, CI status)

## Jira Ticket Summary
(If ticket fetched: title, description, acceptance criteria)

## Files Touched (from inline comments)
- `apps/booking_link/views.py` — 3 comments
- `apps/attribution/views.py` — 2 comments
- ...

## Recommended Fix Scope
BLOCKERS + ISSUES: must fix
SUGGESTIONS: fix if low-risk
NITS: fix at discretion
```

Fetch Jira ticket if key found:
```bash
# Uses MCP Atlassian or gh CLI — fetch title + description + acceptance criteria
```

---

## Phase 1 — PLAN + DUAL AUDIT PROMPTS (3 parallel agents)

Launch all three simultaneously once Phase 0 completes.

### Agent 1a — PLANNER (opus)

**Input:** `/tmp/pr-{PR}-triage.md` + relevant source files

**Task:**
1. Read the triage document
2. Read each file mentioned in BLOCKER/ISSUE comments
3. For each fix, determine the minimal correct change
4. Produce `/tmp/pr-{PR}-plan.md`:

```markdown
# Implementation Plan — PR #{PR} Fixes

## Fix #{n}: {short title}
- **Severity:** BLOCKER / ISSUE / SUGGESTION
- **File:** `path/to/file.py:line`
- **Problem:** (technical description)
- **Change:** (exact code change or approach)
- **Tests to add/modify:** (specific test names or assertions)
- **Risk:** LOW / MEDIUM / HIGH + reason

## Ordering
Execute fixes in this order: (list by risk — low risk first)

## Files Modified
- `file.py` — N changes

## Tests
- Add: (list)
- Modify: (list)
- Verify: (existing tests that must still pass)
```

### Agent 1b — AUDIT PROMPT A: Security/Correctness (sonnet)

**Input:** `/tmp/pr-{PR}-triage.md`

**Task:** Write a focused audit prompt that another agent will use to audit the plan for security and correctness issues. Cover:
- Are all security vulnerabilities fully addressed (not just patched superficially)?
- Are there related vectors the plan misses (e.g. if IDOR fixed in one view, are sibling views checked)?
- Are atomic operations truly atomic?
- Are new inputs validated?
- Are error paths handled without leaking info?
- [from PR #1243] When a queryset looks up by UUID/ID, verify an ownership filter is also applied (e.g., `client=request.user.client`) — UUID is not a credential.
- [from PR #1243] When `select_for_update()` is added for a race condition, verify it is applied to the shared resource row (e.g., the slot), not just the requesting entity's row (e.g., the session) — each client has a separate session so locking the session does not protect the shared slot.
- [from PR #1243] When fixing TOCTOU at one endpoint (e.g., expiry check at status poll), verify all paths that consume the same state also independently re-check it (e.g., the complete endpoint must re-check hold_until, not rely on the status endpoint having run first).
- [from PR #1246] Cross-reference the PR description test plan against urls.py — verify every referenced endpoint actually exists in the URL registry before planning fixes
- [from PR #1243 second pass] When IDOR is fixed in named views, do not stop there — enumerate ALL `Model.objects.get/filter` call sites in the file and verify each has an ownership constraint. Name-driven scanning misses views added after the original fix commit.
- [from PR #1243 second pass] A security guard that is structurally present but conditionally applied (e.g., `if client_profile is not None: lookup['client'] = client_profile` with `client_profile = None` fallback) is effectively no guard. Verify ownership filters are unconditional: `AttributeError` on profile access must result in early `return Response(..., 400)`, not a `None` fallback that silently skips the filter.
- [from PR #1263] When a `waitForURL` or `waitForNavigation` uses a negative-match regex (e.g., `/(?!.*\/login)/`), verify the pattern is not vacuously true on the starting URL — a negative-match regex the current page already satisfies fires immediately without proving any state change occurred.
- [from PR #1263] When a fix addresses a logging/leak issue in one caller (e.g., one spec file), scan ALL callers that share the same test helper function for the same pattern before scoping the fix.
- [from PR #1261] When a fix proposes that two separate components compute the same numeric value (e.g., a price, a total), verify they use the identical formula path — different but mathematically equivalent expressions can diverge by $0.01 due to intermediate rounding (e.g., `amount * 0.9` vs `amount - amount * 0.1 / 100`).
- [from PR #1261] When resetting data state in a catch block (e.g., `setItems([])`), verify ALL derived metadata state is also reset: totals, page numbers, error flags. Leaving `totalCount` non-zero while `items` is empty produces phantom pagination.
- [from PR #1260] When verifying a third-party SDK call (e.g., `stripe.confirmCardPayment`), examine ALL return states including the degenerate case where neither the error field nor the result object is populated — do not assume a non-error return guarantees a valid result object.
- [from PR #1260] When an async navigation function (e.g., `router.replace()`) is called and a `finally` block follows synchronously, verify the finally block does not mutate state that controls rendering — the finally block fires before navigation completes, causing a momentary render in the wrong state. Use a `useRef` flag to suppress state updates during redirect.

Save to `/tmp/pr-{PR}-audit-prompt-A.md`.

### Agent 1c — AUDIT PROMPT B: Completeness/Edge-cases (sonnet)

**Input:** `/tmp/pr-{PR}-triage.md`

**Task:** Write a focused audit prompt covering:
- Does the plan address all BLOCKER/ISSUE comments, not just the most obvious ones?
- Are there edge cases the plan doesn't cover (race conditions, boundary values, missing test assertions)?
- Does the plan verify the fix doesn't break existing functionality?
- Are reviewer SUGGESTIONS that reduce tech debt worth including?
- [from PR #1243] When a security guard is applied to an authenticated endpoint, check all sibling unauthenticated endpoints for the same guard — e.g., if `track/` blocks internal referers, `track-anonymous/` must too.
- [from PR #1243] When a mock/stub path returns a "success" response, verify downstream consumers of that response (WebSocket consumers, follow-up API calls) can actually use the returned value — stub success does not guarantee full flow works.
- [from PR #1246] For any security check that is "already present" or "pre-existing", require a test that confirms it — code presence alone is not evidence the guard works
- [from PR #1246] When scope expands beyond the original ticket (proactive hardening, stubs), require a PR comment explaining what changed, what was deferred, and why
- [from PR #1243 second pass] When a security fix resolves IDOR in a subset of views, verify all read-only sibling endpoints on the same model are also scoped — information disclosure endpoints (status, fee preview, onboarding enrichment) carry the same IDOR risk as mutation endpoints.
- [from PR #1263] When fixing `console.log(body?.slice())` in a cited spec file, grep ALL spec files for the same pattern before scoping the fix — authenticated body slice logging is a suite-wide risk, not a per-file issue.
- [from PR #1263] When fixing a pixel coordinate click in a helper's fallback path, grep all spec files for standalone pixel clicks that bypass the helper entirely.
- [from PR #1261] When a list component can be empty for two distinct reasons (load failure vs genuinely empty), verify the plan distinguishes them — showing "no items" empty state on a failed fetch misleads users into thinking they have no data.
- [from PR #1261] When a modal is triggered by a toggle/button, check whether the trigger can be double-clicked while the modal is opening (race between state update and re-render) — add `disabled={modalOpen}` to the trigger element.
- [from PR #1261] When a fix introduces a new pure function (date formatter, price calculator), add unit tests for that function even if the component has no test harness — pure functions are trivially testable in isolation and document expected behavior precisely.
- [from PR #1261] When tests are added for a fix, verify the test runner is actually configured in the project (jest.config.js / vitest.config.ts exists, test framework appears in package.json dependencies). A test file with no configured runner is dead code that never executes in CI and provides false confidence.
- [from PR #1261] When a component callback (e.g., onPayment, onSubmit) returns data that includes a computed value visible in the UI (e.g., finalPrice), verify the callback payload includes that computed value and not just the raw input — future callers expect the value the user sees, not the pre-computation input.
- [from PR #1261] When a TypeScript type for an API response field is `string` but the fix adds a runtime `!value` null guard, check whether the type should be `string | null` — a runtime guard without the matching type allows TypeScript to silently accept null at call sites that assume non-null.
- [from PR #1260] When context is persisted to sessionStorage for redirect survival, verify FULL objects (not just IDs) are persisted — components that render display data (prices, names, descriptions) need the full object; re-querying by ID requires an additional API call that may not happen before render.
- [from PR #1260] When context is persisted to sessionStorage for redirect survival, verify the wizard step is also persisted — restoring state without restoring step sends users back to step 1 while their slot hold and context are active.
- [from PR #1260] When a function calls `sessionStorage.setItem()`, verify it is wrapped in try/catch — sessionStorage throws in private browsing mode and on quota exceeded.
- [from PR #1260] When constructing a redirect URL using dynamic values (e.g., a slug from Redux state), verify the value is non-null before interpolating — `'/book/' + undefined` produces `/book/undefined`; use a null-checked fallback.

Save to `/tmp/pr-{PR}-audit-prompt-B.md`.

---

## Phase 2 — PLAN AUDITS (2 parallel agents)

Launch both once Phase 1 completes (both prompts must exist).

### Agent 2a — PLAN AUDITOR A: Security/Correctness (opus)

**Input:** `/tmp/pr-{PR}-plan.md` + `/tmp/pr-{PR}-audit-prompt-A.md` + source files

**Task:** Execute the audit prompt against the plan. For each finding:
- State what the plan gets right
- State what is incomplete, wrong, or risky
- Propose a specific correction

Save findings to `/tmp/pr-{PR}-plan-audit-A.md`.

### Agent 2b — PLAN AUDITOR B: Completeness/Edge-cases (opus)

**Input:** `/tmp/pr-{PR}-plan.md` + `/tmp/pr-{PR}-audit-prompt-B.md` + source files

**Task:** Execute the audit prompt against the plan. Same output format.

Save findings to `/tmp/pr-{PR}-plan-audit-B.md`.

---

## Phase 3 — PLAN MERGE (1 agent, sequential)

**Input:** `/tmp/pr-{PR}-plan.md` + both audit files

**Task (sonnet):**
1. For each audit finding, decide: accept, reject, or partially accept
2. Produce a corrected final plan at `/tmp/pr-{PR}-plan-final.md`
3. Annotate each correction with `[from Audit A]` or `[from Audit B]`
4. Flag any audit findings that were rejected and why

The final plan must be self-contained — the implementer reads only this file.

---

## Phase 4 — IMPLEMENT (1 agent, worktree isolation, opus)

**Input:** `/tmp/pr-{PR}-plan-final.md`

**Task:**
1. Checkout the PR branch in a worktree:
   ```bash
   export PATH="/c/Program Files/GitHub CLI:$PATH"
   git fetch origin {headRefName}
   git worktree add /tmp/pr-{PR}-worktree {headRefName}
   cd /tmp/pr-{PR}-worktree
   ```
2. Read each file to be modified before touching it
3. Apply each fix from the final plan
4. Run the test suite:
   ```bash
   # Backend
   cd /tmp/pr-{PR}-worktree
   python manage.py test {affected_apps} --verbosity=2

   # Frontend
   cd /tmp/pr-{PR}-worktree
   yarn check-types && yarn lint
   ```
   **Note:** After any automated linter or refactor pass, re-run the test suite before committing. Do not assume a structurally-correct refactor is semantically correct.
5. Fix any test failures before proceeding
6. Commit all changes:
   ```bash
   git add {changed files}
   git commit -m "fix(RGDEV-{ticket}): address PR #{PR} review comments

   Fixes:
   - {BLOCKER} IDOR ownership check on checkout session endpoints
   - {BLOCKER} Timing-safe HMAC comparison
   - {ISSUE} Input validation on page_size parameter
   ...

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```

Save implementation summary to `/tmp/pr-{PR}-impl-summary.md` listing every file changed and the specific change made.

**Do NOT push yet** — auditors review first.

---

## Phase 5 — IMPLEMENTATION AUDITS (2 parallel agents)

Launch both once Phase 4 completes.

### Agent 5a — IMPL AUDITOR A: Security/Correctness (opus)

**Input:** `/tmp/pr-{PR}-plan-final.md` + `/tmp/pr-{PR}-impl-summary.md` + changed files in worktree

**Task:**
1. For each fix in the implementation, verify the change is correct
2. Check: are there related code paths the fix doesn't cover?
3. Check: does the fix introduce new vulnerabilities?
4. Check: are the new tests actually exercising the fix (not just passing vacuously)?
5. [from PR #1246] Verify that tests have non-trivial setup — an assertion on an empty database passes vacuously and confirms nothing
6. [from PR #1246] After any automated refactor that touches a view's response construction, verify the response value is refreshed from the DB, not read from a stale in-memory ORM instance (call refresh_from_db or re-fetch)
7. [from PR #1261] When two components compute the same numeric result independently, verify both use the identical formula path — even "equivalent" formulas can diverge by $0.01 due to `toFixed()` rounding on different intermediate values.

For each finding, rate: ✅ Correct / ⚠️ Incomplete / ❌ Wrong / 🔍 New issue

Save to `/tmp/pr-{PR}-impl-audit-A.md`.

### Agent 5b — IMPL AUDITOR B: Regression/Edge-cases (opus)

**Input:** Same inputs as 5a

**Task:**
1. Verify each original reviewer comment is fully addressed (not just partially)
2. Check for regression risks — does any change break existing behavior?
3. Identify missing test cases for edge conditions
4. Verify the PR description's test plan items are all addressed
5. [from PR #1243] Verify that time-bounded state (holds, expiry windows, tokens) is re-checked at every consumption point, not just where it is set or polled — relying on background sweeps or previous status checks is insufficient.
6. [from PR #1246] For every security fix applied, verify a test was also written — a fix without a test is a fix that the next refactor can silently undo
7. [from PR #1261] When a list can be empty due to either a failed fetch or genuine zero items, verify the error path is checked before the empty-state path so users are not shown misleading "no items" messaging after a load failure.
8. [from PR #1261] When the plan resets data state in a catch block, verify ALL correlated state is also reset: pagination totals, page numbers, error flags, and selected items. Partial resets produce internally inconsistent UI state.

Save to `/tmp/pr-{PR}-impl-audit-B.md`.

---

## Phase 6 — IMPL FIX (1 agent, sequential, opus)

**Input:** Both implementation audit files + worktree

**Task:**
1. Triage all audit findings (⚠️ and ❌ items)
2. Apply fixes for each finding in the worktree
3. Re-run tests after each fix
4. Commit any additional fixes:
   ```bash
   git commit -m "fix(RGDEV-{ticket}): address implementation audit findings

   - {fix 1}
   - {fix 2}
   ...

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```
5. Push the branch:
   ```bash
   git push origin {headRefName}
   ```

---

## Phase 7 — QA (1 agent, sequential, sonnet)

**Input:** Jira ticket (from triage) + PR description + changed files

**Task — QA against acceptance criteria:**

### 7a. Extract acceptance criteria
From the Jira ticket description and PR body, build a checklist:
```
[ ] POST /api/v1/booking-link/checkout/complete/ with expired hold → 410
[ ] GET /api/v1/booking-link/booking/{id}/ → 403 for wrong client
[ ] POST .../reschedule/ → atomic slot swap
[ ] POST .../cancel/ → 400 outside cancellation window
[ ] HMAC validation rejects tampered signatures
[ ] page_size=abc → 400 (not 500)
[ ] page_size=9999999 → capped at 200
```

### 7b. Verify each criterion
For each item:
- Read the relevant code path to confirm the behavior is implemented
- Check if there's a test covering it; if not, flag as **TEST MISSING**
- Mark: ✅ Verified / ⚠️ Partial / ❌ Not implemented / 🧪 Test missing

### 7c. QA Report
Save to `/tmp/pr-{PR}-qa-report.md`:
```markdown
# QA Report — PR #{PR}

## Acceptance Criteria Checklist
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | ... | ✅ Verified | `views.py:449` + `test_checkout.py:TestCheckoutOwnership` |
| 2 | ... | ⚠️ Partial | Implemented but no test |
| 3 | ... | 🧪 Test missing | Code OK, no test case |

## Risks
(List any behaviors that couldn't be verified statically)

## Pass / Fail
QA: PASS / FAIL (fail if any ❌ items)
```

If QA FAIL: spawn a fix agent to address gaps, then re-run QA.

---

## Phase 8 — PLAYWRIGHT (1 agent, sequential)

**Input:** Changed feature area + QA report

**Task:**
1. Identify relevant Playwright spec files:
   ```bash
   # Find specs related to booking, checkout, attribution
   ls RG-Frontend/e2e/
   grep -rl "booking\|checkout\|attribution" RG-Frontend/e2e/ --include="*.ts"
   ```

2. Run relevant specs:
   ```bash
   cd RG-Frontend
   npx playwright test e2e/{relevant-spec}.spec.ts --reporter=list 2>&1 | tail -50
   ```

3. If no relevant spec exists, note: "No Playwright coverage for this feature — consider adding `e2e/{feature}.spec.ts`"

4. Playwright Report:
   ```markdown
   ## Playwright Results — PR #{PR}

   ### Specs Run
   - `e2e/booking.spec.ts` — 12 passed, 0 failed
   - `e2e/checkout.spec.ts` — 8 passed, 1 skipped

   ### Failures (if any)
   (test name, error, screenshot path)

   ### Coverage Gaps
   (flows not covered by any spec)
   ```

5. If any Playwright tests fail: diagnose → fix (if a code bug) or update test (if test assumption changed) → re-run.

---

## Phase 9 — POST-MORTEM (1 agent, sequential, sonnet)

**Input:** All phase outputs — triage, plans, audits, impl summary, QA report

**Goal:** Every fixed issue gets a permanent record of the full reasoning chain.

### Post-Mortem Report

Save to `/tmp/pr-{PR}-postmortem.md` AND post as a PR comment:

```markdown
# PR #{PR} Fix Post-Mortem

_Generated {date} by pr-review-fix pipeline_

---

## Fixed Issues

### Issue 1: IDOR on CheckoutCompleteView
**Severity:** BLOCKER
**File:** `apps/booking_link/views.py:449`

**Problem:**
CheckoutSession was looked up by UUID only (`get_object_or_404(CheckoutSession, session_id=session_id)`). Any authenticated user who knows or guesses a valid UUID can complete another user's checkout.

**Solution:**
Added `client__user=request.user` filter to the queryset:
```python
session = get_object_or_404(
    CheckoutSession,
    session_id=session_id,
    client__user=request.user
)
```
Applied the same fix to `CheckoutSessionStatusView` and `CheckoutSlotReleaseView` where the same pattern existed.

**Why it was missed in layers of auditing:**
- *Original implementation:* The UUID was treated as a sufficient secret. This is a common but flawed assumption — UUIDs are not credentials.
- *Plan audit miss:* Audit A caught the primary instance but Audit B identified two sibling views with the same pattern that the initial plan overlooked.
- *Implementation audit catch:* Impl Auditor A verified all three views were fixed and that the new test explicitly asserts 403 for a mismatched user, not just a 200 for the correct user.

---

### Issue 2: Timing Attack on HMAC Validation
...

---

## Issues Not Fixed (and why)
| Issue | Decision | Reason |
|-------|----------|--------|

## Audit Layer Effectiveness
| Layer | Issues Caught | Issues Missed | Notes |
|-------|--------------|---------------|-------|
| Original reviewer | 3 BLOCKERS, 3 ISSUES | sibling IDOR views | Human review caught primary patterns |
| Plan Audit A (security) | sibling IDOR views | -- | Systematic scan of related code paths |
| Plan Audit B (completeness) | missing reschedule/cancel endpoints | -- | Cross-referenced PR description vs URL config |
| Impl Audit A (correctness) | vacuous test for page_size cap | -- | Verified test assertion was specific |
| Impl Audit B (regression) | -- | -- | No regressions detected |
| QA | 1 missing test | -- | cancel endpoint test case absent |
| Playwright | -- | -- | No existing e2e coverage for checkout flow |

## Recommended Follow-ups
- Add e2e Playwright spec for checkout/booking flow
- Remove deprecated `get_checkout_discount()` (low-risk, high-clarity)
- Add `warnings.warn` to deprecated function in the interim
```

Post as a PR comment:
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr comment {PR} -R {REPO} --body "$(cat /tmp/pr-{PR}-postmortem.md)"
```

---

## Phase 10 — HARNESS UPDATE (1 agent, sequential, sonnet)

**Input:** `/tmp/pr-{PR}-postmortem.md` — specifically the "Audit Layer Effectiveness" table and the "Why it was missed" sections for each issue.

**Goal:** Every pattern that slipped through the pipeline gets written back into the harness so it can't slip through again.

### 10a — Classify each missed pattern

For each issue in the post-mortem that was caught late (by an auditor, QA, or Playwright — not by the original plan):

Classify where it should have been caught:

| Category | Update target |
|----------|--------------|
| Security pattern (IDOR, timing attack, injection, etc.) | Skill: add to Plan Audit A prompt as an explicit check |
| Completeness gap (sibling views, missing endpoint, untested path) | Skill: add to Plan Audit B prompt as an explicit check |
| Vacuous test (test passes but doesn't assert the right thing) | Skill: add to Impl Audit A checklist |
| Regression / edge case | Skill: add to Impl Audit B checklist |
| Missing Playwright coverage | Skill: note in Phase 8 "gaps to check" |
| Django/DRF pattern (architectural, e.g. `select_for_update`, ownership filter) | `sonarcloud-pr-audit` SKILL.md rule table OR `CLAUDE.md` coding conventions |
| Broad recurring risk (applies beyond this PR) | `CLAUDE.md` Security Notes section OR new memory file |

### 10b — Apply updates

**Update this skill file** (`pr-review-fix/SKILL.md`):

In Phase 1b (Audit Prompt A), add any new security/correctness checks to the explicit checklist under "Cover:".
In Phase 1c (Audit Prompt B), add any new completeness/edge-case checks.
In Phase 5a (Impl Auditor A), add new correctness checks.
In Phase 5b (Impl Auditor B), add new regression checks.

Use `Edit` tool — append the new check as a bullet under the relevant "Check:" block. Format:
```
- [from PR #{PR}] {check description}
```

**Update `sonarcloud-pr-audit/SKILL.md`** if the pattern maps to a static analysis rule:
- Add a row to the Python or TypeScript rule table
- Example: "Ownership filter missing on UUID lookup → always scope queryset to `request.user`"

**Update `CLAUDE.md`** if the pattern is broad enough to be a project-wide coding convention:
- Add to Section 15 (Security Notes) or Section 14 (Coding Conventions)
- Keep entries short and actionable (one sentence + bad/good example if helpful)

**Write a memory file** if the pattern is a recurring architectural risk worth surfacing in future sessions:
```bash
# Save to memory
cat > "C:/Users/jerem/.claude/projects/C--projects-ReallyGlobal/memory/feedback_pr_review_patterns.md" << 'EOF'
---
name: feedback_pr_review_patterns
description: Patterns that slipped through PR review audits — added as explicit checks to prevent recurrence
type: feedback
---

## IDOR on UUID-keyed lookups (caught: PR #1246)
Always scope `get_object_or_404` / `filter()` to `request.user` when the model has a `client` or `user` FK.
**Why:** UUIDs are not credentials. Any authenticated user who obtains a valid UUID can access another user's resource.
**How to apply:** In all DRF views that look up session/appointment/booking objects — verify `client__user=request.user` or equivalent is in the queryset.

## HMAC timing attack (caught: PR #1246)
Use `hmac.compare_digest()` or `django.utils.crypto.constant_time_compare()` for any signature comparison. Never `==` or `!=`.
**Why:** String comparison short-circuits on the first mismatched byte, leaking timing information.
**How to apply:** Any view that validates a token, signature, or hash.
...
EOF
```

Update `MEMORY.md` index to include the new memory file if it doesn't already exist.

### 10c — Confirm updates

Print a summary of every file touched:

```
## Harness Update Summary — PR #{PR}

### Checks added to pr-review-fix/SKILL.md
- Phase 1b: "Check sibling views for the same pattern when fixing a vulnerability in one view"
- Phase 5a: "Verify test assertions are specific — a 403 assertion must use a mismatched user, not just hit the endpoint"

### Rules added to sonarcloud-pr-audit/SKILL.md
- Python: UUID-keyed queryset without owner filter → add `client__user=request.user`

### CLAUDE.md updates
- Section 15: "UUID is not a credential — always scope resource lookups to request.user"

### Memory files written/updated
- feedback_pr_review_patterns.md — 2 new patterns

### Nothing updated (patterns already covered)
- (list any that were already present)
```

---

## Timing Rules

```
Phase 0 (TRIAGE)            → sequential, must complete first
Phase 1a/1b/1c              → launch in parallel once Phase 0 done
Phase 2a                    → launch as soon as Phase 1b done (don't wait for 1c)
Phase 2b                    → launch as soon as Phase 1c done (don't wait for 1b)
Phase 1a (PLANNER)          → can run in parallel with 1b/1c; Phase 3 waits for all of 1a, 2a, 2b
Phase 3 (PLAN MERGE)        → waits for: Phase 1a + Phase 2a + Phase 2b
Phase 4 (IMPLEMENT)         → sequential after Phase 3
Phase 5a/5b                 → launch in parallel once Phase 4 done
Phase 6 (IMPL FIX)          → sequential after both Phase 5a + 5b
Phase 7 (QA)                → sequential after Phase 6
Phase 8 (PLAYWRIGHT)        → sequential after Phase 7
Phase 9 (POST-MORTEM)       → sequential after Phase 8
Phase 10 (HARNESS-UPDATE)   → sequential after Phase 9
```

---

## Edge Cases

### No inline review comments (only a summary review)
- Treat the review body as a single ISSUE-level item
- Extract individual points from the body text manually in Phase 0

### PR already approved / no CHANGES_REQUESTED
- Still run the pipeline — focus on SUGGESTIONS and NITS
- Note in post-mortem that this is proactive quality improvement

### Jira ticket not findable
- Skip Jira fetch; use PR description body as the acceptance criteria source
- Note gap in QA report

### Playwright not installed / no Docker
- Run `yarn check-types && yarn lint` instead as the verification step
- Note in Phase 8 output: "Playwright not available — static checks only"

### Backend-only PR (no Playwright coverage possible)
- Phase 8: run Django test suite + check coverage delta instead
  ```bash
  python manage.py test {affected_apps} --verbosity=2
  coverage run manage.py test {affected_apps}
  coverage report --include="apps/{app}/*"
  ```

---

## Constants

| Constant | Value |
|---|---|
| Backend repo | `reallyhq/Lumy-Backend` |
| Frontend repo | `reallyhq/RG-Frontend` |
| Backend local | `C:\projects\ReallyGlobal\Lumy-Backend` |
| Frontend local | `C:\projects\ReallyGlobal\RG-Frontend` |
| GitHub CLI path | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |
| Playwright config | `RG-Frontend/playwright.config.ts` |
| Django test runner | `python manage.py test {app} --verbosity=2` |
