/**
 * Model Registry API Routes
 *
 * Endpoints:
 * - GET    /api/models          - List models (RBAC-scoped, no secrets)
 * - GET    /api/models/:id      - Get single model (no secrets)
 * - POST   /api/models          - Create model (preset or YAML mode)
 * - PATCH  /api/models/:id      - Update model
 * - DELETE /api/models/:id      - Soft delete model
 * - POST   /api/models/:id/rotate-secret - Rotate credentials
 * - POST   /api/models/test     - Test connection (no persist)
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, ModelScope } from '@arkon/database';
import { providerRegistry, type ProviderTemplateId } from '@arkon/shared';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';
import { rbac, buildRBACContext, RBACContext } from '../middleware/rbac.js';
import {
  listModels,
  getModel,
  createModel,
  updateModel,
  deleteModel,
  rotateModelSecret,
  type ModelFilter,
} from '../services/models.js';
import {
  validateConnection,
  validateYamlConfig,
} from '../validators/index.js';
import {
  logCreate,
  logUpdate,
  logDelete,
  getAuditContext,
} from '../services/audit.js';

export const modelsRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createModelSchema = z.object({
  displayName: z.string().min(1).max(255),
  providerTemplateId: z.string().optional(),
  modelIdentifier: z.string().min(1).max(255),
  publicConfig: z.record(z.unknown()).default({}),
  secretConfig: z.record(z.string()).optional(),
  yamlOverride: z.string().optional(),
  scope: z.enum(['TENANT', 'TEAM']),
  teamId: z.string().optional().nullable(),
}).refine(
  (data) => data.providerTemplateId || data.yamlOverride,
  { message: 'Either providerTemplateId or yamlOverride is required' }
);

const updateModelSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  modelIdentifier: z.string().min(1).max(255).optional(),
  publicConfig: z.record(z.unknown()).optional(),
  secretConfig: z.record(z.string()).optional(),
  yamlOverride: z.string().optional(),
  scope: z.enum(['TENANT', 'TEAM']).optional(),
  teamId: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

const listModelsQuerySchema = z.object({
  scope: z.enum(['TENANT', 'TEAM']).optional(),
  enabled: z.coerce.boolean().optional(),
  search: z.string().optional(),
  providerTemplateId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const testConnectionSchema = z.object({
  providerTemplateId: z.string().optional(),
  publicConfig: z.record(z.unknown()).optional(),
  secretConfig: z.record(z.string()).optional(),
  yamlOverride: z.string().optional(),
}).refine(
  (data) => data.providerTemplateId || data.yamlOverride,
  { message: 'Either providerTemplateId or yamlOverride is required' }
);

const rotateSecretSchema = z.object({
  secretConfig: z.record(z.string()),
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getResourceContext(req: AuthenticatedRequest) {
  const modelId = req.params.id;
  if (!modelId) return null;

  const model = await prisma.model.findUnique({
    where: { id: modelId },
    select: { id: true, teamId: true, scope: true, tenantId: true, deletedAt: true },
  });

  if (!model || model.deletedAt) return null;

  // Verify model belongs to user's tenant
  if (model.tenantId !== req.user?.tenantId) return null;

  return {
    resourceType: 'model',
    resourceId: model.id,
    teamId: model.teamId,
    scope: model.scope,
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/models
 * List models visible to the current user
 */
modelsRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = listModelsQuerySchema.parse(req.query);
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized('Authentication required');
    }

    const filter: ModelFilter = {
      tenantId: rbacCtx.tenantId,
      teamIds: rbacCtx.teamIds,
      scope: query.scope as ModelScope | undefined,
      enabled: query.enabled,
      search: query.search,
      providerTemplateId: query.providerTemplateId,
    };

    const result = await listModels(filter, {
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      data: result.models,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  })
);

/**
 * GET /api/models/providers
 * List available provider templates
 */
modelsRouter.get(
  '/providers',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const providers = providerRegistry.getAll().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      description: p.description,
      category: p.category,
      icon: p.icon,
      fields: p.fields,
      docsUrl: p.docsUrl,
      setupSteps: p.setupSteps,
      supportsStreaming: p.supportsStreaming,
      supportsFunctionCalling: p.supportsFunctionCalling,
      defaultModel: p.defaultModel,
    }));

    res.json({ data: providers });
  })
);

/**
 * GET /api/models/:id
 * Get a single model by ID
 */
modelsRouter.get(
  '/:id',
  rbac({
    resourceType: 'model',
    permission: 'read',
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = (req as any).rbacContext as RBACContext;

    const model = await getModel(req.params.id, {
      tenantId: rbacCtx.tenantId,
      teamIds: rbacCtx.teamIds,
    });

    if (!model) {
      throw ApiError.notFound('Model not found');
    }

    res.json({ data: model });
  })
);

