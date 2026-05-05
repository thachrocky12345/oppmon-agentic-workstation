# Dev Stack — Start / Stop / Rebuild

Manages the full ReallyGlobal dev stack from the monorepo root.

## Stack
```
C:\Projects\ReallyGlobal-Mono\docker-compose.yml
├── postgres:14     (:5432)
├── redis:7         (:6379)
├── backend         (:8000) — Django 4.2 + Channels (ASGI)
├── rqworker        — django-rq background jobs
└── frontend        (:3000) — Next.js 13
```

## Commands

### Start (foreground)
```bash
cd /c/Projects/ReallyGlobal-Mono && docker compose up
```

### Start (background)
```bash
cd /c/Projects/ReallyGlobal-Mono && docker compose up -d
```

### Rebuild after code changes
```bash
cd /c/Projects/ReallyGlobal-Mono && docker compose up --build
```

### Stop (keep volumes)
```bash
cd /c/Projects/ReallyGlobal-Mono && docker compose down
```

### Full reset (destroy volumes + data)
```bash
cd /c/Projects/ReallyGlobal-Mono && docker compose down -v
```

### Logs
```bash
docker logs reallyglobal-backend-1 --tail 50
docker logs reallyglobal-frontend-1 --tail 50
docker logs reallyglobal-rqworker-1 --tail 50
```

### Django management commands
```bash
# Always prefix with MSYS_NO_PATHCONV=1 on Windows
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py <command>
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py migrate
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py shell -c "<python>"
```

## Parse Arguments

```
/dev-stack [up|down|build|reset|logs]
```

| Argument | Action |
|---|---|
| `up` | `docker compose up -d` (background) |
| `down` | `docker compose down` |
| `build` | `docker compose up --build` |
| `reset` | `docker compose down -v` then `docker compose up --build` |
| `logs` | Tail last 50 lines from backend + frontend + rqworker |
| *(none)* | `docker compose up` (foreground) |

## Known Gotchas

- **MSYS_NO_PATHCONV=1** — always prefix `docker exec` commands on Windows or Git Bash mangles `/app/` paths
- **Node 18 IPv4/IPv6** — `NODE_OPTIONS=--dns-result-order=ipv4first` is already set in docker-compose.yml
- **Seed takes ~2 min** — backend healthcheck waits up to 120s for migrations + seed to complete before frontend starts
- **Container names**: `reallyglobal-backend-1`, `reallyglobal-frontend-1`, `reallyglobal-db-1`, `reallyglobal-redis-1`, `reallyglobal-rqworker-1`
- **env files**: backend reads `./backend/.env`, frontend reads `./frontend/.env.local.example`

## Paths

| Resource | Path |
|---|---|
| Monorepo root | `C:\Projects\ReallyGlobal-Mono\` |
| docker-compose.yml | `C:\Projects\ReallyGlobal-Mono\docker-compose.yml` |
| Backend source | `C:\Projects\ReallyGlobal-Mono\backend\` |
| Frontend source | `C:\Projects\ReallyGlobal-Mono\frontend\` |
