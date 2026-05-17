// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Azure OpenAI Provider Template
 * Access OpenAI models via Azure's enterprise deployment
 */

import type { ProviderTemplate } from '../template.js';

export const azureOpenAITemplate: ProviderTemplate = {
  id: 'azure-openai',
  displayName: 'Azure OpenAI',
  description: 'OpenAI models via Azure enterprise deployment',
  category: 'cloud',
  icon: 'azure',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      secret: true,
      required: true,
      placeholder: 'Your Azure OpenAI API key...',
      help: 'Found in Azure Portal > Your OpenAI resource > Keys and Endpoint',
    },
    {
      key: 'api_base',
      label: 'Endpoint URL',
      type: 'text',
      secret: false,
      required: true,
      placeholder: 'https://your-resource.openai.azure.com',
      help: 'Your Azure OpenAI resource endpoint',
      pattern: '^https://[a-zA-Z0-9-]+\\.openai\\.azure\\.com/?$',
      patternError: 'Must be a valid Azure OpenAI endpoint URL',
    },
    {
      key: 'deployment_name',
      label: 'Deployment Name',
      type: 'text',
      secret: false,
      required: true,
      placeholder: 'gpt-4o-deployment',
      help: 'The name of your model deployment in Azure',
    },
    {
      key: 'api_version',
      label: 'API Version',
      type: 'select',
      secret: false,
      required: true,
      options: [
        { value: '2025-01-01-preview', label: '2025-01-01-preview', description: 'Latest preview' },
        { value: '2024-10-21', label: '2024-10-21', description: 'Stable' },
        { value: '2024-08-01-preview', label: '2024-08-01-preview', description: 'Preview' },
        { value: '2024-06-01', label: '2024-06-01', description: 'Previous stable' },
      ],
      default: '2024-10-21',
    },
    {
      key: 'model',
      label: 'Base Model',
      type: 'select',
      secret: false,
      required: true,
      options: [
        { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable multimodal' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Fast and affordable' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: '128K context' },
        { value: 'gpt-4', label: 'GPT-4', description: 'Original GPT-4' },
        { value: 'gpt-35-turbo', label: 'GPT-3.5 Turbo', description: 'Fast, budget option' },
        { value: 'o1-preview', label: 'o1 Preview', description: 'Reasoning model' },
        { value: 'o1-mini', label: 'o1 Mini', description: 'Fast reasoning model' },
      ],
      default: 'gpt-4o',
      help: 'The underlying model for your deployment',
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
      model: 'azure/{{deployment_name}}',
      api_key: '{{api_key}}',
      api_base: '{{api_base}}',
      api_version: '{{api_version}}',
      max_tokens: '{{max_tokens}}',
    },
  },
  validatorId: 'azure-openai',
  docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
  setupSteps: [
    'Go to Azure Portal and create an Azure OpenAI resource',
    'Deploy a model (e.g., GPT-4o) in your resource',
    'Note the deployment name you chose',
    'Copy the API key and endpoint from Keys and Endpoint',
    'Paste the values above',
  ],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  defaultModel: 'gpt-4o',
};
