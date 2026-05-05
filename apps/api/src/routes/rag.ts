/**
 * RAG (Retrieval Augmented Generation) API Routes
 *
 * Endpoints:
 * - POST   /api/rag/query        - Execute RAG query
 * - POST   /api/rag/retrieve     - Retrieve only (no generation)
 * - GET    /api/rag/status       - Get RAG pipeline status
 * - GET    /api/rag/sessions     - List RAG sessions
 * - GET    /api/rag/sessions/:id - Get session with messages
 * - DELETE /api/rag/sessions/:id - Delete session
 * - GET    /api/rag/usage        - Get usage statistics
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';
import { RAGError } from '../lib/rag/index.js';
import { LLMError } from '../lib/llm/index.js';
import { EmbeddingError } from '../lib/embedding/index.js';
import * as ragService from '../services/rag.js';
import * as searchService from '../services/search.js';
import { logCreate, getAuditContext } from '../services/audit.js';

export const ragRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const queryRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
  sourceTypes: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
  topK: z.number().min(1).max(20).optional(),
  threshold: z.number().min(0).max(1).optional(),
  llmProvider: z.enum(['ollama', 'cerebras', 'anthropic']).optional(),
  llmModel: z.string().optional(),
  embeddingProvider: z.enum(['openai', 'gemini', 'voyage', 'cohere']).optional(),
  systemPrompt: z.string().max(5000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
  includeSources: z.boolean().optional().default(true),
  includeMetadata: z.boolean().optional().default(false),
});

const retrieveRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  sourceTypes: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
  topK: z.number().min(1).max(50).optional(),
  threshold: z.number().min(0).max(1).optional(),
  embeddingProvider: z.enum(['openai', 'gemini', 'voyage', 'cohere']).optional(),
  strategy: z.enum(['vector', 'bm25', 'hybrid']).optional().default('vector'),
  scoringPreset: z.enum(['default', 'keyword_focused', 'semantic_focused', 'agreement_focused']).optional(),
});

const listSessionsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const usageQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ============================================================================
// Query Endpoints
// ============================================================================

/**
 * POST /api/rag/query
 * Execute a full RAG query (retrieval + generation)
 */
ragRouter.post(
  '/query',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = queryRequestSchema.parse(req.body);

    try {
      const response = await ragService.query(req.user.tenantId, req.user.id, {
        query: input.query,
        sessionId: input.sessionId,
        sourceTypes: input.sourceTypes,
        sourceIds: input.sourceIds,
        topK: input.topK,
        threshold: input.threshold,
        llmProvider: input.llmProvider,
        llmModel: input.llmModel,
        embeddingProvider: input.embeddingProvider,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        includeSources: input.includeSources,
        includeMetadata: input.includeMetadata,
      });

      // Audit log
      const auditCtx = getAuditContext(req);
      if (auditCtx) {
        await logCreate(auditCtx, 'rag_query', response.sessionId, {
          query: input.query.substring(0, 200),
          provider: response.provider,
          model: response.model,
          sourcesCount: response.sources.length,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        });
      }

      res.json({ data: response });
    } catch (error) {
      if (error instanceof RAGError) {
        res.status(500).json({
          error: error.message,
          code: error.code,
          phase: error.phase,
          details: error.details,
        });
        return;
      }

      if (error instanceof LLMError) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          code: error.code,
          provider: error.provider,
        });
        return;
      }

      if (error instanceof EmbeddingError) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          code: error.code,
          provider: error.provider,
        });
        return;
      }

      throw error;
    }
  })
);

/**
 * POST /api/rag/retrieve
 * Execute retrieval only (no LLM generation)
 * Supports strategy: 'vector' | 'bm25' | 'hybrid'
 */
