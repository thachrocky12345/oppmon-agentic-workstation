/**
 * RAG (Retrieval Augmented Generation) Orchestrator
 *
 * Main entry point for RAG operations. Orchestrates:
 * 1. Query preprocessing
 * 2. Semantic retrieval via embeddings
 * 3. Context formatting
 * 4. LLM generation
 * 5. Response formatting
 */

import {
  RAGRequest,
  RAGResponse,
  RAGConfig,
  RetrievedDocument,
  RetrievalResult,
  SourceCitation,
  RAGError,
  DEFAULT_RAG_SYSTEM_PROMPT,
} from './types.js';
import {
  buildRAGPrompt,
  extractSourceCitations,
  preprocessQuery,
  fitContextWindow,
  estimateTokens,
} from './context.js';
import { createLLMClient, getDefaultProvider, LLMMessage, LLMProvider } from '../llm/index.js';
import { createEmbeddingClient, getDefaultEmbeddingProvider, toPgVector, EmbeddingProvider } from '../embedding/index.js';
import { prisma } from '@arkon/database';
import { hasSearchVector } from '../search/index.js';
import { hybridSearch as hybridSearchFn } from '../../services/search.js';

// Re-export types
export * from './types.js';
export * from './context.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get RAG configuration from environment
 */
export function getRAGConfig(): RAGConfig {
  return {
    defaultTopK: parseInt(process.env.RAG_DEFAULT_TOP_K || '5', 10),
    defaultThreshold: parseFloat(process.env.RAG_DEFAULT_THRESHOLD || '0.7'),
    maxContextTokens: parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '4000', 10),
    strategy: (process.env.RAG_STRATEGY as RAGConfig['strategy']) || 'simple',
    llmProvider: (process.env.RAG_LLM_PROVIDER as LLMProvider) || getDefaultProvider(),
    embeddingProvider: (process.env.RAG_EMBEDDING_PROVIDER as EmbeddingProvider) || getDefaultEmbeddingProvider(),
    includeSources: process.env.RAG_INCLUDE_SOURCES !== 'false',
    systemPromptTemplate: process.env.RAG_SYSTEM_PROMPT || DEFAULT_RAG_SYSTEM_PROMPT,
    contextTemplate: process.env.RAG_CONTEXT_TEMPLATE || '',
  };
}

// ============================================================================
// Retrieval
// ============================================================================

/**
 * Retrieve relevant documents using semantic search
 * Supports both vector-only and hybrid (BM25 + vector) strategies
 */
