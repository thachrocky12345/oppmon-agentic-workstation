/**
 * OpenAI Connection Validator
 * Tests OpenAI API credentials
 */

import type { ConnectionTestResult } from '@arkon/shared';
import {
  type ValidationContext,
  registerValidator,
  translateHttpError,
  fetchWithTimeout,
  createTestPrompt,
} from '../connection-validator.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30000;

async function validateOpenAI(
  context: ValidationContext
): Promise<ConnectionTestResult> {
  const { publicConfig, secretConfig, timeoutMs = DEFAULT_TIMEOUT_MS } = context;

  const apiKey = secretConfig.api_key;
  const model = publicConfig.model as string;
  const organizationId = publicConfig.organization_id as string | undefined;

  if (!apiKey) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required',
        hint: 'Provide your OpenAI API key from platform.openai.com.',
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
        hint: 'Select an OpenAI model to use.',
      },
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (organizationId) {
    headers['OpenAI-Organization'] = organizationId;
  }

  try {
    const response = await fetchWithTimeout(OPENAI_API_URL, {
      method: 'POST',
      timeout: timeoutMs,
      headers,
      body: JSON.stringify({
        model,
        messages: createTestPrompt(),
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as { error?: { type?: string; code?: string; message?: string } };

      // OpenAI-specific error handling
      if (errorBody.error?.code === 'model_not_found') {
        return {
          ok: false,
          latencyMs: 0,
          error: {
            code: 'MODEL_NOT_FOUND',
            message: `Model "${model}" not found`,
            hint: 'Check that the model name is correct and you have access.',
          },
        };
      }

      if (errorBody.error?.code === 'invalid_api_key') {
        return {
          ok: false,
          latencyMs: 0,
          error: {
            code: 'INVALID_API_KEY',
            message: 'API key is invalid',
            hint: 'Check that your API key starts with "sk-" and is active.',
          },
        };
      }

      const translated = translateHttpError(
        { status: response.status, body: errorBody, provider: 'openai' },
        {
          401: 'API key is invalid or expired. Get a new key from platform.openai.com.',
          403: 'Access denied. Check your organization settings.',
          429: 'Rate limit exceeded or quota exhausted. Check your usage.',
        }
      );
      return { ok: false, latencyMs: 0, error: translated };
    }

    const data = await response.json();

    return {
      ok: true,
      latencyMs: 0,
      modelInfo: {
        name: model,
        provider: 'openai',
        contextLength: getContextLength(model),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          hint: 'OpenAI is slow to respond. Try again.',
        },
      };
    }
    throw error;
  }
}

function getContextLength(model: string): number {
  if (model.includes('gpt-4o')) {
    return 128000;
  }
  if (model.includes('gpt-4-turbo')) {
    return 128000;
  }
  if (model.includes('gpt-4')) {
    return 8192;
  }
  if (model.includes('gpt-3.5-turbo')) {
    return 16384;
  }
  if (model.includes('o1') || model.includes('o3')) {
    return 200000;
  }
  return 128000;
}

// Register the validator
registerValidator('openai', validateOpenAI);

export { validateOpenAI };
