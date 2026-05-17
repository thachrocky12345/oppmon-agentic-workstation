// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Ollama Connection Validator
 * Tests connection to local Ollama server
 */

import type { ConnectionTestResult } from '@oppmon/shared';
import {
  type ValidationContext,
  registerValidator,
  translateHttpError,
  fetchWithTimeout,
} from '../connection-validator.js';

const DEFAULT_TIMEOUT_MS = 30000;

async function validateOllama(
  context: ValidationContext
): Promise<ConnectionTestResult> {
  const { publicConfig, timeoutMs = DEFAULT_TIMEOUT_MS } = context;

  // Order: explicit per-model api_base > server-wide OLLAMA_BASE_URL env > localhost.
  // The env fallback matters for swarm deploys where Ollama runs on a LAN host
  // (set via `docker service update --env-add OLLAMA_BASE_URL=http://...`); without
  // it, the validator silently tests the wrong target.
  const apiBase =
    (publicConfig.api_base as string) ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434';
  const model = (publicConfig.custom_model as string) || (publicConfig.model as string);

  if (!model) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_MODEL',
        message: 'Model is required',
        hint: 'Select or enter an Ollama model name.',
      },
    };
  }

  // Normalize base URL
  const baseUrl = apiBase.replace(/\/$/, '');

  try {
    // First, check if Ollama is running
    const healthResponse = await fetchWithTimeout(`${baseUrl}/api/tags`, {
      method: 'GET',
      timeout: timeoutMs,
    });

    if (!healthResponse.ok) {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'OLLAMA_NOT_RESPONDING',
          message: 'Ollama server is not responding',
          hint: `Cannot reach ${baseUrl}. Is Ollama running?`,
        },
      };
    }

    // Check if the model is available
    const tagsData = await healthResponse.json() as { models?: Array<{ name: string }> };
    const availableModels = tagsData.models?.map((m) => m.name) || [];

    // Check if model exists (handle both "model" and "model:tag" formats)
    const modelExists = availableModels.some(
      (m) =>
        m === model ||
        m.startsWith(`${model}:`) ||
        model.startsWith(`${m.split(':')[0]}:`)
    );

    if (!modelExists && availableModels.length > 0) {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: `Model "${model}" not found locally`,
          hint: `Run "ollama pull ${model}" to download it. Available: ${availableModels.slice(0, 5).join(', ')}${availableModels.length > 5 ? '...' : ''}`,
        },
      };
    }

    // Try to generate a simple response
    const generateResponse = await fetchWithTimeout(`${baseUrl}/api/generate`, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: 'Say ok',
        stream: false,
        options: {
          num_predict: 5,
        },
      }),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text().catch(() => '');

      if (errorText.includes('model') && errorText.includes('not found')) {
        return {
          ok: false,
          latencyMs: 0,
          error: {
            code: 'MODEL_NOT_LOADED',
            message: `Model "${model}" is not available`,
            hint: `Run "ollama pull ${model}" to download it.`,
          },
        };
      }

      const translated = translateHttpError(
        { status: generateResponse.status, provider: 'ollama' },
        {
          500: 'Ollama encountered an error. Check Ollama logs for details.',
        }
      );
      return { ok: false, latencyMs: 0, error: translated };
    }

    const data = await generateResponse.json() as { model?: string };

    return {
      ok: true,
      latencyMs: 0,
      modelInfo: {
        name: data.model || model,
        provider: 'ollama',
        contextLength: (publicConfig.num_ctx as number) || 4096,
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
            hint: 'Ollama is slow to respond. The model may be loading.',
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
            code: 'CONNECTION_REFUSED',
            message: 'Cannot connect to Ollama',
            hint: `Is Ollama running? Start it with "ollama serve" or check ${baseUrl}`,
          },
        };
      }
    }
    throw error;
  }
}

// Register the validator
registerValidator('ollama', validateOllama);

export { validateOllama };
