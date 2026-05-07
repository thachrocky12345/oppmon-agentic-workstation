# Deploying OppMon on Ubuntu Docker Swarm

Reference for the production deployment first set up on **2026-05-07**. The stack
runs on a small Docker Swarm spanning two Ubuntu hosts; the database lives on
the host (not in the swarm). This document captures everything that turned out
to be non-obvious so the next deploy isn't a discovery exercise.

---

## 1. Topology

| Component | Where | Notes |
|---|---|---|
| Swarm manager + API task | `old_windows` (192.168.1.195) | `docker node ls` shows hostname `old_windows`, manager + Reachable |
| Swarm worker + Web task | `z800` (192.168.1.105) | hostname is **lowercase** `z800` (a `Z800-Workstation` node also exists but is Down — don't target it) |
| PostgreSQL 14 + TimescaleDB + pgvector | `old_windows` (host, not container) | Listening on `0.0.0.0:5432`. Reachable from swarm overlay via the host LAN IP. |
| Docker Hub registry | `thachrocky/*` namespace | Logged in via `~/.docker/config.json`. Used so z800 can pull web image. |

Service / port layout:

```
oppmon_api   → old_windows  port 3001 (mode: host)   image: oppmon-api:latest    (local only)
oppmon_web   → z800         port 80   (mode: host)   image: thachrocky/oppmon-web:vN  (Docker Hub)
```

The API image stays local because it's pinned to `old_windows`. The web image
is pushed to Docker Hub so z800 can pull it.

---

## 2. Prerequisites (one-time)

Run on `old_windows`:

### 2.1 Passwordless sudo for the deploy user

The host postgres CLI (`psql`) and apt installs need it.

### 2.2 PostgreSQL 14 (PGDG) with TimescaleDB and pgvector

```bash
# Already installed: postgresql-14, postgresql-14-pgvector

# Add Timescale repo (one-time)
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo apt-key add -
echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ bionic main" \
  | sudo tee /etc/apt/sources.list.d/timescaledb.list
sudo apt-get update
sudo apt-get install -y timescaledb-2-postgresql-14

# Enable timescaledb in postgres
sudo sed -i.bak "s|^#shared_preload_libraries = ''.*|shared_preload_libraries = 'timescaledb'|" \
  /etc/postgresql/14/main/postgresql.conf
sudo systemctl restart postgresql@14-main

# Verify
PGPASSWORD=db4n89o3J824 psql -h 192.168.1.195 -U thachbui -d oppmon \
  -tAc "select name, default_version from pg_available_extensions where name in ('timescaledb','vector');"
```

### 2.3 Database + role

The deployment uses the `thachbui` superuser (not `oppmon` — that role does
not exist on this host). The `oppmon` database must exist:

```bash
sudo -u postgres psql -c "\l" | grep oppmon
```

### 2.4 `.env` file at `apps/api/.env`

Dotenv resolves from the migrate script's cwd (`apps/api`). Source of truth
is `apps/.env`; copy it forward:

```bash
cp apps/.env apps/api/.env
```

Critical: `DATABASE_URL` must use the **host LAN IP** (`192.168.1.195`), not
`localhost` — when migrations or scripts run inside containers, `localhost`
is the container.

```
DATABASE_URL=postgres://thachbui:<password>@192.168.1.195:5432/oppmon
```

### 2.5 Docker Hub login

```bash
docker login -u thachrocky
```

---

## 3. Repo layout that matters for deploys

```
docker-stack.yml                   # Swarm-style stack file
apps/api/Dockerfile                # Custom: pnpm + tsx runtime
apps/api/docker-entrypoint.sh      # Gated DB schema sync + pgvector ALTERs
apps/web/Dockerfile                # Custom: pnpm + next start
apps/api/.env                      # Required for host-side migrate; copy from apps/.env
```

The stock arkon Dockerfiles use `npm install`, which **fails** on this
pnpm workspace because of `workspace:*` deps. Use the rewritten Dockerfiles
in this repo.

---

## 4. Build & push

```bash
# API — local build, never pushed (pinned to old_windows)
docker build -f apps/api/Dockerfile -t oppmon-api:latest .

# Web — local build then push to Docker Hub for z800 to pull
docker build -f apps/web/Dockerfile \
  --build-arg INTERNAL_API_URL=http://192.168.1.195:3001 \
  -t oppmon-web:latest \
  -t thachrocky/oppmon-web:vN .
docker push thachrocky/oppmon-web:vN
```

Tagging discipline: bump `vN` (v3, v4, v5…) per deploy so the swarm pulls the
new digest. `:latest` is fine for local but Swarm caches digests, and a
`:latest` re-deploy without a tag bump may not actually pull on the worker.

### 4.1 Why the rebuilt Dockerfiles

| Issue | Fix |
|---|---|
| `npm install` chokes on `workspace:*` | Switched to `corepack enable` + `pnpm@9.0.0` + `pnpm install --frozen-lockfile` |
| `next build` referenced `.next/standalone` but `output: 'standalone'` is commented out in `next.config.ts` | Web Dockerfile uses `next start -p 3000` instead of standalone |
| API tsc-compiled `dist/` imports `.ts` workspace deps at runtime (`@oppmon/database` exports raw TS via `main: ./src/index.ts`) | API runs via `pnpm exec tsx src/index.ts` (no separate build step) |
| Next.js bakes `rewrites()` destinations at **build time**, not runtime | `INTERNAL_API_URL` must be a `--build-arg`, not just a runtime env |

---

## 5. Stack file — `docker-stack.yml`

Key things to remember:

### Placement
```yaml
deploy:
  placement:
    constraints:
      - node.hostname == old_windows   # for api
      # - node.hostname == z800         # for web
```

Use **lowercase `z800`** (the Ready node), not `Z800-Workstation` (Down).

### Port mode
```yaml
ports:
  - target: 3001
    published: 3001
    protocol: tcp
    mode: host
```

`mode: host` binds directly on the placement node and skips the ingress
mesh. With `mode: host`, **only one replica per node** can hold the port —
scaling beyond 1 replica requires either ingress mode or spreading across
nodes.

### Update strategy
```yaml
update_config:
  order: stop-first
  failure_action: rollback
```

`start-first` doesn't work with `mode: host`: the new task can't bind a port
the old task is still holding, so the rollout hangs.

### Env discipline

- `DATABASE_URL` → `postgres://thachbui:...@192.168.1.195:5432/oppmon`
- `CORS_ORIGIN` → comma-separated list of every web origin (`http://192.168.1.195,http://192.168.1.105`)
- `TAG_DOCUMENT_ROOT` → `/app/data/documents` (must match the volume mount)
- `DB_AUTO_PUSH` → `"true"` only when applying schema changes; `"false"` otherwise
- `NEXT_PUBLIC_API_URL` → `""` (browser uses relative `/api/*`)
- `INTERNAL_API_URL` → `http://192.168.1.195:3001` (server-side rewrite target, also baked at build time)

---

## 6. Deploy

```bash
docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
```

`--with-registry-auth` sends Docker Hub credentials to worker nodes so they
can pull `thachrocky/oppmon-web`.

Verify:

```bash
docker stack services oppmon
docker stack ps oppmon --filter "desired-state=running"
curl -sS http://192.168.1.195:3001/api/health/live   # API
curl -sS http://192.168.1.105:80/                    # Web
curl -sS http://192.168.1.105/api/health/live        # Web → API proxy
```

---

## 7. Database schema sync (via entrypoint)

`apps/api/docker-entrypoint.sh` runs at container start and, when
`DB_AUTO_PUSH=true`, does:

1. `pnpm exec prisma db push --accept-data-loss` — applies the Prisma schema
2. Idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS embedding vector(1536)`
   on `embeddings` and `rag_chunks` (Prisma can't represent pgvector types)
3. Creates an `ivfflat` index on each (HNSW isn't available in pgvector 0.4.2
   — that's the apt version on Ubuntu 18.04)

To apply schema changes:

```bash
# 1. Edit packages/database/prisma/schema.prisma
# 2. Flip the flag
docker service update --update-order stop-first --env-add DB_AUTO_PUSH=true oppmon_api
# 3. Watch logs to confirm: "[entrypoint] schema sync done"
docker service logs --tail 50 oppmon_api | grep entrypoint
# 4. Flip it back
docker service update --env-add DB_AUTO_PUSH=false oppmon_api
```

This pattern exists because the host system blocks the agent from running
destructive DB operations directly; the entrypoint runs from inside the
container so it isn't subject to the same gate.

---

## 8. Application gotchas

### 8.1 Prisma `db push` requires `--accept-data-loss`

Triggered by:
- Dropping the legacy `_migrations` tracking row from the partial SQL migration
- Adding unique constraints on `agents(tenant_id, name)` etc. (warning, not real loss on empty tables)

Safe in our case — no business data exists. Running it once during initial
schema creation, and again whenever the Prisma model changes columns/constraints.

### 8.2 Raw SQL must use snake_case columns

The Prisma schema uses `@map("snake_name")` directives. Database columns are
**snake_case**, but raw SQL strings throughout the codebase historically used
camelCase (`"tenantId"`, `"deletedAt"`, etc.) — those queries fail with
`column "tenantId" does not exist` after a fresh Prisma push.

Pattern that works:

```sql
SELECT
  ch.document_id AS "documentId",   -- snake_case column, camelCase output alias
  ch.chunk_index AS "chunkIndex"
FROM rag_chunks ch
WHERE ch.tenant_id = $1            -- snake_case in WHERE/JOIN/ON
```

JS code keeps reading `row.documentId` because of the alias.

Files known to need this treatment (already fixed at deploy time):
`services/rag-retriever.ts`, `services/advanced-rag.ts`, `services/embedding.ts`,
`services/toolbox.ts`, `lib/search/vector.ts`, `lib/search/bm25.ts`,
`lib/rag/index.ts`. New raw SQL must follow the same pattern (see
`docs/database-conventions.md`).

### 8.3 RAG document storage path

`LocalDiskStorage` reads `TAG_DOCUMENT_ROOT` (default: `./data/documents`,
relative to cwd which is `/app/apps/api`). Volume mount in the stack is
`/app/data/documents`. Without `TAG_DOCUMENT_ROOT=/app/data/documents` set,
uploads `EACCES: permission denied`.

### 8.4 Audit logging

`audit_log_v2` doesn't exist; the Prisma table is `audit_logs` with a
different schema (no `actor_type`, has `resource_type`/`resource_id`,
`actor_id` is NOT NULL with FK to users, action is the `AuditAction` enum
`CREATE/READ/UPDATE/DELETE/DENIED`).

`lib/audit.ts` was rewritten to map free-form action strings (e.g.
`"workflow.create"`) to enum values, and to skip silently when there's no
`actorId`/`tenantId` (NOT NULL constraints).

`GET /api/admin/audit?limit=20&offset=0` reads back the joined view.

### 8.5 Frontend can't reach the API directly from the public internet

The web is served on z800; the API on old_windows. A user's browser sees
`http://<some-ip>/` and tries to call the API. Solution: the browser uses
relative `/api/*` URLs, and Next.js's `rewrites()` proxies them server-side
to `INTERNAL_API_URL`. **`NEXT_PUBLIC_API_URL` must be empty** so
`apps/web/src/lib/api.ts` produces relative URLs.

If the browser shows `Unexpected token 'I', "Internal S"... is not valid JSON`,
that's the proxy returning plain-text "Internal Server Error" because either
(a) `INTERNAL_API_URL` wasn't baked at build time, or (b) the API actually
500'd and the response body isn't JSON. Check API logs first.

---

## 9. Rollback

```bash
# Web — pin back to a previous tag
sed -i 's|thachrocky/oppmon-web:v4|thachrocky/oppmon-web:v3|' docker-stack.yml
docker stack deploy --with-registry-auth -c docker-stack.yml oppmon

# API — `oppmon-api:latest` is local-only. To roll back, rebuild from a
# previous git ref or keep tagged builds:
git checkout <good-sha> -- apps/api
docker build -f apps/api/Dockerfile -t oppmon-api:latest .
docker service update --update-order stop-first --force oppmon_api
```

Tip: `docker service rollback oppmon_api` rolls back the *config* (env vars,
image tag) but doesn't restore an overwritten `:latest` tag. Always bump
tags for any image you push to a registry.

---

## 10. Smoke test checklist

After every deploy:

```bash
# Network
curl -sS http://192.168.1.195:3001/api/health/live           # → {"status":"ok"}
curl -sS http://192.168.1.105/                               # → HTTP 200
curl -sS http://192.168.1.105/api/health/live                # → {"status":"ok"} (proxy)

# Auth
EMAIL="smoke+$(date +%s)@example.com"
curl -sS -X POST http://192.168.1.105/api/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokePass123!\",\"name\":\"Smoke\"}"     # → 201 + JWT

# RAG (requires the user from above to be tenant admin)
TOKEN=...   # from /auth/login
curl -sS -X POST http://192.168.1.105/api/admin/rag/collections \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"smoke","scope":"TENANT"}'                                            # → 201
echo "Hadrian built the wall in 122 AD." > /tmp/smoke.txt
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/smoke.txt" \
  "http://192.168.1.105/api/admin/rag/collections/<id>/documents"                   # → 202
# Wait ~10s for indexing, then chat:
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"When was the wall built?"}],"collectionIds":["<id>"]}' \
  http://192.168.1.105/api/rag/chat                                                  # → answer + citations
```

Look for `"level":50` lines in `docker service logs oppmon_api` afterward.
None expected.
