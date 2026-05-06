-- Migration 024: Prisma Schema Alignment
-- Aligns database with Prisma schema using snake_case column names
-- For Go/Rust compatibility

-- ============================================================================
-- Extension: pgvector for embeddings
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Multi-tenancy: tenants table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  fallback_default_model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Multi-tenancy: teams table
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  default_model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_id ON teams(tenant_id);

-- ============================================================================
-- Users & Authentication
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);

-- ============================================================================
-- Agents & Events (Core)
-- ============================================================================
-- Drop and recreate agents table with correct schema
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS tool_calls CASCADE;
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS agents CASCADE;

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  framework TEXT NOT NULL DEFAULT 'CUSTOM',
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  config JSONB DEFAULT '{}',
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX idx_agents_tenant_id ON agents(tenant_id);
CREATE INDEX idx_agents_team_id ON agents(team_id);
CREATE INDEX idx_agents_status ON agents(status);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  direction TEXT,
  session_key TEXT,
  channel_id TEXT,
  sender TEXT,
  content TEXT,
  payload JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info',
  input_tokens INTEGER,
  output_tokens INTEGER,
  threat_level TEXT DEFAULT 'none',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_agent_timestamp ON events(agent_id, timestamp DESC);
CREATE INDEX idx_events_type_timestamp ON events(event_type, timestamp DESC);

-- ============================================================================
-- Tool Calls Tracking
-- ============================================================================
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  status TEXT DEFAULT 'completed',
  duration_ms INTEGER,
  session_key TEXT,
  error_msg TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tool_calls_agent_created ON tool_calls(agent_id, created_at DESC);
CREATE INDEX idx_tool_calls_tool_name ON tool_calls(tool_name);
CREATE INDEX idx_tool_calls_status ON tool_calls(status);

-- ============================================================================
-- Daily Stats (Aggregated Usage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_stats (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  day DATE NOT NULL,
  messages_received INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  tool_calls INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant_day ON daily_stats(tenant_id, day);

-- ============================================================================
-- Incidents
-- ============================================================================
CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_incidents_status_created ON incidents(status, created_at DESC);
CREATE INDEX idx_incidents_agent_id ON incidents(agent_id);

CREATE TABLE IF NOT EXISTS incident_updates (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_updates_incident ON incident_updates(incident_id);

-- ============================================================================
-- Notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at DESC);

-- ============================================================================
-- Workflows
-- ============================================================================
DROP TABLE IF EXISTS workflow_runs CASCADE;
DROP TABLE IF EXISTS workflows CASCADE;

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tenant_id TEXT NOT NULL,
  definition JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workflows_tenant_active ON workflows(tenant_id, is_active);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  context JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);

-- ============================================================================
-- Skills Registry
-- ============================================================================
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER DEFAULT 1,
  content TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  scope TEXT DEFAULT 'TEAM',
  enabled BOOLEAN DEFAULT TRUE,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, name, version)
);
CREATE INDEX IF NOT EXISTS idx_skills_tenant ON skills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_skills_team ON skills(team_id);
CREATE INDEX IF NOT EXISTS idx_skills_scope ON skills(scope);
CREATE INDEX IF NOT EXISTS idx_skills_deleted ON skills(deleted_at);

CREATE TABLE IF NOT EXISTS skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(skill_id, version)
);
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id);

-- ============================================================================
-- Audit Logging
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  before_state JSONB,
  after_state JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_type_created ON audit_logs(tenant_id, resource_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================================================
-- LLM Sessions & Messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS llm_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_llm_sessions_tenant_user ON llm_sessions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_llm_sessions_user_updated ON llm_sessions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS llm_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES llm_sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_llm_messages_session_created ON llm_messages(session_id, created_at);

-- ============================================================================
-- Embeddings & Vector Search
-- ============================================================================
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  metadata JSONB,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, source_type, source_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_type ON embeddings(tenant_id, source_type);
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_source ON embeddings(tenant_id, source_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON embeddings(content_hash);

-- ============================================================================
-- MCP Server Registry
-- ============================================================================
DROP TABLE IF EXISTS mcp_servers CASCADE;
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  team_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args TEXT[] DEFAULT '{}',
  env JSONB DEFAULT '{}',
  version TEXT DEFAULT '1.0.0',
  sha256 TEXT NOT NULL,
  scope TEXT DEFAULT 'TEAM',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, name)
);
CREATE INDEX idx_mcp_servers_tenant ON mcp_servers(tenant_id);
CREATE INDEX idx_mcp_servers_team ON mcp_servers(team_id);
CREATE INDEX idx_mcp_servers_scope ON mcp_servers(scope);
CREATE INDEX idx_mcp_servers_deleted ON mcp_servers(deleted_at);

