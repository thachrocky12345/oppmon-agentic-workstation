---
name: docker-dev-stack
description: Manage the Docker Compose development stack (postgres, redis, backend, rqworker, frontend). Use when asked to "start docker", "restart containers", "check logs", "rebuild", or "docker status".
argument-hint: [up|down|rebuild|logs|status|exec]
---

# Docker Dev Stack Management

## Architecture
```
docker-compose.yml (C:\Projects\ReallyGlobal\)
├── postgres:14     (:5432)
├── redis:7         (:6379)
├── backend         (:8000) — Django 4.2 + Channels (ASGI)
├── rqworker        — django-rq background jobs
└── frontend        (:3000) — Next.js 13
```

## Common Operations

### Start stack
```bash
cd /c/Projects/ReallyGlobal && docker compose up
```

### Start in background
```bash
cd /c/Projects/ReallyGlobal && docker compose up -d
```

### Rebuild after code changes
```bash
cd /c/Projects/ReallyGlobal && docker compose up --build
```

### Teardown (keep volumes)
```bash
cd /c/Projects/ReallyGlobal && docker compose down
```

### Teardown (destroy volumes — full reset)
```bash
cd /c/Projects/ReallyGlobal && docker compose down -v
```

### Check logs
```bash
docker logs reallyglobal-backend-1 --tail 50
docker logs reallyglobal-frontend-1 --tail 50
```

### Execute command in backend container
```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py <command>
```
**CRITICAL**: Always use `MSYS_NO_PATHCONV=1` prefix on Windows to prevent Git Bash from mangling `/app/` paths.

### Django shell
```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py shell -c "<python code>"
```

### Run migrations
```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py migrate
```

### Make migrations
```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py makemigrations <app_name>
```

### Load fixtures
```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py loaddata fixtures/<name>.json
```

## Known Gotchas

### Node 18 IPv4/IPv6 mismatch
- **Symptom**: `ECONNREFUSED 127.0.0.1:{port}` on every page render
- **Fix**: `NODE_OPTIONS=--dns-result-order=ipv4first` in docker-compose.yml

### Shell script line endings
- `.gitattributes` must have `*.sh text eol=lf`
- Without it, `entrypoint.sh` breaks with `\r': command not found`

### auto_now_add fields and loaddata
- `loaddata` uses `raw=True` which bypasses `auto_now_add`/`auto_now`
- Results in `null value in column "created_at"` errors
- **Fix**: Use ORM-based management commands instead of `loaddata` for models with these fields
- Example: `seed_risk_screening` command

### Container names
| Service | Container name |
|---|---|
| backend | `reallyglobal-backend-1` |
| frontend | `reallyglobal-frontend-1` |
| postgres | `reallyglobal-db-1` |
| redis | `reallyglobal-redis-1` |
| rqworker | `reallyglobal-rqworker-1` |

## Seed Data Pipeline (entrypoint.sh)
The backend entrypoint runs this sequence on startup:
1. Wait for PostgreSQL + Redis
2. `migrate --noinput`
3. Pass 1: Core taxonomy fixtures (alphabetical glob, skip FK-dependent)
4. Pass 2: FK-ordered taxonomy (roles, formats, client needs)
5. Pass 2b: `seed_risk_screening` management command
6. Pass 2c: SERP, verification, crisis, Wiley fixtures
7. Pass 3: Dev users, clients, providers
8. Pass 4: Scores, currency, session types
9. Pass 4b: Reset dev passwords to `DevPassword123!`
10. Pass 5: `seed_complete_dev` (modalities, slots, appointments, credentials, social)
11. Pass 5b: Re-load scores
12. Pass 6: `seed_dev_manage_pages` (profile pages)
13. Warm caches
