/**
 * LLM Provider Integration Types
 *
 * Shared types and interfaces for multi-provider LLM support:
 * - Ollama (local inference)
 * - Cerebras (cloud inference)
 * - Anthropic/Claude (cloud inference)
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported LLM providers
 */
export type LLMProvider = 'ollama' | 'cerebras' | 'anthropic';

/**
 * Message role in a conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * A single message in a conversation
 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/**
 * Request to the LLM
 */
export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Response from the LLM
 */
export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  usage: TokenUsage;
  finishReason: string;
}

// ============================================================================
// Client Interface
// ============================================================================

/**
 * Interface that all LLM provider clients must implement
 */
export interface LLMClient {
  /**
   * Send a chat completion request
   */
  chat(request: LLMRequest): Promise<LLMResponse>;

  /**
   * List available models for this provider
   */
  listModels(): Promise<string[]>;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for an LLM provider
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  timeout?: number;
}

/**
 * Ollama-specific configuration
 */
export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  timeout?: number;
}

/**
 * Cerebras-specific configuration
 */
export interface CerebrasConfig {
  apiKey: string;
  defaultModel: string;
  timeout?: number;
}

/**
 * Anthropic-specific configuration
 */
export interface AnthropicConfig {
  apiKey: string;
  defaultModel: string;
  timeout?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * LLM-specific error with provider context
 */
export class LLMError extends Error {
  constructor(
    public provider: LLMProvider,
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }

  static connectionFailed(provider: LLMProvider, message: string): LLMError {
    return new LLMError(provider, message, 'CONNECTION_FAILED', 503);
  }

  static authenticationFailed(provider: LLMProvider): LLMError {
    return new LLMError(
      provider,
      'Authentication failed - check API key',
      'AUTH_FAILED',
      401
    );
  }

  static rateLimited(provider: LLMProvider, retryAfter?: number): LLMError {
    return new LLMError(
      provider,
      'Rate limit exceeded',
      'RATE_LIMITED',
      429,
      { retryAfter }
    );
  }

  static modelNotFound(provider: LLMProvider, model: string): LLMError {
    return new LLMError(
      provider,
      `Model '${model}' not found`,
      'MODEL_NOT_FOUND',
      404
    );
  }

  static invalidResponse(provider: LLMProvider, details?: unknown): LLMError {
    return new LLMError(
      provider,
      'Invalid response from provider',
      'INVALID_RESPONSE',
      500,
      details
    );
  }
}
