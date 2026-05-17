// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Cerebras Provider Template
 * Ultra-fast inference on Cerebras hardware
 */

import type { ProviderTemplate } from '../template.js';

export const cerebrasTemplate: ProviderTemplate = {
  id: 'cerebras',
  displayName: 'Cerebras',
  description: 'Ultra-fast inference on Cerebras hardware',
  category: 'cloud',
  icon: 'cerebras',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      secret: true,
      required: true,
      placeholder: 'csk-...',
      help: 'Your Cerebras API key from cloud.cerebras.ai',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      secret: false,
      required: true,
      placeholder: 'llama3.1-8b',
      default: 'llama3.1-8b',
      help: 'Enter the Cerebras model name. Common models: llama3.1-8b (recommended), gpt-oss-120b, llama-4-scout-17b-16e-instruct. Check cloud.cerebras.ai for available models.',
    },
    {
      key: 'max_tokens',
      label: 'Max Output Tokens',
      type: 'number',
      secret: false,
      required: false,
      default: 4096,
      min: 1,
      max: 8192,
      help: 'Maximum tokens in the response',
    },
  ],
  litellmTemplate: {
    model_name: '{{display_name}}',
    litellm_params: {
      model: 'cerebras/{{model}}',
      api_key: '{{api_key}}',
      max_tokens: '{{max_tokens}}',
    },
  },
  validatorId: 'cerebras',
  docsUrl: 'https://inference-docs.cerebras.ai/',
  setupSteps: [
    'Go to cloud.cerebras.ai and sign up',
    'Navigate to API Keys section',
    'Create a new API key',
    'Copy the key and paste it above',
  ],
  supportsStreaming: true,
  supportsFunctionCalling: true,
  defaultModel: 'llama3.1-8b',
};
