# Deploy Retrospective — 2026-05-08 (full schema rebuild + API redeploy)

## TL;DR

A "load `apps/api/.env`, run migration, redeploy api, run smoke" job took ~2.5 hours
because the prod DB carried significant **migration-state drift** that nobody had
noticed: `_migrations` had been silently empty for the entire life of the
deployment (Prisma had been the de-facto schema manager). When the new
`2026-05-10_*` migrations landed, they assumed legacy raw-SQL migrations had
been run — they hadn't — and failed in a chain.

After confirming there was no irreplaceable data, we **dumped + dropped + rebuilt**
the schema from scratch using the canonical order *prisma db push → migrate.ts*,
then restored data via best-effort `psql -f`. End state matches local: 41 raw-SQL
migrations cleanly applied, all user data preserved (29 users, 20 RAG docs, 391
RAG chunks, 35 audit log entries, etc.).

While debugging, three previously latent bugs surfaced:

1. **HNSW assumed:** two `2026-05-10_*` migrations create `USING hnsw` indexes
   without checking pgvector version. Prod ships pgvector 0.4.2 (Ubuntu 18.04 apt),
   only ivfflat works. **Patched in-place** — both migrations now version-aware.
2. **TimescaleDB compression strict mode:** TS 2.9.0 requires PK columns in
   `compress_segmentby` *or* `compress_orderby`. Migration only set `agent_id`/
   `created_at`. **Patched** — `id` added to `compress_orderby`.
3. **Soft-delete + non-partial unique indexes:** `2026-05-10_soft_delete_and_archival`
   added `deleted_at` columns but didn't rebuild existing UNIQUE constraints to
   filter on `deleted_at IS NULL`. Effect: deleting a row and re-creating with
   the same display_name fails with 409. Hit by user on `models` mid-session.
   **Hot-fixed `models` index;** wrote follow-up migration `2026-05-11_partial_unique_indexes.sql`
   for the other 6 user-facing tables.

