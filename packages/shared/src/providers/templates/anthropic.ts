/**
 * Anthropic Provider Template
 * Direct API access to Claude models
 */

import type { ProviderTemplate } from '../template.js';

export const anthropicTemplate: ProviderTemplate = {
  id: 'anthropic',
  displayName: 'Anthropic',
  description: 'Direct API access to Claude models',
  category: 'cloud',
  icon: 'anthropic',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      secret: true,
      required: true,
      placeholder: 'sk-ant-api03-...',
      help: 'Your Anthropic API key from console.anthropic.com',
      pattern: '^sk-ant-api\\d{2}-[A-Za-z0-9_-]+$',
      patternError: 'Invalid Anthropic API key format',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'select',
      secret: false,
      required: true,
      options: [
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', description: 'Most capable model' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Balanced performance and speed' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: 'Previous generation, fast' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', description: 'Fastest, most affordable' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', description: 'Previous flagship' },
      ],
      default: 'claude-sonnet-4-20250514',
    },
    {
      key: 'max_tokens',
      label: 'Max Output Tokens',
      type: 'number',
      secret: false,
      required: false,
      default: 4096,
      min: 1,
      max: 200000,
      help: 'Maximum tokens in the response',
    },
  ],
  litellmTemplate: {
    model_name: '{{display_name}}',
    litellm_params: {
      model: 'anthropic/{{model}}',
      api_key: '{{api_key}}',
      max_tokens: '{{max_tokens}}',
    },
  },
  validatorId: 'anthropic',
  docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
  setupSteps: [
    'Go to console.anthropic.com and sign in',
    'Navigate to API Keys section',
    'Create a new API key',
    'Copy the key and paste it above',
  ],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  defaultModel: 'claude-sonnet-4-20250514',
};
