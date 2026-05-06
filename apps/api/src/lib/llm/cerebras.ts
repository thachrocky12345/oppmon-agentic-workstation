/**
 * Cerebras Client
 *
 * Client for Cerebras cloud inference API.
 * Uses OpenAI-compatible chat completions endpoint.
 *
 * @see https://docs.cerebras.ai/api-reference
 */

import {
  LLMClient,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  CerebrasConfig,
  LLMError,
} from './types.js';

// ============================================================================
// Types (OpenAI-compatible format)
// ============================================================================

interface CerebrasMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CebrasChatRequest {
  model: string;
  messages: CerebrasMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface CebrasChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface CerebrasModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

interface CerebrasErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const CEREBRAS_API_BASE = 'https://api.cerebras.ai/v1';

// ============================================================================
// Client Implementation
// ============================================================================

export class CerebrasClient implements LLMClient {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly timeout: number;

  constructor(config: CerebrasConfig) {
    if (!config.apiKey) {
      throw new Error('Cerebras API key is required');
    }
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.timeout = config.timeout ?? 60000; // 1 minute default
  }

  /**
   * Send a chat completion request to Cerebras
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;

    const cerebrasRequest: CebrasChatRequest = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
    };

    if (request.temperature !== undefined) {
      cerebrasRequest.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      cerebrasRequest.max_tokens = request.maxTokens;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${CEREBRAS_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cerebrasRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as CerebrasErrorResponse | null;
        const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;

        if (response.status === 401) {
          throw LLMError.authenticationFailed('cerebras');
        }

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          throw LLMError.rateLimited('cerebras', retryAfter);
        }

        if (response.status === 404) {
          throw LLMError.modelNotFound('cerebras', model);
        }

        throw new LLMError(
          'cerebras',
          `Cerebras request failed: ${errorMessage}`,
          'REQUEST_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as CebrasChatResponse;

      if (!data.choices || data.choices.length === 0) {
        throw LLMError.invalidResponse('cerebras', { data });
      }

      const choice = data.choices[0];

      return {
        content: choice.message.content,
        model: data.model,
        provider: 'cerebras',
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        finishReason: choice.finish_reason,
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new LLMError('cerebras', 'Request timed out', 'TIMEOUT', 408);
        }

        if (error.message.includes('fetch failed')) {
          throw LLMError.connectionFailed(
            'cerebras',
            'Cannot connect to Cerebras API'
          );
        }
      }

      throw new LLMError(
        'cerebras',
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  /**
   * Stream a chat completion request to Cerebras
   * Uses Server-Sent Events (SSE) format compatible with OpenAI
   */
  async *streamChat(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const model = request.model || this.defaultModel;

    const cerebrasRequest: CebrasChatRequest = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    };

    if (request.temperature !== undefined) {
      cerebrasRequest.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      cerebrasRequest.max_tokens = request.maxTokens;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${CEREBRAS_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cerebrasRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as CerebrasErrorResponse | null;
        const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;

        if (response.status === 401) {
          throw LLMError.authenticationFailed('cerebras');
        }

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          throw LLMError.rateLimited('cerebras', retryAfter);
        }

        throw new LLMError(
          'cerebras',
          `Cerebras stream request failed: ${errorMessage}`,
          'REQUEST_FAILED',
          response.status
        );
      }

      if (!response.body) {
        throw new LLMError('cerebras', 'No response body', 'INVALID_RESPONSE', 500);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const jsonStr = trimmed.slice(6);
              const chunk = JSON.parse(jsonStr) as {
                choices?: Array<{
                  delta?: { content?: string };
                  finish_reason?: string | null;
                }>;
                usage?: {
                  prompt_tokens?: number;
                  completion_tokens?: number;
                };
              };

              // Track usage if provided
              if (chunk.usage) {
                totalInputTokens = chunk.usage.prompt_tokens || totalInputTokens;
                totalOutputTokens = chunk.usage.completion_tokens || totalOutputTokens;
              }

              if (chunk.choices && chunk.choices.length > 0) {
                const choice = chunk.choices[0];
                const content = choice.delta?.content;
                const finishReason = choice.finish_reason;

                if (content) {
                  yield { type: 'content', text: content };
                }

                if (finishReason) {
                  yield {
                    type: 'done',
                    usage: {
                      inputTokens: totalInputTokens,
                      outputTokens: totalOutputTokens,
                      totalTokens: totalInputTokens + totalOutputTokens,
                    },
                  };
                }
              }
            } catch (parseError) {
              // Skip invalid JSON lines
              console.warn('Failed to parse Cerebras stream chunk:', trimmed);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new LLMError('cerebras', 'Stream request timed out', 'TIMEOUT', 408);
        }
      }

      throw new LLMError(
        'cerebras',
        `Stream error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  /**
   * List available models from Cerebras
   */
  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${CEREBRAS_API_BASE}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          throw LLMError.authenticationFailed('cerebras');
        }

        throw new LLMError(
          'cerebras',
          `Failed to list models: ${response.status}`,
          'LIST_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as CerebrasModelsResponse;

      return data.data.map((m) => m.id);
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      throw new LLMError(
        'cerebras',
        `Failed to list models: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }
}
