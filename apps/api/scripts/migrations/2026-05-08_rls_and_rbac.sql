-- Multi-tenant redesign — RLS, RBAC, System Tenant, Token Versions
-- Plan: docs/plans/abundant-snacking-ullman.md  (2026-05-08)
--
-- Companion to the Prisma migration `multitenant_redesign` which creates the
-- new tables (token_versions, resource_shares) and the SYSTEM_ADMIN enum
-- value. This file owns the bits Prisma cannot express:
--   1. Application DB role (oppmon_app, NOSUPERUSER)
--   2. System Tenant seed row
--   3. Backfill token_versions for existing users
--   4. CHECK constraint on resource_shares (exactly one grantee)
--   5. RLS enable + policies on tenant-scoped tables
--   6. BEFORE INSERT trigger on audit_logs (defense-in-depth)
--
-- Idempotent: every statement is guarded by IF NOT EXISTS / DO blocks so the
-- file can be re-applied safely. The migrate.ts runner already wraps the body
-- in a transaction.
--
-- Rollback path:
--   ALTER TABLE <each_table> DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS tenant_isolation_<table> ON <table>;
--   DROP TRIGGER IF EXISTS audit_logs_tenant_check ON audit_logs;
--   DROP FUNCTION IF EXISTS audit_logs_enforce_tenant();
--   DELETE FROM tenants WHERE id = 'system';
--   -- Keep the oppmon_app role unless cleaning up entirely.

-- =========================================================================
-- 1. Application DB role
-- =========================================================================
-- Created with NOSUPERUSER + NOBYPASSRLS so RLS is enforced on every query.
-- Migration tooling continues to use the superuser DB credentials.
-- Password is set from APP_DB_PASSWORD env (psql variable). If absent at apply
-- time, we leave the role without a password — the operator must set one
-- before pointing the API at it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oppmon_app') THEN
    EXECUTE 'CREATE ROLE oppmon_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE';
  END IF;
END
$$;

-- Grant connect + schema usage. Object grants applied at the end (after
-- the rest of the schema is in place) via GRANT ON ALL TABLES.
-- (PostgreSQL has no CURRENT_DATABASE() target in GRANT — must name it.)
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO oppmon_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO oppmon_app;

-- =========================================================================
-- 2. System Tenant seed
-- =========================================================================
-- The 'system' tenant is the immutable management tenant. Users belonging to
-- it can be granted SYSTEM_ADMIN role and bypass tenant scoping at the RLS
-- layer (their queries set app.current_tenant = 'system').

INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
VALUES ('system', 'System', '__system__', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 3. Backfill token_versions for existing users
-- =========================================================================
-- One row per user, version=1. The Prisma migration creates the table; this
-- block populates it for any pre-existing users.

INSERT INTO token_versions (user_id, version, updated_at)
SELECT id, 1, NOW() FROM users
ON CONFLICT (user_id) DO NOTHING;

-- =========================================================================
-- 4. resource_shares CHECK constraint
-- =========================================================================
-- Exactly one of grantee_user_id / grantee_team_id must be non-null.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'resource_shares_exactly_one_grantee'
  ) THEN
    ALTER TABLE resource_shares
      ADD CONSTRAINT resource_shares_exactly_one_grantee
      CHECK ((grantee_user_id IS NOT NULL)::int + (grantee_team_id IS NOT NULL)::int = 1);
  END IF;
END
$$;

-- access_level must be one of three values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'resource_shares_access_level_check'
  ) THEN
    ALTER TABLE resource_shares
      ADD CONSTRAINT resource_shares_access_level_check
      CHECK (access_level IN ('read', 'write', 'admin'));
  END IF;
END
$$;

-- =========================================================================
-- 5. RLS — enable + policy on each tenant-scoped table
-- =========================================================================
-- Policy template:
--   USING tenant_id = current_setting('app.current_tenant', true) -- read
--   WITH CHECK same  -- write
-- + 'system' bypass for the management tenant.
--
-- We use FORCE ROW LEVEL SECURITY so even the table owner is bound. The
-- migration runner connects as superuser which still bypasses BYPASSRLS+FORCE.

