// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Connection Validator Framework
 * Tests provider credentials and returns helpful error messages
 */

import type { ConnectionTestResult, ProviderTemplateId } from '@oppmon/shared';

// ============================================================================
// Types
// ============================================================================

export interface ValidationContext {
  publicConfig: Record<string, unknown>;
  secretConfig: Record<string, string>;
  timeoutMs?: number;
}

export interface YamlValidationContext {
  yamlOverride: string;
  timeoutMs?: number;
}

export type ConnectionValidator = (
  context: ValidationContext
) => Promise<ConnectionTestResult>;

// ============================================================================
// Error Translation
// ============================================================================

interface ErrorPattern {
  match: (error: unknown, context?: ValidationContext) => boolean;
  translate: (error: unknown, context?: ValidationContext) => {
    code: string;
    message: string;
    hint?: string;
  };
}

const commonErrorPatterns: ErrorPattern[] = [
  {
    match: (error) =>
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')),
    translate: (error, context) => ({
      code: 'CONNECTION_FAILED',
      message: 'Could not connect to the API endpoint',
      hint: context?.publicConfig?.api_base
        ? `Verify that ${context.publicConfig.api_base} is accessible`
        : 'Check your network connection and API endpoint URL',
    }),
  },
  {
    match: (error) =>
      error instanceof Error && error.message.includes('ETIMEDOUT'),
    translate: () => ({
      code: 'TIMEOUT',
      message: 'Connection timed out',
      hint: 'The API endpoint took too long to respond. Try again or check the endpoint.',
    }),
  },
  {
    match: (error) =>
      error instanceof Error && error.message.includes('certificate'),
    translate: () => ({
      code: 'SSL_ERROR',
      message: 'SSL/TLS certificate error',
      hint: 'The API endpoint has an invalid or untrusted certificate.',
    }),
  },
];

export function translateError(
  error: unknown,
  providerPatterns: ErrorPattern[] = [],
  context?: ValidationContext
): { code: string; message: string; hint?: string } {
  // Try provider-specific patterns first
  for (const pattern of providerPatterns) {
    if (pattern.match(error, context)) {
      return pattern.translate(error, context);
    }
  }

  // Try common patterns
  for (const pattern of commonErrorPatterns) {
    if (pattern.match(error, context)) {
      return pattern.translate(error, context);
    }
  }

  // Default error
  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : 'An unknown error occurred',
    hint: 'Check the error message and verify your configuration.',
  };
}

// ============================================================================
// HTTP Response Error Translation
// ============================================================================

export interface HttpErrorContext {
  status: number;
  body?: unknown;
  provider?: string;
}

export function translateHttpError(
  httpContext: HttpErrorContext,
  providerHints?: Record<number, string>
): { code: string; message: string; hint?: string } {
  const { status, provider } = httpContext;

  // Provider-specific hints
  const providerHint = providerHints?.[status];

  switch (status) {
    case 400:
      return {
        code: 'BAD_REQUEST',
        message: 'Invalid request to the API',
        hint: providerHint || 'Check that all required fields are filled correctly.',
      };

    case 401:
      return {
        code: 'AUTHENTICATION_FAILED',
        message: 'Authentication failed',
        hint: providerHint || 'Check that your API key is correct and not expired.',
      };

    case 403:
      return {
        code: 'PERMISSION_DENIED',
        message: 'Permission denied',
        hint:
          providerHint ||
          (provider === 'bedrock'
            ? 'AWS credentials are valid but lack permission. Check IAM policy for bedrock:InvokeModel.'
            : provider === 'azure-openai'
              ? 'Azure credentials lack access to this deployment. Check RBAC permissions.'
              : 'Your API key does not have permission for this operation.'),
      };

    case 404:
      return {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        hint:
          providerHint ||
          (provider === 'azure-openai'
            ? 'Deployment not found. Check that the deployment name is correct.'
            : provider === 'ollama'
              ? 'Model not found. Run "ollama pull <model>" to download it.'
              : 'Check that the model or resource name is correct.'),
      };

    case 429:
      return {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        hint: providerHint || 'Too many requests. Try again in a moment.',
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        code: 'SERVER_ERROR',
        message: `Provider returned ${status} error`,
        hint: providerHint || 'The API is experiencing issues. Try again later.',
      };

    default:
      return {
        code: `HTTP_${status}`,
        message: `Unexpected HTTP status: ${status}`,
        hint: providerHint || 'Check the provider documentation for this error.',
      };
  }
}

// ============================================================================
// Validator Registry
// ============================================================================

const validators = new Map<string, ConnectionValidator>();

export function registerValidator(
  providerId: string,
  validator: ConnectionValidator
): void {
  validators.set(providerId, validator);
}

export function getValidator(providerId: string): ConnectionValidator | undefined {
  return validators.get(providerId);
}

export function hasValidator(providerId: string): boolean {
  return validators.has(providerId);
}

// ============================================================================
// Main Validation Function
// ============================================================================

export async function validateConnection(
  providerId: ProviderTemplateId,
  context: ValidationContext
): Promise<ConnectionTestResult> {
  const validator = validators.get(providerId);

  if (!validator) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'VALIDATOR_NOT_FOUND',
        message: `No validator found for provider: ${providerId}`,
        hint: 'This provider may not support connection testing.',
      },
    };
  }

  const startTime = performance.now();

  try {
    const result = await validator(context);
    return {
      ...result,
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (error) {
    const translated = translateError(error, [], context);
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startTime),
      error: translated,
    };
  }
}

// ============================================================================
// YAML Mode Validation
// ============================================================================

/**
 * Validate YAML configuration
 * This is a basic validation - actual LiteLLM loading happens at runtime
 */
export async function validateYamlConfig(
  context: YamlValidationContext
): Promise<ConnectionTestResult> {
  const startTime = performance.now();

  try {
    // Basic YAML structure validation
    // Note: Full validation requires LiteLLM itself
    const yaml = context.yamlOverride.trim();

    if (!yaml) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startTime),
        error: {
          code: 'EMPTY_YAML',
          message: 'YAML configuration is empty',
          hint: 'Provide a valid LiteLLM model configuration.',
        },
      };
    }

    // Check for required fields
    if (!yaml.includes('model_name:') && !yaml.includes('model_name :')) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startTime),
        error: {
          code: 'MISSING_MODEL_NAME',
          message: 'YAML is missing model_name field',
          hint: 'Add model_name field to identify this model in LiteLLM.',
        },
      };
    }

    if (!yaml.includes('litellm_params:') && !yaml.includes('litellm_params :')) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startTime),
        error: {
          code: 'MISSING_LITELLM_PARAMS',
          message: 'YAML is missing litellm_params field',
          hint: 'Add litellm_params section with model configuration.',
        },
      };
    }

    // YAML syntax is valid (basic check)
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startTime),
      modelInfo: {
        name: 'Custom YAML',
        provider: 'yaml',
      },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startTime),
      error: {
        code: 'YAML_PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to parse YAML',
        hint: 'Check YAML syntax and formatting.',
      },
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a minimal test request for chat completion
 */
export function createTestPrompt(): { role: string; content: string }[] {
  return [
    {
      role: 'user',
      content: 'Say "ok" and nothing else.',
    },
  ];
}

/**
 * Timeout wrapper for fetch operations
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
