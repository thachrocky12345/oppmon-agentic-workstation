// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Embedding Provider Factory
 *
 * Central factory for creating embedding provider clients.
 * Reads configuration from environment variables.
 */

import { OpenAIEmbeddingClient, toPgVector, fromPgVector, cosineSimilarity } from './openai.js';
import { EmbeddingClient, EmbeddingProvider, EmbeddingError } from './types.js';
import { createHash } from 'crypto';

// Re-export types and utilities for convenience
export * from './types.js';
export { OpenAIEmbeddingClient, toPgVector, fromPgVector, cosineSimilarity } from './openai.js';

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Get OpenAI embedding configuration from environment
 */
function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  return {
    apiKey,
    defaultModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    defaultDimensions: parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1536', 10),
    timeout: parseInt(process.env.OPENAI_EMBEDDING_TIMEOUT || '60000', 10),
    maxBatchSize: parseInt(process.env.OPENAI_EMBEDDING_BATCH_SIZE || '2048', 10),
    organization: process.env.OPENAI_ORGANIZATION,
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an embedding client for the specified provider
 */
export function createEmbeddingClient(provider: EmbeddingProvider): EmbeddingClient {
  switch (provider) {
    case 'openai':
      return new OpenAIEmbeddingClient(getOpenAIConfig());

    case 'gemini':
    case 'voyage':
    case 'cohere':
      throw new Error(`Embedding provider '${provider}' is not yet implemented`);

    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}

/**
 * Get the default embedding provider from environment
 */
export function getDefaultEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.POC_SEARCH_EMBEDDING_PROVIDER as EmbeddingProvider;

  if (provider && isValidEmbeddingProvider(provider)) {
    return provider;
  }

  // Default to OpenAI if not specified
  return 'openai';
}

/**
 * Check if a provider is available (has required configuration)
 */
export function isEmbeddingProviderAvailable(provider: EmbeddingProvider): boolean {
  switch (provider) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY;

    case 'gemini':
      return !!process.env.GOOGLE_API_KEY;

    case 'voyage':
      return !!process.env.VOYAGE_API_KEY;

    case 'cohere':
      return !!process.env.COHERE_API_KEY;

    default:
      return false;
  }
}

/**
 * Get list of available embedding providers
 */
export function getAvailableEmbeddingProviders(): EmbeddingProvider[] {
  const providers: EmbeddingProvider[] = ['openai', 'gemini', 'voyage', 'cohere'];
  return providers.filter(isEmbeddingProviderAvailable);
}

/**
 * Validate that a provider string is valid
 */
export function isValidEmbeddingProvider(provider: string): provider is EmbeddingProvider {
  return ['openai', 'gemini', 'voyage', 'cohere'].includes(provider);
}

/**
 * Get default model for a provider
 */
export function getDefaultEmbeddingModel(provider: EmbeddingProvider): string {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    case 'gemini':
      return process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
    case 'voyage':
      return process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-2';
    case 'cohere':
      return process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get default dimensions for a provider/model
 */
export function getDefaultEmbeddingDimensions(provider: EmbeddingProvider): number {
  switch (provider) {
    case 'openai':
      return parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1536', 10);
    case 'gemini':
      return parseInt(process.env.GEMINI_EMBEDDING_DIM || '1536', 10);
    case 'voyage':
      return 1024; // voyage-2 default
    case 'cohere':
      return 1024; // embed-english-v3.0 default
    default:
      return 1536;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compute SHA-256 hash of content for deduplication
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Chunk text for embedding if it exceeds token limits
 * Uses simple sentence-based chunking
 */
export function chunkText(
  text: string,
  options: {
    maxChunkSize?: number;
    overlap?: number;
    separator?: string;
  } = {}
): string[] {
  const { maxChunkSize = 4000, overlap = 200, separator = '. ' } = options;

  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(separator);
  let currentChunk = '';

  for (const sentence of sentences) {
    const testChunk = currentChunk ? `${currentChunk}${separator}${sentence}` : sentence;

    if (testChunk.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk);
      // Start new chunk with overlap from previous
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.ceil(overlap / 5)).join(' ');
      currentChunk = overlapWords ? `${overlapWords}${separator}${sentence}` : sentence;
    } else {
      currentChunk = testChunk;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Get embedding metadata for audit/provenance tracking
 */
export function getEmbeddingMetadata(provider: EmbeddingProvider) {
  return {
    provider,
    model: getDefaultEmbeddingModel(provider),
    dimensions: getDefaultEmbeddingDimensions(provider),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Caller-defined version label used to disambiguate same-(provider,model)
 * embeddings that were generated under different prompt/normalization
 * conventions. Bump via env when starting a re-embedding migration so the
 * new rows live alongside the old ones until cutover.
 *
 * Persisted as the `embedding_version` column on every vector-bearing
 * table (see 2026-05-10_embedding_versioning.sql).
 */
export const EMBEDDING_VERSION = process.env.EMBEDDING_VERSION || 'v1';

/**
 * Provenance columns to write on every vector insert. Pair with the
 * `embedding` column in the same INSERT.
 *
 * @example
 * const { provider, model, version, dim } = getEmbeddingProvenance();
 * await client.query(
 *   `INSERT INTO embeddings
 *      (id, tenant_id, embedding, embedding_provider, embedding_model,
 *       embedding_version, embedding_dim)
 *    VALUES ($1, $2, $3::vector, $4, $5, $6, $7)`,
 *   [id, tenantId, embeddingLiteral, provider, model, version, dim],
 * );
 */
export function getEmbeddingProvenance(provider?: EmbeddingProvider): {
  provider: EmbeddingProvider;
  model: string;
  version: string;
  dim: number;
} {
  const p = provider ?? getDefaultEmbeddingProvider();
  return {
    provider: p,
    model: getDefaultEmbeddingModel(p),
    version: EMBEDDING_VERSION,
    dim: getDefaultEmbeddingDimensions(p),
  };
}
