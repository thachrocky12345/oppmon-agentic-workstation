---
name: prod-swarm-deploy
description: Build, push, and deploy OppMon to the production Docker Swarm (old_windows + z800), apply DB schema changes, and triage common deploy failures. Use when asked to "deploy to prod", "push to swarm", "redeploy api/web", "apply schema", or when fixing 500s/proxy errors after a deploy.
argument-hint: [build-api|build-web|push-web|deploy|deploy-graph|apply-schema|smoke|logs|rollback]
---

# Prod Swarm Deploy

**Reference doc:** [docs/deploy_ubuntu.md](../../../docs/deploy_ubuntu.md) — read this before changing topology, env vars, or the build flow.

## Topology cheatsheet

```
old_windows (192.168.1.195, manager)   →   oppmon_api          :3001 host  thachrocky/oppmon-api:vN   (Docker Hub)
                                       →   oppmon_graph-agent  :7002 (optional, graph mode)
z800        (192.168.1.105, worker)    →   oppmon_web          :80   host  thachrocky/oppmon-web:vN   (Docker Hub)
PostgreSQL 14 + TimescaleDB + pgvector →   on old_windows host, port 5432
```

Port 7002 is the graph-agent (KnowledgeSearchBackend `/solve_v2`). 8002 is in
use by another local service — DO NOT use 8002 for graph-agent. See
[docs/solve-v2.md](../../../docs/solve-v2.md).

Both images are versioned and pushed to Docker Hub under `thachrocky/`. Always
bump the tag on every push — never reuse `:latest` or a previous version, or
swarm workers may serve a stale cached digest.