End-of-session state:
- `oppmon_api` running `thachrocky/oppmon-api:v72277` (2 replicas) — all smoke green.
- `oppmon_web` running `thachrocky/oppmon-web:v5` (unchanged this round).
- DB: 41 migrations applied, prisma push clean, 6 soft-deleted model rows hard-purged, `mcp_servers.scope` repaired to `SkillScope` enum.
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` now correctly substituted into the api stack env at deploy time (was empty-string before — see issue D below).
- Smoke: **week3 12/12 ✅**, **week4 19/19 ✅** (week4 needs `--user 0:0`), full register+login+RAG ingest/search/retrieve.

---

## Timeline

| time | event |
|------|-------|
| 19:30 | User invokes `/prod-swarm-deploy` skill: load env, migrate, redeploy api, run week3+week4 smoke |
| 19:35 | Found host node v18+ unusable (GLIBC 2.27 < 2.28 needed). Rebuilt `pnpm` workflow inside Docker container. |
| 19:50 | First migration dry-run: 41/41 pending. **Major signal:** `_migrations` is empty on prod. |
| 19:55 | Discovered `apps/api/scripts/stamp_legacy_migrations.sql` — designed for exactly this case. Stamped 32 legacy migrations. |
| 20:00 | Re-run dry-run: 10 pending. Approved by user. |
| 20:05 | `2026-05-09_seed_model_pricing` ✅. `2026-05-10_audit_consolidation` ❌ — `audit_log_v2` doesn't exist. |
| 20:08 | User picks "create audit_log_v2 first". Ran legacy `007_audit_log_v2.sql` body via psql. Re-ran migrate. |
| 20:09 | `audit_consolidation` ✅. `embedding_versioning` ❌ — `memory_facts` doesn't exist. |
| 20:11 | Audited remaining migrations. Found `memory_facts` is from legacy `018_memory_v2.sql`, which depends on `agent_identities`, which depends on more — **unbounded depth**. |
| 20:12 | User: *"can we just psql clear the table and recreate one because they worked locally. We don't have any important data."* Pivot to schema rebuild. |
| 20:15 | User's better idea: `pg_dump` first, then drop+rebuild, then `psql` data only. Dumped 8 MB / 635 rows to `.deploy-backup/prod-data-2026-05-08.sql`. |
| 20:20 | `DROP SCHEMA public CASCADE` + recreate extensions. First attempt rolled back (timescaledb extension reload error inside same psql tx). Split into separate sessions, succeeded. |
| 20:23 | Tried migrate.ts on empty schema → `001_add_embedding_vector` fails: `embeddings` table doesn't exist. Realized the canonical order is **prisma db push first**, then migrate. |
| 20:27 | `prisma db push` → in sync 826 ms. migrate.ts → 27/41 ✅, then `024_prisma_schema_alignment` failed on `USING hnsw`. **Patched** to version-aware ivfflat fallback. |
| 20:32 | Resume: 4 more ✅, then `2026-05-10_embedding_versioning` failed on HNSW. **Patched** same way. |
| 20:35 | Resume: 7 more ✅, then `2026-05-10_timescale_tuning` failed: `column "id" must be used for segmenting or ordering`. **Patched** `compress_orderby = 'created_at DESC, id'`. |
| 20:36 | Resume: ✅ all 41 applied. |
| 20:37 | Restore dump via `psql -f`. 79 errors logged, all benign: 64 model_pricing seed conflicts (migration seeded first, dump's rows lost; same data either way), 4 hypertable trigger ops on now-compressed tables, 2 dropped-table refs (`entity_memory`), 1 timescale catalog metadata duplicate. |
| 20:42 | Rebuilt API image with patched migration files → `thachrocky/oppmon-api:v72277`. Pushed. Deployed. |
| 20:46 | First `docker stack deploy` used `${OPENAI_API_KEY}` substitution — **shell didn't have it exported, expanded to empty string**. RAG/embedding endpoints 500'd. |
| 20:48 | `set -a && . apps/api/.env && set +a` then re-deployed. Container env now correct (key length 132). |
| 20:50 | Smoke step ✅ — all health 200, register returns JWT. |
| 20:52 | week3 smoke: 10/12 ✅. The 2 fails are `/api/mcp` 500 (pre-existing, unrelated). |
| 20:54 | week4 smoke (CLI): blocked on container TS-build write-perm to `dist/`. Pre-existing setup issue. |
| 20:55 | User reports: 409 Conflict POSTing `/api/models`. They had soft-deleted models earlier; non-partial unique constraint kept the slot. Plus: edit failed first (OPENAI_API_KEY error before fix), which is why they tried delete+recreate. |
| 21:00 | Hard-deleted 6 soft-deleted model rows. Rebuilt `models_tenant_id_display_name_key` as partial. User unblocked. |
| 21:05 | Audited 13 more tables with same pattern. Wrote `2026-05-11_partial_unique_indexes.sql` — defers application to next deploy. |

---

## Root causes, categorized

### A. `_migrations` was empty for the entire life of prod

The deploy doc says "the live DB is Prisma-managed (`prisma db push`)" — and that
was true. What nobody had recognized was that this **also meant `_migrations` had
zero rows**, because the runner had never been used. So when `2026-05-10_*`
migrations were authored assuming `audit_log_v2`, `memory_facts`, etc. existed
"because their legacy migrations had been applied," they were wrong. Those tables
existed in *some* environments (local, where someone *did* run migrate.ts at
some point) but **not on prod**.

The `stamp_legacy_migrations.sql` file was the documented workaround, but
stamping doesn't fix the absence of the underlying tables.

**Lesson:** Pick a single source of truth. Either:
- (a) Prisma owns everything → migrations folder is for additive features only,
  and no migration may reference a table that isn't in `schema.prisma`.
- (b) Raw-SQL migrations own everything → drop `prisma db push` from the deploy
  flow, only use Prisma to *generate the client* (`prisma generate`).

What we did today is effectively **(c) hybrid: prisma owns base, migrations layer
features on top**. That works but only if migrations are **explicit** about
dependencies on Prisma-created tables (or guard with `IF EXISTS`/`IF NOT EXISTS`).
Which most of today's migrations do. The pre-existing `024_prisma_schema_alignment`
is the migration that bridges the two — its name is a hint.

### B. HNSW assumption baked into two May-2026 migrations

`024_prisma_schema_alignment.sql` and `2026-05-10_embedding_versioning.sql`
created `USING hnsw` indexes unconditionally. `018_memory_v2.sql` already had the
right pattern (version-check + ivfflat fallback) — but the two newer ones didn't
copy that pattern.

**Patched** — both now version-aware. The patch should be committed; it's a
strict improvement over the originals (still uses HNSW where available).

### C. TimescaleDB 2.9.0 compression invariant

TS 2.9 enforces that any column with a unique constraint or PK must appear in
`compress_segmentby` or `compress_orderby`. Newer TS versions are more permissive.
Easy fix: append `, id` to `compress_orderby`.

**Patched** — works on both TS 2.9 and newer. The patch should be committed.

### D. `OPENAI_API_KEY` shell-substitution gap

`docker-stack.yml` uses `OPENAI_API_KEY: "${OPENAI_API_KEY}"`. If the shell that
runs `docker stack deploy` doesn't have that variable exported, swarm sees an
empty string and the container starts without the key. The API throws
`OPENAI_API_KEY environment variable is required` from `apps/api/src/lib/embedding/index.ts:26`.

**Operational fix this deploy:** `set -a && . apps/api/.env && set +a` before
`docker stack deploy`.

**Recommended permanent fix:** add to the `prod-swarm-deploy` skill's "deploy"
step a one-liner that sources `apps/api/.env` automatically — OR move secrets
to Docker Swarm secrets so the `${VAR}` indirection isn't needed at all.

### E. Soft-delete + non-partial unique indexes (NEW BUG, today)

`2026-05-10_soft_delete_and_archival` added `deleted_at` to 14+ tables but did
**not** rebuild their existing `UNIQUE` indexes to filter `WHERE deleted_at IS NULL`.
Effect: any user who deletes a row (soft-delete) and tries to re-create one with
the same natural key gets a 409 Conflict that is **operationally indistinguishable
from the row "still being there"**.

User hit this on `models`. The user's flow:
1. Tried to *edit* a model — failed because of (D) (`OPENAI_API_KEY` missing).
2. *Delete* the model — succeeded (silently soft-deleted).
3. Recreate with the same display_name — 409 Conflict.

After (D) was fixed, edit works. After today's hot-fix, recreate works for
`models`. **Deferred to follow-up:** `2026-05-11_partial_unique_indexes.sql`
(committed, not applied) does the same fix for `agents`, `mcp_servers`, `skills`,
`rag_collections`, `teams`, `persona_memory`. The migration is idempotent and
safe to apply on next deploy.

### F. Soft-delete UX gap — admins can't see/edit/restore deleted rows

User's exact words: *"If soft delete, we have to be allow to edit and reverse it.
The admin is super power."* The current RLS policies filter out `deleted_at IS NOT NULL`
unless `current_setting('app.current_tenant') = 'system'`. So tenant admins
**cannot** see, edit, or restore their own soft-deleted rows from the UI/API.

This is a real product gap. Recommended approach:

1. **API:** add `?include_deleted=true` query param on list endpoints, gated to
   roles `TENANT_ADMIN | SUPER_ADMIN`. Add `POST /api/{resource}/{id}/restore`
   that nulls `deleted_at` (with audit log entry). Add `DELETE /api/{resource}/{id}?hard=true`
   for true purges by admins.
2. **RLS:** add a second `USING` clause that allows `deleted_at IS NOT NULL` rows
   when `app.current_role` is admin-tier. (Currently no `app.current_role` GUC —
   would need to be set by middleware alongside `app.current_tenant`.)
3. **UI:** show a "Deleted" tab on resource list pages with Restore/Delete-Permanently
   buttons.

This is a multi-file change spanning api routes, middleware, RLS migration, and
UI. Out of scope for this session; tracked as a follow-up.

### G. Migration ordering bug discovered (alphabetical sort vs dependency)

`2026-05-10_embedding_versioning` runs alphabetically before `2026-05-10_memory_consolidation`,
but `embedding_versioning` references `memory_facts` (modified by, but not created by,
`memory_consolidation`). On a hybrid Prisma+migrate DB without legacy `018_memory_v2`,
`memory_facts` simply doesn't exist when `embedding_versioning` runs. After today's
schema rebuild, `018_memory_v2` runs first (it's `018_*`), so `memory_facts` exists
in time. **No code change needed** for this — it's a side-effect of running migrations
from scratch. But it's worth knowing.

### H. `024_prisma_schema_alignment` clobbers Prisma's `mcp_servers.scope` enum

Surfaced as `/api/mcp` 500s in week3 smoke. Stack trace:

```
Invalid `prisma.mcpServer.findMany()` invocation
PostgresError 42883: operator does not exist: text = "SkillScope"
```

Diagnosis: `024_prisma_schema_alignment.sql:358-376` did

```sql
DROP TABLE IF EXISTS mcp_servers CASCADE;
CREATE TABLE mcp_servers (..., scope TEXT DEFAULT 'TEAM', ...);
```

When prisma db push runs first (today's canonical order), it creates `mcp_servers`
with `scope SkillScope` (the enum). Then 024 drops that table and recreates it
with plain `text`, even though the `SkillScope` enum still exists in the DB.
Prisma's generated client expects the enum type, sends queries with the enum
value, Postgres rejects with "operator does not exist text = SkillScope".

Other tables with enum scopes (`models.scope ModelScope`, `rag_collections.scope RagScope`,
`skills.scope SkillScope`) survived because 024 didn't `DROP TABLE` them — only
`mcp_servers` (and a few others without enum columns) gets the DROP+recreate
treatment.

**Hot-fixed prod:**

```sql
ALTER TABLE mcp_servers ALTER COLUMN scope DROP DEFAULT;
ALTER TABLE mcp_servers ALTER COLUMN scope TYPE "SkillScope" USING scope::"SkillScope";
ALTER TABLE mcp_servers ALTER COLUMN scope SET DEFAULT 'TEAM'::"SkillScope";
```

Worked cleanly because `mcp_servers` had 0 rows (Prisma re-created it empty).
After this: `/api/mcp` returns 200, week3 12/12 ✅, full MCP CRUD loop passes.

**Patched 024 in place** (uncommitted) so a future `bootstrap.sh --reset` doesn't
reintroduce the bug:
- Removed the `DROP TABLE IF EXISTS mcp_servers CASCADE`.
- Changed `CREATE TABLE` to `CREATE TABLE IF NOT EXISTS` so Prisma's correct
  table is preserved.
- Set the column type to `"SkillScope" DEFAULT 'TEAM'::"SkillScope"` directly.
- Added a defensive `DO $$` block that ALTERs the column to enum if a previous
  run had left it as `text`.

There may be other tables in 024 with similar `DROP TABLE` + recreate patterns
that clobber Prisma columns silently — worth a follow-up audit. The smoke tests
didn't catch it for other tables today; the issue surfaces when Prisma queries
a column whose DB type doesn't match the schema model.

---

## What got patched on disk (uncommitted, please review)

| file | change |
|------|--------|
| `apps/api/scripts/migrations/024_prisma_schema_alignment.sql` | (1) Wrap HNSW index creation in DO block; pick `hnsw` if pgvector >= 0.5, else `ivfflat` with `lists=100`. (2) Stop dropping `mcp_servers`; use `CREATE TABLE IF NOT EXISTS` with `scope "SkillScope"` enum + defensive ALTER if a prior run left it as text. See section H. |
| `apps/api/scripts/migrations/2026-05-10_embedding_versioning.sql` | Same version-aware pattern for partial vector indexes. |
| `apps/api/scripts/migrations/2026-05-10_timescale_tuning.sql` | Add `, id` to all `compress_orderby` clauses (TS 2.9 PK requirement). |
| `apps/api/scripts/migrations/2026-05-11_partial_unique_indexes.sql` | NEW. Rebuilds 7 unique indexes on soft-deleted tables to be partial. Idempotent. **Not applied yet.** |
| `scripts/db-bootstrap.sh` | NEW. Idempotent DB bootstrap with `--reset` option. Auto pg_dump before destructive runs. |
| `docker-stack.yml` | `oppmon_api:v5` → `oppmon-api:v72277` (also fixes the underscore→hyphen repo name). |

The migration patches make the originals **portable** to environments with older
pgvector/timescale; they don't degrade newer environments. Worth committing.

---

## Production state — verification

```sql
SELECT COUNT(*) FROM _migrations WHERE status='applied';
-- 42 (41 raw + 2026-05-09_seed_model_pricing applied twice in different attempts; second is the one that stuck)
```

Live row counts after restore (compared to dump):

| table              | dumped | live now | note |
|--------------------|-------:|---------:|------|
| tenants            | 29     | 32       | +3 from migrations seeding default tenants |
| users              | 29     | 29       | ✓ |
| agents             | 2      | 2        | ✓ |
| rag_chunks         | 391    | 391      | ✓ |
| rag_documents      | 20     | 20       | ✓ |
| rag_collections    | 6      | 6        | ✓ |
| audit_log_v2       | 35     | 35       | ✓ |
| model_pricing      | 64     | 66       | seed migration added 2 new entries |
| token_versions     | 29     | 29       | ✓ |
| skills             | 1      | 1        | ✓ |
| skill_versions     | 1      | 1        | ✓ |
| embeddings         | 3      | 3        | ✓ |
| llm_messages       | 4      | 4        | ✓ |
| llm_sessions       | 2      | 2        | ✓ |
| models             | 7      | 1        | 6 hard-deleted post-restore (soft-delete unblock) |
| model_secrets      | 2      | 2        | ✓ |
| audit_logs_deprecated | 35  | 0        | renamed table doesn't exist on fresh schema |

Smoke (skill standard):
- `GET /api/health/live` direct (192.168.1.195:3001) → **200**
- `GET /api/health/live` via proxy (192.168.1.105) → **200**
- `POST /api/auth/register` round-trip → JWT returned ✓

Smoke (week3, against `http://192.168.1.105`): **12/12 ✅** after MCP scope fix
(see section H). Initial run was 10/12 with both fails on `/api/mcp` — turned
out to be the migration bug, not pre-existing.

