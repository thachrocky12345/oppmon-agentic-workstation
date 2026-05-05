/**
 * Embedding API Routes
 *
 * Endpoints:
 * - POST   /api/embedding/embed       - Generate embedding for text
 * - POST   /api/embedding/embed-batch - Generate embeddings for multiple texts
 * - POST   /api/embedding/search      - Semantic similarity search
 * - GET    /api/embedding             - List embeddings
 * - GET    /api/embedding/:id         - Get single embedding
 * - DELETE /api/embedding/:id         - Delete embedding
 * - DELETE /api/embedding/source/:sourceType/:sourceId - Delete by source
 * - GET    /api/embedding/stats       - Get embedding statistics
 * - POST   /api/embedding/similar/:sourceType/:sourceId - Find similar
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';
import { EmbeddingError, EmbeddingProvider } from '../lib/embedding/index.js';
import * as embeddingService from '../services/embedding.js';
import * as embeddingHooks from '../services/embedding-hooks.js';
import { logCreate, logDelete, getAuditContext } from '../services/audit.js';

export const embeddingRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const embedRequestSchema = z.object({
  content: z.string().min(1).max(100000),
  sourceType: z.string().min(1).max(50),
  sourceId: z.string().min(1).max(100),
  provider: z.enum(['openai', 'gemini', 'voyage', 'cohere']).optional(),
  model: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  skipIfExists: z.boolean().optional().default(true),
});

const embedBatchRequestSchema = z.object({
  items: z.array(
    z.object({
      content: z.string().min(1).max(100000),
      sourceType: z.string().min(1).max(50),
      sourceId: z.string().min(1).max(100),
      metadata: z.record(z.unknown()).optional(),
    })
  ).min(1).max(100),
  provider: z.enum(['openai', 'gemini', 'voyage', 'cohere']).optional(),
  model: z.string().optional(),
  skipIfExists: z.boolean().optional().default(true),
});

const searchRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  sourceType: z.string().optional(),
  sourceIds: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0),
  includeContent: z.boolean().optional().default(false),
  includeMetadata: z.boolean().optional().default(true),
});

const listQuerySchema = z.object({
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const findSimilarQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  threshold: z.coerce.number().min(0).max(1).optional(),
  includeContent: z.coerce.boolean().optional(),
});

// ============================================================================
// Embed Endpoints
// ============================================================================

/**
 * POST /api/embedding/embed
 * Generate embedding for a single text
 */
embeddingRouter.post(
  '/embed',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = embedRequestSchema.parse(req.body);

    try {
      const result = await embeddingService.embed(req.user.tenantId, {
        content: input.content,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        provider: input.provider as EmbeddingProvider | undefined,
        model: input.model,
        metadata: input.metadata,
        skipIfExists: input.skipIfExists,
      });

      // Audit log if created
      if (result.created) {
        const auditCtx = getAuditContext(req);
        if (auditCtx) {
          await logCreate(auditCtx, 'embedding', result.id, {
            sourceType: result.sourceType,
            sourceId: result.sourceId,
            provider: result.provider,
            model: result.model,
          });
        }
      }

      res.status(result.created ? 201 : 200).json({ data: result });
    } catch (error) {
      if (error instanceof EmbeddingError) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          code: error.code,
          provider: error.provider,
          details: error.details,
        });
        return;
      }
      throw error;
    }
  })
);

/**
 * POST /api/embedding/embed-batch
 * Generate embeddings for multiple texts
 */
embeddingRouter.post(
  '/embed-batch',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = embedBatchRequestSchema.parse(req.body);

    try {
      const results = await embeddingService.embedBatch(req.user.tenantId, {
        items: input.items,
        provider: input.provider as EmbeddingProvider | undefined,
        model: input.model,
        skipIfExists: input.skipIfExists,
      });

      // Audit log created embeddings
      const auditCtx = getAuditContext(req);
      if (auditCtx) {
        for (const result of results.filter((r) => r.created)) {
          await logCreate(auditCtx, 'embedding', result.id, {
            sourceType: result.sourceType,
            sourceId: result.sourceId,
            provider: result.provider,
          });
        }
      }

      res.json({
        data: results,
        meta: {
          total: results.length,
          created: results.filter((r) => r.created).length,
          skipped: results.filter((r) => !r.created).length,
        },
      });
    } catch (error) {
      if (error instanceof EmbeddingError) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          code: error.code,
          provider: error.provider,
          details: error.details,
        });
        return;
      }
      throw error;
    }
  })
);

// ============================================================================
// Search Endpoints
// ============================================================================

/**
 * POST /api/embedding/search
 * Semantic similarity search
 */
