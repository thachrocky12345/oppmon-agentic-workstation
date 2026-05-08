-- Global soft-delete + tenant archival
--
-- Adds `deleted_at TIMESTAMPTZ NULL` to every tenant-scoped table.
-- Refreshes RLS policies to filter `WHERE deleted_at IS NULL`.
-- Adds `tenant_archives` and `tenant_deletion_audit` for GDPR-driven hard
-- deletes, plus a BEFORE DELETE trigger on tenants that snapshots before
-- the cascade fires.
--
-- Idempotent — re-runnable.

-- =========================================================================
-- 1. Add deleted_at to every tenant-scoped table
-- =========================================================================
DO $$
DECLARE
  tbl text;
  -- Mirror of the RLS table list in 2026-05-08_rls_and_rbac.sql plus a few
  -- non-RLS tenant-scoped tables. Tables tied to tenant via FK only are
  -- handled at the application layer.
  tables text[] := ARRAY[
    'agents',
    'workflows',
    'skills',
    'models',
    'model_secrets',
    'rag_collections',
    'rag_documents',
    'rag_chunks',
    'mcp_servers',
    'virtual_keys',
    -- audit_logs is renamed to audit_logs_deprecated in
    -- 2026-05-10_audit_consolidation; audit_log_v2 is append-only and never
    -- soft-deletes, so neither needs deleted_at.
    'usage_events',
    'tenant_settings',
    'teams',
    'resource_shares',
    'embeddings',
    'llm_sessions',
    'conversational_memory',
    -- semantic_memory / workflow_memory / toolbox_memory / entity_memory were
    -- consolidated into memory_facts in 2026-05-10_memory_consolidation.
    'summary_memory',
    'persona_memory',
    'tool_log_memory',
    'daily_stats',
    'tenant_routing_states',
    'incidents',
    'workflow_runs',
    'notifications',
    'memory_facts',
    'work_entries',
    'work_items',
    'tasks',
    'approvals',
    'mcp_servers',
    'documents'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
        tbl
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_deleted_at ON %I (deleted_at) WHERE deleted_at IS NULL',
        tbl, tbl
      );
    END IF;
  END LOOP;
END
$$;

-- =========================================================================
-- 2. Refresh RLS policies to hide soft-deleted rows
-- =========================================================================
-- We replace the existing tenant_isolation_<tbl> policies with versions that
-- include `AND (deleted_at IS NULL OR app.current_tenant = 'system')`.
-- System tenant continues to see soft-deleted rows for admin/audit purposes.

DO $$
DECLARE
  tbl text;
  policy_name text;
  rls_tables text[] := ARRAY[
    'agents', 'workflows', 'skills', 'models', 'model_secrets',
    'rag_collections', 'rag_documents', 'rag_chunks',
    'mcp_servers', 'virtual_keys', 'usage_events',
    'tenant_settings', 'teams', 'resource_shares', 'embeddings',
    'llm_sessions', 'conversational_memory',
    'summary_memory', 'persona_memory', 'tool_log_memory',
    'daily_stats', 'tenant_routing_states'
  ];
BEGIN
  FOREACH tbl IN ARRAY rls_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
    ) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'deleted_at'
    ) THEN
      CONTINUE;
    END IF;

    policy_name := 'tenant_isolation_' || tbl;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, tbl);
    EXECUTE format($p$
      CREATE POLICY %I ON %I
      USING (
        (
          tenant_id = current_setting('app.current_tenant', true)
          OR current_setting('app.current_tenant', true) = 'system'
        )
        AND (
          deleted_at IS NULL
          OR current_setting('app.current_tenant', true) = 'system'
        )
      )
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system'
      )
    $p$, policy_name, tbl);
  END LOOP;
END
$$;

-- =========================================================================
-- 3. tenant_archives — full snapshot prior to hard delete
-- =========================================================================
CREATE TABLE IF NOT EXISTS tenant_archives (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL,
  snapshot    JSONB NOT NULL,
  reason      TEXT NOT NULL,
  archived_by TEXT NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_archives_tenant_id ON tenant_archives (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_archives_archived_at ON tenant_archives (archived_at DESC);

-- Append-only — block UPDATE/DELETE on archives.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oppmon_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON tenant_archives FROM oppmon_app';
    EXECUTE 'GRANT  SELECT, INSERT ON tenant_archives TO oppmon_app';
  END IF;
END
$$;

-- =========================================================================
-- 4. tenant_deletion_audit — proof-of-deletion for GDPR DSRs
-- =========================================================================
CREATE TABLE IF NOT EXISTS tenant_deletion_audit (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  reason          TEXT NOT NULL,
  requested_by    TEXT NOT NULL,
  archive_id      TEXT NOT NULL REFERENCES tenant_archives(id),
  row_counts      JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_deletion_audit_tenant ON tenant_deletion_audit (tenant_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oppmon_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON tenant_deletion_audit FROM oppmon_app';
    EXECUTE 'GRANT  SELECT, INSERT ON tenant_deletion_audit TO oppmon_app';
  END IF;
END
$$;

-- =========================================================================
-- 5. BEFORE DELETE trigger on tenants
-- =========================================================================
-- Snapshots core tenant rows into tenant_archives prior to the FK cascade.
-- Application code is still expected to fan out and hard-delete child rows
-- explicitly for GDPR; this trigger is the safety net that ensures we never
-- lose the row counts and key identifiers.

CREATE OR REPLACE FUNCTION tenants_snapshot_before_delete()
RETURNS TRIGGER AS $$
DECLARE
  snap jsonb;
  archive_id text;
  reason_ctx text;
  actor_ctx text;
BEGIN
  -- Optional context — set via SELECT set_config('app.delete_reason', ...) by
  -- the application before issuing the DELETE.
  reason_ctx := COALESCE(NULLIF(current_setting('app.delete_reason', true), ''), 'cascade_delete');
  actor_ctx  := COALESCE(NULLIF(current_setting('app.current_actor_id', true), ''), 'unknown');

  snap := jsonb_build_object(
    'tenant', to_jsonb(OLD),
    'user_count',         (SELECT count(*) FROM users          WHERE tenant_id = OLD.id),
    'agent_count',        (SELECT count(*) FROM agents         WHERE tenant_id = OLD.id),
    'team_count',         (SELECT count(*) FROM teams          WHERE tenant_id = OLD.id),
    'skill_count',        (SELECT count(*) FROM skills         WHERE tenant_id = OLD.id),
    'model_count',        (SELECT count(*) FROM models         WHERE tenant_id = OLD.id),
    'snapshot_taken_at',  NOW()
  );

  archive_id := gen_random_uuid()::text;
  INSERT INTO tenant_archives (id, tenant_id, snapshot, reason, archived_by)
  VALUES (archive_id, OLD.id, snap, reason_ctx, actor_ctx);

  INSERT INTO tenant_deletion_audit (tenant_id, reason, requested_by, archive_id, row_counts)
  VALUES (
    OLD.id,
    reason_ctx,
    actor_ctx,
    archive_id,
    snap - 'tenant'
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_snapshot_trigger ON tenants;
CREATE TRIGGER tenants_snapshot_trigger
  BEFORE DELETE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION tenants_snapshot_before_delete();
