/**
 * Embedding Provider Types
 *
 * Shared types and interfaces for multi-provider embedding support.
 * Currently supports OpenAI with extensibility for future providers.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported embedding providers
 */
export type EmbeddingProvider = 'openai' | 'gemini' | 'voyage' | 'cohere';

/**
 * Request for generating embeddings
 */
export interface EmbeddingRequest {
  /** Text(s) to embed - can be single string or array */
  input: string | string[];
  /** Model to use (optional, uses default if not specified) */
  model?: string;
  /** Dimensions for models that support it (e.g., text-embedding-3-small) */
  dimensions?: number;
}

/**
 * Single embedding result
 */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Index in the input array */
  index: number;
}

/**
 * Response from embedding request
 */
export interface EmbeddingResponse {
  /** Array of embedding results */
  embeddings: EmbeddingResult[];
  /** Model used for embedding */
  model: string;
  /** Provider that generated the embeddings */
  provider: EmbeddingProvider;
  /** Dimension of the embeddings */
  dimensions: number;
  /** Token usage */
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

// ============================================================================
// Client Interface
// ============================================================================

/**
 * Interface that all embedding provider clients must implement
 */
export interface EmbeddingClient {
  /**
   * Generate embeddings for text(s)
   */
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Get the default model for this provider
   */
  getDefaultModel(): string;

  /**
   * Get the default dimensions for this provider
   */
  getDefaultDimensions(): number;

  /**
   * Get the provider name
   */
  getProvider(): EmbeddingProvider;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Base configuration for embedding providers
 */
export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  defaultDimensions: number;
  timeout?: number;
  maxBatchSize?: number;
}

/**
 * OpenAI-specific configuration
 */
export interface OpenAIEmbeddingConfig {
  apiKey: string;
  defaultModel: string;
  defaultDimensions: number;
  timeout?: number;
  maxBatchSize?: number;
  organization?: string;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Stored embedding metadata
 */
export interface StoredEmbedding {
  id: string;
  tenantId: string;
  /** Source type: 'skill', 'agent', 'journal', 'document', etc. */
  sourceType: string;
  /** Source ID reference */
  sourceId: string;
  /** Content that was embedded */
  content: string;
  /** Content hash for deduplication */
  contentHash: string;
  /** The embedding vector */
  embedding: number[];
  /** Provider that generated this embedding */
  provider: EmbeddingProvider;
  /** Model used */
  model: string;
  /** Dimensions of the embedding */
  dimensions: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Search request for semantic similarity
 */
export interface SemanticSearchRequest {
  /** Query text to find similar embeddings for */
  query: string;
  /** Filter by source type */
  sourceType?: string;
  /** Filter by source IDs */
  sourceIds?: string[];
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Include the content in results */
  includeContent?: boolean;
  /** Include metadata in results */
  includeMetadata?: boolean;
}

/**
 * Search result with similarity score
 */
export interface SemanticSearchResult {
  id: string;
  sourceType: string;
  sourceId: string;
  content?: string;
  metadata?: Record<string, unknown>;
  /** Cosine similarity score (0-1, higher is more similar) */
  similarity: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Embedding-specific error with provider context
 */
export class EmbeddingError extends Error {
  constructor(
    public provider: EmbeddingProvider,
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }

  static connectionFailed(provider: EmbeddingProvider, message: string): EmbeddingError {
    return new EmbeddingError(provider, message, 'CONNECTION_FAILED', 503);
  }

  static authenticationFailed(provider: EmbeddingProvider): EmbeddingError {
    return new EmbeddingError(
      provider,
      'Authentication failed - check API key',
      'AUTH_FAILED',
      401
    );
  }

  static rateLimited(provider: EmbeddingProvider, retryAfter?: number): EmbeddingError {
    return new EmbeddingError(
      provider,
      'Rate limit exceeded',
      'RATE_LIMITED',
      429,
      { retryAfter }
    );
  }

  static modelNotFound(provider: EmbeddingProvider, model: string): EmbeddingError {
    return new EmbeddingError(
      provider,
      `Model '${model}' not found`,
      'MODEL_NOT_FOUND',
      404
    );
  }

  static inputTooLong(provider: EmbeddingProvider, maxTokens: number): EmbeddingError {
    return new EmbeddingError(
      provider,
      `Input exceeds maximum token limit of ${maxTokens}`,
      'INPUT_TOO_LONG',
      400
    );
  }

  static invalidResponse(provider: EmbeddingProvider, details?: unknown): EmbeddingError {
    return new EmbeddingError(
      provider,
      'Invalid response from provider',
      'INVALID_RESPONSE',
      500,
      details
    );
  }
}
