import { Router, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import {
  embedAgent,
  deleteAgentEmbedding,
} from '../services/embedding-hooks.js';

export const agentsRouter = Router();

// Validation schemas
const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  framework: z.enum(['openai', 'anthropic', 'langchain', 'custom']),
  metadata: z.record(z.unknown()).optional(),
});

const updateAgentSchema = createAgentSchema.partial();

/**
 * GET /api/agents
 * List all agents for the current tenant
 */
agentsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { limit = 50, offset = 0, status } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  const result = await query(
    `SELECT id, name, description, framework, status, metadata, created_at, updated_at
     FROM agents
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM agents ${whereClause}`,
    params,
  );

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * GET /api/agents/:id
 * Get a specific agent
 */
agentsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(
    `SELECT id, name, description, framework, status, metadata, created_at, updated_at
     FROM agents
     WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId],
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/agents
 * Create a new agent
 */
agentsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createAgentSchema.parse(req.body);

  const result = await query(
    `INSERT INTO agents (name, description, framework, metadata, tenant_id, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, name, description, framework, status, metadata, created_at`,
    [data.name, data.description || null, data.framework, data.metadata || {}, req.tenantId],
  );

  const agent = result.rows[0];

  // Trigger auto-embedding (non-blocking)
  embedAgent(req.tenantId!, {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    framework: agent.framework,
    status: agent.status,
    config: agent.metadata,
  });

  res.status(201).json(agent);
}));

/**
 * PUT /api/agents/:id
 * Update an agent
 */
agentsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = updateAgentSchema.parse(req.body);

  // Build dynamic update query
  const updates: string[] = [];
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
  if (data.framework !== undefined) {
    updates.push(`framework = $${paramIndex++}`);
    values.push(data.framework);
  }
  if (data.metadata !== undefined) {
    updates.push(`metadata = $${paramIndex++}`);
    values.push(data.metadata);
  }

  if (updates.length === 0) {
    throw ApiError.badRequest('No fields to update');
  }

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id, req.tenantId);

  const result = await query(
    `UPDATE agents SET ${updates.join(', ')}
     WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
     RETURNING id, name, description, framework, status, metadata, created_at, updated_at`,
    values,
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  const agent = result.rows[0];

  // Trigger auto-embedding (non-blocking)
  embedAgent(req.tenantId!, {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    framework: agent.framework,
    status: agent.status,
    config: agent.metadata,
  });

  res.json(agent);
}));

/**
 * DELETE /api/agents/:id
 * Delete an agent (soft delete)
 */
agentsRouter.delete('/:id', requireRole('TENANT_ADMIN', 'TEAM_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(
    `UPDATE agents SET status = 'deleted', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [req.params.id, req.tenantId],
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  // Delete embedding (non-blocking)
  deleteAgentEmbedding(req.tenantId!, req.params.id);

  res.status(204).send();
}));

/**
 * POST /api/agents/register
 * Register a new agent from external source
 */
agentsRouter.post('/register', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createAgentSchema.parse(req.body);

  const result = await transaction(async (client) => {
    // Check if agent with same name exists
    const existing = await client.query(
      'SELECT id FROM agents WHERE name = $1 AND tenant_id = $2',
      [data.name, req.tenantId],
    );

    if (existing.rows.length > 0) {
      // Update existing agent
      const updateResult = await client.query(
        `UPDATE agents SET
           description = COALESCE($1, description),
           framework = $2,
           metadata = $3,
           status = 'active',
           updated_at = NOW()
         WHERE id = $4
         RETURNING id, name, description, framework, status, metadata`,
        [data.description, data.framework, data.metadata || {}, existing.rows[0].id],
      );
      return { ...updateResult.rows[0], isNew: false };
    }

    // Create new agent
    const insertResult = await client.query(
      `INSERT INTO agents (name, description, framework, metadata, tenant_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, name, description, framework, status, metadata`,
      [data.name, data.description || null, data.framework, data.metadata || {}, req.tenantId],
    );
    return { ...insertResult.rows[0], isNew: true };
  });

  // Trigger auto-embedding (non-blocking)
  embedAgent(req.tenantId!, {
    id: result.id,
    name: result.name,
    description: result.description,
    framework: result.framework,
    status: result.status,
    config: result.metadata,
  });

  res.status(result.isNew ? 201 : 200).json(result);
}));
