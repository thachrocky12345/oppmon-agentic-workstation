// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Embedding Service
 *
 * Business logic for embedding operations:
 * - Generate and store embeddings
 * - Semantic similarity search using pgvector
 * - Embedding management and deduplication
 */

import { prisma } from '@oppmon/database';
import { Prisma } from '@oppmon/database';
import {
  createEmbeddingClient,
  getDefaultEmbeddingProvider,
  computeContentHash,
  toPgVector,
  chunkText,
  EmbeddingProvider,
  EmbeddingResponse,
  SemanticSearchRequest,
  SemanticSearchResult,
  EmbeddingError,
} from '../lib/embedding/index.js';

// ============================================================================
// Types
// ============================================================================

export interface EmbedInput {
  /** Text to embed */
  content: string;
  /** Source type (skill, agent, document, etc.) */
  sourceType: string;
  /** Source ID reference */
  sourceId: string;
  /** Provider to use (optional) */
  provider?: EmbeddingProvider;
  /** Model to use (optional) */
  model?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Skip if embedding already exists for this content hash */
  skipIfExists?: boolean;
}

export interface EmbedBatchInput {
  items: Array<{
    content: string;
    sourceType: string;
    sourceId: string;
    metadata?: Record<string, unknown>;
  }>;
  provider?: EmbeddingProvider;
  model?: string;
  skipIfExists?: boolean;
}

export interface EmbedResult {
  id: string;
  sourceType: string;
  sourceId: string;
  contentHash: string;
  provider: string;
  model: string;
  dimensions: number;
  created: boolean; // false if skipped due to existing
}

// ============================================================================
// Embed Functions
// ============================================================================

/**
 * Generate and store embedding for a single text
 */