DB user: `thachbui` / password in `apps/api/.env`. Use the **host LAN IP**
(`192.168.1.195`) in DATABASE_URL — never `localhost` (it's the container).

## When invoked, do this

1. **Confirm scope.** "Deploy" can mean api-only, web-only, both, or schema-only. Ask if unclear.
2. **Type-check before building.** Skipping this wastes 60-90s on a bad build:
   ```bash
   pnpm --filter @oppmon/api typecheck
   pnpm --filter @oppmon/web typecheck
   ```
3. **Run the right step(s) below.**
4. **Always smoke-test after.** A "successful" stack deploy can still mean broken endpoints.

---

## Step: build-api + push-api

```bash
# Bump the tag every push so workers actually pull
NEXT_API_TAG=v$(($(date +%s) % 100000))   # or pick the next manual number

docker build -f apps/api/Dockerfile \
  -t oppmon-api:latest \
  -t thachrocky/oppmon-api:$NEXT_API_TAG .

docker push thachrocky/oppmon-api:$NEXT_API_TAG
```

Notes:
- API is pushed to Docker Hub as `thachrocky/oppmon-api:vN`. Even though the service is pinned to `old_windows`, using the registry keeps tag history, makes rollback by tag possible, and matches the web flow.
- The Dockerfile uses `pnpm` and runs the API via `tsx` (not `node dist/`) because workspace deps `@oppmon/database` and `@oppmon/shared` export raw `.ts`.
- If you change `apps/api/docker-entrypoint.sh`, rebuild — it's `COPY`'d in.
- Make sure the workspace-aware Dockerfile + `docker-entrypoint.sh` from `dev` are present on whatever branch you're building from. `main` historically had a stale npm-only Dockerfile that won't compile the workspace.

If `docker push` is permission-blocked: ask the user to run it manually, then come back to update the stack.

## Step: build-web + push-web

```bash
# Bump the tag every push so workers actually pull
NEXT_WEB_TAG=v$(($(date +%s) % 100000))   # or pick the next manual number

docker build -f apps/web/Dockerfile \
  --build-arg INTERNAL_API_URL=http://192.168.1.195:3001 \
  -t oppmon-web:latest \
  -t thachrocky/oppmon-web:$NEXT_WEB_TAG .

docker push thachrocky/oppmon-web:$NEXT_WEB_TAG
```

**`INTERNAL_API_URL` must be a build-arg.** Next.js evaluates `next.config.ts` rewrites at build time; setting it as a runtime env in the stack file does nothing.

If `docker push` is permission-blocked: ask the user to run it manually, then come back to update the stack.

## Step: deploy

> **⚠️ Operational fix — DO NOT SKIP**
>
> Source `apps/api/.env` into the shell BEFORE running `docker stack deploy`.
> Compose substitutes `${VAR}` references in `docker-stack.yml` against the
> current shell, NOT against any file on disk. If you forget, Compose silently
> expands missing vars to empty strings and the containers start without
> secrets — e.g. `OPENAI_API_KEY=""` and the API throws "OPENAI_API_KEY
> environment variable is required" on the first embedding call.
>
> ```bash
> set -a && . apps/api/.env && set +a
> ```
>
> `set -a` auto-exports every var the file defines; `set +a` restores normal
> behavior. Always run this as a single line right before `docker stack deploy`
> on a fresh shell.

```bash
# Edit docker-stack.yml — bump image tags to the ones you just pushed
sed -i "s|thachrocky/oppmon-api:v[0-9]*|thachrocky/oppmon-api:$NEXT_API_TAG|" docker-stack.yml
sed -i "s|thachrocky/oppmon-web:v[0-9]*|thachrocky/oppmon-web:$NEXT_WEB_TAG|" docker-stack.yml

# REQUIRED — see the operational-fix callout above.
set -a && . apps/api/.env && set +a

docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
```

`--with-registry-auth` is required so swarm nodes can pull from Docker Hub (both `oppmon_api` on old_windows and `oppmon_web` on z800).

> **Recommended permanent fix.** The `${VAR}` indirection in the stack file is
> fragile — every deployer has to remember to source `.env`, and a missed
> export silently produces an empty secret. Pick ONE of these and apply it:
>
> 1. **Add `env_file:` to docker-stack.yml.** Reference `env_file: - apps/api/.env`
>    directly on each service that needs API secrets (api, graph-agent).
>    Compose v3 reads it at deploy time on the manager. Keep an `environment:`
>    block only for prod-specific overrides (NODE_ENV, LAN URLs, volume paths)
>    since `environment:` wins over `env_file:`. Net effect: no more
>    `set -a/+a` dance.
>
> 2. **Move secrets to Docker Swarm secrets.** `docker secret create
>    openai_api_key -` etc., then mount them as files under `/run/secrets/*`
>    and read them in the API at boot. No env-file plumbing, no shell sourcing,
>    and rotated values don't require a redeploy — just `docker secret update`.
>
> Until one of these lands, the operational fix above is mandatory.

Wait for convergence (don't sleep-poll — use a `until` loop with Bash run_in_background):

```bash
until ! docker stack ps oppmon --format '{{.CurrentState}}' \
        | grep -qE "Starting|Pending|Preparing|Ready|Assigned"; do
  sleep 3
done
docker stack ps oppmon --filter "desired-state=running"
```

## Step: deploy-graph (optional — KnowledgeSearchBackend)

Graph mode in OppMon Chat depends on a separate Python service that serves
`POST /solve_v2`. The image is NOT built from this repo. To deploy it:

1. **Confirm the image tag** you want to deploy (it lives in a separate Docker
   Hub repo, e.g. `thachrocky/knowledge-search-backend:vN`).
2. **Uncomment the `graph-agent` block** in `docker-stack.yml` (around line
   124) and set:
   - `image:` → the tag from step 1
   - `node.hostname == old_windows` (or wherever the GPUs live)
3. **Wire the web service** to it in the same file:
   ```yaml
   services.web.environment.GRAPH_BACKEND_URL: http://graph-agent:7002
   services.web.environment.GRAPH_BACKEND_TOKEN: "<shared-secret>"  # optional
   ```
4. **Rebuild the web image** with the build-time flag so the toggle renders:
   ```bash
   NEXT_WEB_TAG=v$(($(date +%s) % 100000))
   docker build -f apps/web/Dockerfile \
     --build-arg INTERNAL_API_URL=http://192.168.1.195:3001 \
     --build-arg NEXT_PUBLIC_GRAPH_ENABLED=true \
     -t thachrocky/oppmon-web:$NEXT_WEB_TAG .
   docker push thachrocky/oppmon-web:$NEXT_WEB_TAG
   ```
5. **Deploy** (same env-sourcing rule applies):
   ```bash
   set -a && . apps/api/.env && set +a
   docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
   ```
6. **Smoke-test the proxy** end-to-end from the web host:
   ```bash
   curl -N -X POST http://192.168.1.105/api/graph/solve \
        -H 'Content-Type: application/json' \
        -d '{"inputs":"hello","web_fallback":false,"enable_tools":false,"collection_ids":[]}'
   ```
   Expect a stream of `data: {...}` lines. A `503 graph_backend_not_configured`
   means the web service didn't see `GRAPH_BACKEND_URL` — re-check the stack
   env and that you sourced `.env`.

To disable graph mode later, set
`services.web.environment.GRAPH_BACKEND_URL: ""` and redeploy. The toggle
hides automatically when the build-arg `NEXT_PUBLIC_GRAPH_ENABLED=false`.

See [docs/solve-v2.md](../../../docs/solve-v2.md) for the full architecture and
the SSE envelope shape.

## Step: apply-schema (Prisma push + pgvector)

The agent is blocked from running `prisma db push --accept-data-loss` directly against prod. Use the gated entrypoint:

```bash
# 1) Flip the flag — triggers prisma db push + pgvector ALTERs on next API start
docker service update --update-order stop-first \
  --env-add DB_AUTO_PUSH=true oppmon_api

# 2) Confirm in logs
docker service logs --tail 50 oppmon_api 2>&1 | grep -E "entrypoint|pgvector|OK |ERR "

# 3) Flip it back so future restarts don't re-sync
docker service update --env-add DB_AUTO_PUSH=false oppmon_api
```

If it ever reports `ERR ... access method "hnsw" does not exist`, that's
expected — pgvector 0.4.2 (Ubuntu 18.04 apt) only supports `ivfflat`. Not blocking.

## Step: smoke

Always after a deploy:

```bash
# Network
curl -sS -o /dev/null -w "%{http_code}\n" http://192.168.1.195:3001/api/health/live
curl -sS -o /dev/null -w "%{http_code}\n" http://192.168.1.105/
curl -sS -o /dev/null -w "%{http_code}\n" http://192.168.1.105/api/health/live   # via proxy

# Auth (full register/login round-trip)
EMAIL="smoke+$(date +%s)@example.com"
curl -sS -X POST http://192.168.1.105/api/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokePass123!\",\"name\":\"Smoke\"}" \
  | python3 -m json.tool
```

If `register` succeeds and returns a JWT, the schema and API stack are healthy.

## Step: logs

```bash
# Live tail
docker service logs --follow oppmon_api 2>&1 | tail -f

# Filter to errors only
docker service logs --tail 200 oppmon_api 2>&1 | grep -iE '"level":50|EACCES|relation.*does not exist|column.*does not exist'

# Web (only one place to look — Next.js)
docker service logs --tail 200 oppmon_web
```

## Step: rollback

Both images live on Docker Hub, so rollback is "point at the previous tag and redeploy":

```bash
# Web → previous registry tag
sed -i 's|thachrocky/oppmon-web:vNEW|thachrocky/oppmon-web:vPREV|' docker-stack.yml

# API → previous registry tag
sed -i 's|thachrocky/oppmon-api:vNEW|thachrocky/oppmon-api:vPREV|' docker-stack.yml

docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
```

List recent tags from Docker Hub if you don't remember the previous version:

```bash
curl -s "https://hub.docker.com/v2/repositories/thachrocky/oppmon-api/tags?page_size=10"  | python3 -m json.tool
curl -s "https://hub.docker.com/v2/repositories/thachrocky/oppmon-web/tags?page_size=10"  | python3 -m json.tool
```

`docker service rollback` only restores the spec (env, image tag), not an overwritten image. Always tag pushed images with versions and never reuse a tag.

---

## Failure → fix table

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser: `Unexpected token 'I', "Internal S"... is not valid JSON` | API actually 500'd OR Next.js proxy can't reach API | `docker service logs oppmon_api`. If proxy issue: `INTERNAL_API_URL` not baked at build → rebuild web with `--build-arg INTERNAL_API_URL=http://192.168.1.195:3001` |
| `relation "users" does not exist` | Prisma push never ran | apply-schema step (DB_AUTO_PUSH=true) |
| `column "tenantId" does not exist` (hint: `tenant_id`) | Raw SQL using camelCase column refs | Fix the file: snake_case in `WHERE`/`JOIN`/`ON`, keep `AS "camelCase"` aliases on outputs. See `docs/database-conventions.md`. |
| `EACCES: permission denied, mkdir '/app/apps/api/data/documents/...'` | RAG storage path mismatch | Stack env: `TAG_DOCUMENT_ROOT=/app/data/documents` (matches volume mount) |
| `relation "audit_log_v2" does not exist` | Old code path; correct table is `audit_logs` | Already fixed in `lib/audit.ts` — if it returns, check the file wasn't reverted |
| `extension "timescaledb" not found` | TimescaleDB not enabled | See deploy_ubuntu.md §2.2 |
| `access method "hnsw" does not exist` | pgvector 0.4.2 doesn't support HNSW | Harmless — `ivfflat` index is used instead. Ignore. |
| Service stuck "Pending — host-mode port already in use" | `update_config: order: start-first` clashes with `mode: host` ports | Stack file uses `stop-first`. Force it with `docker service update --update-order stop-first --force <service>` |
| `308 Permanent Redirect` from `/api/admin/rag/collections//documents` | Empty path segment — usually missing collection ID in URL | Check the response shape: it's `{data: {id: ...}}`, not `{id}` |
| `prisma db push` blocked: `--accept-data-loss` not authorized | System safety rule on prod DB | Use the apply-schema step (entrypoint), or have the user run it manually |
| `docker push` blocked | Permission rule on public registry push | Ask user to run `docker push thachrocky/oppmon-web:vN` manually |
| `Z800-Workstation` shows Down | Wrong target — that node is gone | Use lowercase `z800` (the Ready one at 192.168.1.105) |
| Browser: `Graph agent error: 503 graph_backend_not_configured` | `GRAPH_BACKEND_URL` empty in the web container | You forgot the `set -a && . apps/api/.env && set +a` step OR `services.web.environment.GRAPH_BACKEND_URL` is the empty string in `docker-stack.yml`. Set it and redeploy. |
| Browser: `Graph agent error: 502 graph_backend_unreachable` | graph-agent service not running / DNS miss | `docker service ps oppmon_graph-agent`; check the service name in `GRAPH_BACKEND_URL` matches the stack service name |
| Graph toggle missing from `/chat` even though backend is up | Web image was built without `NEXT_PUBLIC_GRAPH_ENABLED=true` | Rebuild with the build-arg (see deploy-graph step) — runtime env doesn't affect baked NEXT_PUBLIC_* |
| `port 8002 already allocated` | Old port reservation | Graph-agent uses **7002** now, not 8002. Pull latest config. |

---

## Things to NOT do

- **Don't `npm install` anything.** This is a pnpm workspace — `npm` doesn't understand `workspace:*` and will fail Turborepo invocations.
- **Don't reuse `:latest` or any previous tag for pushes — for either api or web.** Bump the tag every time. Swarm caches digests on workers; a same-tag push may not trigger a real pull, and the service will silently keep serving the stale image.
- **Don't use `start-first` updates with `mode: host` ports.** New task can't bind the port the old task holds. Use `stop-first`.
- **Don't put `localhost` in DATABASE_URL** if any code might run in a container. Always `192.168.1.195`.
- **Don't run `prisma db push --accept-data-loss` from `Bash` directly** — it'll be permission-blocked. Use the entrypoint flag.
- **Don't scale `oppmon_api` past 1 replica** without first switching to `mode: ingress` and adding Redis pubsub for WebSocket fanout. See `deploy_ubuntu.md` for the trade-offs.
- **Don't forget `set -a && . apps/api/.env && set +a`** before `docker stack deploy`. Missing it silently produces empty `${VAR}` substitutions and your secrets vanish without an error.
- **Don't use port 8002 for graph-agent.** It's already taken by another local service. The contract is **7002**.

---

## Verifying you didn't break anything

After every deploy or schema change, run the smoke step. Specifically check:

1. `/api/health/live` returns 200 on both old_windows direct and z800 proxy.
2. Register + login succeeds end-to-end.
3. `docker service logs oppmon_api 2>&1 | grep '"level":50'` is empty (or only contains expected `BAD_REQUEST` validation errors).
4. `docker service ps oppmon` shows both services with `Running` and no recent failures.

If any of these fail, the failure → fix table is the first place to look.
