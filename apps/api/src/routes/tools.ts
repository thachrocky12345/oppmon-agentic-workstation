import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const toolsRouter = Router();

// ============================================
// Live Agents
// ============================================

/**
 * GET /api/tools/agents-live
 * List currently running agents
 */
toolsRouter.get('/agents-live', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT ar.*, a.name as agent_name, a.framework
    FROM active_runs ar
    JOIN agents a ON a.id = ar.agent_id
    WHERE ar.tenant_id = $1 AND ar.status = 'running'
    ORDER BY ar.started_at DESC
  `, [req.tenantId]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/tools/agents-live/:id
 * Get details of a live agent
 */
toolsRouter.get('/agents-live/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT ar.*, a.name as agent_name, a.framework, a.metadata as agent_metadata
    FROM active_runs ar
    JOIN agents a ON a.id = ar.agent_id
    WHERE ar.id = $1 AND ar.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Active run not found');
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/tools/agents-live/:id/pause
 * Pause a running agent
 */
toolsRouter.post('/agents-live/:id/pause', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    UPDATE active_runs SET status = 'paused', updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 AND status = 'running'
    RETURNING *
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Active run not found or not running');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'tools.agent.pause',
    targetType: 'active_run',
    targetId: req.params.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * POST /api/tools/agents-live/:id/resume
 * Resume a paused agent
 */
toolsRouter.post('/agents-live/:id/resume', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    UPDATE active_runs SET status = 'running', updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 AND status = 'paused'
    RETURNING *
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Active run not found or not paused');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'tools.agent.resume',
    targetType: 'active_run',
    targetId: req.params.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * POST /api/tools/agents-live/:id/kill
 * Kill a running/paused agent
 */
toolsRouter.post('/agents-live/:id/kill', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { reason } = req.body;

  const result = await query(`
    UPDATE active_runs
    SET status = 'killed', ended_at = NOW(), kill_reason = $3
    WHERE id = $1 AND tenant_id = $2 AND status IN ('running', 'paused')
    RETURNING *
  `, [req.params.id, req.tenantId, reason || 'Manual kill']);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Active run not found or already ended');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'tools.agent.kill',
    targetType: 'active_run',
    targetId: req.params.id,
    metadata: { reason },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

// ============================================
// Approvals
// ============================================

/**
 * GET /api/tools/approvals
 * List pending approvals
 */
toolsRouter.get('/approvals', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status = 'pending', limit = 50 } = req.query;

  const result = await query(`
    SELECT ap.*, a.name as agent_name
    FROM approvals ap
    LEFT JOIN agents a ON a.id = ap.agent_id
    WHERE ap.tenant_id = $1 AND ap.status = $2
    ORDER BY ap.created_at DESC
    LIMIT $3
  `, [req.tenantId, status, limit]);

  res.json({ data: result.rows });
}));

/**
 * POST /api/tools/approvals/:id/approve
 * Approve a pending request
 */
toolsRouter.post('/approvals/:id/approve', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { comment } = req.body;

  const result = await query(`
    UPDATE approvals
    SET status = 'approved', approved_by = $3, approved_at = NOW(), comment = $4
    WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
    RETURNING *
  `, [req.params.id, req.tenantId, req.userId, comment || null]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Approval not found or not pending');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'tools.approval.approve',
    targetType: 'approval',
    targetId: req.params.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * POST /api/tools/approvals/:id/deny
 * Deny a pending request
 */
toolsRouter.post('/approvals/:id/deny', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { reason } = req.body;

  const result = await query(`
    UPDATE approvals
    SET status = 'denied', denied_by = $3, denied_at = NOW(), deny_reason = $4
    WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
    RETURNING *
  `, [req.params.id, req.tenantId, req.userId, reason || null]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Approval not found or not pending');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'tools.approval.deny',
    targetType: 'approval',
    targetId: req.params.id,
    metadata: { reason },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

// ============================================
// Commands
// ============================================

/**
 * GET /api/tools/commands
 * List available commands
 */
toolsRouter.get('/commands', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM commands
    WHERE tenant_id = $1 AND enabled = true
    ORDER BY name
  `, [req.tenantId]);

  res.json({ data: result.rows });
}));

/**
 * POST /api/tools/commands/:id/execute
 * Execute a command
 */
toolsRouter.post('/commands/:id/execute', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { args, targetAgentId } = req.body;

  const commandResult = await query(`
    SELECT * FROM commands WHERE id = $1 AND tenant_id = $2 AND enabled = true
  `, [req.params.id, req.tenantId]);

  if (commandResult.rows.length === 0) {
    throw ApiError.notFound('Command not found or disabled');
  }

  // Create execution record
  const execResult = await query(`
    INSERT INTO command_executions (command_id, tenant_id, executed_by, args, target_agent_id, status)
    VALUES ($1, $2, $3, $4, $5, 'running')
    RETURNING *
  `, [req.params.id, req.tenantId, req.userId, JSON.stringify(args || {}), targetAgentId || null]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'tools.command.execute',
    targetType: 'command',
    targetId: req.params.id,
    metadata: { executionId: execResult.rows[0].id, args },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json(execResult.rows[0]);
}));

// ============================================
// Calendar
// ============================================

/**
 * GET /api/tools/calendar
 * Get scheduled events
 */
toolsRouter.get('/calendar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { start, end } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (start) {
    params.push(start);
    whereClause += ` AND scheduled_at >= $${params.length}::timestamp`;
  }

  if (end) {
    params.push(end);
    whereClause += ` AND scheduled_at <= $${params.length}::timestamp`;
  }

  const result = await query(`
    SELECT * FROM scheduled_events
    ${whereClause}
    ORDER BY scheduled_at ASC
  `, params);

  res.json({ data: result.rows });
}));

const scheduleEventSchema = z.object({
  title: z.string().min(1).max(255),
  scheduledAt: z.string().datetime(),
  type: z.enum(['workflow', 'report', 'maintenance', 'other']),
  config: z.record(z.unknown()).optional(),
});

/**
 * POST /api/tools/calendar
 * Schedule a new event
 */
toolsRouter.post('/calendar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = scheduleEventSchema.parse(req.body);

  const result = await query(`
    INSERT INTO scheduled_events (title, scheduled_at, type, config, tenant_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [data.title, data.scheduledAt, data.type, JSON.stringify(data.config || {}), req.tenantId, req.userId]);

  res.status(201).json(result.rows[0]);
}));

/**
 * DELETE /api/tools/calendar/:id
 * Delete a scheduled event
 */
toolsRouter.delete('/calendar/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    DELETE FROM scheduled_events
    WHERE id = $1 AND tenant_id = $2
    RETURNING id
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Scheduled event not found');
  }

  res.status(204).send();
}));