-- Helper to apply RLS to a single tenant-scoped table. Generated via DO loop
-- because PG has no CREATE POLICY IF NOT EXISTS.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'agents',
    'workflows',
    'skills',
    -- 'skill_versions' has no tenant_id column; scoped via skills FK at the
    -- application layer.
    'models',
    'model_secrets',
    'rag_collections',
    'rag_documents',
    'rag_chunks',
    'mcp_servers',
    'virtual_keys',
    'audit_logs',
    'usage_events',
    'tenant_settings',
    'teams',
    'resource_shares',
    'embeddings',
    'llm_sessions',
    'conversational_memory',
    'semantic_memory',
    'workflow_memory',
    'toolbox_memory',
    'entity_memory',
    'summary_memory',
    'persona_memory',
    'tool_log_memory',
    'daily_stats',
    'tenant_routing_states'
  ];
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip if table doesn't exist yet (e.g. fresh db, partial migration).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;

    -- Skip if the table doesn't carry a tenant_id column (the policy below
    -- references it directly, so a missing column is fatal). Such tables
    -- are scoped via FK at the app layer.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    policy_name := 'tenant_isolation_' || tbl;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND policyname = policy_name
    ) THEN
      EXECUTE format($p$
        CREATE POLICY %I ON %I
        USING (
          tenant_id = current_setting('app.current_tenant', true)
          OR current_setting('app.current_tenant', true) = 'system'
        )
        WITH CHECK (
          tenant_id = current_setting('app.current_tenant', true)
          OR current_setting('app.current_tenant', true) = 'system'
        )
      $p$, policy_name, tbl);
    END IF;
  END LOOP;
END
$$;

-- Tables without a tenant_id column but tied to a tenant via FK (events,
-- incidents, llm_messages, team_members, tool_calls, etc.) are NOT directly
-- protected — access is gated through their parent table at the application
-- layer. RLS on those would require subqueries that hurt query plans; the
-- defense-in-depth comes from the parent's policy plus app-layer scoping.

-- =========================================================================
-- 6. Users / OAuth / sessions — special-case RLS
-- =========================================================================
-- users.tenant_id exists, so we can apply the same policy. Note: this hides
-- cross-tenant user lookups (intentional). Auth bootstrap (login by email)
-- runs as superuser before app.current_tenant is set, which is fine because
-- the migration tooling and the public auth endpoint (/api/auth/login) need
-- to find users without a tenant context. The auth endpoint must continue to
-- run with a privileged DB role until refresh-token rotation is added.

DO $$
BEGIN
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE users FORCE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'tenant_isolation_users'
  ) THEN
    EXECUTE $p$
      CREATE POLICY tenant_isolation_users ON users
      USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system'
        OR current_setting('app.current_tenant', true) = ''
      )
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system'
      )
    $p$;
  END IF;
END
$$;

-- Note: empty-string fallback in USING (read) lets the auth login flow find
-- the user before any tenant context is set. The WITH CHECK (write) clause
-- has no such fallback — writes always require a real tenant.

-- =========================================================================
-- 7. audit_logs defense-in-depth trigger
-- =========================================================================
-- Belt + suspenders: even if a service forgets to scope, the trigger ensures
-- the persisted tenant_id matches the session's app.current_tenant. System
-- Tenant ('system') bypasses to allow centralized audit emission.

CREATE OR REPLACE FUNCTION audit_logs_enforce_tenant()
RETURNS TRIGGER AS $$
DECLARE
  ctx text;
BEGIN
  ctx := current_setting('app.current_tenant', true);
  IF ctx IS NULL OR ctx = '' THEN
    RAISE EXCEPTION 'audit_logs insert requires app.current_tenant to be set'
      USING ERRCODE = '42501';
  END IF;
  IF ctx <> 'system' AND NEW.tenant_id <> ctx THEN
    RAISE EXCEPTION 'audit_logs.tenant_id (%) does not match app.current_tenant (%)',
      NEW.tenant_id, ctx
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_tenant_check ON audit_logs;
CREATE TRIGGER audit_logs_tenant_check
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_enforce_tenant();

-- =========================================================================
-- 8. Object-level grants for oppmon_app
-- =========================================================================
-- Done last so newly-created tables (resource_shares, token_versions) are
-- included.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oppmon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO oppmon_app;

-- Future-proofing: ensure new tables/sequences created in this schema after
-- this migration also receive the grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oppmon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO oppmon_app;

-- =========================================================================
-- POST-APPLY SMOKE (run separately via apps/api/scripts/smoke-rls.ts)
-- =========================================================================
-- 1. SET app.current_tenant = 'tenant_a';   SELECT count(*) FROM skills;
--    -- Returns only tenant_a rows.
-- 2. RESET app.current_tenant;              SELECT count(*) FROM skills;
--    -- Returns 0 (RLS denies).
-- 3. SET app.current_tenant = 'system';     SELECT count(*) FROM skills;
--    -- Returns all rows (system bypass).
-- 4. SET ROLE oppmon_app; INSERT INTO audit_logs (...) without setting context;
--    -- Raises 42501 (trigger blocks).
