/**
 * Vector Search
 *
 * pgvector-based semantic search wrapper
 */

import { prisma } from '@oppmon/database';
import { VectorResult, VectorSearchOptions } from './types.js';
import { createEmbeddingClient, getDefaultEmbeddingProvider, toPgVector, EmbeddingProvider } from '../embedding/index.js';

// ============================================================================
// Main Vector Search
// ============================================================================

/**
 * Execute vector similarity search
 */
export async function vectorSearch(
  options: VectorSearchOptions & { embeddingProvider?: EmbeddingProvider }
): Promise<VectorResult[]> {
  const {
    tenantId,
    query,
    sourceTypes,
    sourceIds,
    topK = 100,
    threshold = 0.7,
    embeddingProvider,
  } = options;

  // Generate query embedding
  const provider = embeddingProvider ?? getDefaultEmbeddingProvider();
  const embeddingClient = createEmbeddingClient(provider);
  const embeddingResponse = await embeddingClient.embed({ input: query });
  const queryEmbedding = embeddingResponse.embeddings[0].embedding;

  // Build SQL query with filters
  let results: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    content: string;
    metadata: unknown;
    similarity: number;
  }>;

  if (sourceTypes && sourceTypes.length > 0) {
    results = await prisma.$queryRaw`
      SELECT
        id,
        "sourceType",
        "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
        AND "sourceType" = ANY(${sourceTypes})
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${topK}
    `;
  } else if (sourceIds && sourceIds.length > 0) {
    results = await prisma.$queryRaw`
      SELECT
        id,
        "sourceType",
        "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
        AND "sourceId" = ANY(${sourceIds})
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${topK}
    `;
  } else {
    results = await prisma.$queryRaw`
      SELECT
        id,
        "sourceType",
        "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${topK}
    `;
  }

  return results.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    content: row.content,
    score: Number(row.similarity),
    metadata: row.metadata as Record<string, unknown> | undefined,
  }));
}

/**
 * Vector search without embedding generation (when you have the embedding)
 */
export async function vectorSearchWithEmbedding(
  tenantId: string,
  queryEmbedding: number[],
  options: {
    sourceTypes?: string[];
    sourceIds?: string[];
    topK?: number;
    threshold?: number;
  } = {}
): Promise<VectorResult[]> {
  const { sourceTypes, sourceIds, topK = 100, threshold = 0.7 } = options;

  let results: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    content: string;
    metadata: unknown;
    similarity: number;
  }>;

  if (sourceTypes && sourceTypes.length > 0) {
    results = await prisma.$queryRaw`
      SELECT
        id,
        "sourceType",
        "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
        AND "sourceType" = ANY(${sourceTypes})
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${topK}
    `;
  } else if (sourceIds && sourceIds.length > 0) {
    results = await prisma.$queryRaw`
      SELECT
        id,
        "sourceType",
        "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
        AND "sourceId" = ANY(${sourceIds})
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${topK}
    `;
  } else {
    results = await prisma.$queryRaw`
      SELECT
        id,
        "sourceType",
        "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${topK}
    `;
  }

  return results.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    content: row.content,
    score: Number(row.similarity),
    metadata: row.metadata as Record<string, unknown> | undefined,
  }));
}

/**
 * Get total count of embeddings matching filters
 */
export async function getEmbeddingCount(
  tenantId: string,
  sourceTypes?: string[]
): Promise<number> {
  if (sourceTypes && sourceTypes.length > 0) {
    return prisma.embedding.count({
      where: {
        tenantId,
        sourceType: { in: sourceTypes },
      },
    });
  }

  return prisma.embedding.count({
    where: { tenantId },
  });
}
