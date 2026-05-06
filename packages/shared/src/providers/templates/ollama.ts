/**
 * Ollama Provider Template
 * Local LLM server for self-hosted models
 */

import type { ProviderTemplate } from '../template.js';

export const ollamaTemplate: ProviderTemplate = {
  id: 'ollama',
  displayName: 'Ollama',
  description: 'Local LLM server for self-hosted models',
  category: 'local',
  icon: 'ollama',
  fields: [
    {
      key: 'api_base',
      label: 'Ollama Server URL',
      type: 'text',
      secret: false,
      required: true,
      placeholder: 'http://localhost:11434',
      default: 'http://localhost:11434',
      help: 'URL where Ollama is running',
      pattern: '^https?://[^\\s]+$',
      patternError: 'Must be a valid URL',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'select',
      secret: false,
      required: true,
      options: [
        { value: 'llama3.3:70b', label: 'Llama 3.3 70B', description: 'Latest Llama, 70B parameters' },
        { value: 'llama3.2:latest', label: 'Llama 3.2', description: 'Latest Llama 3.2' },
        { value: 'llama3.1:latest', label: 'Llama 3.1', description: 'Stable Llama 3.1' },
        { value: 'llama3:latest', label: 'Llama 3', description: 'Llama 3' },
        { value: 'mistral:latest', label: 'Mistral', description: 'Mistral 7B' },
        { value: 'mixtral:latest', label: 'Mixtral', description: 'Mixtral 8x7B MoE' },
        { value: 'codellama:latest', label: 'Code Llama', description: 'Code-specialized' },
        { value: 'deepseek-coder-v2:latest', label: 'DeepSeek Coder V2', description: 'Excellent for code' },
        { value: 'qwen2.5:latest', label: 'Qwen 2.5', description: 'Alibaba Qwen' },
        { value: 'phi3:latest', label: 'Phi-3', description: 'Microsoft Phi-3' },
        { value: 'gemma2:latest', label: 'Gemma 2', description: 'Google Gemma 2' },
      ],
      default: 'llama3.2:latest',
    },
    {
      key: 'custom_model',
      label: 'Custom Model Name',
      type: 'text',
      secret: false,
      required: false,
      placeholder: 'my-custom-model:latest',
      help: 'Override with a custom model name if not in the list above',
    },
    {
      key: 'num_ctx',
      label: 'Context Length',
      type: 'number',
      secret: false,
      required: false,
      default: 4096,
      min: 512,
      max: 131072,
      help: 'Context window size (depends on model and available memory)',
    },
  ],
  litellmTemplate: {
    model_name: '{{display_name}}',
    litellm_params: {
      model: 'ollama/{{custom_model|model}}',
      api_base: '{{api_base}}',
      num_ctx: '{{num_ctx}}',
    },
  },
  validatorId: 'ollama',
  docsUrl: 'https://ollama.com/library',
  setupSteps: [
    'Install Ollama from ollama.com',
    'Run: ollama pull llama3.2 (or your preferred model)',
    'Start Ollama: ollama serve',
    'Verify it\'s running at http://localhost:11434',
  ],
  supportsStreaming: true,
  supportsFunctionCalling: false,
  defaultModel: 'llama3.2:latest',
};
