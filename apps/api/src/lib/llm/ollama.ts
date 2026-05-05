/**
 * Ollama Client
 *
 * Client for local Ollama inference server.
 * Supports chat completions and model listing via HTTP API.
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import {
  LLMClient,
  LLMRequest,
  LLMResponse,
  OllamaConfig,
  LLMError,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      parent_model?: string;
      format?: string;
      family?: string;
      families?: string[];
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

// ============================================================================
// Client Implementation
// ============================================================================

export class OllamaClient implements LLMClient {
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeout: number;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultModel = config.defaultModel;
    this.timeout = config.timeout ?? 120000; // 2 minutes default
  }

  /**
   * Send a chat completion request to Ollama
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;

    const ollamaRequest: OllamaChatRequest = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {},
    };

    if (request.temperature !== undefined) {
      ollamaRequest.options!.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      ollamaRequest.options!.num_predict = request.maxTokens;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ollamaRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');

        if (response.status === 404) {
          throw LLMError.modelNotFound('ollama', model);
        }

        throw new LLMError(
          'ollama',
          `Ollama request failed: ${response.status} ${errorText}`,
          'REQUEST_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as OllamaChatResponse;

      // Calculate token usage from Ollama's response
      // Ollama provides eval_count (output tokens) and prompt_eval_count (input tokens)
      const inputTokens = data.prompt_eval_count ?? 0;
      const outputTokens = data.eval_count ?? 0;

      return {
        content: data.message.content,
        model: data.model,
        provider: 'ollama',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        finishReason: data.done_reason ?? 'stop',
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new LLMError(
            'ollama',
            'Request timed out',
            'TIMEOUT',
            408
          );
        }

        // Connection errors
        if (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('fetch failed')
        ) {
          throw LLMError.connectionFailed(
            'ollama',
            `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`
          );
        }
      }

      throw new LLMError(
        'ollama',
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for listing

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new LLMError(
          'ollama',
          `Failed to list models: ${response.status}`,
          'LIST_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as OllamaTagsResponse;

      return data.models.map((m) => m.name);
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      if (error instanceof Error) {
        if (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('fetch failed')
        ) {
          throw LLMError.connectionFailed(
            'ollama',
            `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`
          );
        }
      }

      throw new LLMError(
        'ollama',
        `Failed to list models: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }
}
