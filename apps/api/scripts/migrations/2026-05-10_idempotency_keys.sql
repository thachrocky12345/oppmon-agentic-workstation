-- Idempotency keys — replay protection for mutating endpoints
--
-- A client supplies `Idempotency-Key: <opaque>` on POST/PATCH/DELETE. The
-- middleware:
--   1. Hashes (method + path + sorted body) and stores it as request_hash.
--   2. If a row with the same (tenant_id, idempotency_key) exists:
--        a. and request_hash matches    → replay the stored response.
--        b. and request_hash differs    → 409 conflict (key reuse).
--   3. Otherwise inserts a new row, runs the handler, and stamps the response.
--
-- Scope: per-tenant. Keys auto-expire after `expires_at` (24h default).
-- Idempotent.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key  TEXT NOT NULL,
  request_hash     TEXT NOT NULL,
  request_method   TEXT NOT NULL,
  request_path     TEXT NOT NULL,
  response_status  INT,
  response_body    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  PRIMARY KEY (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON idempotency_keys (expires_at);

-- =========================================================================
-- RLS — same per-tenant model as the rest of the schema.
-- =========================================================================
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_idempotency_keys ON idempotency_keys;
CREATE POLICY tenant_isolation_idempotency_keys ON idempotency_keys
  USING (
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.current_tenant', true) = 'system'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.current_tenant', true) = 'system'
  );
