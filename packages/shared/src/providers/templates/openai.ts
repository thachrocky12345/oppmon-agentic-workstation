/**
 * OpenAI Provider Template
 * Direct API access to OpenAI models
 */

import type { ProviderTemplate } from '../template.js';

export const openAITemplate: ProviderTemplate = {
  id: 'openai',
  displayName: 'OpenAI',
  description: 'Direct API access to GPT models',
  category: 'cloud',
  icon: 'openai',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      secret: true,
      required: true,
      placeholder: 'sk-proj-...',
      help: 'Your OpenAI API key from platform.openai.com',
      pattern: '^sk-[a-zA-Z0-9-_]+$',
      patternError: 'Invalid OpenAI API key format',
    },
    {
      key: 'organization_id',
      label: 'Organization ID',
      type: 'text',
      secret: false,
      required: false,
      placeholder: 'org-...',
      help: 'Optional: Your OpenAI organization ID',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'select',
      secret: false,
      required: true,
      options: [
        { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable multimodal model' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Fast and affordable' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: '128K context window' },
        { value: 'gpt-4', label: 'GPT-4', description: 'Original GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Fast, budget friendly' },
        { value: 'o1-preview', label: 'o1 Preview', description: 'Advanced reasoning' },
        { value: 'o1-mini', label: 'o1 Mini', description: 'Fast reasoning model' },
        { value: 'o3-mini', label: 'o3 Mini', description: 'Latest reasoning model' },
      ],
      default: 'gpt-4o',
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
  ],
  litellmTemplate: {
    model_name: '{{display_name}}',
    litellm_params: {
      model: 'openai/{{model}}',
      api_key: '{{api_key}}',
      organization: '{{organization_id}}',
      max_tokens: '{{max_tokens}}',
    },
  },
  validatorId: 'openai',
  docsUrl: 'https://platform.openai.com/docs/api-reference',
  setupSteps: [
    'Go to platform.openai.com and sign in',
    'Navigate to API Keys section',
    'Create a new API key',
    'Copy the key and paste it above',
  ],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  defaultModel: 'gpt-4o',
};
