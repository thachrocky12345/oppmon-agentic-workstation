-- Migration 025: Rename columns from camelCase to snake_case
-- For Go/Rust compatibility
-- This migration renames all camelCase columns to snake_case
-- Uses DO blocks to handle columns that may not exist

-- Helper function to safely rename columns
CREATE OR REPLACE FUNCTION safe_rename_column(
  p_table TEXT,
  p_old_name TEXT,
  p_new_name TEXT
) RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', p_table, p_old_name, p_new_name);
EXCEPTION
  WHEN undefined_column THEN
    -- Column doesn't exist, skip
    NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- tenants table
-- ============================================================================
SELECT safe_rename_column('tenants', 'isActive', 'is_active');
SELECT safe_rename_column('tenants', 'fallbackDefaultModelId', 'fallback_default_model_id');
SELECT safe_rename_column('tenants', 'createdAt', 'created_at');
SELECT safe_rename_column('tenants', 'updatedAt', 'updated_at');

-- ============================================================================
-- teams table
-- ============================================================================
SELECT safe_rename_column('teams', 'tenantId', 'tenant_id');
SELECT safe_rename_column('teams', 'defaultModelId', 'default_model_id');
SELECT safe_rename_column('teams', 'createdAt', 'created_at');
SELECT safe_rename_column('teams', 'updatedAt', 'updated_at');

-- ============================================================================
-- users table
-- ============================================================================
SELECT safe_rename_column('users', 'passwordHash', 'password_hash');
SELECT safe_rename_column('users', 'tenantId', 'tenant_id');
SELECT safe_rename_column('users', 'isActive', 'is_active');
SELECT safe_rename_column('users', 'createdAt', 'created_at');
SELECT safe_rename_column('users', 'updatedAt', 'updated_at');

-- ============================================================================
-- user_sessions table
-- ============================================================================
SELECT safe_rename_column('user_sessions', 'userId', 'user_id');
SELECT safe_rename_column('user_sessions', 'expiresAt', 'expires_at');
SELECT safe_rename_column('user_sessions', 'createdAt', 'created_at');
SELECT safe_rename_column('user_sessions', 'userAgent', 'user_agent');
SELECT safe_rename_column('user_sessions', 'ipAddress', 'ip_address');

-- ============================================================================
-- oauth_accounts table
-- ============================================================================
SELECT safe_rename_column('oauth_accounts', 'userId', 'user_id');
SELECT safe_rename_column('oauth_accounts', 'providerAccountId', 'provider_account_id');
SELECT safe_rename_column('oauth_accounts', 'accessToken', 'access_token');
SELECT safe_rename_column('oauth_accounts', 'refreshToken', 'refresh_token');
SELECT safe_rename_column('oauth_accounts', 'expiresAt', 'expires_at');
SELECT safe_rename_column('oauth_accounts', 'createdAt', 'created_at');
SELECT safe_rename_column('oauth_accounts', 'updatedAt', 'updated_at');

-- ============================================================================
-- team_members table
-- ============================================================================
SELECT safe_rename_column('team_members', 'userId', 'user_id');
SELECT safe_rename_column('team_members', 'teamId', 'team_id');
SELECT safe_rename_column('team_members', 'createdAt', 'created_at');

-- ============================================================================
-- agents table
-- ============================================================================
SELECT safe_rename_column('agents', 'tenantId', 'tenant_id');
SELECT safe_rename_column('agents', 'teamId', 'team_id');
SELECT safe_rename_column('agents', 'lastSeen', 'last_seen');
SELECT safe_rename_column('agents', 'createdAt', 'created_at');
SELECT safe_rename_column('agents', 'updatedAt', 'updated_at');

-- ============================================================================
-- events table
-- ============================================================================
SELECT safe_rename_column('events', 'agentId', 'agent_id');
SELECT safe_rename_column('events', 'eventType', 'event_type');
SELECT safe_rename_column('events', 'sessionKey', 'session_key');
SELECT safe_rename_column('events', 'channelId', 'channel_id');
SELECT safe_rename_column('events', 'inputTokens', 'input_tokens');
SELECT safe_rename_column('events', 'outputTokens', 'output_tokens');
SELECT safe_rename_column('events', 'threatLevel', 'threat_level');
SELECT safe_rename_column('events', 'createdAt', 'created_at');

-- Add missing columns to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS session_key TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sender TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS threat_level TEXT DEFAULT 'none';
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- incidents table
-- ============================================================================
SELECT safe_rename_column('incidents', 'agentId', 'agent_id');
SELECT safe_rename_column('incidents', 'createdAt', 'created_at');
SELECT safe_rename_column('incidents', 'resolvedAt', 'resolved_at');

