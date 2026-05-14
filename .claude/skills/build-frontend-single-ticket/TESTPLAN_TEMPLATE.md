# Phase 6 — Test Plan Markdown Template

Path: `Docs/RGDEV-<NUM>/RGDEV_<NUM>_test.md`

Copy this skeleton, replace `<NUM>` and the bracketed placeholders, and fill
each section with the actual run output (not hypothetical). The doc reads
top-down: a reviewer should be able to verify every claim by re-running a
single command listed beneath it.

```markdown
# RGDEV-<NUM> — Test Plan

**Title:** [Frontend] <Ticket title from Jira>
**Branch:** `RGDEV-<NUM>_<slug>`
**Reference PR:** #<PR-number-if-opened>
**Backend dependencies:** RGDEV-<dep1>, RGDEV-<dep2> (link to their test plans)
**Points:** <as-shipped>

## 1. Feature Overview

Two-to-four sentences. What does this ticket add to the user-visible product
and the codebase? Reference the BRD section that motivated it. Call out any
scope folded in from `Docs/RGDEV-310/suggested_features_and_tasks_RGDEV_310.md`.

## 2. Files Touched

| Path | Status | Purpose |
|------|--------|---------|
| `RG-Frontend/src/components/<Domain>/<Feature>/<File>.tsx` | NEW | <one-liner> |
| `RG-Frontend/src/components/<Domain>/<Feature>/__tests__/<File>.test.tsx` | NEW | Jest tests |
| `RG-Frontend/src/restapis/<feature>.ts` | NEW or MODIFIED | <one-liner> |
| `RG-Frontend/src/pages/<route>.tsx` | NEW or MODIFIED | <one-liner> |
| `RG-Frontend/src/i18n/en.json` | MODIFIED | i18n keys for <Namespace> |
| `Docs/RGDEV-<NUM>/RGDEV_<NUM>_test.md` | NEW | this file |

Out of scope for this ticket (explicit):
- <Item that belongs to the next ticket, e.g. "design tokens — RGDEV-326">

## 3. Prerequisites

```bash
cd RG-Frontend
yarn install            # if dependencies changed
yarn dev                # http://localhost:3000
```

If the feature consumes a backend endpoint:

```bash
cd Lumy-Backend
docker compose up -d    # or `python manage.py runserver`
python scripts/RGDEV_<dep>.py   # confirm payload shape matches contract
```

## 4. Acceptance Criteria — Verification Matrix

Reproduce the AC list from the ticket. Mark each as `[x]` only after manual
or automated verification.

- [x] **AC1** — <verbatim AC text>
  - Verified by: `yarn test src/components/<...>/<File>.test.tsx -t "<test name>"`
  - Manual check: <route + observed behavior>
- [x] **AC2** — <verbatim AC text>
  - Verified by: <command or screenshot reference>
- [ ] **AC3** — <unmet AC>
  - Blocked by: <link to follow-up ticket>

(Carry forward folded-in AC from `suggested_features_and_tasks_RGDEV_310.md`
under their respective bullets.)

## 5. Unit Test Summary (Jest)

```bash
cd RG-Frontend
yarn test src/components/<Domain>/<Feature>
```

Paste the actual final summary block:

```
Test Suites: <N> passed, <N> total
Tests:       <N> passed, <N> total
Snapshots:   0 total
Time:        <X> s
```

### Per-file breakdown

| Test file | Tests | Coverage of new code |
|-----------|------:|---------------------:|
| `<File>.test.tsx` | <N> | <pct> % |
| `__tests__/<helper>.test.ts` | <N> | <pct> % |

If `yarn test:ci` was run, paste the coverage table for the changed files
only (not the whole repo).

## 6. Quality Gates

```bash
cd RG-Frontend
yarn check-types      # 0 errors
yarn lint             # 0 errors, 0 new warnings
yarn format           # clean
yarn build            # completes
yarn test-all         # composite — exits 0
```

Paste the tail of each command's output (or "clean — no output").

If `/sonarcloud-pr-audit` was run post-push, paste the issue counts:

```
BLOCKER: 0
CRITICAL: 0
MAJOR: 0
MINOR: <N — list any deferred with rationale>
```

## 7. Lighthouse / Manual QA (if user-visible)

For visual changes:

```bash
yarn dev
npx lighthouse http://localhost:3000/<route> --output=html --output-path=./lh-<NUM>.html
```

Lighthouse scores on the changed route(s):

| Route | Perf | A11y | BP | SEO |
|-------|----:|----:|---:|----:|
| `/<route>` | <N> | <N> | <N> | <N> |

For SERP / SEO pages, paste a `curl` excerpt confirming SSR completeness:

```bash
curl -s http://localhost:3000/<route> | grep -E "(<h1|application/ld\+json|canonical|hreflang)" | head -20
```

Accessibility: zero serious/critical axe violations on the affected route(s).

Skip this section explicitly with the line:

> **Phase 5 skipped:** non-visual ticket (REST helper / store slice / utility only).

## 8. Known Limitations

Bulleted list. Each item is one of:
- A behavior the BRD calls out as out-of-scope for V1.
- A test we couldn't write yet (e.g. visual regression — no Chromatic in repo).
- A backend endpoint that returns a stub today and will be filled in by
  RGDEV-<future>.

## 9. Rollback Procedure

```bash
git checkout main
git revert <merge-commit-sha>     # if already merged
# OR
git push origin :RGDEV-<NUM>_<slug>   # close the PR, delete the branch
```

Any feature flag or env var to flip back? List it here. For SERP pages, note
whether revalidation cache needs invalidation (`POST /api/revalidate?path=...`).

## 10. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Author | <you> | YYYY-MM-DD | First green |
| Reviewer | <reviewer> | YYYY-MM-DD | |
| QA | <qa or N/A> | YYYY-MM-DD | |
```

## Style notes for the test plan

- **Numbers, not adjectives.** "23 tests passed, 95 % coverage on the new
  helper" — not "comprehensive test suite".
- **Commands, not screenshots.** Anyone should be able to re-run the proof.
  Screenshots only for visual-regression evidence.
- **Past tense.** The plan documents what *was* done. Future work goes in
  Known Limitations or a follow-up ticket.
- **Link, don't duplicate.** Reference the BRD section by anchor; do not
  re-state requirements verbatim except in the AC matrix.
- **Match prior ticket tone.** Open `Docs/RGDEV-<prev>/RGDEV_<prev>_test.md`
  (or the latest in `Docs/`) and mirror its section ordering and headings.
