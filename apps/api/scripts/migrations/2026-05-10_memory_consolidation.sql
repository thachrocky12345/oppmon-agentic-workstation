-- Memory consolidation — memory_facts wins
--
-- The agent memory layer historically had 8 specialized tables (018 +
-- schema.prisma). Of these, four — semantic_memory, workflow_memory,
-- toolbox_memory, entity_memory — are over-decomposed redundant stores: each
-- holds a content blob + 1024-dim vector + metadata, with the only real
-- difference being which `kind` label they implicitly carry.
--
-- This migration:
--   1. Promotes memory_facts (1536-dim, MRL-compatible) to also carry
--      tenant-wide knowledge that has no specific agent owner.
--   2. Adds a vocabulary CHECK on memory_facts.kind covering both the
--      original agent-fact kinds and the new consolidated kinds.
--   3. Adds partial unique indexes for `toolbox` and `entity` kinds so we keep
--      the upsert semantics the dropped tables used to enforce.
--   4. Drops the four redundant tables outright (the workspace has no data;
--      this is safe).
--
-- The four tables we KEEP:
--   - conversational_memory  (raw turn log, SQL)
--   - tool_log_memory        (execution audit, SQL)
--   - summary_memory         (compressed threads, vector)
--   - persona_memory         (identity state, vector)
-- These four have non-overlapping semantics with memory_facts and stay as-is.
--
-- Idempotent.

-- =========================================================================
-- 1. memory_facts: relax owner_agent so tenant-wide knowledge fits
-- =========================================================================
-- Original 018 made owner_agent NOT NULL because durable agent facts always
-- have an owner. The consolidated 'semantic' / 'workflow' / 'toolbox' /
-- 'entity' kinds are tenant-scoped and have no owning agent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memory_facts'
      AND column_name = 'owner_agent'
      AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE memory_facts ALTER COLUMN owner_agent DROP NOT NULL';
  END IF;
END
$$;

-- =========================================================================
-- 2. memory_facts.kind vocabulary CHECK
-- =========================================================================
-- Enforced vocabulary so retrieval can rely on `kind` for routing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memory_facts_kind_check'
  ) THEN
    ALTER TABLE memory_facts
      ADD CONSTRAINT memory_facts_kind_check
      CHECK (kind IN (
        -- original agent-fact kinds (018)
        'preference', 'project-context', 'decision', 'person', 'pattern',
        -- consolidated kinds (this migration)
        'semantic', 'workflow', 'toolbox', 'entity'
      ));
  END IF;
END
$$;

-- =========================================================================
-- 3. Partial unique indexes for upsert semantics
-- =========================================================================
-- toolbox_memory used UNIQUE(tenant_id, tool_name); entity_memory had no
-- unique key on (tenant_id, entity_name) but the application code upserted
-- on it. We preserve both via partial unique indexes scoped to `kind`.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_facts_toolbox_unique
  ON memory_facts (tenant_id, (metadata->>'tool_name'))
  WHERE kind = 'toolbox';

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_facts_entity_unique
  ON memory_facts (tenant_id, (metadata->>'entity_name'))
  WHERE kind = 'entity';

-- =========================================================================
-- 4. RLS — bring memory_facts into line with the rest of the schema
-- =========================================================================
-- 018 did not enable RLS because the helper had not landed yet. Now that the
-- table will hold tenant-wide knowledge as well as per-agent facts, RLS is
-- mandatory.
ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_facts FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'memory_facts'
      AND policyname = 'tenant_isolation_memory_facts'
  ) THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_memory_facts ON memory_facts
      USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system'
      )
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system'
      )
    $p$;
  END IF;
END
$$;

-- =========================================================================
-- 5. Drop the four redundant memory tables
-- =========================================================================
-- Workspace has no data; safe to drop. If you are running this on a populated
-- environment, BACKFILL these tables into memory_facts FIRST (see plan,
-- Phase 1.2) — this migration intentionally does not include the backfill
-- to keep the cutover atomic.
DROP TABLE IF EXISTS semantic_memory CASCADE;
DROP TABLE IF EXISTS workflow_memory CASCADE;
DROP TABLE IF EXISTS toolbox_memory CASCADE;
DROP TABLE IF EXISTS entity_memory CASCADE;
