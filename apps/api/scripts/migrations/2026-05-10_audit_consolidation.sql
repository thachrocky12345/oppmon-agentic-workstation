-- Audit consolidation — audit_log_v2 wins
--
-- The codebase has historically carried three audit tables:
--   audit_log     (v1, base_schema 000) — minimal, never read by code
--   audit_logs    (Prisma + 024)         — used by lib/audit.ts
--   audit_log_v2  (007)                  — append-only event-sourced
--
-- This migration:
--   1. Strengthens audit_log_v2 with constraints + RLS so it can be the
--      single source of truth.
--   2. Backfills any rows from audit_log and audit_logs into audit_log_v2.
--   3. Drops audit_log (v1) outright.
--   4. Renames audit_logs -> audit_logs_deprecated and revokes writes; a
--      follow-up migration drops it after a deprecation window.
--
-- Idempotent.

-- =========================================================================
-- 1. Strengthen audit_log_v2
-- =========================================================================

-- Enforce known actor_type vocabulary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_v2_actor_type_check'
  ) THEN
    ALTER TABLE audit_log_v2
      ADD CONSTRAINT audit_log_v2_actor_type_check
      CHECK (actor_type IN ('user', 'agent', 'system', 'cron', 'service'));
  END IF;
END
$$;

-- tenant_id is required for everything except 'system' actor rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_v2_tenant_required'
  ) THEN
    ALTER TABLE audit_log_v2
      ADD CONSTRAINT audit_log_v2_tenant_required
      CHECK (actor_type = 'system' OR tenant_id IS NOT NULL);
  END IF;
END
$$;

-- Defense-in-depth trigger (mirror of audit_logs_enforce_tenant): ensure the
-- persisted tenant_id matches app.current_tenant unless caller is 'system'.
CREATE OR REPLACE FUNCTION audit_log_v2_enforce_tenant()
RETURNS TRIGGER AS $$
DECLARE
  ctx text;
BEGIN
  ctx := current_setting('app.current_tenant', true);
  IF NEW.actor_type = 'system' THEN
    -- System emissions can write any tenant_id (or none).
    RETURN NEW;
  END IF;
  IF ctx IS NULL OR ctx = '' THEN
    RAISE EXCEPTION 'audit_log_v2 insert requires app.current_tenant to be set'
      USING ERRCODE = '42501';
  END IF;
  IF ctx <> 'system' AND NEW.tenant_id IS DISTINCT FROM ctx THEN
    RAISE EXCEPTION 'audit_log_v2.tenant_id (%) does not match app.current_tenant (%)',
      NEW.tenant_id, ctx
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_v2_tenant_check ON audit_log_v2;
CREATE TRIGGER audit_log_v2_tenant_check
  BEFORE INSERT ON audit_log_v2
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_v2_enforce_tenant();

-- RLS — same template as the rest of the schema.
ALTER TABLE audit_log_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_v2 FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log_v2'
      AND policyname = 'tenant_isolation_audit_log_v2'
  ) THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_audit_log_v2 ON audit_log_v2
      USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system'
      )
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system'
        OR actor_type = 'system'
      )
    $p$;
  END IF;
END
$$;

-- Append-only enforcement against the application role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oppmon_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_log_v2 FROM oppmon_app';
    EXECUTE 'GRANT  SELECT, INSERT ON audit_log_v2 TO oppmon_app';
  END IF;
END
$$;

-- =========================================================================
-- 2. Backfill audit_log (v1) -> audit_log_v2
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_log'
  ) THEN
    INSERT INTO audit_log_v2
      (id, actor_type, actor_id, action, target_type, target_id,
       description, metadata, old_value, new_value, ip_address, tenant_id, created_at)
    SELECT
      gen_random_uuid()::text,
      'user',                                       -- best-guess
      al.actor::text,
      al.action,
      al.resource_type,
      al.resource_id,
      NULL,
      COALESCE(al.detail, '{}'::jsonb),
      NULL,
      NULL,
      al.ip_address,
      al.tenant_id,
      al.created_at
    FROM audit_log al
    -- Avoid duplicating on re-run.
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_log_v2 v2
      WHERE v2.action = al.action
        AND v2.created_at = al.created_at
        AND v2.target_id IS NOT DISTINCT FROM al.resource_id
    );
  END IF;
END
$$;

-- =========================================================================
-- 3. Backfill audit_logs (Prisma) -> audit_log_v2
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    INSERT INTO audit_log_v2
      (id, actor_type, actor_id, action, target_type, target_id,
       description, metadata, old_value, new_value, ip_address, tenant_id, created_at)
    SELECT
      al.id,
      'user',
      al.actor_id,
      al.action::text,
      al.resource_type,
      al.resource_id,
      NULL,
      COALESCE(al.metadata, '{}'::jsonb),
      al.before_state,
      al.after_state,
      al.ip_address,
      al.tenant_id,
      al.created_at
    FROM audit_logs al
    WHERE NOT EXISTS (SELECT 1 FROM audit_log_v2 v2 WHERE v2.id = al.id);
  END IF;
END
$$;

-- =========================================================================
-- 4. Drop audit_log (v1)
-- =========================================================================
-- Backfilled — safe to drop. The v1 table has never been read by the API.
DROP TABLE IF EXISTS audit_log CASCADE;

-- =========================================================================
-- 5. Deprecate audit_logs (Prisma) — rename + revoke writes
-- =========================================================================
-- We keep the table for a deprecation window so any out-of-band consumers can
-- be migrated. Code is being switched to write directly to audit_log_v2 in
-- this same release.
--
-- A follow-up migration (2026-06-XX_drop_audit_logs.sql) will DROP the
-- deprecated table after the window closes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs_deprecated'
  ) THEN
    EXECUTE 'ALTER TABLE audit_logs RENAME TO audit_logs_deprecated';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs_deprecated'
  ) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oppmon_app') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON audit_logs_deprecated FROM oppmon_app';
  END IF;
END
$$;
