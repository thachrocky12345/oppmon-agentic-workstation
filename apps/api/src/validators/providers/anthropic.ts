/**
 * Anthropic Connection Validator
 * Tests Anthropic API credentials
 */

import type { ConnectionTestResult } from '@arkon/shared';
import {
  type ValidationContext,
  registerValidator,
  translateHttpError,
  fetchWithTimeout,
  createTestPrompt,
} from '../connection-validator.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_TIMEOUT_MS = 30000;

async function validateAnthropic(
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
        hint: 'Provide your Anthropic API key.',
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
        hint: 'Select a Claude model to use.',
      },
    };
  }

  try {
    const response = await fetchWithTimeout(ANTHROPIC_API_URL, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: createTestPrompt(),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const translated = translateHttpError(
        { status: response.status, body: errorBody, provider: 'anthropic' },
        {
          401: 'Check that your API key starts with "sk-ant-" and is not expired.',
          403: 'Your API key may not have access to this model.',
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
        provider: 'anthropic',
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
          hint: 'The Anthropic API is slow to respond. Try again.',
        },
      };
    }
    throw error;
  }
}

function getContextLength(model: string): number {
  if (model.includes('opus-4') || model.includes('sonnet-4')) {
    return 200000;
  }
  if (model.includes('3-5-sonnet') || model.includes('3-5-haiku')) {
    return 200000;
  }
  if (model.includes('3-opus')) {
    return 200000;
  }
  return 100000; // Default for older models
}

// Register the validator
registerValidator('anthropic', validateAnthropic);

export { validateAnthropic };
