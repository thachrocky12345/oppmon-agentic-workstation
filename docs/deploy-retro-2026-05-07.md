# Deploy Retrospective — 2026-05-07 (API + Web to prod swarm)

## TL;DR

A "deploy api then web" job took ~1.5 hours instead of ~15 minutes because of six independent issues, none of which were code bugs the user pushed — they were tooling/state drift between the working tree, the swarm, and the database. Concrete fixes are at the bottom.

**End result:** `oppmon_api` ran dev's image with all dev fixes applied, `token_versions` table created, web admin unblocked (JWT_SECRET fix), web image `v79954` built but not yet pushed.

## Timeline of issues

| # | Symptom | Real cause | How long it cost |
|---|---|---|---|
| 1 | `pnpm: command not found` on host | Host doesn't have pnpm; only `nvm` node binaries | 2 min — typecheck skipped, build catches errors anyway |
| 2 | `apps/api/Dockerfile` was a legacy non-workspace npm build that won't compile a pnpm workspace | The proper workspace-aware Dockerfile lived only on `dev` branch; `main` had stale Dockerfile | ~10 min — reverse-engineered from `docker history oppmon-api:latest`, then user pointed to dev |
| 3 | `apps/api/docker-entrypoint.sh` missing on `main` | Same as #2 — only on `dev` | Bundled with #2 |
| 4 | API on `main` had camelCase raw SQL: `column "tenantId" does not exist` in `rag-retriever.ts` | Pre-existing bug on `main`; `dev` already had the snake_case fix | ~5 min — fixed locally, then discovered dev had it too |
| 5 | `prisma.tokenVersion.create() — table public.token_versions does not exist` | First `DB_AUTO_PUSH` ran against `main` schema (no `TokenVersion` model); when dev image deployed, the schema was already "pushed" so push didn't run again with new model | ~15 min — diagnosed; user applied SQL manually |
| 6 | `/admin` always 307 → `/login` even after successful login | `oppmon_web` service had no `JWT_SECRET` env var → middleware fell back to `'development-secret-change-in-production'` while API uses `'development-secret-key-change-in-production'` (extra `key-`) → JWT verify fails | ~10 min — found by env diff |
| 7 | Logs showed many `Called end on pool more than once` and `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL SIGKILL` errors | 4 service updates × 2 replicas = 8 dead containers logging the same shutdown bug. The errors are real but only fire during teardown — not request errors. | Confusing, not blocking |
| 8 | `docker push thachrocky/oppmon-web:vN` blocked by sandbox | Public registry push requires explicit user action | ~5 min waiting |

## Root causes, categorized

### A. Branch / source-of-truth drift
- `main` and `dev` had **substantially different** infra files: Dockerfile, docker-entrypoint.sh, `audit.ts` (writes to `audit_logs` vs `audit_log_v2`), `db.ts` (RLS-aware via `withTenant`), pending SQL migrations.
- `main`'s Dockerfile literally cannot build the workspace API. There is no scenario where `main` is "deployable."
- Nobody told the deploy tool that "deploy from main" is a category error — the skill assumes the working tree is the canonical source.

### B. Schema sync is order-dependent and the gate doesn't know it
- The `DB_AUTO_PUSH=true` entrypoint runs `prisma db push --accept-data-loss` against whatever schema is in **the current image**. So it must run on the **new image after deploy**, not before.
- I ran it on the old (main) image first → `token_versions` model wasn't in that schema → push didn't create the table → the new (dev) image started failing on every `register()`.
- Fix is operational: always (re)run `DB_AUTO_PUSH=true` cycle **after** the new image is deployed, never before.

### C. Web service config drift (JWT_SECRET)
- `apps/api/.env` has the source-of-truth JWT_SECRET. The API stack has it. The **web** stack didn't, so the Next.js edge middleware silently fell back to a different default and rejected every JWT.
- This passed local dev because both default fallbacks are identical there, but on prod the API's secret is set explicitly while the web's was unset.

### D. Multiple buggy raw-SQL files outside `rag-retriever.ts`
Still using `"camelCase"` quoted column refs in raw SQL — will keep producing 500s on hit:
- `apps/api/src/services/advanced-rag.ts` lines 329, 356–361, 615, 628–631, 660
- `apps/api/src/services/toolbox.ts` lines 255, 256, 468, 469, 470
- `apps/api/src/services/embedding.ts` lines 347, 363, 424
- `apps/api/src/services/rag-retriever.test.ts` lines 209, 233, 296, 297, 531, 544, 558 (test asserts old SQL — tests will fail until updated)

### E. Graceful-shutdown bug
- `apps/api/src/lib/db.ts:98 closePool()` is registered on multiple shutdown signals (`SIGTERM` + `beforeExit` is the usual pair). Both fire on real shutdown, second `pool.end()` throws `Called end on pool more than once`, container exits with non-zero code. Doesn't affect serving traffic.
- One-line fix: guard with `if (poolClosed) return; poolClosed = true;`.

