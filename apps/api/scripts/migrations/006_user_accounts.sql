-- Migration 006: User accounts and user sessions
-- Part of Phase 3: Auth & Data Foundation
--
-- This migration is idempotent against a Prisma `db push`-managed DB.
-- Prisma's `User` model already creates `users` with: id (cuid), email,
-- password_hash (nullable), name (NOT NULL), role (Prisma `Role` enum:
-- SYSTEM_ADMIN/TENANT_ADMIN/TEAM_ADMIN/MEMBER), tenant_id (NOT NULL,
-- ON DELETE CASCADE), is_active, created_at, updated_at.
--
-- Strategy here:
--   1) `CREATE TABLE IF NOT EXISTS` so this is a no-op when Prisma made it.
--   2) Defensive `ALTER TABLE ADD COLUMN IF NOT EXISTS` for legacy-only
--      columns (`display_name`, `last_login_at`) used by older code paths.
--   3) Do NOT (re)apply the legacy role CHECK constraint — its values
--      ('owner','admin','operator','viewer','tenant_user') conflict with
--      Prisma's Role enum. Role validation lives in the API layer.

-- 1. Users table — no-op when Prisma already created it.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  tenant_id TEXT REFERENCES tenants(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1b. Defensive: add legacy-only columns when running against the
--     Prisma-created `users` table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- 2. User sessions table — no-op when Prisma already created it.
--    Prisma's `UserSession` uses a `token` (UNIQUE) column; the legacy
--    code path uses `token_hash`. We add `token_hash` defensively so
--    older inserts still work; Prisma writers continue to populate `token`.
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2b. Defensive: legacy-only / Prisma-optional columns.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user    ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
