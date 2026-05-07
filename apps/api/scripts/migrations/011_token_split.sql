-- Phase 1a: Separate input/output token tracking
-- Applied: 2026-04-09
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op when Prisma already
-- created `input_tokens`/`output_tokens` on `events` and `daily_stats`.
--
-- Backfill: only run the legacy 60/40 split when the source column
-- `daily_stats.estimated_tokens` exists. Prisma's current DailyStats
-- model doesn't define `estimated_tokens` (it was replaced by the
-- input/output split), so on Prisma-managed DBs there's nothing to
-- backfill from.

ALTER TABLE events      ADD COLUMN IF NOT EXISTS input_tokens  integer;
ALTER TABLE events      ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS input_tokens  integer DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0;

-- Backfill historical daily_stats with 60/40 split (best available estimate)
-- only if the legacy `estimated_tokens` column exists on this DB.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name   = 'daily_stats'
      AND column_name  = 'estimated_tokens'
  ) THEN
    EXECUTE $sql$
      UPDATE daily_stats SET
        input_tokens  = ROUND(estimated_tokens * 0.6),
        output_tokens = ROUND(estimated_tokens * 0.4)
      WHERE input_tokens = 0 AND estimated_tokens > 0
    $sql$;
  ELSE
    RAISE NOTICE 'daily_stats.estimated_tokens not present — skipping 60/40 backfill (Prisma-managed DB has no source data)';
  END IF;
END $$;
