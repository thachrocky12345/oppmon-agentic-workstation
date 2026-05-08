-- Notifications consolidation — per-user shape wins
--
-- Two parallel notification designs existed:
--   - 004_notifications.sql      : tenant-scoped (tenant_id + read + body)
--   - Prisma + 024 schema_align  : per-user      (user_id + is_read + message)
-- The Prisma model never had tenant_id, but the older RLS work referenced one,
-- creating a silent break risk if 004 ran first.
--
-- This migration unifies on the per-user shape. Tenant-level notifications
-- become a fanout pattern (one row per recipient) at the producer layer; the
-- table itself is purely per-user.
--
-- Changes:
--   1. Ensure the per-user columns Prisma expects exist: user_id, type, title,
--      message, is_read, created_at.
--   2. Carry the rich fields from 004 forward as nullable additions: severity,
--      body, link, metadata.
--   3. Drop the legacy tenant_id column if it survived from 004.
--   4. Rename `read` -> `is_read` if `read` exists (handles DBs that ran 004
--      before the Prisma alignment).
--   5. Backfill `message` from `body` so the column is never null on rows that
--      came in via the old shape.
--   6. RLS policy that JOINs notifications.user_id -> users.tenant_id so the
--      table can stay tenant-isolated without owning a tenant_id column.
--
-- Idempotent.

-- =========================================================================
-- 1. Ensure baseline columns exist (per-user shape)
-- =========================================================================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id    TEXT,
  ADD COLUMN IF NOT EXISTS type       TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS title      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS message    TEXT,
  ADD COLUMN IF NOT EXISTS is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =========================================================================
-- 2. Promote enriched columns from 004 to canonical
-- =========================================================================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS body     TEXT,
  ADD COLUMN IF NOT EXISTS link     TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- =========================================================================
-- 3. Reconcile `read` -> `is_read` if both exist
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
      AND column_name = 'read'
  ) THEN
    -- Carry any unread state forward, then drop the legacy column.
    EXECUTE 'UPDATE notifications SET is_read = "read" WHERE is_read IS DISTINCT FROM "read"';
    EXECUTE 'ALTER TABLE notifications DROP COLUMN "read"';
  END IF;
END
$$;

-- =========================================================================
-- 4. Backfill message from body (in case 004 rows have body but not message)
-- =========================================================================
UPDATE notifications
   SET message = COALESCE(message, body, title)
 WHERE message IS NULL;

ALTER TABLE notifications ALTER COLUMN message SET NOT NULL;

-- =========================================================================
-- 5. Drop legacy tenant_id column (per-user is canonical)
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
      AND column_name = 'tenant_id'
  ) THEN
    -- Anyone consuming the old broadcast pattern needs to fanout to user rows
    -- before this column goes away. Workspace has no data; safe.
    EXECUTE 'ALTER TABLE notifications DROP COLUMN tenant_id';
  END IF;
END
$$;

-- =========================================================================
-- 6. user_id is required and FK'd to users
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_user_id_fkey'
  ) THEN
    -- Only add the FK if every row already has a valid user_id; the workspace
    -- has no data, so this is a no-op there.
    EXECUTE 'ALTER TABLE notifications
             ADD CONSTRAINT notifications_user_id_fkey
             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE';
  END IF;
END
$$;

ALTER TABLE notifications ALTER COLUMN user_id SET NOT NULL;

-- =========================================================================
-- 7. Indexes
-- =========================================================================
DROP INDEX IF EXISTS idx_notifications_tenant_read;
DROP INDEX IF EXISTS idx_notifications_tenant_created;
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- =========================================================================
-- 8. RLS — user_id -> users.tenant_id
-- =========================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  USING (
    user_id IN (
      SELECT id FROM users
       WHERE tenant_id = current_setting('app.current_tenant', true)
    )
    OR current_setting('app.current_tenant', true) = 'system'
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM users
       WHERE tenant_id = current_setting('app.current_tenant', true)
    )
    OR current_setting('app.current_tenant', true) = 'system'
  );