/**
 * POST /api/models
 * Create a new model
 */
modelsRouter.post(
  '/',
  rbac({
    resourceType: 'model',
    permission: 'create',
    getResourceContext: async (req) => {
      const body = req.body;
      return {
        resourceType: 'model',
        scope: body.scope as ModelScope,
        teamId: body.teamId,
      };
    },
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = createModelSchema.parse(req.body);
    const rbacCtx = (req as any).rbacContext as RBACContext;

    // Validate team membership if creating team-scoped model
    if (input.scope === 'TEAM' && input.teamId) {
      if (!rbacCtx.teamIds.includes(input.teamId)) {
        throw ApiError.forbidden('You are not a member of this team');
      }
    }

    // Validate provider template exists
    if (input.providerTemplateId) {
      if (!providerRegistry.has(input.providerTemplateId)) {
        throw ApiError.badRequest(`Unknown provider: ${input.providerTemplateId}`);
      }
    }

    const model = await createModel(rbacCtx.tenantId, rbacCtx.userId, {
      displayName: input.displayName,
      providerTemplateId: input.providerTemplateId,
      modelIdentifier: input.modelIdentifier,
      publicConfig: input.publicConfig,
      secretConfig: input.secretConfig,
      yamlOverride: input.yamlOverride,
      scope: input.scope as ModelScope,
      teamId: input.teamId || undefined,
    });

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logCreate(auditCtx, 'model', model.id, model as unknown as Record<string, unknown>);
    }

    res.status(201).json({ data: model });
  })
);

/**
 * PATCH /api/models/:id
 * Update an existing model
 */
modelsRouter.patch(
  '/:id',
  rbac({
    resourceType: 'model',
    permission: 'update',
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = updateModelSchema.parse(req.body);
    const rbacCtx = (req as any).rbacContext as RBACContext;

    // If changing team, validate membership
    if (input.teamId && !rbacCtx.teamIds.includes(input.teamId)) {
      throw ApiError.forbidden('You are not a member of the target team');
    }

    const { model, beforeState } = await updateModel(
      req.params.id,
      rbacCtx.tenantId,
      {
        displayName: input.displayName,
        modelIdentifier: input.modelIdentifier,
        publicConfig: input.publicConfig,
        secretConfig: input.secretConfig,
        yamlOverride: input.yamlOverride,
        scope: input.scope as ModelScope | undefined,
        teamId: input.teamId || undefined,
        enabled: input.enabled,
      }
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logUpdate(
        auditCtx,
        'model',
        model.id,
        beforeState,
        model as unknown as Record<string, unknown>
      );
    }

    res.json({ data: model });
  })
);

/**
 * DELETE /api/models/:id
 * Soft delete a model
 */
modelsRouter.delete(
  '/:id',
  rbac({
    resourceType: 'model',
    permission: 'delete',
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = (req as any).rbacContext as RBACContext;

    const { model, beforeState } = await deleteModel(req.params.id, rbacCtx.tenantId);

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logDelete(auditCtx, 'model', model.id, beforeState);
    }

    res.json({ success: true, data: model });
  })
);

/**
 * POST /api/models/:id/rotate-secret
 * Rotate model credentials
 */
modelsRouter.post(
  '/:id/rotate-secret',
  rbac({
    resourceType: 'model',
    permission: 'update',
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = rotateSecretSchema.parse(req.body);
    const rbacCtx = (req as any).rbacContext as RBACContext;

    await rotateModelSecret(req.params.id, rbacCtx.tenantId, input.secretConfig);

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logUpdate(
        auditCtx,
        'model',
        req.params.id,
        { secretRotated: false },
        { secretRotated: true }
      );
    }

    res.json({ success: true, message: 'Secret rotated successfully' });
  })
);

/**
 * POST /api/models/test
 * Test connection without persisting
 */
modelsRouter.post(
  '/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = testConnectionSchema.parse(req.body);

    let result;

    if (input.yamlOverride) {
      // YAML mode validation
      result = await validateYamlConfig({
        yamlOverride: input.yamlOverride,
        timeoutMs: 30000,
      });
    } else if (input.providerTemplateId) {
      // Provider template validation
      result = await validateConnection(
        input.providerTemplateId as ProviderTemplateId,
        {
          publicConfig: input.publicConfig || {},
          secretConfig: input.secretConfig || {},
          timeoutMs: 30000,
        }
      );
    } else {
      throw ApiError.badRequest('Either providerTemplateId or yamlOverride is required');
    }

    res.json({
      data: result,
    });
  })
);
