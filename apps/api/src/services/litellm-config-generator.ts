// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * LiteLLM Config Generator
 * Generates LiteLLM YAML configuration from tenant's models
 */

import { providerRegistry } from '@oppmon/shared';
import { getEnabledModelsForTenant } from './models.js';

// ============================================================================
// Types
// ============================================================================

interface LiteLLMModelConfig {
  model_name: string;
  litellm_params: Record<string, unknown>;
}

interface LiteLLMConfig {
  model_list: LiteLLMModelConfig[];
  litellm_settings?: Record<string, unknown>;
  general_settings?: Record<string, unknown>;
}

// ============================================================================
// Template Rendering
// ============================================================================

/**
 * Render a value from template, supporting mustache-style placeholders
 * Handles {{field}} and {{field1|field2}} (fallback) syntax
 */
function renderValue(
  template: unknown,
  publicConfig: Record<string, unknown>,
  secretConfig: Record<string, string>
): unknown {
  if (typeof template !== 'string') {
    return template;
  }

  // If it's not a template, return as-is
  if (!template.includes('{{')) {
    return template;
  }

  // Replace all {{key}} or {{key1|key2}} patterns
  const result = template.replace(/\{\{([^}]+)\}\}/g, (_match, keys: string) => {
    const keyList = keys.split('|').map((k: string) => k.trim());

    for (const key of keyList) {
      // Check secretConfig first, then publicConfig
      if (key in secretConfig) {
        return secretConfig[key];
      }
      if (key in publicConfig) {
        const value = publicConfig[key];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
    }

    // Return empty string if no value found
    return '';
  });

  // If the entire value was a single template, try to preserve type
  if (template.match(/^\{\{[^}]+\}\}$/)) {
    const key = template.slice(2, -2).split('|')[0].trim();
    if (key in secretConfig) {
      return secretConfig[key];
    }
    if (key in publicConfig) {
      return publicConfig[key];
    }
  }

  return result;
}

/**
 * Render all values in a litellm_params object
 */
function renderLitellmParams(
  template: Record<string, unknown>,
  publicConfig: Record<string, unknown>,
  secretConfig: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(template)) {
    const rendered = renderValue(value, publicConfig, secretConfig);

    // Skip empty strings and null values
    if (rendered === '' || rendered === null || rendered === undefined) {
      continue;
    }

    result[key] = rendered;
  }

  return result;
}

// ============================================================================
// Config Generation
// ============================================================================

/**
 * Generate LiteLLM YAML config for a tenant
 */
export async function generateLiteLLMConfig(tenantId: string): Promise<string> {
  const modelsWithSecrets = await getEnabledModelsForTenant(tenantId);

  const modelList: LiteLLMModelConfig[] = [];

  for (const { model, secrets, yamlOverride } of modelsWithSecrets) {
    // YAML mode: parse and include directly
    if (yamlOverride) {
      try {
        // Basic YAML parsing (for model_list entries)
        // Note: A more robust solution would use a YAML parser
        const yamlConfig = parseYamlEntry(yamlOverride);
        if (yamlConfig) {
          modelList.push(yamlConfig);
        }
      } catch (error) {
        console.error(`Failed to parse YAML override for model ${model.id}:`, error);
      }
      continue;
    }

    // Template mode: render from provider template
    if (model.providerTemplateId) {
      const template = providerRegistry.get(model.providerTemplateId);
      if (!template) {
        console.warn(`Unknown provider template: ${model.providerTemplateId}`);
        continue;
      }

      // Add display_name to config for template rendering
      const fullPublicConfig = {
        ...model.publicConfig,
        display_name: model.displayName,
      };

      const litellmParams = renderLitellmParams(
        template.litellmTemplate.litellm_params,
        fullPublicConfig,
        secrets
      );

      modelList.push({
        model_name: model.displayName,
        litellm_params: litellmParams,
      });
    }
  }

  const config: LiteLLMConfig = {
    model_list: modelList,
    litellm_settings: {
      drop_params: true,
      set_verbose: false,
    },
    general_settings: {
      master_key: `sk-litellm-${tenantId}`, // Will be replaced by orchestrator
    },
  };

  return generateYaml(config);
}

