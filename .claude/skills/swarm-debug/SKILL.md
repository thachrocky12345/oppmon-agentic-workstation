---
name: swarm-debug
description: Triage prod Docker Swarm failures for OppMon — missing env keys, graph-agent / mindsearch returning "no grounding", Tavily/DDG fallback silently breaking, image-vs-source drift, and UI flags not reaching the backend. Use when asked to "debug prod", "graph mode returns no grounding", "Tavily isn't working", "env var missing in container", "service is using stale image", "fix swarm 500s", or "why is .env not loading".
argument-hint: [env-check|graph-trace|image-drift|tavily-test|ui-flag-check|full-triage]
---

# Swarm Debug — OppMon Production Triage

**Companion to:** [prod-swarm-deploy/SKILL.md](../prod-swarm-deploy/SKILL.md) — that one ships code, this one diagnoses why a shipped deploy is misbehaving.

## What this skill is for

The most common prod failure pattern on OppMon is **silent env/state drift** — the deploy "succeeds", containers are `Running`, healthchecks pass, but a feature returns empty/grounding-less responses. This is almost always one of:

| # | Failure class | Telltale |
|---|---|---|
| 1 | **Shell env not exported before `docker stack deploy`** | `${TAVILY_API_KEY:-}` in stack file resolves to `""`. Graph-agent silently falls through to DDG (rate-limited) or returns no hits. |
| 2 | **`.env` in wrong location for swarm** | Only `apps/api/.env` is loaded (via `env_file:` on the api service). `apps/agent_graph_backend/.env` is **NEVER** read by swarm — that file only works under `docker compose` with a bind mount. |
| 3 | **Image-vs-source drift** | Pre-built image has old source baked at `/root/mindsearch` (or `/app`). Host edits don't appear until the image is rebuilt + pushed + workers pull. |
| 4 | **UI flag never reaches backend** | Web sends `web_fallback=false`, retriever short-circuits before calling web search. No Tavily/DDG hit in logs at all. |
| 5 | **NEXT_PUBLIC_* not baked at build time** | Setting it in `environment:` of the stack file does nothing — Next.js evaluates at `next build`. |
| 6 | **Stale image cached on worker** | Worker pulled `:latest` once and never refreshes. Always bump the tag; never reuse a version. |
| 7 | **JWT_SECRET mismatch between api and web** | Web middleware silently rejects every cookie. `/admin` 307-loops to `/login`. |

## Topology refresher

```
old_windows (192.168.1.195, manager)
  oppmon_api          replicas 2, port 3001       (thachrocky/oppmon-api:<tag>)
  oppmon_graph-agent  replicas 1, port 8002       (thachrocky/mindsearch:<tag>)
z800        (192.168.1.105, worker)
  oppmon_web          replicas 2, port 80         (thachrocky/oppmon-web:<tag>)
Postgres+TimescaleDB+pgvector on old_windows host :5432 (NOT in swarm)
```

`oppmon-net` overlay network. Web reaches graph-agent via overlay DNS: `http://graph-agent:8002` (the `7002` port mapping you may see is the dev-time host mapping in `docker-compose.override.yml`, not in swarm).

## When invoked, do this

1. **Get the symptom in one sentence.** "Graph mode returns no grounding" / "API 500 on POST /api/x" / "Web 502s through Cloudflare" / "Login works but /admin 307s to /login".
2. **Confirm the deploy actually happened**, not just the image push. `docker stack services oppmon` on manager — check the `IMAGE` column matches the tag you pushed, and `REPLICAS` shows N/N.
3. **Run the matching subroutine below.**
4. **Always finish with a real end-to-end smoke test** (not just a healthcheck), and paste the proof.

---

## Subroutine: env-check  (most common — start here for any "no grounding" / "empty response" bug)

### Step 1 — Is the env var actually in the running service spec?

On the manager (old_windows):

```bash
# Replace TAVILY_API_KEY with whatever var you suspect
docker service inspect oppmon_graph-agent \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep -E 'TAVILY|ANTHROPIC|WEB_SEARCH|LLM_PROVIDER'
```

Expected: `TAVILY_API_KEY=tvly-...` (non-empty). If you see `TAVILY_API_KEY=` (empty) or it's missing entirely, **the shell env was not exported at deploy time**.

### Step 2 — Why is it empty?

