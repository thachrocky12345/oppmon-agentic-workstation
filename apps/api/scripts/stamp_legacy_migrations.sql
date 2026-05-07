-- ============================================================================
-- One-shot: stamp legacy raw-SQL migrations as already-applied.
--
-- Why
-- ---
-- The live DB is Prisma-managed (`prisma db push`). Legacy raw-SQL migrations
-- under apps/api/scripts/migrations/ declare schema that conflicts with what
-- Prisma already created (e.g. `mcp_servers.id` was SERIAL/INTEGER in the SQL
-- migrations but is TEXT/cuid in Prisma). Running them now fails:
--
--   foreign key constraint "mcp_server_agents_mcp_server_id_fkey"
--   cannot be implemented
--   detail: Key columns "mcp_server_id" and "id" are of incompatible types:
--           integer and text.
--
-- Fix: record their names in `_migrations` so the runner skips them, and only
-- new migrations (e.g. 2026-05-09_seed_model_pricing) actually execute.
--
-- Usage
-- -----
--   psql "$DATABASE_URL" -f apps/api/scripts/stamp_legacy_migrations.sql
--
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- ============================================================================

-- Make sure the tracking table exists with the same shape as migrate.ts uses.
CREATE TABLE IF NOT EXISTS _migrations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL UNIQUE,
  applied_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO _migrations (name) VALUES
  ('000_base_schema'),
  ('001_add_embedding_vector'),
  ('001_create_tenants'),
  ('002_add_search_vectors'),
  ('002_event_threat_actions'),
  ('003_add_rag_chunks_embedding'),
  ('003_setup_wizard'),
  ('004_notifications'),
  ('005_push_subscriptions'),
  ('006_user_accounts'),
  ('007_audit_log_v2'),
  ('008_rate_limit'),
  ('009_traces_spans'),
  ('010_api_keys_magic_links'),
  ('011_token_split'),
  ('013_infra_costs'),
  ('014_reconciliation'),
  ('015_agent_models'),
  ('016_youtube_channels'),
  ('017_journal'),
  ('018_memory_v2'),
  ('019_agent_identities_refresh'),
  ('020_work_items'),
  ('021_drop_youtube_channels'),
  ('022_cache_creation_multiplier'),
  ('022_memory_facts_decay_index'),
  ('023_memory_relevance_feedback'),
  ('024_prisma_schema_alignment'),
  ('025_rename_columns_to_snake_case'),
  ('20250505120000_add_skill_enabled'),
  ('2026-04-21_wael_rls_phase2_1'),
  ('2026-05-08_rls_and_rbac')
ON CONFLICT (name) DO NOTHING;

-- Verify
SELECT name FROM _migrations ORDER BY name;