### F. Pending DB migrations not yet applied
Three SQL files on dev that prod hasn't run (user opted to apply manually):
1. `apps/api/scripts/2026-05-07_pending_schema_patch.sql` — net-new tables: `api_keys`, `magic_link_tokens`, `agent_identities`, etc.
2. `apps/api/scripts/migrations/2026-05-08_rls_and_rbac.sql` — creates `oppmon_app` non-superuser DB role, seeds System Tenant, backfills `token_versions`, RLS policies, audit_logs BEFORE INSERT trigger.
3. `apps/api/scripts/migrations/2026-05-09_seed_model_pricing.sql` — global `model_pricing` rate cards (Anthropic / OpenAI / Cerebras / Ollama).

Until #2 is applied, **don't** flip `APP_DB_ROLE=oppmon_app` — the role doesn't exist and every API query will fail.

## What's deployed vs what's pending

| Component | State | Notes |
|---|---|---|
| `oppmon_api` image | dev branch HEAD (`b3296b8 Working great`) | image hash `a8e2b04...` |
| `oppmon_api` env | `.env` keys applied via `--env-add` | `APP_DB_ROLE=''` (RLS off until 2026-05-08 SQL applied) |
| `token_versions` table | ✅ created + 17 rows backfilled | manual `CREATE TABLE` + INSERT today |
| `skills.enabled` column | ✅ created via `prisma db push` | index `skills_enabled_idx` not yet created |
| 2026-05-07 patch SQL | ❌ not applied | user-manual |
| 2026-05-08 RLS SQL | ❌ not applied | user-manual |
| 2026-05-09 pricing SQL | ❌ not applied | user-manual |
| `oppmon_web` image | still v4 | new `v79954` built locally, push blocked |
| `oppmon_web` JWT_SECRET | ✅ matches API | applied via `--env-add` today |

## Concrete things to fix before next deploy

### Code / repo
1. **Delete or fix the legacy `apps/api/Dockerfile` and `apps/web/Dockerfile` on `main`.** They are dead code that produces a misleading green light. Either merge dev into main or carry a clear "main is unbuildable, deploy from dev" note in CLAUDE.md.
2. **Commit `apps/api/docker-entrypoint.sh` to the deploy branch** (it's already on `dev`).
3. **Fix `closePool()` idempotency** in `apps/api/src/lib/db.ts:98`. One liner.
4. **Fix the remaining camelCase raw-SQL bugs** listed in section D, and update `rag-retriever.test.ts` to assert snake_case.
5. **Bake `JWT_SECRET` requirement** into `apps/web` startup — fail fast if unset, instead of silently falling back to a non-matching default. Do the same for any other shared secrets that web + api both consume.

### Skill (`.claude/skills/prod-swarm-deploy/SKILL.md`)
1. Add a **"verify branch" preflight**: warn if the working tree isn't `dev` (or whatever the canonical deploy branch is).
2. Reorder the **schema-sync step** to come **after** the new image is deployed, with an explicit note: "running this before swapping the image is a no-op against old schema."
3. Add a **stack file source**: either commit `docker-stack.yml` to the repo, or document that `docker service inspect oppmon_api` is the source of truth and provide the exact `service update --env-add` invocation.
4. Document the **reverse proxy in front of the swarm** (oppmon.com → swarm). Several "404" diagnoses today were confused by the proxy hop.
5. Add a **JWT_SECRET parity check** to the smoke step: web's middleware secret must equal API's signing secret.

### Operational discipline
1. **One service update per deploy**, not four. Today's update sequence (main→AUTO_PUSH on→off→dev) created 8 dead containers, all of which logged the same shutdown bug, and produced log noise that was hard to filter from real errors.
2. **Smoke before declaring done.** I declared API "converged" 3 times today; the converge signal only means swarm placed the task, not that it serves traffic correctly. Always run register + `/auth/me` round-trip after every deploy.
3. **Apply DB migrations before deploying code that depends on them.** The user's preference is manual SQL — that's fine, but it must come **first**.

## Open follow-ups (with owners)

| Item | Owner | Blocker for |
|---|---|---|
| Push `thachrocky/oppmon-web:v79954` to Docker Hub | user (manual) | web service swap |
| Apply 3 pending SQL migrations | user (manual) | enabling RLS, model pricing, api_keys/magic_links |
| Flip `APP_DB_ROLE=oppmon_app` after 2026-05-08 SQL | claude (after user signal) | RLS enforcement |
| Create `skills_enabled_idx` (optional) | user (manual) | none — perf only |
| Fix `closePool()` double-fire | next code change | nothing critical |
| Fix camelCase SQL in `advanced-rag.ts`, `toolbox.ts`, `embedding.ts` | next code change | RAG / toolbox endpoints |
| Merge `dev` → `main` so the deploy branch matches the documented branch | next code change | future deploys from `main` |
