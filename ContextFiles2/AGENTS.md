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
Context files:
- `scripts/check-filename-length.sh [path]`: report `.md` filenames longer than `MAX_FILENAME_BYTES` (default 140).
- Enable the pre-commit hook: `git config core.hooksPath .githooks` (already set in this repo).

Backend (`Lumy-Backend/`):
- `python -m venv .venv && source .venv/bin/activate`: create/activate venv.
- `pip install -r requirements.txt`: install deps.
- `python manage.py makemigrations && python manage.py migrate`: DB setup.
- `python manage.py runserver`: start API on http://localhost:8000.
- `python manage.py test` (or `python manage.py test apps.<app>`): run tests.

## Coding Style & Naming Conventions
- Frontend: Prettier + ESLint define formatting; don’t hand-format. Use PascalCase for React components, camelCase for functions/variables, and keep page entries in `src/pages/`.
- Backend: follow Django/PEP8 conventions (4-space indentation, snake_case for modules/functions, PascalCase for classes). Add new Django apps under `apps/`.
- Context files: keep `.md` filenames <= 140 bytes to avoid Linux filesystem limits (some setups cap names at 143 bytes).

## Testing Guidelines
- Backend: Django test runner (`python manage.py test`), tests typically live in `apps/<app>/tests.py`.
- Frontend: no dedicated unit test harness is wired; rely on `yarn test-all` as the quality gate. Add tests alongside components or in `__tests__/` if you introduce a framework.
- No explicit coverage target is documented.

## Commit & Pull Request Guidelines
- Commit history shows merge commits and short, imperative messages (e.g., “fix …”, “Update …”). No strict conventional-commit format is enforced—keep messages concise and scoped.
- PRs should include: a clear summary, linked issue/task (if any), testing performed, and screenshots for UI changes.

## Security & Configuration Tips
- Backend config comes from `Lumy-Backend/.env`; frontend uses `RG-Frontend/.env.local` (set `NEXT_APP_BACKEND_BASE_URL`, OAuth keys, analytics tokens).
- Avoid committing secrets; use example env files and local overrides.

## Reference Docs (ContextFiles)
- `ContextFiles/SystemOverview.md`
- `ContextFiles/OnboardingGuide.md`
- `ContextFiles/Architecture-RG-Frontend.md`
- `ContextFiles/lumy-backend-architecture.md`
- `ContextFiles/lumy-backend-apis.md`

## Reference Docs (ContextFiles2)
- `ContextFiles2/README.md`
- `ContextFiles2/HumanDocuments/feature-breakdowns/index.md`
- `ContextFiles2/HumanDocuments/Features/_extracted/List of Features.txt`
- `ContextFiles2/HumanDocuments/runbooks/index.md`