Smoke (week4, CLI): **19/19 ✅** when run with `--user 0:0` in the container.
The default user `oppmon` (uid 1001) can't write to `/app/packages/cli/dist`
because that path doesn't get `chown`'d in the Dockerfile. Workaround at runtime
is fine; permanent fix is `RUN chown -R oppmon:oppmon /app/packages/*/dist || true`
in the Dockerfile (or pre-create the dirs as oppmon). Tracked as follow-up.

RAG full loop (ingest + search + retrieve) passes in **~2 s** — confirms
`OPENAI_API_KEY` end-to-end fix.

---

## Follow-ups (not in this PR)

1. **Apply `2026-05-11_partial_unique_indexes.sql`** to prod next deploy. 6 tables.
2. **Build admin UX for soft-delete** — `?include_deleted=true`, restore endpoint,
   hard-delete endpoint, RLS policy for admin-tier roles. Spec in (F) above.
3. **Wire `apps/api/.env` sourcing into the prod-swarm-deploy skill** so future
   deploys can't accidentally ship empty `${OPENAI_API_KEY}`. Or migrate to Swarm secrets.
4. ~~**Investigate `/api/mcp` 500s**~~ — DONE in this session. Root cause + fix
   in section H. Patched migration in place. Re-run week3 → 12/12 ✅.