export async function retrieve(
  tenantId: string,
  query: string,
  options: {
    topK?: number;
    threshold?: number;
    sourceTypes?: string[];
    sourceIds?: string[];
    embeddingProvider?: EmbeddingProvider;
    strategy?: 'vector' | 'hybrid';
  } = {}
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const config = getRAGConfig();

  const topK = options.topK ?? config.defaultTopK;
  const threshold = options.threshold ?? config.defaultThreshold;
  const embeddingProvider = options.embeddingProvider ?? config.embeddingProvider;
  const strategy = options.strategy ?? (config.strategy === 'hybrid' ? 'hybrid' : 'vector');

  // Preprocess query
  const processedQuery = preprocessQuery(query);

  // Use hybrid search if strategy is 'hybrid' and BM25 is available
  if (strategy === 'hybrid') {
    try {
      const hasBM25 = await hasSearchVector('skills');
      if (hasBM25) {
        const hybridResult = await hybridSearchFn(tenantId, {
          query: processedQuery,
          sourceTypes: options.sourceTypes || ['skill', 'mcp_server'],
          topK,
          threshold,
          strategy: 'hybrid',
          embeddingProvider,
        });

        const documents: RetrievedDocument[] = hybridResult.results.map((r) => ({
          id: r.id,
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          content: r.content,
          score: r.scores.final,
          metadata: {
            ...r.metadata,
            scores: r.scores,
          },
        }));

        return {
          documents,
          query: processedQuery,
          totalSearched: hybridResult.debug.bm25Count + hybridResult.debug.vectorCount,
          retrievalTimeMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      console.warn('[RAG] Hybrid search failed, falling back to vector search:', error);
    }
  }

  // Vector-only search (default/fallback)
  // Generate query embedding
  const embeddingClient = createEmbeddingClient(embeddingProvider);
  const embeddingResponse = await embeddingClient.embed({ input: processedQuery });
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

  if (options.sourceTypes && options.sourceTypes.length > 0) {
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
        AND "sourceType" = ANY(${options.sourceTypes})
        AND (1 - (embedding <=> ${toPgVector(queryEmbedding)}::vector)) >= ${threshold}
      ORDER BY embedding <=> ${toPgVector(queryEmbedding)}::vector
      LIMIT ${topK}
    `;
  } else if (options.sourceIds && options.sourceIds.length > 0) {
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
        AND "sourceId" = ANY(${options.sourceIds})
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

  // Get total count for metadata
  const totalCount = await prisma.embedding.count({ where: { tenantId } });

  const documents: RetrievedDocument[] = results.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    content: row.content,
    score: Number(row.similarity),
    metadata: row.metadata as Record<string, unknown> | undefined,
  }));

  return {
    documents,
    query: processedQuery,
    totalSearched: totalCount,
    retrievalTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate response using LLM with retrieved context
 */
export async function generate(
  query: string,
  documents: RetrievedDocument[],
  options: {
    history?: LLMMessage[];
    systemPrompt?: string;
    llmProvider?: LLMProvider;
    llmModel?: string;
    temperature?: number;
    maxTokens?: number;
    maxContextTokens?: number;
  } = {}
): Promise<{
  content: string;
  model: string;
  provider: LLMProvider;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}> {
  const config = getRAGConfig();

  const llmProvider = options.llmProvider ?? config.llmProvider;
  const systemPrompt = options.systemPrompt ?? config.systemPromptTemplate;
  const maxContextTokens = options.maxContextTokens ?? config.maxContextTokens;

  // Fit content within context window
  const { fittedDocuments, fittedHistory } = fitContextWindow(
    systemPrompt,
    options.history || [],
    documents,
    query,
    {
      maxTokens: 8000, // Model context window
      systemPromptReserve: 500,
      responseReserve: options.maxTokens ?? 1000,
      truncationStrategy: 'last',
    }
  );

  // Build RAG prompt
  const messages = buildRAGPrompt(query, fittedDocuments, {
    systemPrompt,
    history: fittedHistory,
    maxContextTokens,
  });

  // Generate response
  const llmClient = createLLMClient(llmProvider);

  try {
    const response = await llmClient.chat({
      messages,
      model: options.llmModel,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    return {
      content: response.content,
      model: response.model,
      provider: response.provider,
      usage: response.usage,
    };
  } catch (error) {
    throw RAGError.generationFailed(
      error instanceof Error ? error.message : 'LLM generation failed',
      error
    );
  }
}

// ============================================================================
// Main RAG Pipeline
// ============================================================================

/**
 * Execute full RAG pipeline: retrieve -> generate -> format
 */
export async function executeRAG(
  tenantId: string,
  request: RAGRequest
): Promise<RAGResponse> {
  const config = getRAGConfig();

  // Phase 1: Retrieval
  let retrievalResult: RetrievalResult;
  try {
    retrievalResult = await retrieve(tenantId, request.query, {
      topK: request.topK ?? config.defaultTopK,
      threshold: request.threshold ?? config.defaultThreshold,
      sourceTypes: request.sourceTypes,
      sourceIds: request.sourceIds,
      embeddingProvider: request.embeddingProvider,
    });
  } catch (error) {
    throw RAGError.retrievalFailed(
      error instanceof Error ? error.message : 'Retrieval failed',
      error
    );
  }

  // Phase 2: Generation
  const generationResult = await generate(request.query, retrievalResult.documents, {
    history: request.history,
    systemPrompt: request.systemPrompt,
    llmProvider: request.llmProvider,
    llmModel: request.llmModel,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    maxContextTokens: config.maxContextTokens,
  });

  // Phase 3: Format response
  const sources: SourceCitation[] = request.includeSources !== false
    ? extractSourceCitations(retrievalResult.documents)
    : [];

  // Generate or use provided session ID
  const sessionId = request.sessionId || generateSessionId();

  const response: RAGResponse = {
    answer: generationResult.content,
    sources,
    sessionId,
    model: generationResult.model,
    provider: generationResult.provider,
    usage: generationResult.usage,
  };

  // Add retrieval metadata if requested
  if (request.includeMetadata) {
    response.retrieval = {
      documentsRetrieved: retrievalResult.documents.length,
      retrievalTimeMs: retrievalResult.retrievalTimeMs,
      query: retrievalResult.query,
    };
  }

  return response;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `rag_${timestamp}_${random}`;
}

/**
 * Check if RAG is properly configured
 */
export function isRAGConfigured(): boolean {
  // Check embedding provider
  const embeddingProvider = getDefaultEmbeddingProvider();
  if (embeddingProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    return false;
  }

  // Check LLM provider
  const llmProvider = getDefaultProvider();
  if (llmProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    return false;
  }
  if (llmProvider === 'cerebras' && !process.env.CEREBRAS_API_KEY) {
    return false;
  }

  return true;
}

/**
 * Check if LLM provider is available
 */
function isLLMAvailable(): boolean {
  const llmProvider = getDefaultProvider();
  if (llmProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    return false;
  }
  if (llmProvider === 'cerebras' && !process.env.CEREBRAS_API_KEY) {
    return false;
  }
  if (llmProvider === 'ollama') {
    // Ollama is local, assume available if configured
    return true;
  }
  return true;
}

/**
 * Check if embedding provider is available
 */
function isEmbeddingAvailable(): boolean {
  const embeddingProvider = getDefaultEmbeddingProvider();
  if (embeddingProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    return false;
  }
  if (embeddingProvider === 'gemini' && !process.env.GOOGLE_API_KEY) {
    return false;
  }
  if (embeddingProvider === 'voyage' && !process.env.VOYAGE_API_KEY) {
    return false;
  }
  if (embeddingProvider === 'cohere' && !process.env.COHERE_API_KEY) {
    return false;
  }
  return true;
}

/**
 * Get RAG status
 */
export function getRAGStatus(): {
  llmAvailable: boolean;
  embeddingAvailable: boolean;
  embeddingProvider: string;
  llmProvider: string;
  config: RAGConfig;
} {
  const config = getRAGConfig();

  return {
    llmAvailable: isLLMAvailable(),
    embeddingAvailable: isEmbeddingAvailable(),
    embeddingProvider: config.embeddingProvider,
    llmProvider: config.llmProvider,
    config,
  };
}
