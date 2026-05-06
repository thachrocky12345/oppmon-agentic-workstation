/**
 * Provider Registry
 * Central registry for all provider templates
 */

// Export core types
export * from './template.js';

// Export individual provider templates
export { anthropicTemplate } from './templates/anthropic.js';
export { bedrockTemplate } from './templates/bedrock.js';
export { azureOpenAITemplate } from './templates/azure-openai.js';
export { openAITemplate } from './templates/openai.js';
export { ollamaTemplate } from './templates/ollama.js';
export { cerebrasTemplate } from './templates/cerebras.js';
export { openAICompatibleTemplate, openAICompatiblePresets } from './templates/openai-compatible.js';

// Import for registry
import { anthropicTemplate } from './templates/anthropic.js';
import { bedrockTemplate } from './templates/bedrock.js';
import { azureOpenAITemplate } from './templates/azure-openai.js';
import { openAITemplate } from './templates/openai.js';
import { ollamaTemplate } from './templates/ollama.js';
import { cerebrasTemplate } from './templates/cerebras.js';
import { openAICompatibleTemplate } from './templates/openai-compatible.js';
import type { ProviderTemplate, ProviderCategory, ProviderRegistry } from './template.js';

// ============================================================================
// Provider Registry Implementation
// ============================================================================

const allTemplates: ProviderTemplate[] = [
  anthropicTemplate,
  bedrockTemplate,
  azureOpenAITemplate,
  openAITemplate,
  ollamaTemplate,
  cerebrasTemplate,
  openAICompatibleTemplate,
];

const templateMap = new Map<string, ProviderTemplate>(
  allTemplates.map((t) => [t.id, t])
);

/**
 * Provider Registry - access all provider templates
 */
export const providerRegistry: ProviderRegistry = {
  templates: templateMap,

  get(id: string): ProviderTemplate | undefined {
    return templateMap.get(id);
  },

  getAll(): ProviderTemplate[] {
    return allTemplates;
  },

  getByCategory(category: ProviderCategory): ProviderTemplate[] {
    return allTemplates.filter((t) => t.category === category);
  },

  has(id: string): boolean {
    return templateMap.has(id);
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get provider templates grouped by category
 */
export function getProvidersByCategory(): Record<ProviderCategory, ProviderTemplate[]> {
  return {
    cloud: providerRegistry.getByCategory('cloud'),
    local: providerRegistry.getByCategory('local'),
    compatible: providerRegistry.getByCategory('compatible'),
  };
}

/**
 * Get cloud providers (Anthropic, Bedrock, Azure, OpenAI, Cerebras)
 */
export function getCloudProviders(): ProviderTemplate[] {
  return providerRegistry.getByCategory('cloud');
}

/**
 * Get local providers (Ollama)
 */
export function getLocalProviders(): ProviderTemplate[] {
  return providerRegistry.getByCategory('local');
}

/**
 * Get compatible providers (OpenAI-compatible)
 */
export function getCompatibleProviders(): ProviderTemplate[] {
  return providerRegistry.getByCategory('compatible');
}

/**
 * Validate that required fields are present in config
 */
export function validateRequiredFields(
  templateId: string,
  config: Record<string, unknown>
): { valid: boolean; missingFields: string[] } {
  const template = providerRegistry.get(templateId);
  if (!template) {
    return { valid: false, missingFields: ['Template not found'] };
  }

  const missingFields: string[] = [];

  for (const field of template.fields) {
    if (field.required) {
      // Check showWhen condition
      if (field.showWhen) {
        const conditionField = config[field.showWhen.field];
        if (conditionField !== field.showWhen.equals) {
          continue; // Field not visible, skip validation
        }
      }

      const value = config[field.key];
      if (value === undefined || value === null || value === '') {
        missingFields.push(field.key);
      }
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Extract secret fields from config
 */
export function extractSecretFields(
  templateId: string,
  config: Record<string, unknown>
): { publicConfig: Record<string, unknown>; secretConfig: Record<string, string> } {
  const template = providerRegistry.get(templateId);
  if (!template) {
    return { publicConfig: config, secretConfig: {} };
  }

  const publicConfig: Record<string, unknown> = {};
  const secretConfig: Record<string, string> = {};

  for (const [key, value] of Object.entries(config)) {
    const field = template.fields.find((f) => f.key === key);
    if (field?.secret && typeof value === 'string') {
      secretConfig[key] = value;
    } else {
      publicConfig[key] = value;
    }
  }

  return { publicConfig, secretConfig };
}

/**
 * Get default values for a template
 */
export function getTemplateDefaults(templateId: string): Record<string, unknown> {
  const template = providerRegistry.get(templateId);
  if (!template) {
    return {};
  }

  const defaults: Record<string, unknown> = {};
  for (const field of template.fields) {
    if (field.default !== undefined) {
      defaults[field.key] = field.default;
    }
  }

  return defaults;
}

/**
 * Provider template IDs as const for type safety
 */
export const PROVIDER_TEMPLATE_IDS = [
  'anthropic',
  'bedrock',
  'azure-openai',
  'openai',
  'ollama',
  'cerebras',
  'openai-compatible',
] as const;

export type ProviderTemplateId = (typeof PROVIDER_TEMPLATE_IDS)[number];