// ============================================================================
// YAML Generation
// ============================================================================

/**
 * Generate YAML from config object
 * This is a simple implementation - production would use a proper YAML library
 */
function generateYaml(config: LiteLLMConfig): string {
  const lines: string[] = [];

  // Model list
  lines.push('model_list:');
  for (const model of config.model_list) {
    lines.push(`  - model_name: "${escapeYamlString(model.model_name)}"`);
    lines.push('    litellm_params:');
    for (const [key, value] of Object.entries(model.litellm_params)) {
      lines.push(`      ${key}: ${formatYamlValue(value)}`);
    }
  }

  // LiteLLM settings
  if (config.litellm_settings) {
    lines.push('');
    lines.push('litellm_settings:');
    for (const [key, value] of Object.entries(config.litellm_settings)) {
      lines.push(`  ${key}: ${formatYamlValue(value)}`);
    }
  }

  // General settings
  if (config.general_settings) {
    lines.push('');
    lines.push('general_settings:');
    for (const [key, value] of Object.entries(config.general_settings)) {
      lines.push(`  ${key}: ${formatYamlValue(value)}`);
    }
  }

  return lines.join('\n');
}

function formatYamlValue(value: unknown): string {
  if (typeof value === 'string') {
    // Check if the string needs quoting
    if (
      value.includes(':') ||
      value.includes('#') ||
      value.includes('"') ||
      value.includes("'") ||
      value.includes('\n') ||
      value.startsWith(' ') ||
      value.endsWith(' ') ||
      /^[0-9]/.test(value) ||
      ['true', 'false', 'null', 'yes', 'no', 'on', 'off'].includes(value.toLowerCase())
    ) {
      return `"${escapeYamlString(value)}"`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatYamlValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    // Inline object for simple cases
    const pairs = Object.entries(value)
      .map(([k, v]) => `${k}: ${formatYamlValue(v)}`)
      .join(', ');
    return `{${pairs}}`;
  }
  return String(value);
}

function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Parse a YAML entry string into a config object
 * This is a basic parser - production would use a proper YAML library
 */
function parseYamlEntry(yaml: string): LiteLLMModelConfig | null {
  try {
    // Very basic YAML parsing for single model entries
    const lines = yaml.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));

    let modelName = '';
    const litellmParams: Record<string, unknown> = {};
    let inLitellmParams = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Model name
      if (trimmed.startsWith('model_name:')) {
        modelName = trimmed.substring('model_name:'.length).trim().replace(/^["']|["']$/g, '');
        continue;
      }

      // litellm_params section
      if (trimmed === 'litellm_params:') {
        inLitellmParams = true;
        continue;
      }

      // Inside litellm_params
      if (inLitellmParams && line.startsWith('  ') || line.startsWith('\t')) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          const key = trimmed.substring(0, colonIdx).trim();
          let value: unknown = trimmed.substring(colonIdx + 1).trim();

          // Parse value
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (value === 'null' || value === '') value = null;
          else if (typeof value === 'string' && /^-?\d+$/.test(value)) value = parseInt(value, 10);
          else if (typeof value === 'string' && /^-?\d+\.\d+$/.test(value)) value = parseFloat(value);
          else if (typeof value === 'string') value = value.replace(/^["']|["']$/g, '');

          if (value !== null && value !== '') {
            litellmParams[key] = value;
          }
        }
      }
    }

    if (!modelName || Object.keys(litellmParams).length === 0) {
      return null;
    }

    return {
      model_name: modelName,
      litellm_params: litellmParams,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { LiteLLMConfig, LiteLLMModelConfig };
