// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Provider Templates Tests
 * Tests for the provider template registry
 */

import { describe, it, expect } from 'vitest';
import {
  providerRegistry,
  validateRequiredFields,
  extractSecretFields,
} from './index.js';

describe('Provider Registry', () => {
  describe('providerRegistry', () => {
    it('contains all expected providers', () => {
      const expectedProviders = [
        'anthropic',
        'bedrock',
        'azure-openai',
        'openai',
        'ollama',
        'cerebras',
        'openai-compatible',
      ];

      const registeredProviders = Object.keys(providerRegistry);

      for (const provider of expectedProviders) {
        expect(registeredProviders).toContain(provider);
      }
    });

    it('all providers have required properties', () => {
      for (const [id, provider] of Object.entries(providerRegistry)) {
        expect(provider.id).toBe(id);
        expect(provider.displayName).toBeTruthy();
        expect(['cloud', 'local', 'compatible']).toContain(provider.category);
        expect(Array.isArray(provider.fields)).toBe(true);
        expect(provider.fields.length).toBeGreaterThan(0);
        expect(provider.litellmTemplate).toBeDefined();
        expect(typeof provider.docsUrl).toBe('string');
        expect(Array.isArray(provider.setupSteps)).toBe(true);
      }
    });
  });

  describe('providerRegistry.get', () => {
    it('returns provider template by ID', () => {
      const template = providerRegistry.get('anthropic');

      expect(template).toBeDefined();
      expect(template?.id).toBe('anthropic');
      expect(template?.displayName).toBe('Anthropic');
    });

    it('returns undefined for unknown provider', () => {
      const template = providerRegistry.get('unknown-provider');

      expect(template).toBeUndefined();
    });
  });

  describe('getAllProviders', () => {
    it('returns array of all providers', () => {
      const providers = providerRegistry.getAll();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBe(7);
    });

    it('providers are sorted by category and name', () => {
      const providers = providerRegistry.getAll();
      const categories = providers.map((p) => p.category);

      // Cloud providers should come before local
      const cloudIndex = categories.indexOf('cloud');
      const localIndex = categories.indexOf('local');

      expect(cloudIndex).toBeLessThan(localIndex);
    });
  });

  describe('validateRequiredFields', () => {
    it('returns valid when all required fields present', () => {
      const result = validateRequiredFields('anthropic', {
        api_key: 'sk-ant-test',
        model: 'claude-sonnet-4-20250514',
      });

      expect(result.valid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('returns errors for missing required fields', () => {
      const result = validateRequiredFields('anthropic', {});

      expect(result.valid).toBe(false);
      expect(result.missingFields.length).toBeGreaterThan(0);
      expect(result.missingFields).toContain('api_key');
    });

    it('handles conditional required fields', () => {
      // Bedrock requires different fields based on auth method
      const result = validateRequiredFields('bedrock', {
        auth_method: 'access_keys',
        aws_region: 'us-east-1',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        // Missing aws_access_key_id and aws_secret_access_key
      });

      expect(result.missingFields.some((f) => f === 'aws_access_key_id')).toBe(true);
    });

    it('returns error for unknown provider', () => {
      const result = validateRequiredFields('unknown-provider', {});

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('Template not found');
    });
  });

  describe('extractSecretFields', () => {
    it('extracts secret fields from config', () => {
      const config = {
        api_key: 'sk-ant-secret',
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
      };

      const { publicConfig, secretConfig } = extractSecretFields('anthropic', config);

      expect(secretConfig).toHaveProperty('api_key', 'sk-ant-secret');
      expect(publicConfig).not.toHaveProperty('api_key');
      expect(publicConfig).toHaveProperty('model', 'claude-sonnet-4-20250514');
      expect(publicConfig).toHaveProperty('max_tokens', 4096);
    });

    it('handles provider with no secrets', () => {
      const config = {
        api_base: 'http://localhost:11434',
        model: 'llama3.2:latest',
      };

      const { publicConfig, secretConfig } = extractSecretFields('ollama', config);

      expect(Object.keys(secretConfig)).toHaveLength(0);
      expect(publicConfig).toEqual(config);
    });

    it('returns all as public for unknown provider', () => {
      const config = { key: 'value' };

      const { publicConfig, secretConfig } = extractSecretFields('unknown', config);

      expect(publicConfig).toEqual(config);
      expect(secretConfig).toEqual({});
    });
  });

  describe('Provider field definitions', () => {
    describe('Anthropic', () => {
      it('has required API key field marked as secret', () => {
        const template = providerRegistry.get('anthropic');
        const apiKeyField = template?.fields.find((f) => f.key === 'api_key');

        expect(apiKeyField).toBeDefined();
        expect(apiKeyField?.required).toBe(true);
        expect(apiKeyField?.secret).toBe(true);
        expect(apiKeyField?.type).toBe('password');
      });

      it('has model field with default value', () => {
        const template = providerRegistry.get('anthropic');
        const modelField = template?.fields.find((f) => f.key === 'model');

        expect(modelField).toBeDefined();
        expect(modelField?.default).toBeDefined();
      });
    });

    describe('Bedrock', () => {
      it('has auth_method select field', () => {
        const template = providerRegistry.get('bedrock');
        const authField = template?.fields.find((f) => f.key === 'auth_method');

        expect(authField).toBeDefined();
        expect(authField?.type).toBe('select');
        expect(authField?.options).toContain('iam_role');
        expect(authField?.options).toContain('access_keys');
      });

      it('has conditional access key fields', () => {
        const template = providerRegistry.get('bedrock');
        const accessKeyField = template?.fields.find((f) => f.key === 'aws_access_key_id');

        expect(accessKeyField).toBeDefined();
        expect(accessKeyField?.condition).toBeDefined();
        expect(accessKeyField?.condition?.field).toBe('auth_method');
        expect(accessKeyField?.condition?.value).toBe('access_keys');
      });
    });

    describe('Azure OpenAI', () => {
      it('has all required fields', () => {
        const template = providerRegistry.get('azure-openai');
        const requiredFields = template?.fields.filter((f) => f.required);

        const requiredKeys = requiredFields?.map((f) => f.key) || [];
        expect(requiredKeys).toContain('api_key');
        expect(requiredKeys).toContain('api_base');
        expect(requiredKeys).toContain('api_version');
      });
    });

    describe('OpenAI', () => {
      it('has optional organization field', () => {
        const template = providerRegistry.get('openai');
        const orgField = template?.fields.find((f) => f.key === 'organization');

        expect(orgField).toBeDefined();
        expect(orgField?.required).toBe(false);
      });
    });

    describe('Ollama', () => {
      it('has api_base with default localhost', () => {
        const template = providerRegistry.get('ollama');
        const apiBaseField = template?.fields.find((f) => f.key === 'api_base');

        expect(apiBaseField).toBeDefined();
        expect(apiBaseField?.default).toContain('localhost:11434');
      });

      it('has no secret fields', () => {
        const template = providerRegistry.get('ollama');
        const secretFields = template?.fields.filter((f) => f.secret);

        expect(secretFields).toHaveLength(0);
      });
    });

    describe('Cerebras', () => {
      it('is categorized as cloud provider', () => {
        const template = providerRegistry.get('cerebras');

        expect(template?.category).toBe('cloud');
      });
    });

    describe('OpenAI Compatible', () => {
      it('is categorized as compatible', () => {
        const template = providerRegistry.get('openai-compatible');

        expect(template?.category).toBe('compatible');
      });

      it('has configurable api_base', () => {
        const template = providerRegistry.get('openai-compatible');
        const apiBaseField = template?.fields.find((f) => f.key === 'api_base');

        expect(apiBaseField).toBeDefined();
        expect(apiBaseField?.required).toBe(true);
      });
    });
  });

  describe('LiteLLM template generation', () => {
    it('Anthropic template generates correct model name', () => {
      const template = providerRegistry.get('anthropic');

      expect(template?.litellmTemplate.model).toBe('anthropic/{{model}}');
    });

    it('Bedrock template includes region', () => {
      const template = providerRegistry.get('bedrock');

      expect(template?.litellmTemplate.model).toContain('bedrock');
      expect(template?.litellmTemplate.aws_region_name).toBe('{{aws_region}}');
    });

    it('Azure template includes all required fields', () => {
      const template = providerRegistry.get('azure-openai');

      expect(template?.litellmTemplate.model).toContain('azure/');
      expect(template?.litellmTemplate.api_base).toBe('{{api_base}}');
      expect(template?.litellmTemplate.api_version).toBe('{{api_version}}');
    });

    it('Ollama template uses local prefix', () => {
      const template = providerRegistry.get('ollama');

      expect(template?.litellmTemplate.model).toContain('ollama');
    });
  });
});
