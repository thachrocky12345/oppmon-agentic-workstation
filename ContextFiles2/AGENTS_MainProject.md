# Repository Guidelines

## Project Structure & Module Organization
- `RG-Frontend/` contains the Next.js 13 (pages router) web app. Key paths: `src/pages/` for routes, `src/components/` + `src/containers/` for UI, `src/store/` for Redux/Apollo/Axios setup, `src/graphql/` and `src/restapis/` for data access, and `public/` for static assets.
- `Lumy-Backend/` contains the Django 4.2 API. Key paths: `apps/` for domain apps, `lumy_global/` for settings/urls, `fixtures/` for seed data, and `static/`/`templates/` for assets and admin templates.
- Architectural hints live in `ContextFiles/` (see “Reference Docs”).

## Build, Test, and Development Commands
Frontend (`RG-Frontend/`):
- `yarn dev`: start Next.js dev server on http://localhost:3000.
- `yarn build` / `yarn start`: production build and run.
- `yarn lint`, `yarn format`, `yarn check-types`: code quality checks.
- `yarn test-all`: format + lint + typecheck + build gate.

Backend (`Lumy-Backend/`):
- `python -m venv .venv && source .venv/bin/activate`: create/activate venv.
- `pip install -r requirements.txt`: install deps.
- `python manage.py makemigrations && python manage.py migrate`: DB setup.
- `python manage.py runserver`: start API on http://localhost:8000.
- `python manage.py test` (or `python manage.py test apps.<app>`): run tests.

## Coding Style & Naming Conventions
- Frontend: Prettier + ESLint define formatting; don’t hand-format. Use PascalCase for React components, camelCase for functions/variables, and keep page entries in `src/pages/`.
- Backend: follow Django/PEP8 conventions (4-space indentation, snake_case for modules/functions, PascalCase for classes). Add new Django apps under `apps/`.

## Testing Guidelines

### MANDATORY: Pre-Push Testing Gate
**Run the test suite for every affected app BEFORE pushing any commit to a PR branch.**
CI is the safety net, not the first gate. Pushing untested code is not acceptable.

**Backend (Lumy-Backend) — run inside Docker on Windows (Python 3.14 + django-rq fork constraint):**
```bash
docker compose run --rm backend python manage.py test apps.<affected_app>
# Must show: 0 errors, 0 failures before pushing
```

**Frontend (RG-Frontend):**
```bash
yarn test-all   # format + lint + typecheck + build — must pass before pushing
```

**After pushing:** run `/sonarcloud-pr-audit` then `/build-check`. Fix all BLOCKER/CRITICAL/MAJOR before declaring done.

### Test locations
- Backend: Django test runner (`python manage.py test`), tests live in `apps/<app>/tests/` or `apps/<app>/tests.py`
- Frontend: no unit harness; `yarn test-all` is the quality gate
- E2E: `e2e/*.spec.ts` (Playwright) — run before merging, not required before every push
- No explicit coverage target is documented.

## Commit & Pull Request Guidelines
- Commit history shows merge commits and short, imperative messages (e.g., “fix …”, “Update …”). No strict conventional-commit format is enforced—keep messages concise and scoped.
- PRs MUST include: a clear summary, linked JIRA issue, **testing performed** (which commands ran and passed), and screenshots for UI changes.
- Do not request review until local test gate passes AND `/sonarcloud-pr-audit` + `/build-check` are both clean.

## Security & Configuration Tips
- Backend config comes from `Lumy-Backend/.env`; frontend uses `RG-Frontend/.env.local` (set `NEXT_APP_BACKEND_BASE_URL`, OAuth keys, analytics tokens).
- Avoid committing secrets; use example env files and local overrides.

## Reference Docs (ContextFiles)
- `ContextFiles/SystemOverview.md`
- `ContextFiles/OnboardingGuide.md`
- `ContextFiles/Architecture-RG-Frontend.md`
- `ContextFiles/lumy-backend-architecture.md`
- `ContextFiles/lumy-backend-apis.md`
