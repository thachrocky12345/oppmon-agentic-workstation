// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Anthropic Client
 *
 * Client for Anthropic Claude API using the official SDK.
 * Supports chat completions with system prompts and conversation history.
 *
 * @see https://docs.anthropic.com/claude/reference
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  LLMClient,
  LLMRequest,
  LLMResponse,
  AnthropicConfig,
  LLMError,
} from './types.js';

// ============================================================================
// Client Implementation
// ============================================================================

export class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(config: AnthropicConfig) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout ?? 60000,
    });

    this.defaultModel = config.defaultModel;
  }

  /**
   * Send a chat completion request to Anthropic
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;

    try {
      // Extract system message (Anthropic handles it separately)
      const systemMessage = request.messages.find((m) => m.role === 'system');

      // Filter out system messages and map to Anthropic format
      const messages = request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // Ensure we have at least one message
      if (messages.length === 0) {
        throw new LLMError(
          'anthropic',
          'At least one user or assistant message is required',
          'INVALID_REQUEST',
          400
        );
      }

      // Anthropic requires alternating user/assistant messages
      // and must start with user
      const firstNonSystemMessage = messages[0];
      if (firstNonSystemMessage.role !== 'user') {
        throw new LLMError(
          'anthropic',
          'Conversation must start with a user message',
          'INVALID_REQUEST',
          400
        );
      }

      const response = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 4096,
        system: systemMessage?.content,
        messages,
        ...(request.temperature !== undefined && {
          temperature: request.temperature,
        }),
      });

      // Extract text content from response
      let content = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        }
      }

      return {
        content,
        model: response.model,
        provider: 'anthropic',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: response.stop_reason ?? 'end_turn',
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      // Handle Anthropic SDK errors
      if (error instanceof Anthropic.APIError) {
        if (error.status === 401) {
          throw LLMError.authenticationFailed('anthropic');
        }

        if (error.status === 429) {
          throw LLMError.rateLimited('anthropic');
        }

        if (error.status === 404) {
          throw LLMError.modelNotFound('anthropic', model);
        }

        throw new LLMError(
          'anthropic',
          error.message,
          'API_ERROR',
          error.status
        );
      }

      if (error instanceof Anthropic.APIConnectionError) {
        throw LLMError.connectionFailed(
          'anthropic',
          'Cannot connect to Anthropic API'
        );
      }

      if (error instanceof Anthropic.RateLimitError) {
        throw LLMError.rateLimited('anthropic');
      }

      if (error instanceof Anthropic.AuthenticationError) {
        throw LLMError.authenticationFailed('anthropic');
      }

      throw new LLMError(
        'anthropic',
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  /**
   * List available models from Anthropic
   *
   * Note: Anthropic doesn't have a models listing endpoint,
   * so we return a hardcoded list of known models
   */
  async listModels(): Promise<string[]> {
    // Anthropic doesn't provide a models endpoint, return known models
    return [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }
}
