-- Migration 004: Notifications & alert system
-- In-app notification center + notification preferences for multi-channel dispatch

-- 1. Notifications table — stores all in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- threat, anomaly, approval, budget, agent_offline, infra_offline, intake, workflow_failure
  severity TEXT NOT NULL DEFAULT 'info',  -- info, warning, critical
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,  -- relative URL to navigate to on click
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Defensive: if `notifications` already existed (partial earlier run / Prisma)
-- without these columns, add them so the indexes below resolve.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id  TEXT NOT NULL DEFAULT 'default';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type       TEXT NOT NULL DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity   TEXT NOT NULL DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title      TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body       TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link       TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata   JSONB DEFAULT '{}';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_read ON notifications(tenant_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC);

-- 2. Notification preferences — per-tenant channel configuration
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,  -- email, slack, telegram, discord, webhook
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',  -- channel-specific config (webhook_url, bot_token, chat_id, email, etc.)
  -- Per-type toggles stored in config: { "types": { "threat_critical": true, "threat_high": true, ... } }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel)
);

-- Defensive: same rationale as for `notifications` above.
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS tenant_id  TEXT NOT NULL DEFAULT 'default';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS channel    TEXT NOT NULL DEFAULT 'email';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS enabled    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS config     JSONB NOT NULL DEFAULT '{}';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_notification_prefs_tenant ON notification_preferences(tenant_id);
