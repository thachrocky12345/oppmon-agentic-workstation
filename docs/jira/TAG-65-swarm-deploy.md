# TAG-65: Swarm Deploy Hardening + ADR

## Description

**Suggested Points:** 2
**Type:** Story / DevOps
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Wire the new env vars into the production Docker Swarm stack, add deploy-time
parity checks for the JWT and master-key secrets, and capture the architecture
decision in an ADR. Closes the epic by making the new endpoint actually
reachable from `apps/web` in prod.

## Objective

After this ticket, a fresh `docker stack deploy` from a clean shell:

- Loads `JWT_SECRET`, `SECRET_VAULT_MASTER_KEY`, `DATABASE_URL`,
  `OPENAI_EMBED_API_KEY` into the `graph-agent` service.
- Refuses to start if any of those vars are empty (fail-fast at container init).
- Verifies `JWT_SECRET` parity with `oppmon_api` at deploy time.
- Routes `apps/web` /api/graph/solve proxy → `http://graph-agent:8002/solve`
  via the existing overlay network.

## Requirements

### `docker-stack.yml` additions

Under `services.graph-agent.environment`:

```yaml
graph-agent:
  image: thachrocky/mindsearch:<bumped-tag>
  environment:
    # existing
    LLM_PROVIDER: "${LLM_PROVIDER:-anthropic}"
    ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY:-}"
    TAVILY_API_KEY: "${TAVILY_API_KEY:-}"
    WEB_SEARCH_PROVIDER: "${WEB_SEARCH_PROVIDER:-tavily}"
    # new (TAG-50)
    DATABASE_URL: "${DATABASE_URL:-}"
    JWT_SECRET: "${JWT_SECRET:-}"
    SECRET_VAULT_MASTER_KEY: "${SECRET_VAULT_MASTER_KEY:-}"
    OPENAI_EMBED_API_KEY: "${OPENAI_EMBED_API_KEY:-}"
    EMBEDDING_MODEL: "${EMBEDDING_MODEL:-text-embedding-3-small}"
    EMBEDDING_DIM: "${EMBEDDING_DIM:-1536}"
    ENABLE_SOLVE_V3: "${ENABLE_SOLVE_V3:-true}"
```

Per the `swarm-debug` skill: these `${VAR:-}` placeholders resolve from the
**shell that ran `docker stack deploy`**, not from any `.env` file. Document
this in the runbook section below.

### Fail-fast container init

`apps/agent_graph_backend/mindsearch/v2_server.py` (or `agent_v2/app.py`)
startup adds:

```python
def _check_required_env():
    s = settings
    missing = []
    if s.enable_solve_v3:
        for name, val in [
            ("JWT_SECRET",              s.jwt_secret),
            ("SECRET_VAULT_MASTER_KEY", s.secret_vault_master_key),
            ("DATABASE_URL",            s.database_url),
            ("OPENAI_EMBED_API_KEY",    s.openai_embed_api_key or s.openai_api_key),
        ]:
            if not val:
                missing.append(name)
    if missing:
        raise SystemExit(f"required env vars missing: {missing}")
```

Container CrashLoopBackOff is the desired signal — operator sees it in
`docker service ps oppmon_graph-agent` immediately.

### JWT parity check (deploy-time)

New script `scripts/check-jwt-parity.sh`:

```bash
# Verifies oppmon_api and oppmon_graph-agent share JWT_SECRET.
A=$(docker service inspect oppmon_api          --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep '^JWT_SECRET=' | head -1)
G=$(docker service inspect oppmon_graph-agent  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep '^JWT_SECRET=' | head -1)
[ -n "$A" ] && [ "$A" = "$G" ] || { echo "JWT_SECRET MISMATCH"; exit 1; }
echo "JWT_SECRET parity OK"
```

Run from the prod-swarm-deploy skill after every stack deploy.

### Web proxy

`apps/web/src/app/api/graph/solve/route.ts` — same-origin proxy mirroring the
existing `/api/graph/solve_v2` proxy but pointing at `/solve` and forwarding the
user's `Authorization: Bearer` header. No new auth in the web layer; the
existing middleware already verifies the cookie and the proxy mints/forwards a
Bearer token.

### ADR

`docs/decisions/ADR-NNNN-authenticated-solve-endpoint.md` covering:

- Why HS256 shared-secret JWT (vs RS256 or remote `/me`).
- Why `asyncpg` direct (vs ORM).
- Why per-request `LLMClient` (vs cached).
- Why corpus mode runs the same `PlannerAgent` (vs separate orchestrator).
- Why 403 on cross-tenant model lookup (vs 404).
- Why decryption lives in `agent_search` (vs `apps/api` minting short-lived tokens).

Number assigned at merge time; place file in `docs/decisions/` and add an entry
to `docs/decisions/index.md`.

### Runbook update

Append a section to `.claude/skills/swarm-debug/SKILL.md`:

```
### Subroutine: solve-v3-check
- env-check additionally must show DATABASE_URL, JWT_SECRET, SECRET_VAULT_MASTER_KEY.
- run scripts/check-jwt-parity.sh after every deploy.
- if /solve returns 401 for valid-looking JWT: JWT_SECRET drift — re-export from apps/api/.env on manager and redeploy.
- if /solve returns 500 "secret decrypt failed": SECRET_VAULT_MASTER_KEY drift — keys encrypted under a different master will all fail; restore master from the secrets store, do NOT rotate without re-encrypting all rows.
```

## Implementation Notes

- The new env vars MUST be present in `apps/api/.env` on the manager (the file
  consulted by the deploy operator's `set -a && . apps/api/.env && set +a`),
  even though `graph-agent` doesn't `env_file:` from it. The deploy-time shell
  expansion is the path.
- Image tag bump follows the existing convention (`webs.v3`, `auth.v1`, etc).
- `ENABLE_SOLVE_V3=false` is the rollback knob — flipping it and redeploying
  un-mounts the `/solve` route without removing code.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/deploy/test_required_env.py` | start w/o `JWT_SECRET` → SystemExit | exit code != 0 |
| `tests/deploy/test_required_env.py` | start w/ all set → boots | smoke 200 on /health |
| `scripts/check-jwt-parity.sh` | mismatched secrets → exit 1 | |
| `scripts/check-jwt-parity.sh` | matching secrets → exit 0 | |

## Acceptance Criteria

- [ ] `docker stack deploy` from a shell missing any required var → graph-agent
      CrashLoopBackOff with clear log line.
- [ ] JWT parity script integrated into the prod-swarm-deploy skill.
- [ ] ADR merged and linked from `docs/decisions/index.md`.
- [ ] swarm-debug skill includes `solve-v3-check` subroutine.
- [ ] Web proxy at `/api/graph/solve` reachable from `apps/web`.
- [ ] Smoke: SSE response with citations through the full prod stack.

## Dependencies

**Depends on:** TAG-64 (epic must be green before deploy hardening lands)
**Blocks:** none (closes the epic)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Operator forgets to export new env vars | Fail-fast container init + swarm-debug runbook entry. |
| `SECRET_VAULT_MASTER_KEY` rotated without re-encryption | Documented in runbook; rotation is out-of-scope here. |
| Web proxy bypasses auth (e.g. proxies anon traffic) | Existing middleware already gates `/api/*` to authenticated sessions; proxy inherits. |
| Image tag reuse breaks worker | Convention: always bump tag; documented in prod-swarm-deploy skill. |
