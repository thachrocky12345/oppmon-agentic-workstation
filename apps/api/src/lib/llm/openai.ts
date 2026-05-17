// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * OpenAI Client
 *
 * Client for the OpenAI Chat Completions API. The same class also backs the
 * generic `openai-compatible` provider — callers just pass a different
 * `baseUrl` (e.g. https://api.together.xyz/v1, https://api.groq.com/openai/v1,
 * a self-hosted vLLM endpoint, etc).
 *
 * @see https://platform.openai.com/docs/api-reference/chat
 */

import {
  LLMClient,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMProvider,
  LLMError,
} from './types.js';

// ============================================================================
// Types (OpenAI wire format
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

// ============================================================================
// Config
// ============================================================================

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';

export interface OpenAIClientConfig {
  apiKey: string;
  defaultModel: string;
  /**
   * Override the API base URL. When unset, defaults to the official
   * OpenAI endpoint. Used by the `openai-compatible` provider to point at
   * Together / Groq / Fireworks / vLLM / etc.
   */
  baseUrl?: string;
  /** Provider tag used in errors and responses. Defaults to 'openai'. */
  provider?: LLMProvider;
  timeout?: number;
}

// ============================================================================
// Client
// ============================================================================

export class OpenAIClient implements LLMClient {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly provider: LLMProvider;
  private readonly timeout: number;

  constructor(config: OpenAIClientConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    // Strip trailing slash so we can append `/chat/completions` cleanly.
    this.baseUrl = (config.baseUrl || DEFAULT_OPENAI_BASE).replace(/\/$/, '');
    this.provider = config.provider ?? 'openai';
    this.timeout = config.timeout ?? 60000;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;

    const body: OpenAIChatRequest = {
      model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as OpenAIErrorResponse | null;
        const msg = errBody?.error?.message || `HTTP ${response.status}`;

        if (response.status === 401) throw LLMError.authenticationFailed(this.provider);
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          throw LLMError.rateLimited(this.provider, retryAfter);
        }
        if (response.status === 404) throw LLMError.modelNotFound(this.provider, model);

        throw new LLMError(
          this.provider,
          `OpenAI request failed: ${msg}`,
          'REQUEST_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as OpenAIChatResponse;

      if (!data.choices || data.choices.length === 0) {
        throw LLMError.invalidResponse(this.provider, { data });
      }

      const choice = data.choices[0];
      return {
        content: choice.message.content,
        model: data.model,
        provider: this.provider,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        finishReason: choice.finish_reason,
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new LLMError(this.provider, 'Request timed out', 'TIMEOUT', 408);
        }
        if (error.message.includes('fetch failed')) {
          throw LLMError.connectionFailed(this.provider, `Cannot connect to ${this.baseUrl}`);
        }
      }

      throw new LLMError(
        this.provider,
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  async *streamChat(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const model = request.model || this.defaultModel;

    const body: OpenAIChatRequest = {
      model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      // Ask OpenAI to emit a final chunk with usage. Some openai-compatible
      // backends ignore this — that's fine, totals just stay 0.
      stream_options: { include_usage: true },
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as OpenAIErrorResponse | null;
        const msg = errBody?.error?.message || `HTTP ${response.status}`;

        if (response.status === 401) throw LLMError.authenticationFailed(this.provider);
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          throw LLMError.rateLimited(this.provider, retryAfter);
        }

        throw new LLMError(
          this.provider,
          `OpenAI stream request failed: ${msg}`,
          'REQUEST_FAILED',
          response.status
        );
      }

      if (!response.body) {
        throw new LLMError(this.provider, 'No response body', 'INVALID_RESPONSE', 500);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let finished = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const payload = trimmed.slice(6);
            if (payload === '[DONE]') {
              if (!finished) {
                finished = true;
                yield {
                  type: 'done',
                  usage: {
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                    totalTokens: totalInputTokens + totalOutputTokens,
                  },
                };
              }
              continue;
            }

            try {
              const chunk = JSON.parse(payload) as {
                choices?: Array<{
                  delta?: { content?: string };
                  finish_reason?: string | null;
                }>;
                usage?: { prompt_tokens?: number; completion_tokens?: number };
              };

              if (chunk.usage) {
                totalInputTokens = chunk.usage.prompt_tokens ?? totalInputTokens;
                totalOutputTokens = chunk.usage.completion_tokens ?? totalOutputTokens;
              }

              const choice = chunk.choices?.[0];
              if (!choice) continue;

              const content = choice.delta?.content;
              if (content) yield { type: 'content', text: content };

              if (choice.finish_reason && !finished) {
                finished = true;
                yield {
                  type: 'done',
                  usage: {
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                    totalTokens: totalInputTokens + totalOutputTokens,
                  },
                };
              }
            } catch {
              // Skip malformed SSE lines silently — providers occasionally
              // emit keepalive comments or partial JSON.
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof LLMError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMError(this.provider, 'Stream request timed out', 'TIMEOUT', 408);
      }

      throw new LLMError(
        this.provider,
        `Stream error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) throw LLMError.authenticationFailed(this.provider);
        throw new LLMError(
          this.provider,
          `Failed to list models: ${response.status}`,
          'LIST_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as OpenAIModelsResponse;
      return data.data.map((m) => m.id);
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        this.provider,
        `Failed to list models: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }
}
