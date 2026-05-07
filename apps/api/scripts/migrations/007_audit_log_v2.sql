-- Migration 007: Audit Log v2 — full event sourcing model
-- Coexists with audit_log (v1) during transition.
--
-- Idempotent: safe to re-run against a DB where Prisma `db push` may have
-- already touched related audit tables, and against environments that
-- don't have the `mcadmin` DB role we use in production.

CREATE TABLE IF NOT EXISTS audit_log_v2 (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_type TEXT NOT NULL,  -- user, agent, system, cron
  actor_id TEXT,
  action TEXT NOT NULL,      -- e.g. user.login, agent.killed, workflow.created
  target_type TEXT,          -- e.g. agent, workflow, user, session
  target_id TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_v2_action_time ON audit_log_v2(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_v2_actor       ON audit_log_v2(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_v2_target      ON audit_log_v2(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_v2_tenant      ON audit_log_v2(tenant_id, created_at DESC);

-- Append-only: revoke UPDATE/DELETE from the non-superuser app role.
-- Production uses the `mcadmin` role; dev/CI may not have it. Skip the
-- REVOKE when the role is absent so the migration stays portable.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcadmin') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_log_v2 FROM mcadmin';
  ELSE
    RAISE NOTICE 'role "mcadmin" not found — skipping REVOKE on audit_log_v2 (append-only invariant enforced at API layer)';
  END IF;
END $$;
