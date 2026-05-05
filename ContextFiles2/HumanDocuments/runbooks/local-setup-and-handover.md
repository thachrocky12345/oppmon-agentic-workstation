# Local Setup & Handover Runbook (Frontend + Backend)

## 1) Overview
This repo contains two primary applications that run together locally:
- **Frontend**: `RG-Frontend/` (Next.js 13 pages router) on `http://localhost:3000`
- **Backend**: `Lumy-Backend/` (Django 4.2) on `http://127.0.0.1:8000`

The frontend talks to the backend via GraphQL and REST (configured by env vars). You will run **both services** in separate terminals.

## 2) Prerequisites
Install these before starting:
- **Node.js** (LTS recommended) + **Yarn**
- **Python 3.8.10** (per backend README)
- **PostgreSQL** (local instance or container)
- **Git**

Best practice: use isolated environments
- Node via nvm or Volta
- Python via venv

## 3) Repo Layout
- `RG-Frontend/` → Next.js app
- `Lumy-Backend/` → Django API
- `ContextFiles2/` → documentation + runbooks + feature breakdowns
- `AGENTS.md` → canonical setup commands

## 4) Environment Variables
### Frontend
File: `RG-Frontend/.env.local`
Required values (from `AGENTS.md` and `RG-Frontend/next.config.js`):
- `NEXT_APP_BACKEND_BASE_URL`
- `NEXT_APP_GRAPHQL_API_URL`
- `NEXTAUTH_URL`

### Backend
File: `Lumy-Backend/.env`
Required values (from `Lumy-Backend/README.md`):
- Database: `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASS`, `POSTGRES_HOST`, `POSTGRES_PORT`
- Twilio: `TWILIO_*` values
- Stripe: `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`

If you do not have credentials, request them from the team owner. Do **not** commit secrets.

## 5) Backend Setup (Django)
From repo root:

```bash
cd Lumy-Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` in `Lumy-Backend/` with required variables.

Database setup:
```bash
python manage.py makemigrations
python manage.py migrate
```

Optional: create admin user
```bash
python manage.py createsuperuser
```

Run backend:
```bash
python manage.py runserver
```

Backend URLs:
- Admin: `http://127.0.0.1:8000/admin/`
- GraphQL: `http://127.0.0.1:8000/graphql/`

## 6) Frontend Setup (Next.js)
From repo root:

```bash
cd RG-Frontend
yarn install
```

Create `.env.local` in `RG-Frontend/` with required variables.

Run frontend:
```bash
yarn dev
```

## 7) Running Locally (Two Terminals)
Terminal A:
```bash
cd Lumy-Backend
source .venv/bin/activate
python manage.py runserver
```

Terminal B:
```bash
cd RG-Frontend
yarn dev
```

Verify:
- `http://localhost:3000` loads the UI
- Frontend can query backend via GraphQL

## 8) Testing & Quality Checks
Frontend:
```bash
cd RG-Frontend
yarn lint
yarn format
yarn check-types
yarn test-all
```

Backend:
```bash
cd Lumy-Backend
source .venv/bin/activate
python manage.py test
```

## 9) Troubleshooting
- **CORS or API errors**: verify `NEXT_APP_BACKEND_BASE_URL` and `NEXT_APP_GRAPHQL_API_URL` point to `http://127.0.0.1:8000`.
- **Database errors**: confirm Postgres is running and `.env` values are correct.
- **Port conflicts**: change ports in your local config or stop conflicting services.
- **Missing env vars**: backend may fail to start if Twilio/Stripe are required by default; confirm defaults or request dev keys.

## 10) Deployment Notes (Local/Standard)
Local best practice:
- Use `.env.local` for frontend, `.env` for backend.
- Keep secrets in local files or secrets manager.
- Use venv for Python isolation.

## 11) Docker (Recommended Local Setup)
Docker provides the most consistent local environment. A Compose file and Dockerfiles are included at repo root.

### Files
- `docker-compose.yml`
- `Lumy-Backend/Dockerfile`
- `RG-Frontend/Dockerfile`
- `Lumy-Backend/.dockerignore`
- `RG-Frontend/.dockerignore`

### Required env wiring
Backend `.env` should include:
- `POSTGRES_HOST=db` (because the DB service is named `db`)
- Copy `Lumy-Backend/.env.example` to `Lumy-Backend/.env` and fill placeholders.
  - **Note:** The backend reads Twilio, Stripe, and Azure Search keys at startup via `env()`. These must be present (placeholders are OK for local boot).
  - **Also required:** SendGrid and upload limits (see `.env.example`).

Frontend `.env.local` should include:
- `NEXT_APP_BACKEND_BASE_URL=http://backend:8000`
- `NEXT_APP_GRAPHQL_API_URL=http://backend:8000/graphql/`
- Copy `RG-Frontend/.env.local.example` to `RG-Frontend/.env.local`.
  - **One-time step:** You only need to copy these once unless you delete or want to reset the files.

### Run
From repo root:
```bash
docker compose up --build
```

Verify:
- `http://localhost:3000` (frontend)
- `http://127.0.0.1:8000/graphql/` (backend)

### Seeding
The backend container runs migrations and seeds core fixtures on first boot via `Lumy-Backend/docker-entrypoint.sh`. Seed files include navigation, country codes, and client/care-provider taxonomy fixtures.

Default dev users are seeded from fixtures in `Lumy-Backend/fixtures/`:
- `dev_fake_users.json` (password: `Password123!`)
- `dev_fake_in_person_locations.json`
- `dev_fake_care_providers.json`