-- ============================================================================
-- incident_updates table
-- ============================================================================
SELECT safe_rename_column('incident_updates', 'incidentId', 'incident_id');
SELECT safe_rename_column('incident_updates', 'userId', 'user_id');
SELECT safe_rename_column('incident_updates', 'createdAt', 'created_at');

-- ============================================================================
-- notifications table
-- ============================================================================
SELECT safe_rename_column('notifications', 'userId', 'user_id');
SELECT safe_rename_column('notifications', 'isRead', 'is_read');
SELECT safe_rename_column('notifications', 'createdAt', 'created_at');

-- ============================================================================
-- workflows table
-- ============================================================================
SELECT safe_rename_column('workflows', 'tenantId', 'tenant_id');
SELECT safe_rename_column('workflows', 'isActive', 'is_active');
SELECT safe_rename_column('workflows', 'createdAt', 'created_at');
SELECT safe_rename_column('workflows', 'updatedAt', 'updated_at');

-- ============================================================================
-- workflow_runs table
-- ============================================================================
SELECT safe_rename_column('workflow_runs', 'workflowId', 'workflow_id');
SELECT safe_rename_column('workflow_runs', 'startedAt', 'started_at');
SELECT safe_rename_column('workflow_runs', 'completedAt', 'completed_at');

-- ============================================================================
-- skills table
-- ============================================================================
SELECT safe_rename_column('skills', 'tenantId', 'tenant_id');
SELECT safe_rename_column('skills', 'teamId', 'team_id');
SELECT safe_rename_column('skills', 'createdById', 'created_by_id');
SELECT safe_rename_column('skills', 'createdAt', 'created_at');
SELECT safe_rename_column('skills', 'updatedAt', 'updated_at');
SELECT safe_rename_column('skills', 'deletedAt', 'deleted_at');

-- ============================================================================
-- skill_versions table
-- ============================================================================
SELECT safe_rename_column('skill_versions', 'skillId', 'skill_id');
SELECT safe_rename_column('skill_versions', 'createdById', 'created_by_id');
SELECT safe_rename_column('skill_versions', 'createdAt', 'created_at');

-- ============================================================================
-- audit_logs table
-- ============================================================================
SELECT safe_rename_column('audit_logs', 'tenantId', 'tenant_id');
SELECT safe_rename_column('audit_logs', 'resourceType', 'resource_type');
SELECT safe_rename_column('audit_logs', 'resourceId', 'resource_id');
SELECT safe_rename_column('audit_logs', 'actorId', 'actor_id');
SELECT safe_rename_column('audit_logs', 'beforeState', 'before_state');
SELECT safe_rename_column('audit_logs', 'afterState', 'after_state');
SELECT safe_rename_column('audit_logs', 'ipAddress', 'ip_address');
SELECT safe_rename_column('audit_logs', 'userAgent', 'user_agent');
SELECT safe_rename_column('audit_logs', 'createdAt', 'created_at');

-- ============================================================================
-- llm_sessions table
-- ============================================================================
SELECT safe_rename_column('llm_sessions', 'tenantId', 'tenant_id');
SELECT safe_rename_column('llm_sessions', 'userId', 'user_id');
SELECT safe_rename_column('llm_sessions', 'createdAt', 'created_at');
SELECT safe_rename_column('llm_sessions', 'updatedAt', 'updated_at');

-- ============================================================================
-- llm_messages table
-- ============================================================================
SELECT safe_rename_column('llm_messages', 'sessionId', 'session_id');
SELECT safe_rename_column('llm_messages', 'inputTokens', 'input_tokens');
SELECT safe_rename_column('llm_messages', 'outputTokens', 'output_tokens');
SELECT safe_rename_column('llm_messages', 'createdAt', 'created_at');

-- ============================================================================
-- embeddings table
-- ============================================================================
SELECT safe_rename_column('embeddings', 'tenantId', 'tenant_id');
SELECT safe_rename_column('embeddings', 'sourceType', 'source_type');
SELECT safe_rename_column('embeddings', 'sourceId', 'source_id');
SELECT safe_rename_column('embeddings', 'contentHash', 'content_hash');
SELECT safe_rename_column('embeddings', 'createdAt', 'created_at');
SELECT safe_rename_column('embeddings', 'updatedAt', 'updated_at');

