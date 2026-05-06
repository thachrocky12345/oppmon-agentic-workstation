import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const workflowsRouter = Router();

/**
 * Workflows Routes
 *
 * Uses the workflows table from Prisma schema.
 * Column names use camelCase per Prisma convention.
 */

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  definition: z.record(z.unknown()).optional(),
});

/**
 * GET /api/workflows
 * List workflows
 */
workflowsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { limit = 10, offset = 0 } = req.query;

  const result = await query(`
    SELECT w.*,
      (SELECT COUNT(*) FROM workflow_runs wr WHERE wr."workflowId" = w.id) as total_runs,
      (SELECT MAX(wr."startedAt") FROM workflow_runs wr WHERE wr."workflowId" = w.id) as last_run
    FROM workflows w
    WHERE w."tenantId" = $1
    ORDER BY w."createdAt" DESC
    LIMIT $2 OFFSET $3
  `, [req.tenantId, limit, offset]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/workflows/:id
 * Get workflow details
 */
workflowsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM workflows WHERE id = $1 AND "tenantId" = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Workflow not found');
  }

  // Get recent runs
  const runs = await query(`
    SELECT * FROM workflow_runs
    WHERE "workflowId" = $1
    ORDER BY "startedAt" DESC
    LIMIT 10
  `, [req.params.id]);

  res.json({
    ...result.rows[0],
    recentRuns: runs.rows,
  });
}));

/**
 * POST /api/workflows
 * Create a new workflow
 */
workflowsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createWorkflowSchema.parse(req.body);

  const result = await query(`
    INSERT INTO workflows (name, description, definition, "tenantId", "isActive")
    VALUES ($1, $2, $3, $4, false)
    RETURNING *
  `, [
    data.name,
    data.description || null,
    JSON.stringify(data.definition || {}),
    req.tenantId,
  ]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'workflow.create',
    targetType: 'workflow',
    targetId: result.rows[0].id,
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json(result.rows[0]);
}));

/**
 * PUT /api/workflows/:id
 * Update workflow
 */
workflowsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createWorkflowSchema.partial().parse(req.body);

  const currentResult = await query(`
    SELECT * FROM workflows WHERE id = $1 AND "tenantId" = $2
  `, [req.params.id, req.tenantId]);

  if (currentResult.rows.length === 0) {
    throw ApiError.notFound('Workflow not found');
  }

  const updates: string[] = ['"updatedAt" = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }

  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }

  if (data.definition !== undefined) {
    updates.push(`definition = $${paramIndex++}`);
    values.push(JSON.stringify(data.definition));
  }

  values.push(req.params.id, req.tenantId);

  const result = await query(`
    UPDATE workflows SET ${updates.join(', ')}
    WHERE id = $${paramIndex++} AND "tenantId" = $${paramIndex}
    RETURNING *
  `, values);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'workflow.update',
    targetType: 'workflow',
    targetId: req.params.id,
    oldValue: currentResult.rows[0],
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * POST /api/workflows/:id/activate
 * Activate a workflow
 */
workflowsRouter.post('/:id/activate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    UPDATE workflows SET "isActive" = true, "updatedAt" = NOW()
    WHERE id = $1 AND "tenantId" = $2
    RETURNING *
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Workflow not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'workflow.activate',
    targetType: 'workflow',
    targetId: req.params.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * POST /api/workflows/:id/deactivate
 * Deactivate a workflow
 */
workflowsRouter.post('/:id/deactivate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    UPDATE workflows SET "isActive" = false, "updatedAt" = NOW()
    WHERE id = $1 AND "tenantId" = $2
    RETURNING *
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Workflow not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'workflow.deactivate',
    targetType: 'workflow',
    targetId: req.params.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * POST /api/workflows/:id/run
 * Manually trigger a workflow run
 */
workflowsRouter.post('/:id/run', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { input } = req.body;

  const workflowResult = await query(`
    SELECT * FROM workflows WHERE id = $1 AND "tenantId" = $2
  `, [req.params.id, req.tenantId]);

  if (workflowResult.rows.length === 0) {
    throw ApiError.notFound('Workflow not found');
  }

  const runResult = await query(`
    INSERT INTO workflow_runs ("workflowId", status, context, "startedAt")
    VALUES ($1, 'pending', $2, NOW())
    RETURNING *
  `, [req.params.id, JSON.stringify(input || {})]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'workflow.run',
    targetType: 'workflow',
    targetId: req.params.id,
    metadata: { runId: runResult.rows[0].id },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json(runResult.rows[0]);
}));

/**
 * DELETE /api/workflows/:id
 * Delete a workflow
 */
workflowsRouter.delete('/:id', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    DELETE FROM workflows WHERE id = $1 AND "tenantId" = $2
    RETURNING id
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Workflow not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'workflow.delete',
    targetType: 'workflow',
    targetId: req.params.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(204).send();
}));
