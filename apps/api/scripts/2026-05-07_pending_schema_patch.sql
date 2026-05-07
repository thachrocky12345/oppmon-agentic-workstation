-- ============================================================================
-- Manual application of pending raw-SQL migrations against the Prisma-managed
-- schema. Several legacy migrations conflict with Prisma's reshaped model
-- (notifications was per-tenant, Prisma made it per-user; users.id was INTEGER,
--  Prisma uses TEXT cuid; model_pricing was replaced by Prisma `models`).
--
-- This patch applies only the *net new* tables/columns/indexes needed by
-- features that aren't already covered by `prisma db push`.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 011_token_split: add input_tokens/output_tokens columns (skip backfill,
-- no historical data to migrate).
-- ---------------------------------------------------------------------
ALTER TABLE events      ADD COLUMN IF NOT EXISTS input_tokens  INTEGER;
ALTER TABLE events      ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS input_tokens  INTEGER DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------
-- 010_api_keys_magic_links — corrected: users.id is TEXT (cuid), not INTEGER.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id          SERIAL PRIMARY KEY,
  tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id)   ON DELETE SET NULL,
  name        TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  scopes      TEXT[] DEFAULT '{}',
  expires_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id           SERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_magic_link_hash    ON magic_link_tokens(token_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_magic_link_expires ON magic_link_tokens(expires_at);

-- ---------------------------------------------------------------------
-- 017_journal — schema only. Skip the hardcoded 'transformate' tenant
-- seed (that's author-specific data, not a schema requirement).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_identities (
  slug         TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('governor', 'agent')),
  emoji        TEXT,
  model        TEXT,
  home_server  TEXT,
  description  TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_identities_tenant ON agent_identities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_identities_active_harness
  ON agent_identities(tenant_id) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS work_entries (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_slug      TEXT REFERENCES agent_identities(slug) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  priority        TEXT,
  metadata        JSONB DEFAULT '{}',
  search_vector   tsvector,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_entries_tenant   ON work_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_entries_agent    ON work_entries(agent_slug);
CREATE INDEX IF NOT EXISTS idx_work_entries_status   ON work_entries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_work_entries_search   ON work_entries USING GIN (search_vector);

CREATE OR REPLACE FUNCTION work_entries_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_entries_search ON work_entries;
CREATE TRIGGER trg_work_entries_search BEFORE INSERT OR UPDATE
  ON work_entries FOR EACH ROW EXECUTE FUNCTION work_entries_search_trigger();

-- ---------------------------------------------------------------------
-- 018_memory_v2 — memory_facts (vector-backed long-term memory)
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_facts (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_slug    TEXT REFERENCES agent_identities(slug) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  content       TEXT NOT NULL,
  embedding     vector(1536),
  metadata      JSONB DEFAULT '{}',
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  decay_score   REAL DEFAULT 1.0,
  last_used_at  TIMESTAMPTZ,
  use_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_memory_facts_tenant_owner ON memory_facts(tenant_id, owner_slug);
CREATE INDEX IF NOT EXISTS idx_memory_facts_tenant_kind  ON memory_facts(tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_memory_facts_pinned       ON memory_facts(tenant_id) WHERE pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_memory_facts_embedding
  ON memory_facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 022_memory_facts_decay_index
CREATE INDEX IF NOT EXISTS idx_memory_facts_tenant_decay_score
  ON memory_facts(tenant_id, decay_score DESC);
CREATE INDEX IF NOT EXISTS idx_memory_facts_prune_candidates
  ON memory_facts(tenant_id, last_used_at NULLS FIRST)
  WHERE pinned = FALSE;

-- 023_memory_relevance_feedback
CREATE TABLE IF NOT EXISTS memory_retrieval_events (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fact_id         TEXT REFERENCES memory_facts(id) ON DELETE CASCADE,
  retrieved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  query_text      TEXT,
  feedback        SMALLINT,                  -- -1 / 0 / +1
  metadata        JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_memory_retrieval_events_fact_time
  ON memory_retrieval_events(fact_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_retrieval_events_retrieved_at
  ON memory_retrieval_events(retrieved_at DESC);

-- ---------------------------------------------------------------------
-- 020_work_items — separate from work_entries; lighter-weight task list
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_items (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_agent   TEXT REFERENCES agent_identities(slug) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  tier          TEXT,
  metadata      JSONB DEFAULT '{}',
  due_at        TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_items_tenant ON work_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_work_items_owner  ON work_items(owner_agent, status) WHERE owner_agent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_tier   ON work_items(tier, status);