-- ============================================================================
-- Tenant Settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL,
  events_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Usage Events (Privacy-First)
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  bucket_timestamp TIMESTAMPTZ NOT NULL,
  count INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, resource_type, resource_id, action, bucket_timestamp)
);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_bucket ON usage_events(tenant_id, bucket_timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_type ON usage_events(tenant_id, resource_type);

-- ============================================================================
-- Model Routing
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_secrets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  encrypted_payload BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_model_secrets_tenant ON model_secrets(tenant_id);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope TEXT DEFAULT 'TENANT',
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  provider_template_id TEXT,
  model_identifier TEXT NOT NULL,
  public_config JSONB DEFAULT '{}',
  secret_ref TEXT REFERENCES model_secrets(id),
  yaml_override TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, display_name)
);
CREATE INDEX IF NOT EXISTS idx_models_tenant_enabled ON models(tenant_id, enabled, deleted_at);
CREATE INDEX IF NOT EXISTS idx_models_team ON models(team_id);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_template_id);

CREATE TABLE IF NOT EXISTS virtual_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_prefix VARCHAR(8) UNIQUE NOT NULL,
  key_hash TEXT NOT NULL,
  label TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_prefix ON virtual_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_user_enabled ON virtual_keys(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_tenant ON virtual_keys(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_routing_states (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  litellm_container_name TEXT,
  master_key_secret_ref TEXT,
  status TEXT DEFAULT 'STOPPED',
  last_health_check_at TIMESTAMPTZ,
  last_error TEXT,
  restart_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Memory System (8 Tables)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversational_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_memory_tenant_thread ON conversational_memory(tenant_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_memory_thread ON conversational_memory(thread_id);

CREATE TABLE IF NOT EXISTS semantic_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  team_id TEXT,
  content TEXT NOT NULL,
  embedding vector(1024),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_tenant ON semantic_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_team ON semantic_memory(team_id);

CREATE TABLE IF NOT EXISTS workflow_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_memory_tenant ON workflow_memory(tenant_id);

CREATE TABLE IF NOT EXISTS toolbox_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  original_description TEXT NOT NULL,
  augmented_description TEXT NOT NULL,
  embedding vector(1024),
  category TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, tool_name)
);
CREATE INDEX IF NOT EXISTS idx_toolbox_memory_tenant ON toolbox_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_memory_category ON toolbox_memory(category);

CREATE TABLE IF NOT EXISTS entity_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  description TEXT NOT NULL,
  embedding vector(1024),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entity_memory_tenant_type ON entity_memory(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_memory_name ON entity_memory(entity_name);

CREATE TABLE IF NOT EXISTS summary_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  original_message_count INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_summary_memory_tenant_thread ON summary_memory(tenant_id, thread_id);

CREATE TABLE IF NOT EXISTS persona_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  team_id TEXT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  traits JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_persona_memory_tenant ON persona_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_persona_memory_team ON persona_memory(team_id);

CREATE TABLE IF NOT EXISTS tool_log_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL,
  output JSONB NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_log_memory_tenant_thread ON tool_log_memory(tenant_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_log_memory_tool ON tool_log_memory(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_log_memory_status ON tool_log_memory(status);

-- ============================================================================
-- RAG Document Management
-- ============================================================================
CREATE TABLE IF NOT EXISTS rag_collections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT DEFAULT 'TENANT',
  team_id TEXT,
  created_by_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_rag_collections_tenant_deleted ON rag_collections(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_rag_collections_team ON rag_collections(team_id);
CREATE INDEX IF NOT EXISTS idx_rag_collections_scope ON rag_collections(scope);

CREATE TABLE IF NOT EXISTS rag_documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES rag_collections(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  extraction_status TEXT DEFAULT 'PENDING',
  extraction_error TEXT,
  chunk_count INTEGER DEFAULT 0,
  uploaded_by_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(collection_id, file_sha256)
);
CREATE INDEX IF NOT EXISTS idx_rag_documents_tenant_collection ON rag_documents(tenant_id, collection_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(extraction_status);
CREATE INDEX IF NOT EXISTS idx_rag_documents_sha256 ON rag_documents(file_sha256);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  token_count INTEGER NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tenant ON rag_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document_index ON rag_chunks(document_id, chunk_index);

-- ============================================================================
-- HNSW Indexes for Vector Search (if pgvector supports it)
-- ============================================================================
-- These are created after data to be more efficient

-- For embeddings table (1536 dimensions - OpenAI)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);

-- For RAG chunks (1536 dimensions - OpenAI)
CREATE INDEX IF NOT EXISTS idx_rag_chunks_vector ON rag_chunks USING hnsw (embedding vector_cosine_ops);

-- For memory tables (1024 dimensions - BGE-M3)
CREATE INDEX IF NOT EXISTS idx_semantic_memory_vector ON semantic_memory USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_workflow_memory_vector ON workflow_memory USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_toolbox_memory_vector ON toolbox_memory USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_entity_memory_vector ON entity_memory USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_summary_memory_vector ON summary_memory USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_persona_memory_vector ON persona_memory USING hnsw (embedding vector_cosine_ops);
