---
name: prod-swarm-deploy
description: Build, push, and deploy OppMon to the production Docker Swarm (old_windows + z800), apply DB schema changes, and triage common deploy failures. Use when asked to "deploy to prod", "push to swarm", "redeploy api/web", "apply schema", or when fixing 500s/proxy errors after a deploy.
argument-hint: [build-api|build-web|push-web|deploy|deploy-graph|bump-graph-env|apply-schema|smoke|logs|rollback]
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

All three images are versioned and pushed to Docker Hub under `thachrocky/`.
Always bump the tag on every push — never reuse `:latest` or a previous
version, or swarm workers may serve a stale cached digest.

| Service | Source | Docker Hub repo | Notes |
|---|---|---|---|
| `oppmon_api` | `apps/api/` | `thachrocky/oppmon-api` | Express/Node |
| `oppmon_web` | `apps/web/` | `thachrocky/oppmon-web` | Next.js 15 |
| `oppmon_graph-agent` | `apps/KnowledgeSearchBackend/` | `thachrocky/mindsearch` (tag prefix `backend.v2.*`) | Python FastAPI, serves `/solve_v2` only |

For the graph-agent, **always use the `backend.v2.<N>` tag pattern** — the
legacy `backend.<year>` tags (e.g. `backend.2025`) point at the old image
without `/solve_v2`. See [docs/solve-v2.md](../../../docs/solve-v2.md).

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

## Pre-flight checklist (prevents the 6 most common hiccups)

Run through these once before each deploy. ~30 seconds, prevents 5-10 minute recoveries.

| # | Check | Why |
|---|---|---|
| 1 | `set -a && . apps/api/.env && set +a` was run in THIS shell | `${VAR:-}` in stack file expands from shell, not file. Skipping it empties graph-agent secrets → CrashLoopBackOff. |
| 2 | If rebuilding web: `--build-arg INTERNAL_API_URL=http://192.168.1.195:3001` (and `NEXT_PUBLIC_GRAPH_ENABLED=true` if graph mode) | Next.js bakes these at build time; runtime env on the service is too late. |
| 3 | Image tag bumped — never reusing the last one | Workers cache digests; same tag may not pull. |
| 4 | `apps/api/.env` is the only place shared secrets live (`JWT_SECRET`, `OPENAI_API_KEY`, `DATABASE_URL`, etc.) — NOT hardcoded in `docker-stack.yml` | Both api and web read it via `env_file:`. Hardcoded literals drift on rotation. |
| 5 | `update_config.order: stop-first` on any service with `mode: host` ports | `start-first` jams — new task can't bind the port the old one holds. |
| 6 | After deploy: don't trust "Updating service …" output — verify with `docker stack ps oppmon --filter desired-state=running` that timestamps are recent | Stack deploy is a no-op for services whose spec didn't change. Use `service update --force` if you need a guaranteed bounce. |

### Want X to happen? Use this command.

| Goal | Command |
|---|---|
| Push new image + run it | build → push → bump tag in stack file → `docker stack deploy …` |
| Pick up new value from `apps/api/.env` (`env_file:` services: api, web) | edit `.env` → `docker stack deploy …` (re-bakes env into spec) |
| Pick up new value for graph-agent (still uses `${VAR:-}` substitution) | edit `.env` → `set -a && . apps/api/.env && set +a` → `docker stack deploy …` |
| Force-restart unchanged services (e.g. clear in-memory cache) | `docker service update --force --update-order stop-first oppmon_<name>` |
| Tune one graph-agent knob without a full deploy | `docker service update --env-add KEY=VAL --update-order stop-first oppmon_graph-agent` |
| Apply Prisma schema change | flip `DB_AUTO_PUSH=true` via `service update --env-add`, watch logs, flip back |

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

> **State of the `env_file:` rollout (single-source-of-truth for secrets):**
> - ✅ **api** — uses `env_file: apps/api/.env` (no shell sourcing needed for its vars).
> - ✅ **web** — uses `env_file: apps/api/.env` since 2026-05-17 (shares JWT_SECRET with api by construction; no drift on rotation).
> - ⚠️ **graph-agent** — still uses `${VAR:-}` substitution for JWT_SECRET, DATABASE_URL, OPENAI_EMBED_API_KEY, etc. **This is why shell sourcing is still required.** To eliminate the requirement entirely, add `env_file: - apps/api/.env` to the graph-agent service and drop the `${VAR:-}` block (the boot-time `check_required_env()` will still fail-fast on empty values).
>
> **Stronger alternative — Docker Swarm secrets.** `docker secret create
> jwt_secret -` etc., mount under `/run/secrets/*`, read at boot. Rotation
> doesn't require a redeploy — just `docker secret update`. Bigger change
> (touches application code), defer until you actually need rotation
> independent of redeploys.
>
> **Rule going forward:** shared secrets live in `apps/api/.env` ONLY. Never
> hardcode `JWT_SECRET`, `OPENAI_API_KEY`, `DATABASE_URL`, `TAG_ENCRYPTION_MASTER_KEY`,
> etc. as literals in `docker-stack.yml`. Both api and web pull them via
> `env_file:`. To rotate: edit `.env` → deploy. Done.

