# Onboarding Guide

## System at a Glance
- RG-Frontend: Next.js 13 (pages router) with TypeScript, Redux Toolkit, Apollo Client, Axios, MUI/Emotion, Next-Intl, Stripe/Twilio client libs. Serves web UX and talks to backend via REST and GraphQL.
- Lumy-Backend: Django 4.2 + Django REST Framework + Graphene; JWT auth via SimpleJWT; PostgreSQL; Twilio (video/SMS/verify), Stripe, SendGrid, Azure Cognitive Search. Exposes REST endpoints under `/api/v1/*` and GraphQL at `/api/v1/graphql/`.

## Prerequisites
- Node 18+ with Yarn and npm; Python 3.8.10; PostgreSQL running locally; Git.
- Environment files: copy `.env.example` in `Lumy-Backend/` to `.env`; create `.env.local` in `RG-Frontend/` with backend URL (`NEXT_APP_BACKEND_BASE_URL`), OAuth keys, and third-party tokens.

## Setup Steps
1) Backend
- From `Lumy-Backend/`: `python -m venv .venv && source .venv/bin/activate`.
- Install deps: `pip install -r requirements.txt`.
- Configure DB/Twilio/Stripe/SendGrid keys in `.env`.
- Run migrations: `python manage.py makemigrations && python manage.py migrate`.
- Optionally load fixtures: `python manage.py loaddata fixtures/<file>.json`.

2) Frontend
- From `RG-Frontend/`: `yarn install`.
- Populate `.env.local` with backend URL and public keys (Google OAuth, Mixpanel, MailModo, Certn, etc.).

## Running & Debugging
- Backend server: `python manage.py runserver` (http://localhost:8000). Use DRF views and GraphQL endpoint for API inspection.
- Frontend dev: `yarn dev` (http://localhost:3000). Update `BASE_API_URL` in `src/lib/constants.ts` if pointing to non-default backend.
- Type checking/linting (frontend): `yarn check-types`, `yarn lint`, `yarn format`; combined gate `yarn test-all`.
- Tests (backend): `python manage.py test` or target an app (`python manage.py test apps.authentication`).

## Common Workflows
- Add a backend feature: create/extend a Django app under `apps/`, add serializers/views/urls, add migrations, write tests in `apps/<app>/tests.py`, expose via `/api/v1/...` or GraphQL schema.
- Add a frontend feature: add page or component under `src/pages`/`components`, wire state in Redux slices under `src/store/slices`, use `api` or Apollo clients for data, add loading/error handling.
- Update dependencies: backend via `requirements.txt`; frontend via `package.json`/`yarn.lock`. Run `yarn test-all` and backend tests after upgrades.

## Links
- Architecture (Frontend): `docs/Architecture-RG-Frontend.md`
- Architecture (Backend): `docs/Architecture-Lumy-Backend.md`
- APIs (Backend): `docs/APIs-Lumy-Backend.md`
- System Overview: `docs/SystemOverview.md`