ragRouter.post(
  '/retrieve',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = retrieveRequestSchema.parse(req.body);

    try {
      // Use hybrid search if strategy is 'hybrid' or 'bm25'
      if (input.strategy === 'hybrid' || input.strategy === 'bm25') {
        const result = await searchService.hybridSearch(req.user.tenantId, {
          query: input.query,
          sourceTypes: input.sourceTypes || ['skill', 'mcp_server'],
          topK: input.topK,
          threshold: input.threshold,
          strategy: input.strategy,
          scoringPreset: input.scoringPreset,
          embeddingProvider: input.embeddingProvider,
        });

        res.json({
          data: {
            documents: result.results.map(r => ({
              id: r.id,
              sourceType: r.sourceType,
              sourceId: r.sourceId,
              content: r.content,
              score: r.scores.final,
              scores: r.scores,
              metadata: r.metadata,
            })),
            query: input.query,
            totalSearched: result.debug.bm25Count + result.debug.vectorCount,
            retrievalTimeMs: result.debug.timings.totalMs,
            confidence: result.confidence,
            debug: result.debug,
          },
        });
        return;
      }

      // Default: use vector-only search (original behavior)
      const result = await ragService.retrieveOnly(req.user.tenantId, {
        query: input.query,
        sourceTypes: input.sourceTypes,
        sourceIds: input.sourceIds,
        topK: input.topK,
        threshold: input.threshold,
        embeddingProvider: input.embeddingProvider,
      });

      res.json({
        data: {
          documents: result.documents,
          query: result.query,
          totalSearched: result.totalSearched,
          retrievalTimeMs: result.retrievalTimeMs,
        },
      });
    } catch (error) {
      if (error instanceof EmbeddingError) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          code: error.code,
          provider: error.provider,
        });
        return;
      }

      throw error;
    }
  })
);

// ============================================================================
// Status & Configuration
// ============================================================================

/**
 * GET /api/rag/status
 * Get RAG pipeline status and configuration
 */
ragRouter.get(
  '/status',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const status = ragService.getStatus();
    const config = ragService.getConfig();
    const searchStatus = await searchService.getSearchStatus();

    res.json({
      data: {
        ...status,
        search: searchStatus,
        config: {
          defaultTopK: config.defaultTopK,
          defaultThreshold: config.defaultThreshold,
          maxContextTokens: config.maxContextTokens,
          strategy: config.strategy,
        },
      },
    });
  })
);

// ============================================================================
// Session Management
// ============================================================================

/**
 * GET /api/rag/sessions
 * List RAG sessions for the current user
 */
ragRouter.get(
  '/sessions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = listSessionsQuerySchema.parse(req.query);

    const { sessions, total } = await ragService.listSessions(
      req.user.tenantId,
      req.user.id,
      {
        limit: query.limit,
        offset: query.offset,
      }
    );

    res.json({
      data: sessions,
      meta: {
        total,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      },
    });
  })
);

/**
 * GET /api/rag/sessions/:id
 * Get a RAG session with messages
 */
ragRouter.get(
  '/sessions/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const session = await ragService.getSession(
      req.user.tenantId,
      req.user.id,
      req.params.id
    );

    if (!session) {
      throw ApiError.notFound('Session not found');
    }

    res.json({ data: session });
  })
);

/**
 * DELETE /api/rag/sessions/:id
 * Delete a RAG session
 */
ragRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const deleted = await ragService.deleteSession(
      req.user.tenantId,
      req.user.id,
      req.params.id
    );

    if (!deleted) {
      throw ApiError.notFound('Session not found');
    }

    res.json({ success: true });
  })
);

// ============================================================================
// Usage Statistics
// ============================================================================

/**
 * GET /api/rag/usage
 * Get RAG usage statistics
 */
ragRouter.get(
  '/usage',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = usageQuerySchema.parse(req.query);

    const stats = await ragService.getUsageStats(
      req.user.tenantId,
      req.user.id,
      {
        startDate: query.startDate,
        endDate: query.endDate,
      }
    );

    res.json({ data: stats });
  })
);
