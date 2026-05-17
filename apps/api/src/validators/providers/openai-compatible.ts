// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * OpenAI-Compatible Connection Validator
 * Tests generic OpenAI-compatible API endpoints
 */

import type { ConnectionTestResult } from '@oppmon/shared';
import { openAICompatiblePresets } from '@oppmon/shared';
import {
  type ValidationContext,
  registerValidator,
  translateHttpError,
  fetchWithTimeout,
  createTestPrompt,
} from '../connection-validator.js';

const DEFAULT_TIMEOUT_MS = 30000;

async function validateOpenAICompatible(
  context: ValidationContext
): Promise<ConnectionTestResult> {
  const { publicConfig, secretConfig, timeoutMs = DEFAULT_TIMEOUT_MS } = context;

  const apiKey = secretConfig.api_key;
  const providerName = publicConfig.provider_name as string;
  let apiBase = publicConfig.api_base as string;
  const model = publicConfig.model as string;

  // Apply preset if selected
  if (providerName && providerName !== 'custom') {
    const preset = openAICompatiblePresets[providerName];
    if (preset && !apiBase) {
      apiBase = preset.apiBase;
    }
  }

  if (!apiKey) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required',
        hint: 'Provide your API key for this provider.',
      },
    };
  }

  if (!apiBase) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_API_BASE',
        message: 'API base URL is required',
        hint: 'Provide the API endpoint URL.',
      },
    };
  }

  if (!model) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_MODEL',
        message: 'Model is required',
        hint: 'Enter the model identifier for this provider.',
      },
    };
  }

  // Normalize base URL and construct endpoint
  const baseUrl = apiBase.replace(/\/$/, '');
  const url = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  // Parse extra headers if provided
  let extraHeaders: Record<string, string> = {};
  if (publicConfig.extra_headers) {
    try {
      extraHeaders =
        typeof publicConfig.extra_headers === 'string'
          ? JSON.parse(publicConfig.extra_headers)
          : (publicConfig.extra_headers as Record<string, string>);
    } catch {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'INVALID_HEADERS',
          message: 'Extra headers must be valid JSON',
          hint: 'Check the format of your extra headers.',
        },
      };
    }
  }

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: createTestPrompt(),
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));

      // Provider-specific hints
      const hints: Record<number, string> = {
        401: getAuthHint(providerName),
        403: 'Access denied. Check your API key permissions.',
        404: `Model "${model}" not found. Check the model identifier.`,
      };

      const translated = translateHttpError(
        { status: response.status, body: errorBody, provider: providerName || 'openai-compatible' },
        hints
      );
      return { ok: false, latencyMs: 0, error: translated };
    }

    const data = await response.json();

    return {
      ok: true,
      latencyMs: 0,
      modelInfo: {
        name: model,
        provider: providerName || 'openai-compatible',
        contextLength: 128000, // Assume large context for most providers
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          ok: false,
          latencyMs: 0,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out',
            hint: 'The API is slow to respond. Try again.',
          },
        };
      }

      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      ) {
        return {
          ok: false,
          latencyMs: 0,
          error: {
            code: 'CONNECTION_FAILED',
            message: 'Cannot connect to API',
            hint: `Verify the API URL: ${apiBase}`,
          },
        };
      }
    }
    throw error;
  }
}

function getAuthHint(providerName?: string): string {
  switch (providerName) {
    case 'together':
      return 'API key is invalid. Get one from api.together.xyz';
    case 'groq':
      return 'API key is invalid. Get one from console.groq.com';
    case 'fireworks':
      return 'API key is invalid. Get one from fireworks.ai';
    case 'anyscale':
      return 'API key is invalid. Get one from anyscale.com';
    case 'perplexity':
      return 'API key is invalid. Get one from perplexity.ai';
    case 'deepinfra':
      return 'API key is invalid. Get one from deepinfra.com';
    case 'openrouter':
      return 'API key is invalid. Get one from openrouter.ai';
    case 'replicate':
      return 'API key is invalid. Get one from replicate.com';
    default:
      return 'API key is invalid. Check with your provider.';
  }
}

// Register the validator
registerValidator('openai-compatible', validateOpenAICompatible);

export { validateOpenAICompatible };
