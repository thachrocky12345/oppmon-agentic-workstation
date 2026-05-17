// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * OpenAI Embedding Client
 *
 * Client for OpenAI text embeddings using the official SDK.
 * Supports text-embedding-3-small, text-embedding-3-large, and text-embedding-ada-002.
 *
 * @see https://platform.openai.com/docs/guides/embeddings
 */

import OpenAI from 'openai';
import {
  EmbeddingClient,
  EmbeddingRequest,
  EmbeddingResponse,
  OpenAIEmbeddingConfig,
  EmbeddingError,
  EmbeddingProvider,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Model specifications
 */
const MODEL_SPECS: Record<string, { maxTokens: number; defaultDimensions: number }> = {
  'text-embedding-3-small': { maxTokens: 8191, defaultDimensions: 1536 },
  'text-embedding-3-large': { maxTokens: 8191, defaultDimensions: 3072 },
  'text-embedding-ada-002': { maxTokens: 8191, defaultDimensions: 1536 },
};

// ============================================================================
// Client Implementation
// ============================================================================

export class OpenAIEmbeddingClient implements EmbeddingClient {
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultDimensions: number;
  private readonly maxBatchSize: number;

  constructor(config: OpenAIEmbeddingConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout ?? 60000,
      organization: config.organization,
    });

    this.defaultModel = config.defaultModel;
    this.defaultDimensions = config.defaultDimensions;
    this.maxBatchSize = config.maxBatchSize ?? 2048; // OpenAI allows up to 2048 inputs per request
  }

  /**
   * Generate embeddings for text(s)
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || this.defaultModel;
    const dimensions = request.dimensions || this.defaultDimensions;

    // Normalize input to array
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    // Validate batch size
    if (inputs.length > this.maxBatchSize) {
      throw new EmbeddingError(
        'openai',
        `Batch size ${inputs.length} exceeds maximum of ${this.maxBatchSize}`,
        'BATCH_TOO_LARGE',
        400
      );
    }

    // Filter empty strings
    const nonEmptyInputs = inputs.filter((text) => text.trim().length > 0);
    if (nonEmptyInputs.length === 0) {
      throw new EmbeddingError(
        'openai',
        'At least one non-empty input is required',
        'INVALID_INPUT',
        400
      );
    }

    try {
      const response = await this.client.embeddings.create({
        model,
        input: nonEmptyInputs,
        // Only specify dimensions for models that support it
        ...(model.startsWith('text-embedding-3') && { dimensions }),
      });

      return {
        embeddings: response.data.map((item) => ({
          embedding: item.embedding,
          index: item.index,
        })),
        model: response.model,
        provider: 'openai',
        dimensions: response.data[0]?.embedding.length ?? dimensions,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }

      // Handle OpenAI SDK errors
      if (error instanceof OpenAI.APIError) {
        if (error.status === 401) {
          throw EmbeddingError.authenticationFailed('openai');
        }

        if (error.status === 429) {
          const retryAfter = parseInt(
            error.headers?.['retry-after'] as string || '60',
            10
          );
          throw EmbeddingError.rateLimited('openai', retryAfter);
        }

        if (error.status === 404) {
          throw EmbeddingError.modelNotFound('openai', model);
        }

        // Check for context length error
        if (error.message?.includes('maximum context length')) {
          const maxTokens = MODEL_SPECS[model]?.maxTokens ?? 8191;
          throw EmbeddingError.inputTooLong('openai', maxTokens);
        }

        throw new EmbeddingError(
          'openai',
          error.message,
          'API_ERROR',
          error.status
        );
      }

      if (error instanceof OpenAI.APIConnectionError) {
        throw EmbeddingError.connectionFailed(
          'openai',
          'Cannot connect to OpenAI API'
        );
      }

      if (error instanceof OpenAI.RateLimitError) {
        throw EmbeddingError.rateLimited('openai');
      }

      if (error instanceof OpenAI.AuthenticationError) {
        throw EmbeddingError.authenticationFailed('openai');
      }

      throw new EmbeddingError(
        'openai',
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  /**
   * Get the default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Get the default dimensions
   */
  getDefaultDimensions(): number {
    return this.defaultDimensions;
  }

  /**
   * Get the provider name
   */
  getProvider(): EmbeddingProvider {
    return 'openai';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert embedding array to PostgreSQL vector literal format
 * e.g., [0.1, 0.2, 0.3] -> '[0.1,0.2,0.3]'
 */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse PostgreSQL vector literal back to array
 * e.g., '[0.1,0.2,0.3]' -> [0.1, 0.2, 0.3]
 */
export function fromPgVector(vectorStr: string): number[] {
  const cleaned = vectorStr.replace(/[\[\]]/g, '');
  return cleaned.split(',').map((v) => parseFloat(v.trim()));
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}
