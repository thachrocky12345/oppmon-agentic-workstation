// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * OpenAI-Compatible Provider Template
 * Generic template for any OpenAI-compatible API endpoint
 * Supports: Together AI, Anyscale, Fireworks, Groq, Perplexity, DeepInfra, etc.
 */

import type { ProviderTemplate } from '../template.js';

export const openAICompatibleTemplate: ProviderTemplate = {
  id: 'openai-compatible',
  displayName: 'OpenAI-Compatible',
  description: 'Any API endpoint compatible with OpenAI format',
  category: 'compatible',
  icon: 'openai-compatible',
  fields: [
    {
      key: 'provider_name',
      label: 'Provider Preset',
      type: 'select',
      secret: false,
      required: true,
      options: [
        { value: 'custom', label: 'Custom', description: 'Configure manually' },
        { value: 'together', label: 'Together AI', description: 'together.ai' },
        { value: 'groq', label: 'Groq', description: 'groq.com' },
        { value: 'fireworks', label: 'Fireworks AI', description: 'fireworks.ai' },
        { value: 'anyscale', label: 'Anyscale', description: 'anyscale.com' },
        { value: 'perplexity', label: 'Perplexity', description: 'perplexity.ai' },
        { value: 'deepinfra', label: 'DeepInfra', description: 'deepinfra.com' },
        { value: 'openrouter', label: 'OpenRouter', description: 'openrouter.ai' },
        { value: 'replicate', label: 'Replicate', description: 'replicate.com' },
      ],
      default: 'custom',
    },
    {
      key: 'api_base',
      label: 'API Base URL',
      type: 'text',
      secret: false,
      required: true,
      placeholder: 'https://api.example.com/v1',
      help: 'Base URL for the API (including /v1 if applicable)',
      pattern: '^https?://[^\\s]+$',
      patternError: 'Must be a valid URL',
    },
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      secret: true,
      required: true,
      placeholder: 'Your API key...',
      help: 'API key for authentication',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      secret: false,
      required: true,
      placeholder: 'meta-llama/Llama-3.3-70B-Instruct',
      help: 'Model identifier (check provider docs for available models)',
    },
    {
      key: 'max_tokens',
      label: 'Max Output Tokens',
      type: 'number',
      secret: false,
      required: false,
      default: 4096,
      min: 1,
      max: 128000,
      help: 'Maximum tokens in the response',
    },
    {
      key: 'extra_headers',
      label: 'Extra Headers',
      type: 'json',
      secret: false,
      required: false,
      placeholder: '{"X-Custom-Header": "value"}',
      help: 'Additional HTTP headers to send with requests (JSON format)',
    },
  ],
  litellmTemplate: {
    model_name: '{{display_name}}',
    litellm_params: {
      model: 'openai/{{model}}',
      api_key: '{{api_key}}',
      api_base: '{{api_base}}',
      max_tokens: '{{max_tokens}}',
      // extra_headers will be populated from config if provided
    },
  },
  validatorId: 'openai-compatible',
  docsUrl: 'https://docs.litellm.ai/docs/providers/openai_compatible',
  setupSteps: [
    'Choose a provider or select Custom',
    'Enter the API base URL from your provider',
    'Get an API key from your provider',
    'Enter the model identifier',
  ],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  defaultModel: undefined,
};

/**
 * Known provider presets for OpenAI-compatible endpoints
 */
export const openAICompatiblePresets: Record<string, { apiBase: string; helpUrl: string }> = {
  together: {
    apiBase: 'https://api.together.xyz/v1',
    helpUrl: 'https://docs.together.ai/reference/inference',
  },
  groq: {
    apiBase: 'https://api.groq.com/openai/v1',
    helpUrl: 'https://console.groq.com/docs/quickstart',
  },
  fireworks: {
    apiBase: 'https://api.fireworks.ai/inference/v1',
    helpUrl: 'https://docs.fireworks.ai/api-reference/introduction',
  },
  anyscale: {
    apiBase: 'https://api.endpoints.anyscale.com/v1',
    helpUrl: 'https://docs.anyscale.com/endpoints/overview',
  },
  perplexity: {
    apiBase: 'https://api.perplexity.ai',
    helpUrl: 'https://docs.perplexity.ai/guides/getting-started',
  },
  deepinfra: {
    apiBase: 'https://api.deepinfra.com/v1/openai',
    helpUrl: 'https://deepinfra.com/docs',
  },
  openrouter: {
    apiBase: 'https://openrouter.ai/api/v1',
    helpUrl: 'https://openrouter.ai/docs',
  },
  replicate: {
    apiBase: 'https://api.replicate.com/v1',
    helpUrl: 'https://replicate.com/docs',
  },
};