Wait for convergence (don't sleep-poll — use a `until` loop with Bash run_in_background):

```bash
until ! docker stack ps oppmon --format '{{.CurrentState}}' \
        | grep -qE "Starting|Pending|Preparing|Ready|Assigned"; do
  sleep 3
done
docker stack ps oppmon --filter "desired-state=running"
```

> **Gotcha — "Updating service" does NOT mean restarted.** `docker stack deploy`
> only bounces a service if its **spec** (image, env, healthcheck, etc.) actually
> changed. If you edited only `apps/api/.env` and the resolved values happen to
> match what's already in the spec, swarm prints `Updating service oppmon_api`
> and does nothing. Verify by checking timestamps in the convergence output:
>
> ```bash
> docker stack ps oppmon --filter desired-state=running \
>   --format 'table {{.Name}}\t{{.CurrentState}}'
> ```
>
> If `CurrentState` shows "Running 2 hours ago" for a service you expected to
> bounce, force it:
>
> ```bash
> set -a && . apps/api/.env && set +a  # (only needed for graph-agent)
> docker service update --force --update-order stop-first oppmon_api
> docker service update --force --update-order stop-first oppmon_graph-agent
> ```

## Step: build-graph + push-graph

The graph-agent image is built from `apps/KnowledgeSearchBackend/` in this
repo and pushed to `thachrocky/mindsearch` under the `backend.v2.*` tag
prefix. v2 images are NOT compatible with the legacy `backend.<year>` tags —
those don't include `/solve_v2`.

```bash
# Bump the v2 tag every push so workers actually pull
NEXT_GRAPH_TAG=backend.v2.$(($(date +%s) % 100000))   # or pick the next manual number

docker build -f apps/KnowledgeSearchBackend/dockerfile \
  -t oppmon-graph-agent:latest \
  -t thachrocky/mindsearch:$NEXT_GRAPH_TAG \
  apps/KnowledgeSearchBackend

docker push thachrocky/mindsearch:$NEXT_GRAPH_TAG
```

Notes:
- The Dockerfile installs from `requirements-v2.txt` (minimal: fastapi,
  uvicorn, sse-starlette, pydantic, pydantic-settings, anthropic, openai,
  httpx, ddgs, python-dotenv). The legacy `requirement.locked.txt` is no
  longer read.
- Entry point is `python3 -m mindsearch.v2_server` — listens on container
  port **7002** in prod (image default `MINDSEARCH_PORT=7002`), exposes
  `/healthz`, `/`, and `POST /solve_v2`. The local dev `docker compose
  --profile graph` flow maps host 7002 → container 8002 — that mapping is
  ONLY for local dev, prod is 7002 inside and outside the container.
- Build cost: ~30s on a warm cache. Image size: ~250 MB (vs the legacy
  ~6.8 GB image with torch + jupyter + streamlit + transformers).
- Local smoke-test before pushing:
  ```bash
  docker compose --profile graph up -d graph-agent
  curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:7002/healthz
  ```
  Expect `200`. Then POST a question to `/solve_v2` and confirm SSE events
  stream.

If `docker push` is permission-blocked: ask the user to run it manually,
then come back to update the stack.

## Step: deploy-graph (wire into the stack)

After pushing the v2 image, update `docker-stack.yml`:

```bash
# Bump the graph image tag
sed -i "s|thachrocky/mindsearch:backend.v2[._a-z0-9]*|thachrocky/mindsearch:$NEXT_GRAPH_TAG|" docker-stack.yml

# Same env-sourcing rule as the main deploy step.
set -a && . apps/api/.env && set +a

docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
```

Make sure `docker-stack.yml` has:
- `services.graph-agent` uncommented, pointing at `thachrocky/mindsearch:$NEXT_GRAPH_TAG`
- `services.web.environment.GRAPH_BACKEND_URL: http://graph-agent:7002`
  (prod container listens on 7002 — image default `MINDSEARCH_PORT=7002`.
  8002 is the LOCAL dev container port — wrong here will yield `502
  graph_backend_unreachable` even though `docker service ps` shows Running.)
- `services.graph-agent.healthcheck` uses `http://localhost:7002/healthz`
  (same port — mismatch = healthcheck red but the container is fine).
- Web image rebuilt with `--build-arg NEXT_PUBLIC_GRAPH_ENABLED=true` so the
  Graph toggle renders in `/chat`.

To disable graph mode later, set
`services.web.environment.GRAPH_BACKEND_URL: ""` and redeploy. The toggle
hides automatically when the build-arg `NEXT_PUBLIC_GRAPH_ENABLED=false`.

Smoke-test the proxy end-to-end through the web host:
```bash
curl -N -X POST http://192.168.1.105/api/graph/solve \
     -H 'Content-Type: application/json' \
     -d '{"inputs":"hello","web_fallback":false,"enable_tools":false,"collection_ids":[]}'
```
Expect a stream of `data: {...}` lines. Failure modes:
- `503 graph_backend_not_configured` → web container didn't see
  `GRAPH_BACKEND_URL`. You forgot the `set -a && . apps/api/.env && set +a`
  step, or the stack env is empty-string.
- `502 graph_backend_unreachable` → graph-agent container isn't running or
  DNS resolution failed. `docker service ps oppmon_graph-agent`.

See [docs/solve-v2.md](../../../docs/solve-v2.md) for the full architecture
and the SSE envelope shape.

## Step: bump-graph-env (change one knob without a full stack redeploy)

For one-off tuning of graph-agent env vars (e.g. bumping
`PLANNER_MAX_ITERATIONS`, `SEARCHER_MAX_ITERATIONS`,
`TAVILY_SEARCH_TIMEOUT`), **prefer `docker service update --env-add` over
`docker stack deploy`**. A full stack deploy re-evaluates every `${VAR:-}`
against the current shell — if you forget `set -a && . apps/api/.env && set
+a`, four required secrets (`JWT_SECRET`, `TAG_ENCRYPTION_MASTER_KEY`,
`DATABASE_URL`, `OPENAI_EMBED_API_KEY`) become empty strings, the TAG-65
fail-fast check trips, and every replica CrashLoopBackOffs (502 at the web
proxy). Service-update touches only the keys you name.

```bash
# 1) Update the source-of-truth files so they don't drift
#    - apps/agent_graph_backend/.env  (local-dev value)
#    - docker-stack.yml               (prod default)

# 2) Apply to the running service — no shell env sourcing needed
docker service update --update-order stop-first \
  --env-add PLANNER_MAX_ITERATIONS=10 \
  oppmon_graph-agent

# 3) Verify
docker service inspect oppmon_graph-agent \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep PLANNER_MAX_ITERATIONS
docker service ps oppmon_graph-agent --filter desired-state=running
```

If a full `docker stack deploy` IS required (image bump, port change,
healthcheck change), the env-sourcing line is **mandatory**:
```bash
set -a && . apps/api/.env && set +a
docker stack deploy --with-registry-auth -c docker-stack.yml oppmon --prune=false
```
Without it, expect the CrashLoopBackOff above and a `502
graph_backend_unreachable` at the proxy until you re-deploy with env sourced.

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
# Network — three services, three checks
curl -sS -o /dev/null -w "api direct:      %{http_code}\n" http://192.168.1.195:3001/api/health/live
curl -sS -o /dev/null -w "web root:        %{http_code}\n" http://192.168.1.105/
curl -sS -o /dev/null -w "web → api proxy: %{http_code}\n" http://192.168.1.105/api/health/live

# Auth (full register/login round-trip — also proves JWT_SECRET parity between api and web)
EMAIL="smoke+$(date +%s)@example.com"
RESP=$(curl -sS -X POST http://192.168.1.105/api/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokePass123!\",\"name\":\"Smoke\"}")
TOKEN=$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')
[ -n "$TOKEN" ] && curl -sS -o /dev/null -w "auth/me via web: %{http_code}\n" \
  http://192.168.1.105/api/auth/me -H "Authorization: Bearer $TOKEN"
```

Pass criteria: all four 200s. The `auth/me` call goes through web's edge
middleware, which verifies the JWT — if it returns 401, JWT_SECRET drifted
between api and web (see env_file rollout note above).

> **DO NOT smoke-test graph-agent directly on :7002 from the host.** It has
> no published port — overlay-only. `curl http://192.168.1.195:7002/...` will
> return "connection refused" even when the service is perfectly healthy. The
> only valid graph-agent smoke is through the web proxy:
>
> ```bash
> # Expect: streaming "data: {...}" lines OR an `unauthenticated` JSON error
> # (which still proves the proxy is reaching the backend). NOT 502/503.
> curl -sS -N -X POST http://192.168.1.105/api/graph/solve \
>      -H 'Content-Type: application/json' \
>      -d '{"inputs":"hello","web_fallback":false,"enable_tools":false,"collection_ids":[]}' \
>      --max-time 5 | head -3
> ```

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
| `docker stack deploy` printed "Updating service oppmon_api" but `docker stack ps` still shows the task running from hours ago | Spec didn't change — swarm treats it as a no-op | Use `docker service update --force --update-order stop-first oppmon_api` to actually bounce |
| `curl http://192.168.1.195:7002/healthz` → `Connection refused` | graph-agent has no published port (overlay-only by design) | Don't test directly. Smoke via `POST http://192.168.1.105/api/graph/solve` instead |
| `auth/me` returns 401 even though `/login` succeeded | JWT_SECRET drifted between api and web | Both should use `env_file: apps/api/.env` (see env_file rollout note in deploy step). Compare with `docker service inspect oppmon_api/oppmon_web --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \| grep JWT_SECRET` |

---

## Things to NOT do

- **Don't `npm install` anything.** This is a pnpm workspace — `npm` doesn't understand `workspace:*` and will fail Turborepo invocations.
- **Don't reuse `:latest` or any previous tag for pushes — for either api or web.** Bump the tag every time. Swarm caches digests on workers; a same-tag push may not trigger a real pull, and the service will silently keep serving the stale image.
- **Don't use `start-first` updates with `mode: host` ports.** New task can't bind the port the old task holds. Use `stop-first`.
- **Don't put `localhost` in DATABASE_URL** if any code might run in a container. Always `192.168.1.195`.
- **Don't run `prisma db push --accept-data-loss` from `Bash` directly** — it'll be permission-blocked. Use the entrypoint flag.
- **Don't scale `oppmon_api` past 1 replica** without first switching to `mode: ingress` and adding Redis pubsub for WebSocket fanout. See `deploy_ubuntu.md` for the trade-offs.
- **Don't forget `set -a && . apps/api/.env && set +a`** before `docker stack deploy`. Missing it silently produces empty `${VAR}` substitutions and your secrets vanish without an error. (Only graph-agent still needs this — api and web read `apps/api/.env` via `env_file:`.)
- **Don't use port 8002 for graph-agent.** It's already taken by another local service. The contract is **7002**.
- **Don't hardcode shared secrets in `docker-stack.yml`.** `JWT_SECRET`, `OPENAI_API_KEY`, `DATABASE_URL`, `TAG_ENCRYPTION_MASTER_KEY` etc. belong in `apps/api/.env` and reach the containers via `env_file:`. A literal in the stack file silently drifts the day you rotate the `.env` value.
- **Don't smoke-test graph-agent directly on `:7002`.** It has no published port. `curl http://192.168.1.195:7002/...` will look broken even when it's healthy. Always test through `http://192.168.1.105/api/graph/solve`.
- **Don't trust "Updating service …" from `docker stack deploy`.** It's printed unconditionally. The real signal is `docker stack ps oppmon --filter desired-state=running` showing recent timestamps. If you needed a bounce and didn't get one, follow up with `docker service update --force --update-order stop-first oppmon_<name>`.

---

## Verifying you didn't break anything

After every deploy or schema change, run the smoke step. Specifically check:

1. `/api/health/live` returns 200 on both old_windows direct and z800 proxy.
2. Register + login + `auth/me` succeeds end-to-end (also proves JWT_SECRET parity).
3. `docker service logs oppmon_api 2>&1 | grep '"level":50'` is empty (or only contains expected `BAD_REQUEST` validation errors).
4. `docker stack ps oppmon --filter desired-state=running` shows all services `Running` with **timestamps consistent with what you expected to bounce**. A service still showing "Running 2 hours ago" when you thought you redeployed it = stack deploy was a no-op for that service.
5. (If graph mode enabled) `POST /api/graph/solve` through the web host returns streaming data or a structured 401, NOT 502/503.

If any of these fail, the failure → fix table is the first place to look.