embeddingRouter.post(
  '/search',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = searchRequestSchema.parse(req.body);

    try {
      const results = await embeddingService.search(req.user.tenantId, {
        query: input.query,
        sourceType: input.sourceType,
        sourceIds: input.sourceIds,
        limit: input.limit,
        threshold: input.threshold,
        includeContent: input.includeContent,
        includeMetadata: input.includeMetadata,
      });

      res.json({
        data: results,
        meta: {
          total: results.length,
          query: input.query.substring(0, 100),
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

/**
 * POST /api/embedding/similar/:sourceType/:sourceId
 * Find similar items to a given source
 */
embeddingRouter.post(
  '/similar/:sourceType/:sourceId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = findSimilarQuerySchema.parse(req.query);

    const results = await embeddingService.findSimilar(
      req.user.tenantId,
      req.params.sourceType,
      req.params.sourceId,
      {
        limit: query.limit,
        threshold: query.threshold,
        includeContent: query.includeContent,
      }
    );

    res.json({ data: results });
  })
);

// ============================================================================
// Management Endpoints
// ============================================================================

/**
 * GET /api/embedding
 * List embeddings
 */
embeddingRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = listQuerySchema.parse(req.query);

    const result = await embeddingService.listEmbeddings(req.user.tenantId, {
      sourceType: query.sourceType,
      sourceId: query.sourceId,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      data: result.embeddings,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  })
);

/**
 * GET /api/embedding/stats
 * Get embedding statistics
 */
embeddingRouter.get(
  '/stats',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const stats = await embeddingService.getEmbeddingStats(req.user.tenantId);

    res.json({ data: stats });
  })
);

/**
 * GET /api/embedding/coverage
 * Get embedding coverage statistics
 * NOTE: Must be defined BEFORE /:id to avoid route conflicts
 */
embeddingRouter.get(
  '/coverage',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const coverage = await embeddingHooks.getEmbeddingCoverage(req.user.tenantId);

    res.json({ data: coverage });
  })
);

/**
 * GET /api/embedding/config
 * Get auto-embedding configuration
 * NOTE: Must be defined BEFORE /:id to avoid route conflicts
 */
embeddingRouter.get(
  '/config',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    res.json({
      data: {
        autoEmbeddingEnabled: embeddingHooks.isAutoEmbeddingEnabled(),
        supportedTypes: embeddingHooks.EMBEDDABLE_TYPES,
      },
    });
  })
);

/**
 * GET /api/embedding/status/:sourceType/:sourceId
 * Get embedding status for a specific entity
 * NOTE: Must be defined BEFORE /:id to avoid route conflicts
 */
embeddingRouter.get(
  '/status/:sourceType/:sourceId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const status = await embeddingHooks.getEmbeddingStatus(
      req.user.tenantId,
      req.params.sourceType,
      req.params.sourceId
    );

    res.json({ data: status });
  })
);

/**
 * GET /api/embedding/:id
 * Get single embedding
 */
embeddingRouter.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const embedding = await embeddingService.getEmbedding(
      req.user.tenantId,
      req.params.id
    );

    if (!embedding) {
      throw ApiError.notFound('Embedding not found');
    }

    res.json({ data: embedding });
  })
);

/**
 * DELETE /api/embedding/:id
 * Delete single embedding
 */
embeddingRouter.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const deleted = await embeddingService.deleteEmbedding(
      req.user.tenantId,
      req.params.id
    );

    if (!deleted) {
      throw ApiError.notFound('Embedding not found');
    }

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logDelete(auditCtx, 'embedding', req.params.id, {});
    }

    res.json({ success: true });
  })
);

/**
 * DELETE /api/embedding/source/:sourceType/:sourceId
 * Delete all embeddings for a source
 */
embeddingRouter.delete(
  '/source/:sourceType/:sourceId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const count = await embeddingService.deleteSourceEmbeddings(
      req.user.tenantId,
      req.params.sourceType,
      req.params.sourceId
    );

    res.json({
      success: true,
      data: { deleted: count },
    });
  })
);

// ============================================================================
// Auto-Embedding Management Endpoints
// ============================================================================

const reindexRequestSchema = z.object({
  types: z.array(z.enum(['skill', 'agent'])).optional(),
  batchSize: z.number().min(1).max(200).optional(),
  dryRun: z.boolean().optional().default(false),
});

/**
 * POST /api/embedding/reindex
 * Trigger re-indexing of all embeddable content
 */
embeddingRouter.post(
  '/reindex',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = reindexRequestSchema.parse(req.body);

    const results = await embeddingHooks.reindexAll(req.user.tenantId, {
      types: input.types as embeddingHooks.EmbeddableType[] | undefined,
      batchSize: input.batchSize,
      dryRun: input.dryRun,
    });

    // Calculate totals
    const totals = {
      total: 0,
      processed: 0,
      failed: 0,
    };

    for (const type of Object.keys(results) as embeddingHooks.EmbeddableType[]) {
      totals.total += results[type].total;
      totals.processed += results[type].processed;
      totals.failed += results[type].failed;
    }

    res.json({
      data: {
        dryRun: input.dryRun,
        results,
        totals,
      },
    });
  })
);