-- ============================================================================
-- mcp_servers table
-- ============================================================================
SELECT safe_rename_column('mcp_servers', 'tenantId', 'tenant_id');
SELECT safe_rename_column('mcp_servers', 'teamId', 'team_id');
SELECT safe_rename_column('mcp_servers', 'createdAt', 'created_at');
SELECT safe_rename_column('mcp_servers', 'updatedAt', 'updated_at');
SELECT safe_rename_column('mcp_servers', 'deletedAt', 'deleted_at');

-- ============================================================================
-- tenant_settings table
-- ============================================================================
SELECT safe_rename_column('tenant_settings', 'tenantId', 'tenant_id');
SELECT safe_rename_column('tenant_settings', 'eventsEnabled', 'events_enabled');
SELECT safe_rename_column('tenant_settings', 'createdAt', 'created_at');
SELECT safe_rename_column('tenant_settings', 'updatedAt', 'updated_at');

-- ============================================================================
-- usage_events table
-- ============================================================================
SELECT safe_rename_column('usage_events', 'tenantId', 'tenant_id');
SELECT safe_rename_column('usage_events', 'resourceType', 'resource_type');
SELECT safe_rename_column('usage_events', 'resourceId', 'resource_id');
SELECT safe_rename_column('usage_events', 'bucketTimestamp', 'bucket_timestamp');
SELECT safe_rename_column('usage_events', 'createdAt', 'created_at');

-- ============================================================================
-- models table
-- ============================================================================
SELECT safe_rename_column('models', 'tenantId', 'tenant_id');
SELECT safe_rename_column('models', 'teamId', 'team_id');
SELECT safe_rename_column('models', 'displayName', 'display_name');
SELECT safe_rename_column('models', 'providerTemplateId', 'provider_template_id');
SELECT safe_rename_column('models', 'modelIdentifier', 'model_identifier');
SELECT safe_rename_column('models', 'publicConfig', 'public_config');
SELECT safe_rename_column('models', 'secretRef', 'secret_ref');
SELECT safe_rename_column('models', 'yamlOverride', 'yaml_override');
SELECT safe_rename_column('models', 'createdById', 'created_by_id');
SELECT safe_rename_column('models', 'lastSyncedAt', 'last_synced_at');
SELECT safe_rename_column('models', 'createdAt', 'created_at');
SELECT safe_rename_column('models', 'updatedAt', 'updated_at');
SELECT safe_rename_column('models', 'deletedAt', 'deleted_at');

-- ============================================================================
-- model_secrets table
-- ============================================================================
SELECT safe_rename_column('model_secrets', 'tenantId', 'tenant_id');
SELECT safe_rename_column('model_secrets', 'encryptedPayload', 'encrypted_payload');
SELECT safe_rename_column('model_secrets', 'createdAt', 'created_at');

-- ============================================================================
-- virtual_keys table
-- ============================================================================
SELECT safe_rename_column('virtual_keys', 'tenantId', 'tenant_id');
SELECT safe_rename_column('virtual_keys', 'userId', 'user_id');
SELECT safe_rename_column('virtual_keys', 'keyPrefix', 'key_prefix');
SELECT safe_rename_column('virtual_keys', 'keyHash', 'key_hash');
SELECT safe_rename_column('virtual_keys', 'expiresAt', 'expires_at');
SELECT safe_rename_column('virtual_keys', 'lastUsedAt', 'last_used_at');
SELECT safe_rename_column('virtual_keys', 'createdAt', 'created_at');
SELECT safe_rename_column('virtual_keys', 'revokedAt', 'revoked_at');

-- ============================================================================
-- tenant_routing_states table
-- ============================================================================
SELECT safe_rename_column('tenant_routing_states', 'tenantId', 'tenant_id');
SELECT safe_rename_column('tenant_routing_states', 'litellmContainerName', 'litellm_container_name');
SELECT safe_rename_column('tenant_routing_states', 'masterKeySecretRef', 'master_key_secret_ref');
SELECT safe_rename_column('tenant_routing_states', 'lastHealthCheckAt', 'last_health_check_at');
SELECT safe_rename_column('tenant_routing_states', 'lastError', 'last_error');
SELECT safe_rename_column('tenant_routing_states', 'restartCount', 'restart_count');
SELECT safe_rename_column('tenant_routing_states', 'createdAt', 'created_at');
SELECT safe_rename_column('tenant_routing_states', 'updatedAt', 'updated_at');

