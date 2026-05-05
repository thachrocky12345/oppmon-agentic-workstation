---
name: testing-guidelines
description: Mandatory pre-push testing requirements, test runner details, and what "done" means before any push to a PR branch.
---
# Skill: testing-guidelines

## MANDATORY: Pre-Push Testing Gate

**You MUST run the test suite for every affected app before pushing any commit to a PR branch.**
CI is not the first gate — local testing is. Pushing broken code and waiting for CI is not acceptable.

### What "affected" means
- Any file changed under `apps/<app>/` → run `python manage.py test apps.<app>`
- Multiple apps changed → run each app's suite
- New serializer, view, model, or URL → the owning app's suite MUST pass
- New migration → run `python manage.py migrate --check` then the owning app's suite

### Backend test commands (Lumy-Backend)

```bash
# Targeted (preferred — run BEFORE every push)
python manage.py test apps.booking_link
python manage.py test apps.authentication
python manage.py test apps.calendar_functionality
python manage.py test apps.stripe_integration
python manage.py test apps.care_provider
python manage.py test apps.client
python manage.py test apps.video_conferencing

# Full suite (run when touching shared utilities, settings, or multiple apps)
python manage.py test
```

### ⚠ Windows / Python 3.14 Constraint

`django-rq` uses the `fork` multiprocessing start method, which is not available on Windows.
Running `python manage.py test` directly on Windows with Python 3.14 will fail at import time for any app that imports `django_rq`.

**Workaround — run tests inside the Docker backend container:**

```bash
# From repo root (docker stack must be running)
docker compose exec backend python manage.py test apps.<app>

# Or spin up a one-off container without the full stack:
docker compose run --rm backend python manage.py test apps.<app>
```

This is the canonical test execution method on Windows dev machines. Do not skip tests because of the Windows constraint — use Docker.

### Frontend test commands (RG-Frontend)

```bash
yarn test-all        # format + lint + typecheck + build (MUST pass before push)
yarn check-types     # tsc --noEmit (fast type check)
yarn lint            # ESLint (catches import/hook errors)
```

`yarn test-all` is the minimum gate before any FE push. It catches type errors, lint violations, and broken builds before CI sees them.

### Playwright E2E (RG-Frontend)

E2E tests run in CI and are not required before every push, but MUST be run before merging:

```bash
npx playwright test          # full suite
npx playwright test e2e/01-  # single spec
```

Do not log tokens, PII, or full page bodies in test output — use boolean presence checks only.

---

## Test Locations

| Repo | Location | Runner |
|---|---|---|
| Lumy-Backend | `apps/<app>/tests/` or `apps/<app>/tests.py` | `python manage.py test` |
| RG-Frontend | No unit harness; quality gate via `yarn test-all` | `yarn test-all` |
| RG-Frontend E2E | `e2e/*.spec.ts` | `npx playwright test` |

---

## What "Done" Means Before a Push

A commit is **not ready to push** until:

1. **Backend changes**: `docker compose run --rm backend python manage.py test apps.<affected_app>` passes with 0 errors and 0 failures
2. **Frontend changes**: `yarn test-all` passes (0 TS errors, 0 lint errors, build succeeds)
3. **Both repos changed**: both gates pass
4. **New test files**: they must actually run (not just exist) — verify with `python manage.py test apps.<app> -v 2`

After push: run `/sonarcloud-pr-audit` then `/build-check` and fix all BLOCKER/CRITICAL/MAJOR issues.

---

## Common Test Failure Patterns to Check Before Pushing

- `SyntaxError` in test files — unmatched parentheses, missing imports
- `ImportError` — circular imports, missing migration, wrong app label
- `AssertionError` — wrong fixture state in `setUp`, shared DB state bleeding between tests
- `refresh_from_db()` inside `transaction.atomic()` reads pre-commit stale value — remove it
- `select_for_update()` in tests requires `transaction.TestCase`, not `SimpleTestCase`
- `OneToOneField` violation in `setUp` — don't call `_create_*` helpers twice for the same object
- Mocked `has_completed_prior_interaction` returning True from a real setUp appointment — always patch when testing onboarding stage logic
