/**
 * Cerebras Connection Validator
 * Tests Cerebras API credentials
 */

import type { ConnectionTestResult } from '@oppmon/shared';
import {
  type ValidationContext,
  registerValidator,
  translateHttpError,
  fetchWithTimeout,
  createTestPrompt,
} from '../connection-validator.js';

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30000;

async function validateCerebras(
  context: ValidationContext
): Promise<ConnectionTestResult> {
  const { publicConfig, secretConfig, timeoutMs = DEFAULT_TIMEOUT_MS } = context;

  const apiKey = secretConfig.api_key;
  const model = publicConfig.model as string;

  if (!apiKey) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required',
        hint: 'Provide your Cerebras API key from cloud.cerebras.ai.',
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
        hint: 'Select a Cerebras model to use.',
      },
    };
  }

  try {
    const response = await fetchWithTimeout(CEREBRAS_API_URL, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: createTestPrompt(),
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));

      const translated = translateHttpError(
        { status: response.status, body: errorBody, provider: 'cerebras' },
        {
          401: 'API key is invalid. Get a new key from cloud.cerebras.ai.',
          403: 'Access denied. Check your Cerebras account status.',
          404: `Model "${model}" not found. Check the model name.`,
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
        provider: 'cerebras',
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
          hint: 'Cerebras is slow to respond. Try again.',
        },
      };
    }
    throw error;
  }
}

function getContextLength(model: string): number {
  // Cerebras models generally support 8K context
  if (model.includes('70b')) {
    return 8192;
  }
  if (model.includes('8b')) {
    return 8192;
  }
  return 8192;
}

// Register the validator
registerValidator('cerebras', validateCerebras);

export { validateCerebras };
