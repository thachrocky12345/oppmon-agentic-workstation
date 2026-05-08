-- _migrations metadata upgrade
-- Adds checksum, duration_ms, status, error_message, executed_by columns
-- to enable drift detection and migration observability.
--
-- The migrate.ts runner is updated to populate these columns starting with
-- this migration. Existing rows are left with NULLs for new columns.

ALTER TABLE _migrations
  ADD COLUMN IF NOT EXISTS checksum     TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms  INTEGER,
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS executed_by  TEXT;

-- Enforce status vocabulary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = '_migrations_status_check'
  ) THEN
    ALTER TABLE _migrations
      ADD CONSTRAINT _migrations_status_check
      CHECK (status IN ('applied', 'failed', 'rolled_back'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_migrations_status ON _migrations (status);
CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON _migrations (applied_at DESC);
