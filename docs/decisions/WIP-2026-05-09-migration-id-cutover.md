# WIP — Migration ID Cutover & model_pricing Seed (2026-05-09)

> **Status:** in progress. This document is a handoff so a future session can
> resume without re-discovering context. Update the "Where we are" section
> after each step.

## Goal

Two intertwined problems that block `pnpm --filter @oppmon/api migrate` from
completing on the live (Prisma-managed) DB:

1. **`model_pricing` table doesn't exist** — needed by `/api/admin/pricing`
   route and by usage cost-attribution. The new seed migration
   `2026-05-09_seed_model_pricing.sql` creates the table and inserts public
   rate cards for Anthropic, OpenAI, Cerebras, and Ollama (~63 rows).
2. **Legacy raw-SQL migrations conflict with Prisma `db push`-managed tables.**
   Live DB was created by `prisma db push` so `tenants`, `users`,
   `mcp_servers`, `agents`, `models`, `audit_logs` exist with TEXT cuid ids
   and Prisma's column set. The legacy migrations under
   `apps/api/scripts/migrations/` were written assuming SERIAL/INTEGER ids and
   the pre-Prisma column set, so re-running them blows up with:
     - `Key columns "mcp_server_id" and "id" are of incompatible types: integer and text`
     - `column "plan" of relation "tenants" does not exist`
     - …and probably more.

## Strategy

- **All ids → TEXT/cuid.** Convert every `SERIAL/BIGSERIAL PRIMARY KEY` to
  `TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`, and every
  `INTEGER/BIGINT REFERENCES` to `TEXT REFERENCES`. Add
  `CREATE EXTENSION IF NOT EXISTS pgcrypto` to `000_base_schema.sql` for
  `gen_random_uuid()` portability across PG 12/13+.