-- ============================================================================
-- Memory tables
-- ============================================================================
SELECT safe_rename_column('conversational_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('conversational_memory', 'threadId', 'thread_id');
SELECT safe_rename_column('conversational_memory', 'createdAt', 'created_at');

SELECT safe_rename_column('semantic_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('semantic_memory', 'teamId', 'team_id');
SELECT safe_rename_column('semantic_memory', 'createdAt', 'created_at');

SELECT safe_rename_column('workflow_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('workflow_memory', 'createdAt', 'created_at');

SELECT safe_rename_column('toolbox_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('toolbox_memory', 'toolName', 'tool_name');
SELECT safe_rename_column('toolbox_memory', 'originalDescription', 'original_description');
SELECT safe_rename_column('toolbox_memory', 'augmentedDescription', 'augmented_description');
SELECT safe_rename_column('toolbox_memory', 'createdAt', 'created_at');
SELECT safe_rename_column('toolbox_memory', 'updatedAt', 'updated_at');

SELECT safe_rename_column('entity_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('entity_memory', 'entityType', 'entity_type');
SELECT safe_rename_column('entity_memory', 'entityName', 'entity_name');
SELECT safe_rename_column('entity_memory', 'createdAt', 'created_at');
SELECT safe_rename_column('entity_memory', 'updatedAt', 'updated_at');

SELECT safe_rename_column('summary_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('summary_memory', 'threadId', 'thread_id');
SELECT safe_rename_column('summary_memory', 'originalMessageCount', 'original_message_count');
SELECT safe_rename_column('summary_memory', 'createdAt', 'created_at');

SELECT safe_rename_column('persona_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('persona_memory', 'teamId', 'team_id');
SELECT safe_rename_column('persona_memory', 'createdAt', 'created_at');
SELECT safe_rename_column('persona_memory', 'updatedAt', 'updated_at');

SELECT safe_rename_column('tool_log_memory', 'tenantId', 'tenant_id');
SELECT safe_rename_column('tool_log_memory', 'threadId', 'thread_id');
SELECT safe_rename_column('tool_log_memory', 'toolName', 'tool_name');
SELECT safe_rename_column('tool_log_memory', 'durationMs', 'duration_ms');
SELECT safe_rename_column('tool_log_memory', 'createdAt', 'created_at');

-- ============================================================================
-- RAG tables
-- ============================================================================
SELECT safe_rename_column('rag_collections', 'tenantId', 'tenant_id');
SELECT safe_rename_column('rag_collections', 'teamId', 'team_id');
SELECT safe_rename_column('rag_collections', 'createdById', 'created_by_id');
SELECT safe_rename_column('rag_collections', 'createdAt', 'created_at');
SELECT safe_rename_column('rag_collections', 'updatedAt', 'updated_at');
SELECT safe_rename_column('rag_collections', 'deletedAt', 'deleted_at');

SELECT safe_rename_column('rag_documents', 'collectionId', 'collection_id');
SELECT safe_rename_column('rag_documents', 'tenantId', 'tenant_id');
SELECT safe_rename_column('rag_documents', 'originalFilename', 'original_filename');
SELECT safe_rename_column('rag_documents', 'mimeType', 'mime_type');
SELECT safe_rename_column('rag_documents', 'sizeBytes', 'size_bytes');
SELECT safe_rename_column('rag_documents', 'filePath', 'file_path');
SELECT safe_rename_column('rag_documents', 'fileSha256', 'file_sha256');
SELECT safe_rename_column('rag_documents', 'extractionStatus', 'extraction_status');
SELECT safe_rename_column('rag_documents', 'extractionError', 'extraction_error');
SELECT safe_rename_column('rag_documents', 'chunkCount', 'chunk_count');
SELECT safe_rename_column('rag_documents', 'uploadedById', 'uploaded_by_id');
SELECT safe_rename_column('rag_documents', 'createdAt', 'created_at');
SELECT safe_rename_column('rag_documents', 'updatedAt', 'updated_at');
SELECT safe_rename_column('rag_documents', 'deletedAt', 'deleted_at');

SELECT safe_rename_column('rag_chunks', 'documentId', 'document_id');
SELECT safe_rename_column('rag_chunks', 'tenantId', 'tenant_id');
SELECT safe_rename_column('rag_chunks', 'chunkIndex', 'chunk_index');
SELECT safe_rename_column('rag_chunks', 'pageNumber', 'page_number');
SELECT safe_rename_column('rag_chunks', 'tokenCount', 'token_count');
SELECT safe_rename_column('rag_chunks', 'createdAt', 'created_at');

-- ============================================================================
-- Create tool_calls table (new)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  status TEXT DEFAULT 'completed',
  duration_ms INTEGER,
  session_key TEXT,
  error_msg TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_agent_created ON tool_calls(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);

-- ============================================================================
-- Create daily_stats table (new)
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

-- Cleanup helper function
DROP FUNCTION IF EXISTS safe_rename_column;
