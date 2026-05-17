// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Provider Template Types
 * Core types for multi-provider model routing configuration
 */

// ============================================================================
// Template Field Types
// ============================================================================

export type FieldType = 'text' | 'password' | 'select' | 'textarea' | 'json' | 'number' | 'boolean';

export interface TemplateFieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface TemplateField {
  /** Unique key for this field */
  key: string;
  /** Display label */
  label: string;
  /** Field input type */
  type: FieldType;
  /** Whether this field contains a secret (API key, etc.) */
  secret: boolean;
  /** Whether this field is required */
  required: boolean;
  /** Options for select fields */
  options?: TemplateFieldOption[];
  /** Placeholder text */
  placeholder?: string;
  /** Help text shown below the field */
  help?: string;
  /** Default value */
  default?: string | number | boolean;
  /** Validation regex pattern (for text fields) */
  pattern?: string;
  /** Validation error message for pattern */
  patternError?: string;
  /** Minimum value (for number fields) */
  min?: number;
  /** Maximum value (for number fields) */
  max?: number;
  /** Conditional visibility: field is shown only when condition is met */
  showWhen?: {
    field: string;
    equals: string | number | boolean;
  };
}

// ============================================================================
// Provider Template Types
// ============================================================================

export type ProviderCategory = 'cloud' | 'local' | 'compatible';

export interface ProviderTemplate {
  /** Unique provider template ID */
  id: string;
  /** Display name shown in UI */
  displayName: string;
  /** Short description */
  description: string;
  /** Provider category */
  category: ProviderCategory;
  /** Icon identifier (for UI) */
  icon: string;
  /** Configuration fields */
  fields: TemplateField[];
  /**
   * Template for generating LiteLLM config.
   * Uses mustache-style placeholders: {{field_key}}
   */
  litellmTemplate: LiteLLMModelConfig;
  /**
   * Validation function name.
   * Maps to validator implementation in apps/api/src/validators/providers/
   */
  validatorId: string;
  /** Documentation URL */
  docsUrl: string;
  /** Setup steps shown in UI */
  setupSteps: string[];
  /** Whether this provider supports streaming */
  supportsStreaming: boolean;
  /** Whether this provider supports function calling */
  supportsFunctionCalling: boolean;
  /** Default model identifier (for quick setup) */
  defaultModel?: string;
}

// ============================================================================
// LiteLLM Configuration Types
// ============================================================================

export interface LiteLLMModelConfig {
  /** Model name in LiteLLM format (e.g., "anthropic/claude-3-sonnet-20240229") */
  model_name: string;
  /** LiteLLM provider params */
  litellm_params: {
    /** Model identifier */
    model: string;
    /** API key (use {{api_key}} placeholder) */
    api_key?: string;
    /** API base URL */
    api_base?: string;
    /** API version (for Azure) */
    api_version?: string;
    /** AWS region (for Bedrock) */
    aws_region_name?: string;
    /** AWS access key */
    aws_access_key_id?: string;
    /** AWS secret key */
    aws_secret_access_key?: string;
    /** Custom headers */
    extra_headers?: Record<string, string>;
    /** Additional provider-specific params */
    [key: string]: unknown;
  };
}

// ============================================================================
// Model Configuration Types
// ============================================================================

export type ModelScope = 'TENANT' | 'TEAM';

export type RoutingStatus = 'PROVISIONING' | 'RUNNING' | 'DEGRADED' | 'FAILED' | 'STOPPED';

export interface ModelConfig {
  id: string;
  tenantId: string;
  scope: ModelScope;
  teamId?: string;
  displayName: string;
  /** Provider template ID (null = YAML mode) */
  providerTemplateId?: string;
  /** Model identifier (e.g., "claude-3-sonnet-20240229") */
  modelIdentifier: string;
  /** Public (non-secret) configuration */
  publicConfig: Record<string, unknown>;
  /** Whether YAML override mode is used */
  isYamlMode: boolean;
  /** YAML override content (for advanced users) */
  yamlOverride?: string;
  enabled: boolean;
  createdById: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface VirtualKeyConfig {
  id: string;
  tenantId: string;
  userId: string;
  /** 8-character prefix for key lookup */
  keyPrefix: string;
  label?: string;
  enabled: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  revokedAt?: Date;
}

export interface TenantRoutingStateConfig {
  tenantId: string;
  litellmContainerName?: string;
  status: RoutingStatus;
  lastHealthCheckAt?: Date;
  lastError?: string;
  restartCount: number;
}

// ============================================================================
// Connection Test Types
// ============================================================================

export interface ConnectionTestRequest {
  /** Provider template ID (null = YAML mode) */
  providerTemplateId?: string;
  /** Public configuration */
  publicConfig?: Record<string, unknown>;
  /** Secret configuration (API keys, etc.) */
  secretConfig?: Record<string, string>;
  /** Raw YAML override (for YAML mode) */
  yamlOverride?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  modelInfo?: {
    name: string;
    provider: string;
    contextLength?: number;
  };
  error?: {
    code: string;
    message: string;
    hint?: string;
  };
}

// ============================================================================
// Registry Types
// ============================================================================

export interface ProviderRegistry {
  /** All registered provider templates */
  templates: Map<string, ProviderTemplate>;
  /** Get template by ID */
  get(id: string): ProviderTemplate | undefined;
  /** Get all templates */
  getAll(): ProviderTemplate[];
  /** Get templates by category */
  getByCategory(category: ProviderCategory): ProviderTemplate[];
  /** Check if template exists */
  has(id: string): boolean;
}