- **Idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS`.** When a legacy
  migration assumes a column that Prisma never created, add it defensively
  rather than relying on `CREATE TABLE IF NOT EXISTS` (which is a no-op when
  the table already exists).
- **Skip TimescaleDB hypertable internal `id` columns.** Hypertables (traces,
  spans, node_metrics) use `id BIGSERIAL` without a standalone PK and have no
  FK targets. Leaving them alone — they're internal counters.

## Where we are

### ✅ Done

- `000_base_schema.sql`
  - 22 `id SERIAL PRIMARY KEY` → `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`
  - 4 INTEGER FK columns → TEXT (`workflow_runs.workflow_id`,
    `calendar_items.linked_approval_id`, `calendar_items.linked_task_id`,
    `mcp_server_agents.mcp_server_id`, `mcp_proxy_logs.server_id`)
  - Added `CREATE EXTENSION IF NOT EXISTS pgcrypto`
- `004_notifications.sql` — 2 ids → TEXT
- `005_push_subscriptions.sql` — 1 id → TEXT
- `006_user_accounts.sql` — `users.id` and `user_sessions.user_id` → TEXT
- `007_audit_log_v2.sql` — `audit_log_v2.id` BIGSERIAL → TEXT
- `010_api_keys_magic_links.sql` — both ids + `user_id` FK → TEXT
- `016_youtube_channels.sql` — id → TEXT
- `017_journal.sql` — 3 BIGSERIAL ids → TEXT, 2 BIGINT FKs → TEXT
- `018_memory_v2.sql` — `source_entry_id` BIGINT → TEXT
- `020_work_items.sql` — 3 BIGSERIAL ids + 2 BIGINT FKs + `depends_on BIGINT[]` → all TEXT
- `023_memory_relevance_feedback.sql` — id + turn_id → TEXT, dropped sequence GRANT
- `2026-05-09_seed_model_pricing.sql` — new file; CREATE TABLE
  `model_pricing` with full superset of columns + ~63 row seed
- `001_create_tenants.sql` — added defensive ADD COLUMN for `plan`, `domain`,
  `metadata`, `settings` so the legacy INSERT works against a Prisma-created
  `tenants` table
- `004_notifications.sql` — added defensive ADD COLUMN for all `notifications`
  and `notification_preferences` columns (legacy `CREATE TABLE` was bare, no
  `IF NOT EXISTS`; Prisma may have created partial tables).
- `006_user_accounts.sql` — full consolidation:
  - Switched bare `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS` for both
    `users` and `user_sessions` (was the source of the `relation "users"
    already exists` error).
  - Added defensive `ALTER TABLE ADD COLUMN IF NOT EXISTS` for legacy-only
    columns: `users.display_name`, `users.last_login_at`,
    `user_sessions.token_hash`, `user_sessions.ip_address`,
    `user_sessions.user_agent`.
  - **Dropped the legacy role CHECK constraint** — its values
    (`owner/admin/operator/viewer/tenant_user`) conflict with Prisma's
    Role enum (`SYSTEM_ADMIN/TENANT_ADMIN/TEAM_ADMIN/MEMBER`). Role
    validation lives in the API layer (`requireRole` middleware).
  - Changed `user_sessions.id` from `UUID` to `TEXT` to match Prisma cuid.
- `007_audit_log_v2.sql` — full consolidation:
  - Switched bare `CREATE TABLE` and `CREATE INDEX` → `... IF NOT EXISTS`.
  - Wrapped the `REVOKE UPDATE, DELETE ON audit_log_v2 FROM mcadmin` in a
    `DO` block guarded by `pg_roles` lookup. Production has the `mcadmin`
    role; dev/CI doesn't, which was throwing `role "mcadmin" does not
    exist`. Append-only invariant is still enforced at the API layer.
- `011_token_split.sql` — wrapped the legacy 60/40 backfill UPDATE in a
  `DO` block guarded by an `information_schema.columns` check on
  `daily_stats.estimated_tokens`. Prisma's `DailyStats` model dropped
  `estimated_tokens` in favour of `input_tokens`/`output_tokens`, so on
  Prisma-managed DBs there's nothing to backfill from and the migration
  was throwing `column "estimated_tokens" does not exist`.
- `015_agent_models.sql` — added defensive `ALTER TABLE ADD COLUMN IF NOT
  EXISTS` for `model_pricing.pricing_type`, `monthly_cost_usd`, `notes`
  before the subscription seed INSERT. `000_base_schema.sql` creates
  `model_pricing` with the minimal per-token rate-card columns; the
  subscription columns are normally added by later migrations
  (`022_cache_creation_multiplier`, `2026-05-09_seed_model_pricing`),
  but 015 runs before them. Hoisting the column adds into 015 makes the
  migration idempotent regardless of run order.
- `017_journal.sql` — added defensive `INSERT ... SELECT ... WHERE NOT
  EXISTS` for the `transformate` tenant at the top of the migration.
  The `agent_identities` seed hardcodes `tenant_id = 'transformate'`,
  which exists in production but not on a fresh dev/CI DB (where only
  `default` exists from 001). Now creates the tenant idempotently so
  the FK constraint resolves either way.
- `024_prisma_schema_alignment.sql` — added defensive `ALTER TABLE ADD
  COLUMN IF NOT EXISTS embedding vector(N)` before the HNSW index
  block. Prisma can't model pgvector natively (schema.prisma:566 says
  "embedding vector stored via raw SQL, Prisma doesn't support
  pgvector"), so Prisma `db push` created these 8 tables without the
  `embedding` column. The `CREATE TABLE IF NOT EXISTS` above no-op'd,
  and the HNSW indexes failed with `column "embedding" does not
  exist`. Added the column for: `embeddings` (1536), `rag_chunks`
  (1536), and the 6 BGE-M3 memory tables (1024).
- `2026-04-21_wael_rls_phase2_1.sql` — **renamed to
  `.psql.skip`** so the migration runner skips it. The file's own
  header states "Phase 2.1 — WAEL role + RLS provisioning (LIVE OPS,
  not an Arkon migration). Target: mission_control @ 100.108.57.71".
  It uses psql meta-commands (`\set ON_ERROR_STOP on`) and psql
  variable substitution (`:'lumina_pw'`) which only work via the
  `psql` CLI, and references tables/roles (`worker_activity_events`,
  `warden_bridge`, `arkonhelm`, `wael_writer`, `mcadmin`) that don't
  exist in Arkon's DB. It was never meant to run through the
  node-postgres migration runner — was thrown into the directory by
  mistake. Rename keeps the file in place for ops reference (apply
  via `ssh ... | docker exec mc-postgres psql`) without the
  migrator picking it up.

### ⏳ In progress

- Pre-emptive scan of remaining legacy migrations for column references that
  Prisma's schema doesn't have. Next-up suspects: `002_event_threat_actions`,
  `003_setup_wizard`, `011_token_split`, `015_agent_models`,
  `024_prisma_schema_alignment`, `025_rename_columns_to_snake_case`,
  `2026-04-21_wael_rls_phase2_1`, `2026-05-08_rls_and_rbac`.
- `apps/api/scripts/stamp_legacy_migrations.sql` exists as a fallback —
  stamps the 32 legacy files in `_migrations` so the runner skips them. NOT
  needed if all legacy files now run cleanly; keep as escape hatch if the
  one-by-one fix path takes too long.

### ❌ Pending

- Run `pnpm --filter @oppmon/api migrate` end-to-end and verify
  `SELECT provider, COUNT(*) FROM model_pricing GROUP BY provider`.
- **Ollama chat fix** — separate user-reported bug. Working reference at
  `C:\Users\thach\Documents\workstation\agent-research-assistant\backend\ollama_client.py`.
  Suspect streaming-format mismatch in
  `apps/api/src/lib/llm/ollama.ts` vs how Anthropic/Cerebras emit deltas.
  Compare to `apps/api/src/lib/llm/anthropic.ts` and `cerebras.ts`.

## How to resume

1. Run the migration:
   ```bash
   pnpm --filter @oppmon/api migrate
   ```
2. If it fails with `column "X" of relation "Y" does not exist`:
   - That column is in a legacy migration but missing from Prisma's schema for
     table `Y`.
   - Fix: in the failing migration file, add
     `ALTER TABLE Y ADD COLUMN IF NOT EXISTS X <type>` right after the
     `CREATE TABLE IF NOT EXISTS Y (...)` block, mirroring what we did in
     `001_create_tenants.sql`.
3. If it fails with `incompatible types` on a FK:
   - Search for `INTEGER REFERENCES <table>` or `BIGINT REFERENCES <table>` in
     `apps/api/scripts/migrations/` and convert to `TEXT REFERENCES`.
4. If it fails with anything `<column>_id_seq does not exist`:
   - Some grant or trigger references a sequence that no longer exists because
     we converted SERIAL → TEXT. Drop or comment out the offending SQL (we
     already did this in `023_memory_relevance_feedback.sql`).
5. Once green: verify
   ```sql
   SELECT provider, COUNT(*) FROM model_pricing GROUP BY provider;
   -- expected: anthropic=11, cerebras=10, ollama=21, openai=21
   ```
6. Move to the Ollama chat fix.

## Files touched in this work session

- `apps/api/scripts/migrations/000_base_schema.sql`
- `apps/api/scripts/migrations/001_create_tenants.sql`
- `apps/api/scripts/migrations/004_notifications.sql`
- `apps/api/scripts/migrations/005_push_subscriptions.sql`
- `apps/api/scripts/migrations/006_user_accounts.sql`
- `apps/api/scripts/migrations/007_audit_log_v2.sql`
- `apps/api/scripts/migrations/010_api_keys_magic_links.sql`
- `apps/api/scripts/migrations/016_youtube_channels.sql`
- `apps/api/scripts/migrations/017_journal.sql`
- `apps/api/scripts/migrations/018_memory_v2.sql`
- `apps/api/scripts/migrations/020_work_items.sql`
- `apps/api/scripts/migrations/023_memory_relevance_feedback.sql`
- `apps/api/scripts/migrations/2026-05-09_seed_model_pricing.sql` (new)
- `apps/api/scripts/stamp_legacy_migrations.sql` (new — escape hatch)
- (also from earlier in session) `apps/api/src/routes/admin.ts`,
  `apps/api/src/routes/compliance.ts`

## Prisma column reference (quick lookup)

| Prisma model | Live columns |
|---|---|
| Tenant | id, name, slug, is_active, fallback_default_model_id, created_at, updated_at |
| User | (read schema.prisma:148+) |
| Agent | (read schema.prisma:237+) |
| McpServer | id (TEXT cuid), …  (read schema.prisma:589+) |
| Model | id, tenant_id, display_name, model_identifier, provider_template_id, … (per-tenant routing config; NOT a rate card) |
| AuditLog | id, tenant_id, resource_type, resource_id, action, actor_id, before_state, after_state, ip_address, user_agent, metadata, created_at |

Anything a legacy migration touches that's not in this table is fair game for
the ADD COLUMN IF NOT EXISTS pattern.
