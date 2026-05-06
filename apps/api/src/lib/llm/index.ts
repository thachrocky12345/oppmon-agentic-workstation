/**
 * LLM Provider Factory
 *
 * Central factory for creating LLM provider clients.
 * Reads configuration from Model Registry first, falls back to environment variables.
 */

import { OllamaClient } from './ollama.js';
import { CerebrasClient } from './cerebras.js';
import { AnthropicClient } from './anthropic.js';
import { LLMClient, LLMProvider, LLMError } from './types.js';

// Re-export types for convenience
export * from './types.js';
export { OllamaClient } from './ollama.js';
export { CerebrasClient } from './cerebras.js';
export { AnthropicClient } from './anthropic.js';

// Model Registry config type
export interface ModelRegistryConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeout?: number;
}

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Get Ollama configuration from environment
 */
function getOllamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultModel: process.env.OLLAMA_MODEL || 'llama3.2',
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10),
  };
}

/**
 * Get Cerebras configuration from environment
 */
function getCerebrasConfig() {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY environment variable is required');
  }

  return {
    apiKey,
    defaultModel: process.env.CEREBRAS_MODEL || 'llama3.1-70b',
    timeout: parseInt(process.env.CEREBRAS_TIMEOUT || '60000', 10),
  };
}

/**
 * Get Anthropic configuration from environment
 */
function getAnthropicConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  return {
    apiKey,
    defaultModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    timeout: parseInt(process.env.ANTHROPIC_TIMEOUT || '60000', 10),
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an LLM client for the specified provider
 * If registryConfig is provided, use it instead of environment variables
 */
export function createLLMClient(provider: LLMProvider, registryConfig?: ModelRegistryConfig): LLMClient {
  switch (provider) {
    case 'ollama':
      if (registryConfig) {
        return new OllamaClient({
          baseUrl: registryConfig.baseUrl || 'http://localhost:11434',
          defaultModel: registryConfig.model,
          timeout: registryConfig.timeout || 120000,
        });
      }
      return new OllamaClient(getOllamaConfig());

    case 'cerebras':
      if (registryConfig) {
        return new CerebrasClient({
          apiKey: registryConfig.apiKey,
          defaultModel: registryConfig.model,
          timeout: registryConfig.timeout || 60000,
        });
      }
      return new CerebrasClient(getCerebrasConfig());

    case 'anthropic':
      if (registryConfig) {
        return new AnthropicClient({
          apiKey: registryConfig.apiKey,
          defaultModel: registryConfig.model,
          timeout: registryConfig.timeout || 60000,
        });
      }
      return new AnthropicClient(getAnthropicConfig());

    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Get the default LLM provider from environment
 */
export function getDefaultProvider(): LLMProvider {
  const provider = process.env.LLM_DEFAULT_PROVIDER as LLMProvider;

  if (provider && ['ollama', 'cerebras', 'anthropic'].includes(provider)) {
    return provider;
  }

  // Default to anthropic if not specified
  return 'anthropic';
}

/**
 * Check if a provider is available (has required configuration)
 */
export function isProviderAvailable(provider: LLMProvider): boolean {
  switch (provider) {
    case 'ollama':
      // Ollama is always "available" - it just might not be running
      return true;

    case 'cerebras':
      return !!process.env.CEREBRAS_API_KEY;

    case 'anthropic':
      return !!process.env.ANTHROPIC_API_KEY;

    default:
      return false;
  }
}

/**
 * Get list of available providers
 */
export function getAvailableProviders(): LLMProvider[] {
  const providers: LLMProvider[] = ['ollama', 'cerebras', 'anthropic'];
  return providers.filter(isProviderAvailable);
}

/**
 * Validate that a provider string is valid
 */
export function isValidProvider(provider: string): provider is LLMProvider {
  return ['ollama', 'cerebras', 'anthropic'].includes(provider);
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case 'ollama':
      return process.env.OLLAMA_MODEL || 'llama3.2';
    case 'cerebras':
      return process.env.CEREBRAS_MODEL || 'llama3.1-70b';
    case 'anthropic':
      return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
