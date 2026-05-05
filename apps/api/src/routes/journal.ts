import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const journalRouter = Router();

const createEntrySchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string(),
  agentId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['private', 'team', 'tenant']).default('private'),
});

/**
 * GET /api/journal/entries
 * List journal entries
 */
journalRouter.get('/entries', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId, tag, visibility, limit = 50, offset = 0 } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  // Filter by visibility - users can see their own private entries + team/tenant entries
  whereClause += ` AND (visibility != 'private' OR created_by = $${params.length + 1})`;
  params.push(req.userId);

  if (agentId) {
    params.push(agentId);
    whereClause += ` AND agent_id = $${params.length}`;
  }

  if (tag) {
    params.push(tag);
    whereClause += ` AND $${params.length} = ANY(tags)`;
  }

  if (visibility) {
    params.push(visibility);
    whereClause += ` AND visibility = $${params.length}`;
  }

  const result = await query(`
    SELECT j.*, a.name as agent_name
    FROM journal_entries j
    LEFT JOIN agents a ON a.id = j.agent_id
    ${whereClause}
    ORDER BY j.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM journal_entries j ${whereClause}
  `, params);

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * GET /api/journal/entries/:id
 * Get a journal entry
 */
journalRouter.get('/entries/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT j.*, a.name as agent_name
    FROM journal_entries j
    LEFT JOIN agents a ON a.id = j.agent_id
    WHERE j.id = $1 AND j.tenant_id = $2
      AND (j.visibility != 'private' OR j.created_by = $3)
  `, [req.params.id, req.tenantId, req.userId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Journal entry not found');
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/journal/entries
 * Create a journal entry
 */
journalRouter.post('/entries', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createEntrySchema.parse(req.body);

  const result = await query(`
    INSERT INTO journal_entries (title, content, agent_id, tags, visibility, tenant_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    data.title,
    data.content,
    data.agentId || null,
    data.tags || [],
    data.visibility,
    req.tenantId,
    req.userId,
  ]);

  res.status(201).json(result.rows[0]);
}));

/**
 * PUT /api/journal/entries/:id
 * Update a journal entry
 */
journalRouter.put('/entries/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createEntrySchema.partial().parse(req.body);

  // Check ownership
  const existing = await query(`
    SELECT created_by FROM journal_entries WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (existing.rows.length === 0) {
    throw ApiError.notFound('Journal entry not found');
  }

  if (existing.rows[0].created_by !== req.userId) {
    throw ApiError.forbidden('You can only edit your own journal entries');
  }

  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(data.title);
  }

  if (data.content !== undefined) {
    updates.push(`content = $${paramIndex++}`);
    values.push(data.content);
  }

  if (data.tags !== undefined) {
    updates.push(`tags = $${paramIndex++}`);
    values.push(data.tags);
  }

  if (data.visibility !== undefined) {
    updates.push(`visibility = $${paramIndex++}`);
    values.push(data.visibility);
  }

  values.push(req.params.id, req.tenantId);

  const result = await query(`
    UPDATE journal_entries SET ${updates.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `, values);

  res.json(result.rows[0]);
}));

/**
 * DELETE /api/journal/entries/:id
 * Delete a journal entry
 */
journalRouter.delete('/entries/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Check ownership
  const existing = await query(`
    SELECT created_by FROM journal_entries WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (existing.rows.length === 0) {
    throw ApiError.notFound('Journal entry not found');
  }

  if (existing.rows[0].created_by !== req.userId) {
    throw ApiError.forbidden('You can only delete your own journal entries');
  }

  await query(`
    DELETE FROM journal_entries WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  res.status(204).send();
}));

/**
 * GET /api/journal/stream
 * Stream journal entries (SSE)
 */
journalRouter.get('/stream', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  // Clean up on close
  req.on('close', () => {
    clearInterval(keepAlive);
  });
}));

/**
 * GET /api/journal/tags
 * Get all unique tags
 */
journalRouter.get('/tags', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT DISTINCT unnest(tags) as tag
    FROM journal_entries
    WHERE tenant_id = $1
    ORDER BY tag
  `, [req.tenantId]);

  res.json({ data: result.rows.map((r: any) => r.tag) });
}));