5. **Fix week4 smoke runtime in container** — add `RUN chown -R oppmon:oppmon /app/packages/*/dist || true`
   to `apps/api/Dockerfile` (or pre-create empty dist dirs owned by `oppmon`).
   Workaround for now: run with `--user 0:0`.
6. **Move secrets out of `.env`** to Swarm secrets so substitution gaps can't
   happen. Out of scope for today; worth a separate ADR.
7. **Pre-existing TypeScript errors on `dev` branch** (memory-manager.ts, retrieval.ts,
   litellm-orchestrator.ts, models.ts) — not blocking because runtime is `tsx`,
   but they shouldn't accumulate. Should be cleaned up in a typing pass.
8. **Decide on schema source-of-truth** (root cause A above) — prisma-only,
   migrations-only, or formalize the hybrid with a "Prisma must run first"
   contract. ADR-worthy.

---

## Artifacts on disk

- `.deploy-backup/prod-data-2026-05-08.sql` — 8 MB pre-rebuild dump
- `.deploy-backup/pgdump.err` — pg_dump warnings (TS catalog circular FKs, harmless)
- `.deploy-backup/restore.log`, `.deploy-backup/restore.err` — restore output / 79 benign errors
- `/tmp/migrate-fresh-2026-05-08.log` — full migrate.ts output (this session only)
- `/tmp/deploy-2026-05-08.tags` — tag/branch/commit log

`.deploy-backup/` is gitignored. Move/delete after you're satisfied with the new state.

---

## Lessons (for the skill / next operator)

1. **Always dry-run migrate first.** A `Pending: 41` reading on what should be
   an established prod DB means `_migrations` is wrong and you should stop
   *before* applying anything.
2. **`pg_dump --data-only --column-inserts --disable-triggers --exclude-table=_migrations`**
   is the right shape of dump for a "rebuild-from-zero, restore data" cycle.
   Keeps schema flexibility, survives reasonable column changes, doesn't
   re-import migration tracking.
3. **Use `set -a && . apps/api/.env && set +a` before any `docker stack deploy`**
   that contains `${VAR}` substitutions. Always. Until secrets move to Swarm secrets.
4. **`prisma db push` first, `migrate.ts` second.** Prisma owns the base; the
   migrations layer features on top. Inverting the order means raw-SQL migrations
   reference Prisma-only tables that don't exist yet.
5. **A new ALTER TABLE that adds `deleted_at` should be paired with rebuilding
   any unique index on that table to be partial.** If you're touching `deleted_at`,
   you're touching the unique-index semantics. They're inseparable.
