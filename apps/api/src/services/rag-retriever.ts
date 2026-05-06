/**
 * RAG Retrieval Service
 *
 * Retrieves relevant document chunks for RAG-grounded chat.
 * Uses pgvector cosine similarity search with tenant isolation.
 */

import { query } from '../lib/db.js';
import { createEmbeddingClient, toPgVector } from '../lib/embedding/index.js';

// ============================================================================
// Types
// ============================================================================

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentFilename: string;
  chunkText: string;
  chunkIndex: number;
  score: number;
  collectionId: string;
  collectionName: string;
  pageNumber: number | null;
}

export interface RetrieveOptions {
  /** Tenant ID - required for isolation */
  tenantId: string;
  /** User ID for team membership lookup */
  userId: string;
  /** Teams the user is a member of */
  teamIds: string[];
  /** The query text to find relevant chunks for */
  queryText: string;
  /** Maximum number of chunks to return (default: 5) */
  topK?: number;
  /** Minimum similarity threshold (default: 0.3) */
  threshold?: number;
  /** Optional: Filter to specific collections */
  collectionIds?: string[];
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Retrieve relevant document chunks for a query
 *
 * Steps:
 * 1. Embed the query text
 * 2. Find similar chunks using pgvector cosine similarity
 * 3. Filter by tenant and accessible collections
 * 4. Return top-k results above threshold
 */
export async function retrieve(options: RetrieveOptions): Promise<RetrievedChunk[]> {
  const {
    tenantId,
    userId,
    teamIds,
    queryText,
    topK = 5,
    threshold = 0.3,
    collectionIds,
  } = options;

  if (!queryText.trim()) {
    return [];
  }

  try {
    // Step 1: Embed the query
    const embeddingClient = createEmbeddingClient('openai');
    const embeddingResponse = await embeddingClient.embed({ input: queryText });
    const queryEmbedding = embeddingResponse.embeddings[0].embedding;

    // Step 2: Build the SQL query with proper scoping
    // Collections accessible:
    // - TENANT scoped collections in user's tenant
    // - TEAM scoped collections where user is a member
    const params: unknown[] = [
      toPgVector(queryEmbedding), // $1 - query vector
      tenantId,                    // $2 - tenant ID
      threshold,                   // $3 - similarity threshold
      topK,                        // $4 - limit
    ];

    let collectionFilter = '';
    let teamFilter = '';

    // Team scope filter
    if (teamIds.length > 0) {
      params.push(teamIds); // $5
      teamFilter = `
        AND (
          c.scope = 'TENANT'
          OR (c.scope = 'TEAM' AND c."teamId" = ANY($5))
        )
      `;
    } else {
      // No teams - only tenant-scoped collections
      teamFilter = `AND c.scope = 'TENANT'`;
    }

    // Optional collection filter
    if (collectionIds && collectionIds.length > 0) {
      params.push(collectionIds);
      collectionFilter = `AND c.id = ANY($${params.length})`;
    }

    const sql = `
      SELECT
        ch.id as "chunkId",
        ch."documentId",
        d."originalFilename" as "documentFilename",
        d."originalFilename" as "documentTitle",
        ch.content as "chunkText",
        ch."chunkIndex",
        ch."pageNumber",
        c.id as "collectionId",
        c.name as "collectionName",
        1 - (ch.embedding <=> $1::vector) as score
      FROM rag_chunks ch
      JOIN rag_documents d ON d.id = ch."documentId"
      JOIN rag_collections c ON c.id = d."collectionId"
      WHERE ch."tenantId" = $2
        AND d."deletedAt" IS NULL
        AND c."deletedAt" IS NULL
        AND d."extractionStatus" = 'EXTRACTED'
        AND 1 - (ch.embedding <=> $1::vector) >= $3
        ${teamFilter}
        ${collectionFilter}
      ORDER BY ch.embedding <=> $1::vector
      LIMIT $4
    `;

    const result = await query(sql, params);

    return result.rows.map((row: any) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      documentFilename: row.documentFilename,
      chunkText: row.chunkText,
      chunkIndex: row.chunkIndex,
      score: parseFloat(row.score),
      collectionId: row.collectionId,
      collectionName: row.collectionName,
      pageNumber: row.pageNumber,
    }));
  } catch (error) {
    console.error('RAG retrieval error:', error);
    throw error;
  }
}

/**
 * Format retrieved chunks as context for LLM prompt
 */
export function formatChunksAsContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '';
  }

  const formattedChunks = chunks.map((chunk, index) => {
    const source = chunk.pageNumber
      ? `${chunk.documentTitle} (page ${chunk.pageNumber})`
      : chunk.documentTitle;

    return `[${index + 1}] From "${source}":\n${chunk.chunkText}`;
  });

  return `<context>\n${formattedChunks.join('\n\n')}\n</context>`;
}

/**
 * Get list of accessible collections for a user
 */
export async function getAccessibleCollections(
  tenantId: string,
  teamIds: string[]
): Promise<{ id: string; name: string; scope: string }[]> {
  let teamFilter = '';
  const params: unknown[] = [tenantId];

  if (teamIds.length > 0) {
    params.push(teamIds);
    teamFilter = `
      AND (
        scope = 'TENANT'
        OR (scope = 'TEAM' AND "teamId" = ANY($2))
      )
    `;
  } else {
    teamFilter = `AND scope = 'TENANT'`;
  }

  const result = await query(`
    SELECT id, name, scope
    FROM rag_collections
    WHERE "tenantId" = $1
      AND "deletedAt" IS NULL
      ${teamFilter}
    ORDER BY name
  `, params);

  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    scope: row.scope,
  }));
}