export async function embed(
  tenantId: string,
  input: EmbedInput
): Promise<EmbedResult> {
  const provider = input.provider || getDefaultEmbeddingProvider();
  const contentHash = computeContentHash(input.content);

  // Check for existing embedding if skipIfExists is true
  if (input.skipIfExists) {
    const existing = await prisma.embedding.findFirst({
      where: {
        tenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        contentHash,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        contentHash: existing.contentHash,
        provider: existing.provider,
        model: existing.model,
        dimensions: existing.dimensions,
        created: false,
      };
    }
  }

  // Generate embedding
  const client = createEmbeddingClient(provider);
  const response = await client.embed({
    input: input.content,
    model: input.model,
  });

  const embedding = response.embeddings[0].embedding;

  // Store embedding using transaction with raw SQL for pgvector
  const result = await prisma.$transaction(async (tx) => {
    // First create the Prisma record without the vector
    const record = await tx.embedding.upsert({
      where: {
        tenantId_sourceType_sourceId_contentHash: {
          tenantId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          contentHash,
        },
      },
      create: {
        tenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        content: input.content,
        contentHash,
        provider,
        model: response.model,
        dimensions: response.dimensions,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      update: {
        content: input.content,
        provider,
        model: response.model,
        dimensions: response.dimensions,
        metadata: input.metadata as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    // Update the vector column with raw SQL
    await tx.$executeRaw`
      UPDATE embeddings
      SET embedding = ${toPgVector(embedding)}::vector
      WHERE id = ${record.id}
    `;

    return record;
  });

  return {
    id: result.id,
    sourceType: result.sourceType,
    sourceId: result.sourceId,
    contentHash: result.contentHash,
    provider: result.provider,
    model: result.model,
    dimensions: result.dimensions,
    created: true,
  };
}

/**
 * Generate and store embeddings for multiple texts
 * Batches API calls for efficiency
 */
export async function embedBatch(
  tenantId: string,
  input: EmbedBatchInput
): Promise<EmbedResult[]> {
  const provider = input.provider || getDefaultEmbeddingProvider();
  const results: EmbedResult[] = [];

  // Filter items that need embedding
  const itemsToEmbed: Array<{
    index: number;
    content: string;
    sourceType: string;
    sourceId: string;
    contentHash: string;
    metadata?: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const contentHash = computeContentHash(item.content);

    if (input.skipIfExists) {
      const existing = await prisma.embedding.findFirst({
        where: {
          tenantId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          contentHash,
        },
      });

      if (existing) {
        results.push({
          id: existing.id,
          sourceType: existing.sourceType,
          sourceId: existing.sourceId,
          contentHash: existing.contentHash,
          provider: existing.provider,
          model: existing.model,
          dimensions: existing.dimensions,
          created: false,
        });
        continue;
      }
    }

    itemsToEmbed.push({
      index: i,
      content: item.content,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      contentHash,
      metadata: item.metadata,
    });
  }

  // If nothing to embed, return results
  if (itemsToEmbed.length === 0) {
    return results;
  }

  // Batch embed
  const client = createEmbeddingClient(provider);
  const response = await client.embed({
    input: itemsToEmbed.map((item) => item.content),
    model: input.model,
  });

  // Store embeddings
  for (let i = 0; i < itemsToEmbed.length; i++) {
    const item = itemsToEmbed[i];
    const embedding = response.embeddings[i].embedding;

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.embedding.upsert({
        where: {
          tenantId_sourceType_sourceId_contentHash: {
            tenantId,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            contentHash: item.contentHash,
          },
        },
        create: {
          tenantId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          content: item.content,
          contentHash: item.contentHash,
          provider,
          model: response.model,
          dimensions: response.dimensions,
          metadata: item.metadata as Prisma.InputJsonValue,
        },
        update: {
          content: item.content,
          provider,
          model: response.model,
          dimensions: response.dimensions,
          metadata: item.metadata as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      await tx.$executeRaw`
        UPDATE embeddings
        SET embedding = ${toPgVector(embedding)}::vector
        WHERE id = ${record.id}
      `;

      return record;
    });

    results.push({
      id: result.id,
      sourceType: result.sourceType,
      sourceId: result.sourceId,
      contentHash: result.contentHash,
      provider: result.provider,
      model: result.model,
      dimensions: result.dimensions,
      created: true,
    });
  }

  return results;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Semantic search using cosine similarity
 */
export async function search(
  tenantId: string,
  request: SemanticSearchRequest
): Promise<SemanticSearchResult[]> {
  const provider = getDefaultEmbeddingProvider();
  const client = createEmbeddingClient(provider);

  // Generate query embedding
  const response = await client.embed({
    input: request.query,
  });

  const queryEmbedding = response.embeddings[0].embedding;
  const limit = request.limit ?? 10;
  const threshold = request.threshold ?? 0;

  // Build raw SQL query for pgvector similarity search
  let results: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    content: string;
    metadata: unknown;
    similarity: number;
  }>;

  if (request.sourceType) {
    results = await prisma.$queryRaw`
      SELECT
        id,
        source_type AS "sourceType",
        source_id AS "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE tenant_id = ${tenantId}
        AND source_type = ${request.sourceType}
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${limit}
    `;
  } else {
    results = await prisma.$queryRaw`
      SELECT
        id,
        source_type AS "sourceType",
        source_id AS "sourceId",
        content,
        metadata,
        1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector) AS similarity
      FROM embeddings
      WHERE tenant_id = ${tenantId}
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${limit}
    `;
  }

  return results.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    content: request.includeContent ? row.content : undefined,
    metadata: request.includeMetadata ? (row.metadata as Record<string, unknown>) : undefined,
    similarity: Number(row.similarity),
  }));
}

/**
 * Find similar embeddings to a given source
 */
export async function findSimilar(
  tenantId: string,
  sourceType: string,
  sourceId: string,
  options: { limit?: number; threshold?: number; includeContent?: boolean } = {}
): Promise<SemanticSearchResult[]> {
  const { limit = 10, threshold = 0.5, includeContent = false } = options;

  // Get the source embedding
  const source = await prisma.embedding.findFirst({
    where: {
      tenantId,
      sourceType,
      sourceId,
    },
  });

  if (!source) {
    return [];
  }

  // Find similar (excluding self)
  const results: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    content: string;
    metadata: unknown;
    similarity: number;
  }> = await prisma.$queryRaw`
    SELECT
      e.id,
      e.source_type AS "sourceType",
      e.source_id AS "sourceId",
      e.content,
      e.metadata,
      1 - (e.embedding <=> src.embedding) AS similarity
    FROM embeddings e
    CROSS JOIN (
      SELECT embedding FROM embeddings WHERE id = ${source.id}
    ) src
    WHERE e.tenant_id = ${tenantId}
      AND e.id != ${source.id}
      AND (1 - (e.embedding <=> src.embedding)) >= ${threshold}
    ORDER BY e.embedding <=> src.embedding
    LIMIT ${limit}
  `;

  return results.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    content: includeContent ? row.content : undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    similarity: Number(row.similarity),
  }));
}

