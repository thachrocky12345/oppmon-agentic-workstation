import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const journalRouter = Router();

/**
 * Journal Routes
 *
 * NOTE: journal_entries table doesn't exist in the Prisma schema.
 * We use events as proxies for journal data (agent activity log).
 */

const createEntrySchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string(),
  agentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['private', 'team', 'tenant']).default('private'),
});

/**
 * GET /api/journal/entries
 * List journal entries (using events as proxy)
 */
journalRouter.get('/entries', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId, limit = 20, offset = 0 } = req.query;

  let whereClause = `WHERE a."tenantId" = $1`;
  const params: unknown[] = [req.tenantId];

  if (agentId) {
    params.push(agentId);
    whereClause += ` AND e."agentId" = $${params.length}`;
  }

  // Use events as journal entries
  const result = await query(`
    SELECT
      e.id,
      e."agentId" as agent_id,
      a.name as agent_name,
      e."eventType" as type,
      e.payload,
      e.severity,
      e.timestamp as created_at
    FROM events e
    JOIN agents a ON a.id = e."agentId"
    ${whereClause}
    ORDER BY e.timestamp DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total
    FROM events e
    JOIN agents a ON a.id = e."agentId"
    ${whereClause}
  `, params);

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
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
    SELECT e.*, a.name as agent_name
    FROM events e
    JOIN agents a ON a.id = e."agentId"
    WHERE e.id = $1 AND a."tenantId" = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Journal entry not found');
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/journal/entries
 * Create a journal entry (stores as event)
 */
journalRouter.post('/entries', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createEntrySchema.parse(req.body);

  // Verify agent belongs to tenant if provided
  let agentId = data.agentId;
  if (agentId) {
    const agentCheck = await query(`
      SELECT id FROM agents WHERE id = $1 AND "tenantId" = $2
    `, [agentId, req.tenantId]);

    if (agentCheck.rows.length === 0) {
      throw ApiError.badRequest('Agent not found');
    }
  } else {
    // Get first agent for tenant
    const defaultAgent = await query(`
      SELECT id FROM agents WHERE "tenantId" = $1 LIMIT 1
    `, [req.tenantId]);

    if (defaultAgent.rows.length === 0) {
      throw ApiError.badRequest('No agents available');
    }
    agentId = defaultAgent.rows[0].id;
  }

  const result = await query(`
    INSERT INTO events ("agentId", "eventType", payload, severity, timestamp)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING *
  `, [
    agentId,
    'JOURNAL',
    JSON.stringify({ title: data.title, content: data.content, tags: data.tags || [], visibility: data.visibility }),
    'INFO',
  ]);

  res.status(201).json(result.rows[0]);
}));

/**
 * DELETE /api/journal/entries/:id
 * Delete a journal entry
 */
journalRouter.delete('/entries/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    DELETE FROM events e
    USING agents a
    WHERE e.id = $1 AND e."agentId" = a.id AND a."tenantId" = $2
    RETURNING e.id
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Journal entry not found');
  }

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

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
}));

/**
 * GET /api/journal/tags
 * Get all unique tags (from metadata in conversational_memory)
 */
journalRouter.get('/tags', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Tags not tracked in current schema - return empty
  res.json({ data: [] });
}));
