-- promote_users_to_admin.sql
--
-- Promote existing users to TENANT_ADMIN.
--
-- Context: every self-registered user (POST /api/auth/register) is provisioned
-- as TENANT_ADMIN. This script exists for two scenarios:
--
--   1. A specific user was downgraded or seeded with a non-admin role and you
--      want to put them back to admin.
--   2. You want to promote *every* legacy user that is currently below
--      TENANT_ADMIN — useful right after enabling the role gate.
--
-- Usage (from the repo root, with the dev DB up):
--
--   # Promote ONE user by email:
--   docker exec -i oppmon-db psql -U oppmon -d oppmon \
--     -v target_email="'admin1@admin.com'" \
--     -f apps/api/scripts/promote_users_to_admin.sql
--
--   # Promote ALL non-admin users (uncomment the WHERE clause below first):
--   docker exec -i oppmon-db psql -U oppmon -d oppmon \
--     -f apps/api/scripts/promote_users_to_admin.sql
--
-- Idempotent: re-running is a no-op once everyone is already at admin.

\set ON_ERROR_STOP on

BEGIN;

-- Default the :target_email variable to NULL when invoked without -v so the
-- bulk path becomes the active one.
\if :{?target_email}
\else
  \set target_email NULL
\endif

-- ---- Single-user path ------------------------------------------------------
-- Runs only when target_email was supplied via psql -v.
UPDATE users
   SET role       = 'TENANT_ADMIN',
       updated_at = NOW()
 WHERE :target_email IS NOT NULL
   AND email = LOWER(:target_email)
   AND role <> 'TENANT_ADMIN'
   AND role <> 'SYSTEM_ADMIN';

-- ---- Bulk path -------------------------------------------------------------
-- Promote every legacy user that isn't already an admin role.
-- Comment this block out if you only want the single-user path above.
UPDATE users
   SET role       = 'TENANT_ADMIN',
       updated_at = NOW()
 WHERE :target_email IS NULL
   AND role NOT IN ('TENANT_ADMIN', 'SYSTEM_ADMIN', 'TEAM_ADMIN');

-- Bump token_version so any stale JWTs holding the old role are invalidated
-- on next /api/auth/me check (event-driven revocation).
INSERT INTO token_versions (user_id, version, updated_at)
SELECT u.id, 1, NOW()
  FROM users u
 WHERE u.role IN ('TENANT_ADMIN', 'SYSTEM_ADMIN', 'TEAM_ADMIN')
   AND NOT EXISTS (SELECT 1 FROM token_versions tv WHERE tv.user_id = u.id)
ON CONFLICT (user_id) DO UPDATE
  SET version    = token_versions.version + 1,
      updated_at = NOW();

-- ---- Report ----------------------------------------------------------------
SELECT email, role, tenant_id, updated_at
  FROM users
 ORDER BY updated_at DESC
 LIMIT 20;

COMMIT;
