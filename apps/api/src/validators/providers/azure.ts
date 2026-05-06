/**
 * Azure OpenAI Connection Validator
 * Tests Azure OpenAI deployment credentials
 */

import type { ConnectionTestResult } from '@oppmon/shared';
import {
  type ValidationContext,
  registerValidator,
  translateHttpError,
  fetchWithTimeout,
  createTestPrompt,
} from '../connection-validator.js';

const DEFAULT_TIMEOUT_MS = 30000;

async function validateAzureOpenAI(
  context: ValidationContext
): Promise<ConnectionTestResult> {
  const { publicConfig, secretConfig, timeoutMs = DEFAULT_TIMEOUT_MS } = context;

  const apiKey = secretConfig.api_key;
  const apiBase = publicConfig.api_base as string;
  const deploymentName = publicConfig.deployment_name as string;
  const apiVersion = publicConfig.api_version as string;

  if (!apiKey) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required',
        hint: 'Provide your Azure OpenAI API key from the Azure Portal.',
      },
    };
  }

  if (!apiBase) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_ENDPOINT',
        message: 'Endpoint URL is required',
        hint: 'Provide your Azure OpenAI resource endpoint.',
      },
    };
  }

  if (!deploymentName) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_DEPLOYMENT',
        message: 'Deployment name is required',
        hint: 'Provide the name of your model deployment in Azure.',
      },
    };
  }

  // Normalize endpoint URL
  const baseUrl = apiBase.replace(/\/$/, '');
  const version = apiVersion || '2024-10-21';
  const url = `${baseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=${version}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: createTestPrompt(),
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };

      // Azure-specific error handling
      if (errorBody.error?.code === 'DeploymentNotFound') {
        return {
          ok: false,
          latencyMs: 0,
          error: {
            code: 'DEPLOYMENT_NOT_FOUND',
            message: `Deployment "${deploymentName}" not found`,
            hint: 'Check the deployment name in Azure OpenAI Studio.',
          },
        };
      }

      const translated = translateHttpError(
        { status: response.status, body: errorBody, provider: 'azure-openai' },
        {
          401: 'API key is invalid. Get the correct key from Azure Portal > Keys and Endpoint.',
          403: 'Access denied. Check RBAC permissions for this resource.',
          404: `Deployment "${deploymentName}" not found. Verify the deployment name.`,
        }
      );
      return { ok: false, latencyMs: 0, error: translated };
    }

    const data = await response.json();

    return {
      ok: true,
      latencyMs: 0,
      modelInfo: {
        name: deploymentName,
        provider: 'azure-openai',
        contextLength: getContextLength(publicConfig.model as string),
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
          hint: 'Azure is slow to respond. Try again.',
        },
      };
    }

    // Handle DNS/connection errors
    if (error instanceof Error && error.message.includes('ENOTFOUND')) {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'INVALID_ENDPOINT',
          message: 'Could not resolve endpoint URL',
          hint: `Verify the endpoint: ${apiBase}`,
        },
      };
    }

    throw error;
  }
}

function getContextLength(model: string): number {
  if (!model) return 128000;

  if (model.includes('gpt-4o')) {
    return 128000;
  }
  if (model.includes('gpt-4-turbo')) {
    return 128000;
  }
  if (model.includes('gpt-4')) {
    return 8192;
  }
  if (model.includes('gpt-35') || model.includes('gpt-3.5')) {
    return 16384;
  }
  if (model.includes('o1')) {
    return 200000;
  }
  return 128000;
}

// Register the validator
registerValidator('azure-openai', validateAzureOpenAI);

export { validateAzureOpenAI };
