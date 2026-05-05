---
name: commit-and-pr-hygiene
description: Pre-push testing gate, commit message conventions, and PR requirements. Tests MUST pass locally before any push.
---
# Skill: commit-and-pr-hygiene

## MANDATORY: Pre-Push Gate (do this before every push)

**Never push to a PR branch without running the test suite first.**

The cycle of "push → watch CI fail → fix → push again" is banned. Local testing is the first gate, CI is a safety net.

### Minimum gate before `git push`

**Backend changes (any file in `apps/`):**
```bash
# On Windows — run inside Docker (Python 3.14 + django-rq fork constraint)
docker compose run --rm backend python manage.py test apps.<affected_app>
# Must show: 0 errors, 0 failures
```

**Frontend changes (any file in `src/`):**
```bash
yarn test-all
# Must pass: format + lint + typecheck + build
```

**Both repos changed:** run both gates.

If either gate fails, fix the failure before pushing. Do not push a broken commit and rely on CI to tell you what's wrong.

---

## Commit Message Conventions

- Short, imperative subject line (≤ 72 chars): `fix login redirect`, `add slot hold expiry check`
- No strict conventional-commit format required, but be descriptive
- Reference JIRA ticket when applicable: `RGDEV-205: add checkout session flow`
- Scope commits to a single logical change; don't bundle unrelated fixes

---

## PR Requirements

Every PR must include:

| Field | Requirement |
|---|---|
| **Summary** | Clear description of what changed and why |
| **JIRA ticket** | Linked issue (required for feature work) |
| **Testing performed** | Which test commands were run locally and passed |
| **Screenshots** | Required for any UI changes |
| **Security impact** | Note if the change touches auth, payments, or PII |

### Before requesting review

1. Local test gate passed (see above)
2. `/sonarcloud-pr-audit` run — all BLOCKER/CRITICAL/MAJOR issues fixed
3. `/build-check` run — GitHub Actions CI green
4. All self-review comments addressed
5. No debug prints, commented-out code, or TODO stubs left in

### After pushing

**MANDATORY**: After every `git push` to a PR branch, run BOTH:
1. `/sonarcloud-pr-audit` — fix all BLOCKER/CRITICAL/MAJOR issues
2. `/build-check` — wait for CI to complete; fix any failures

Do not declare a PR ready for review until both pass.

---

## Branch Naming

- Feature: `feat/RGDEV-NNN-short-description`
- Fix: `fix/RGDEV-NNN-short-description`
- Keep branches scoped — one ticket per branch

---

## Review Response Protocol

- Address all reviewer comments before re-requesting review
- Mark threads as resolved only after the fix is pushed
- Re-request review from the original reviewer after pushing fixes
- Do not merge without approval from at least one reviewer