`docker-stack.yml` uses `${TAVILY_API_KEY:-}` for the graph-agent service. That placeholder resolves from **the shell that runs `docker stack deploy`**, not from any `.env` file. The api service uses `env_file: - apps/api/.env`, but graph-agent does NOT — it relies on shell expansion.

### Step 3 — Fix

```bash
cd ~/oppmon-agentic-workstation
grep -E 'TAVILY|ANTHROPIC_API_KEY|LLM_PROVIDER|WEB_SEARCH_PROVIDER' apps/api/.env
# If keys are missing, append them now.
set -a && . apps/api/.env && set +a
echo "${TAVILY_API_KEY:0:10}..."   # confirm non-empty
docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
```

### Step 4 — Re-verify

Re-run Step 1. If still empty, check `apps/api/.env` actually contains the key (not just `.env.example`).

### Common pitfall

Creating `apps/agent_graph_backend/.env` does **nothing in swarm**. That file is only read when the source is bind-mounted via `docker-compose.override.yml` and the container starts with `python-dotenv` finding it next to the working directory. Swarm doesn't bind-mount, doesn't auto-load it, and the image's WORKDIR is `/root` — not `/root/mindsearch` — so even if you `COPY` it in, it won't be found.

**The only authoritative env source for graph-agent on swarm is the shell that ran `docker stack deploy`.**

---

## Subroutine: graph-trace  (use when env vars look right but graph mode still empty)

Goal: figure out which of the four hops between user and Tavily is broken:

```
Browser → web container → graph-agent container → Tavily/DDG → results back
```

### Step 1 — Tail graph-agent logs while reproducing in UI

```bash
docker service logs oppmon_graph-agent --tail 0 --follow --since 1m
# In the UI, run a query like: "Groupon GRPN stock 2025"
```

Look for one of these patterns:

| Pattern | Meaning |
|---|---|
| `POST https://api.tavily.com/search "HTTP/1.1 200 OK"` | Tavily was called — good. If still empty, Tavily returned 0 results (try different query). |
| `POST https://api.tavily.com/search "HTTP/1.1 401"` | Bad/missing API key. Run `env-check`. |
| `POST https://api.tavily.com/search "HTTP/1.1 429"` | Tavily quota exhausted. Should fall through to DDG; check `ChainedWebSearch`. |
| `primp: response: https://www.bing.com/search` | DDG ran (it wraps Bing under the hood). Tavily was skipped — likely `TavilyWebSearch` couldn't initialize. |
| No `POST` / no `primp` line at all | Web never asked for web search. Jump to `ui-flag-check`. |
| `TavilyWebSearch init failed` | Key invalid or `tavily-python` not installed in image. |
| `solve_v2 error` Exception traceback | Real backend bug — read the traceback. |

### Step 2 — Smoke Tavily directly from inside the container

```bash
GRAPH_CID=$(docker ps -qf "label=com.docker.swarm.service.name=oppmon_graph-agent" | head -1)
docker exec "$GRAPH_CID" python3 -c "
import os, httpx
key = os.environ.get('TAVILY_API_KEY','')
print('key prefix:', key[:10] if key else 'EMPTY')
if not key: raise SystemExit(1)
r = httpx.post('https://api.tavily.com/search',
  json={'api_key':key,'query':'Groupon GRPN stock','max_results':3},
  timeout=10)
print('status:', r.status_code, 'results:', len(r.json().get('results',[])))
"
```

200 + 3 results = Tavily works. 401 = key issue. 0 results = upstream issue, try a different query.

### Step 3 — End-to-end SSE bypass UI

```bash
# Replace COOKIE with a logged-in session cookie copied from browser devtools.
curl -N -X POST http://192.168.1.195/api/graph/solve \
  -H 'Content-Type: application/json' \
  -H "Cookie: $COOKIE" \
  -d '{"inputs":"Groupon GRPN stock 2025","enable_tools":true,"web_fallback":true,"collection_ids":[]}'
```

Look for `"source": "web"` and real domains in citations.

---

## Subroutine: image-drift  (use when "I edited the file but nothing changed")

### Step 1 — What image is actually running?

```bash
docker service inspect oppmon_graph-agent \
  --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
# Should print: thachrocky/mindsearch:<expected-tag>@sha256:<digest>
```

If the tag is right but the digest differs from what you pushed → worker has a stale layer cache.

### Step 2 — What source is inside the running container?