// ============================================================================
// Management Functions
// ============================================================================

/**
 * List embeddings for a tenant
 */
export async function listEmbeddings(
  tenantId: string,
  options: {
    sourceType?: string;
    sourceId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { limit = 50, offset = 0 } = options;

  const where: Prisma.EmbeddingWhereInput = { tenantId };
  if (options.sourceType) where.sourceType = options.sourceType;
  if (options.sourceId) where.sourceId = options.sourceId;

  const [embeddings, total] = await Promise.all([
    prisma.embedding.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        contentHash: true,
        provider: true,
        model: true,
        dimensions: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.embedding.count({ where }),
  ]);

  return { embeddings, total, limit, offset };
}

/**
 * Get embedding by ID
 */
export async function getEmbedding(tenantId: string, id: string) {
  return prisma.embedding.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Delete embedding by ID
 */
export async function deleteEmbedding(
  tenantId: string,
  id: string
): Promise<boolean> {
  const embedding = await prisma.embedding.findFirst({
    where: { id, tenantId },
  });

  if (!embedding) {
    return false;
  }

  await prisma.embedding.delete({ where: { id } });
  return true;
}

/**
 * Delete all embeddings for a source
 */
export async function deleteSourceEmbeddings(
  tenantId: string,
  sourceType: string,
  sourceId: string
): Promise<number> {
  const result = await prisma.embedding.deleteMany({
    where: { tenantId, sourceType, sourceId },
  });

  return result.count;
}

/**
 * Get embedding statistics for a tenant
 */
export async function getEmbeddingStats(tenantId: string) {
  const [bySourceType, byProvider, total] = await Promise.all([
    // Group by source type
    prisma.embedding.groupBy({
      by: ['sourceType'],
      where: { tenantId },
      _count: { id: true },
    }),
    // Group by provider
    prisma.embedding.groupBy({
      by: ['provider'],
      where: { tenantId },
      _count: { id: true },
    }),
    // Total count
    prisma.embedding.count({ where: { tenantId } }),
  ]);

  // Convert to Record<string, number> format
  const bySourceTypeMap: Record<string, number> = {};
  for (const stat of bySourceType) {
    bySourceTypeMap[stat.sourceType] = stat._count.id;
  }

  const byProviderMap: Record<string, number> = {};
  for (const stat of byProvider) {
    byProviderMap[stat.provider] = stat._count.id;
  }

  return {
    total,
    bySourceType: bySourceTypeMap,
    byProvider: byProviderMap,
  };
}

/**
 * Re-embed content with a new provider/model
 * Useful for migration or model upgrades
 */
export async function reEmbed(
  tenantId: string,
  options: {
    sourceType?: string;
    provider?: EmbeddingProvider;
    model?: string;
    batchSize?: number;
  } = {}
): Promise<{ processed: number; failed: number }> {
  const { batchSize = 100 } = options;
  const provider = options.provider || getDefaultEmbeddingProvider();

  let processed = 0;
  let failed = 0;
  let offset = 0;

  const where: Prisma.EmbeddingWhereInput = { tenantId };
  if (options.sourceType) where.sourceType = options.sourceType;

  while (true) {
    const embeddings = await prisma.embedding.findMany({
      where,
      take: batchSize,
      skip: offset,
      select: {
        id: true,
        content: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
      },
    });

    if (embeddings.length === 0) break;

    const client = createEmbeddingClient(provider);

    for (const emb of embeddings) {
      try {
        const response = await client.embed({
          input: emb.content,
          model: options.model,
        });

        const embedding = response.embeddings[0].embedding;

        await prisma.$transaction(async (tx) => {
          await tx.embedding.update({
            where: { id: emb.id },
            data: {
              provider,
              model: response.model,
              dimensions: response.dimensions,
              updatedAt: new Date(),
            },
          });

          await tx.$executeRaw`
            UPDATE embeddings
            SET embedding = ${toPgVector(embedding)}::vector
            WHERE id = ${emb.id}
          `;
        });

        processed++;
      } catch (error) {
        console.error(`Failed to re-embed ${emb.id}:`, error);
        failed++;
      }
    }

    offset += batchSize;
  }

  return { processed, failed };
}
