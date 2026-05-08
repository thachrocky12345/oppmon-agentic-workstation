-- Transactional outbox — atomic event emission
--
-- Producers enqueue events inside the same DB transaction as the state change
-- they describe; a background publisher drains them. This eliminates the
-- "wrote to DB but lost the downstream notification" failure mode.
--
-- Schema:
--   id              cuid-style text primary key
--   tenant_id       FK to tenants for RLS / cascade
--   aggregate_type  domain noun ('incident', 'agent', 'workflow', ...)
--   aggregate_id    id of the row that produced the event
--   event_type      'incident.created', 'agent.registered', ...
--   payload         JSONB body
--   created_at      enqueue time
--   published_at    set by drainer when emitted; NULL while pending
--   attempt_count   bumped on each drainer attempt
--   last_error      diagnostic from last failed attempt
--   available_at    next attempt time — supports exponential backoff
--   locked_at       set by drainer to claim a row; cleared on success/failure
--   locked_by       drainer instance id (hostname#pid)
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS event_outbox (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id   TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,
  attempt_count  INT NOT NULL DEFAULT 0,
  last_error     TEXT,
  locked_at      TIMESTAMPTZ,
  locked_by      TEXT
);

-- Drainer hot-path: pending rows sorted by created_at.
CREATE INDEX IF NOT EXISTS idx_event_outbox_pending
  ON event_outbox (available_at)
  WHERE published_at IS NULL;

-- Allow per-tenant queries (admin debug, retry-failed-for-tenant).
CREATE INDEX IF NOT EXISTS idx_event_outbox_tenant_unpublished
  ON event_outbox (tenant_id, created_at DESC)
  WHERE published_at IS NULL;

-- Allow event-type filtered drainers.
CREATE INDEX IF NOT EXISTS idx_event_outbox_event_type
  ON event_outbox (event_type, created_at DESC);

-- =========================================================================
-- RLS — outbox rows belong to a tenant; drainer runs as 'system'.
-- =========================================================================
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_event_outbox ON event_outbox;
CREATE POLICY tenant_isolation_event_outbox ON event_outbox
  USING (
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.current_tenant', true) = 'system'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.current_tenant', true) = 'system'
  );