```bash
GRAPH_CID=$(docker ps -qf "label=com.docker.swarm.service.name=oppmon_graph-agent" | head -1)
docker exec "$GRAPH_CID" grep -l "TavilyWebSearch" /root/mindsearch/agent_v2/rag/web_search.py \
  && echo "OK: Tavily code present" || echo "BUG: image has old source"
```

If "BUG" — the image was built from an older checkout. Rebuild + push + bump tag in `docker-stack.yml` + redeploy.

### Step 3 — Force a re-pull on workers

Always bump the tag (`webs.v2` → `webs.v3`). If you *must* reuse a tag (don't), force-update:

```bash
docker service update --force --with-registry-auth oppmon_graph-agent
```

### Why bind mounts don't fix this in swarm

Swarm services don't honor host bind mounts the way `docker-compose` does. The local-dev override `./apps/agent_graph_backend/mindsearch:/root/mindsearch:ro` only exists in `docker-compose.override.yml`, not in `docker-stack.yml`. On swarm the image is the source of truth.

---

## Subroutine: tavily-test  (focused validation of Tavily + fallback chain)

### Step 1 — Confirm config inside container

```bash
GRAPH_CID=$(docker ps -qf "label=com.docker.swarm.service.name=oppmon_graph-agent" | head -1)
docker exec "$GRAPH_CID" python3 -c "
from mindsearch.agent_v2.config import settings as s
print('provider:', s.web_search_provider)
print('tavily key set:', bool(s.tavily_api_key))
print('tavily timeout:', s.tavily_search_timeout)
print('tavily depth:', s.tavily_search_depth)
"
```

### Step 2 — Inspect the constructed chain

```bash
docker exec "$GRAPH_CID" python3 -c "
from mindsearch.agent_v2.app import _build_web_search
w = _build_web_search()
print('type:', type(w).__name__)
if hasattr(w, '_providers'):
    print('chain:', [type(p).__name__ for p in w._providers])
"
```

Expected for `WEB_SEARCH_PROVIDER=tavily`: `type: ChainedWebSearch` / `chain: ['TavilyWebSearch', 'DuckDuckGoWebSearch']`.

### Step 3 — Call the chain

```bash
docker exec "$GRAPH_CID" python3 -c "
import asyncio
from mindsearch.agent_v2.app import _build_web_search
w = _build_web_search()
hits = asyncio.run(w.search('Groupon GRPN stock 2025', top_k=3))
for h in hits: print(getattr(h, 'url', h))
"
```

3 hits = working. 0 hits = Tavily empty + DDG also empty/throttled. Test a more generic query like `"latest tech news"` to confirm wiring vs upstream issue.

---

## Subroutine: ui-flag-check  (use when graph-agent logs show no web search at all)

The retriever short-circuits when `web_fallback=false`:

```python
# apps/agent_graph_backend/mindsearch/agent_v2/rag/retriever.py:~100
if not web_fallback or self._web is None:
    return RetrievalResult(..., source="none")
```

The web UI computes `web_fallback` in `apps/web/src/app/(dashboard)/chat/page.tsx:~436`:

```ts
web_fallback: enableWebFallback || selectedCollections.length === 0,
```

### Step 1 — Confirm the deployed web image has the fix

```bash
docker service inspect oppmon_web \
  --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
# Compare digest against the one printed at push time.
```

If image predates the chat/page.tsx fix → rebuild web with the new source.

### Step 2 — Capture the actual request body

In browser DevTools → Network → filter `solve` → check the POST body has `"web_fallback": true`. If false, either:
- A RAG collection is selected in the UI (user choice), OR
- The deployed web image is older than the fix.

### Step 3 — Force web_fallback unconditionally for testing

Temporarily flip it on the server-side route in `apps/web/src/app/api/graph/solve/route.ts` (if one exists) or directly in `chat/page.tsx`. Rebuild + push web. Confirm graph mode now grounds. Then decide on the proper UX (e.g. always-on toggle, or auto when collection list empty).

---

## Subroutine: full-triage  (run when symptom is unclear)

Top-to-bottom checklist. Run on the manager.

```bash
# A. Services up?
docker stack services oppmon
# Expect: oppmon_api 2/2, oppmon_web 2/2, oppmon_graph-agent 1/1

# B. Images match what you pushed?
docker service inspect oppmon_api          --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
docker service inspect oppmon_web          --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
docker service inspect oppmon_graph-agent  --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'

# C. Critical env vars present?
docker service inspect oppmon_graph-agent --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep -E 'TAVILY|ANTHROPIC_API_KEY|LLM_PROVIDER|WEB_SEARCH_PROVIDER'
docker service inspect oppmon_api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep -E 'DATABASE_URL|JWT_SECRET|TAVILY|ANTHROPIC'
docker service inspect oppmon_web --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep -E 'JWT_SECRET|INTERNAL_API_URL|GRAPH_BACKEND_URL'

# D. JWT_SECRET parity between api and web? (must match for cookies to verify)
A=$(docker service inspect oppmon_api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep '^JWT_SECRET=' | head -1)
W=$(docker service inspect oppmon_web --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep '^JWT_SECRET=' | head -1)
[ "$A" = "$W" ] && echo "JWT match" || echo "JWT MISMATCH — auth WILL fail"

# E. Healthchecks
curl -fsS http://192.168.1.195:3001/api/health/live  && echo " api OK"
curl -fsS http://192.168.1.105/                       >/dev/null && echo " web OK"

# F. Real LLM smoke test (will use ANTHROPIC + Tavily if graph mode)
# (run end-to-end SSE from graph-trace step 3)
```

---

## Subroutine: solve-v3-check  (TAG-65 — authenticated `/solve` endpoint deploy validation)

Use this whenever `POST /api/graph/solve` returns 401/403/500 for what looks like a valid login, or whenever `graph-agent` CrashLoopBackOffs after a fresh deploy.

The authenticated `/solve` route (TAG-50 epic) adds four hard requirements on the graph-agent container beyond the ones the legacy `/solve_v2` route needed:

| Env var | Must equal | Symptom if drifted |
|---|---|---|
| `JWT_SECRET` | `oppmon_api`'s `JWT_SECRET` | every `/solve` request returns 401 with a valid-looking cookie |
| `TAG_ENCRYPTION_MASTER_KEY` | `oppmon_api`'s `TAG_ENCRYPTION_MASTER_KEY` | `/solve` returns 500 "secret decrypt failed" or AEAD-tag-mismatch in logs |
| `DATABASE_URL` | host LAN DSN (NOT `localhost`) | `/solve` 500 with asyncpg connection refused; CrashLoopBackOff on boot |
| `OPENAI_EMBED_API_KEY` (or `OPENAI_API_KEY` fallback) | non-empty | corpus mode returns empty hits; embed factory raises on boot |

`ENABLE_SOLVE_V3=true` (default) is what mounts the route. Flip to `false` and redeploy to roll back without touching code.

### Step 1 — Did the container even start?

```bash
docker service ps oppmon_graph-agent --no-trunc | head -5
```

Look for `ENABLE_SOLVE_V3=true but required env vars are missing or empty: [...]` in the error column. That's `check_required_env()` (in `agent_search/agent_v2/app.py`) doing its job — the deploy operator forgot to `set -a && . apps/api/.env && set +a` before `docker stack deploy`. Fix:

```bash
cd ~/oppmon-agentic-workstation
set -a && . apps/api/.env && set +a
echo "${JWT_SECRET:0:6}... ${TAG_ENCRYPTION_MASTER_KEY:0:6}... ${DATABASE_URL:0:20}..."   # confirm non-empty
docker stack deploy --with-registry-auth -c docker-stack.yml oppmon
```

### Step 2 — Are the four vars actually in the running service spec?

```bash
docker service inspect oppmon_graph-agent \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep -E '^(JWT_SECRET|TAG_ENCRYPTION_MASTER_KEY|DATABASE_URL|OPENAI_EMBED_API_KEY|ENABLE_SOLVE_V3)='
```

Each should print `<KEY>=<non-empty>`. Empty value on the right of `=` means the shell that ran `docker stack deploy` didn't have the var exported — same fix as Step 1.

### Step 3 — JWT parity with `oppmon_api`

```bash
./scripts/check-jwt-parity.sh
# OK: JWT_SECRET parity confirmed (len=64) between oppmon_api and oppmon_graph-agent.
```

Exit 0 = parity. Exit 1 = mismatch or empty on one side; the script tells you which. Exit 2 = `docker service inspect` failed (re-check the deploy landed).

If mismatched: drift between `apps/api/.env` on the manager and the shell that deployed graph-agent. Re-source and redeploy as in Step 1.

### Step 4 — Master-key drift

There is no parity script for `TAG_ENCRYPTION_MASTER_KEY` because we never want to compare cleartext copies. Instead, if `/solve` returns 500 with "secret decrypt failed" or similar in `oppmon_graph-agent` logs:

- Confirm the env var is present (Step 2).
- Compare against the master key in the operator's password store. **Do not** rotate the master key here — every model-registry row in Postgres is AEAD-encrypted under the *previous* master, so rotation requires a coordinated re-encrypt pass (out of scope for this runbook).
- If the key is wrong, restore from the secrets store and redeploy. If the key is right, the ciphertext is wrong — re-mint the affected model rows from `apps/api`.

### Step 5 — End-to-end smoke

```bash
# Replace COOKIE with a logged-in session cookie copied from browser devtools.
curl -N -X POST http://192.168.1.195/api/graph/solve \
  -H 'Content-Type: application/json' \
  -H "Cookie: $COOKIE" \
  -d '{"inputs":"hello","enable_tools":false,"web_fallback":true,"collection_ids":[]}'
```

200 + SSE event stream = working. 401 = JWT drift (Step 3). 403 = tenant mismatch on the requested resource. 500 = master-key or DB drift (Step 4).

### Anti-patterns specific to this subroutine

- **Never log the JWT or master-key contents** while debugging. The parity script prints lengths, not values, on purpose.
- **Don't bypass `check_required_env`** by setting `ENABLE_SOLVE_V3=false` to "make it boot" in prod — that just hides the missing-secret symptom and leaves `/solve` un-mounted. Fix the env, don't disable the check.

---

## Anti-patterns (do NOT do these)

1. **Don't restart the swarm to "fix" missing env.** Restarting won't re-resolve `${VAR:-}` placeholders — only `docker stack deploy` with the var exported in shell will.
2. **Don't put secrets in `docker-stack.yml`.** Use shell-exported env + `${VAR:-}` interpolation, or `secrets:` blocks. The current pattern relies on shell — keep `apps/api/.env` as the source and always run `set -a && . apps/api/.env && set +a` before deploying.
3. **Don't bind-mount source on swarm to patch a bug.** Rebuild and bump the image tag. Bind mounts only exist in `docker-compose.override.yml` for local dev.
4. **Don't reuse an image tag.** Workers cache by tag. `webs.v2 → webs.v2.1 → webs.v3` is fine. `webs.v2 → webs.v2` is a deploy that does nothing on at least one node.
5. **Don't trust `Running` status.** A service can be `Running` and `1/1` with a broken upstream key. Always smoke the actual feature end-to-end.
6. **Don't set `NEXT_PUBLIC_*` in `docker-stack.yml environment:` and expect the browser to see it.** Those are baked at `next build` time. Pass them as `--build-arg` when building the web image.

---

## Quick reference — file → behavior map

| File | Where it's read |
|---|---|
| `apps/api/.env` | Loaded by api service via `env_file:` in stack. Also: source of shell env on manager before deploy. |
| `apps/agent_graph_backend/.env` | Only `docker-compose` + bind mount. **Ignored by swarm.** |
| `apps/web/.env.local` | Local dev only. Web prod image bakes vars from `--build-arg`. |
| `apps/web/Dockerfile` ARG block | Browser-visible `NEXT_PUBLIC_*` come from here. |
| `docker-stack.yml` `environment:` | Container env at runtime. Use `${VAR:-default}` for shell expansion. |
| `docker-stack.yml` `env_file:` | Path is relative to where `docker stack deploy` runs from. |
| `apps/web/src/app/(dashboard)/chat/page.tsx:~436` | Computes `web_fallback` — gates whether retriever calls web search at all. |
| `apps/agent_graph_backend/mindsearch/agent_v2/rag/retriever.py:~100` | Hard short-circuit on `web_fallback=false`. |
| `apps/agent_graph_backend/mindsearch/agent_v2/app.py` `_build_web_search` | Builds the `ChainedWebSearch` from `WEB_SEARCH_PROVIDER`. |

---

## Output format

After triage, always produce:

```
ROOT CAUSE: <one sentence — which of the 7 failure classes>
EVIDENCE:   <copy-paste of the diagnostic command output that proves it>
FIX:        <exact commands to run on the manager>
VERIFIED:   <copy-paste of the smoke test output showing the symptom is gone>
```

If a fix needs a code change + rebuild, also link to the file/line you touched.
