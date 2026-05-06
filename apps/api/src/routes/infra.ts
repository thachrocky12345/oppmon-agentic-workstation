import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const infraRouter = Router();

/**
 * Infrastructure Routes
 *
 * NOTE: infra_nodes, infra_metrics, infra_connections, infra_alerts tables
 * don't exist in the Prisma schema. Returns mock/empty data.
 */

/**
 * GET /api/infra/nodes
 * List infrastructure nodes
 */
infraRouter.get('/nodes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // infra_nodes table doesn't exist - return agents as nodes
  const result = await query(`
    SELECT
      a.id,
      a.name,
      'agent' as node_type,
      a.status,
      a."lastSeen" as last_seen,
      a.config as metadata
    FROM agents a
    WHERE a."tenantId" = $1
    ORDER BY a.name
  `, [req.tenantId]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/infra/nodes/:id
 * Get node details
 */
infraRouter.get('/nodes/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT
      a.id,
      a.name,
      'agent' as node_type,
      a.status,
      a."lastSeen" as last_seen,
      a.config as metadata,
      a.description
    FROM agents a
    WHERE a.id = $1 AND a."tenantId" = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Node not found');
  }

  res.json({
    ...result.rows[0],
    metrics: [], // No metrics table
  });
}));

const nodeActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'drain', 'cordon']),
  force: z.boolean().default(false),
});

/**
 * POST /api/infra/nodes/:id/action
 * Execute action on node (updates agent status)
 */
infraRouter.post('/nodes/:id/action', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = nodeActionSchema.parse(req.body);

  const statusMap: Record<string, string> = {
    start: 'ACTIVE',
    stop: 'INACTIVE',
    restart: 'PENDING',
    drain: 'INACTIVE',
    cordon: 'INACTIVE',
  };

  const newStatus = statusMap[data.action];

  const result = await query(`
    UPDATE agents
    SET status = $3, "updatedAt" = NOW()
    WHERE id = $1 AND "tenantId" = $2
    RETURNING *
  `, [req.params.id, req.tenantId, newStatus]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Node not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: `infra.node.${data.action}`,
    targetType: 'agent',
    targetId: req.params.id,
    metadata: { action: data.action, force: data.force },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * GET /api/infra/topology
 * Get infrastructure topology (agents as nodes)
 */
infraRouter.get('/topology', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const nodes = await query(`
    SELECT
      a.id,
      a.name,
      'agent' as node_type,
      a.status,
      a.config as metadata
    FROM agents a
    WHERE a."tenantId" = $1
    ORDER BY a.name
  `, [req.tenantId]);

  res.json({
    nodes: nodes.rows,
    connections: [], // No connections table
  });
}));

/**
 * GET /api/infra/report
 * Get infrastructure health report
 */
infraRouter.get('/report', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const summary = await query(`
    SELECT
      'agent' as node_type,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'ACTIVE') as running,
      COUNT(*) FILTER (WHERE status = 'INACTIVE') as stopped,
      COUNT(*) FILTER (WHERE status = 'ERROR') as error
    FROM agents
    WHERE "tenantId" = $1
    GROUP BY 'agent'
  `, [req.tenantId]);

  res.json({
    summary: summary.rows,
    recentAlerts: [], // No alerts table
    resourceUsage: [], // No metrics table
    generatedAt: new Date().toISOString(),
  });
}));

/**
 * POST /api/infra/collect
 * Collect metrics from nodes
 */
infraRouter.post('/collect', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // No metrics table - just update agent lastSeen
  const { nodeId } = req.body;

  if (nodeId) {
    await query(`
      UPDATE agents SET "lastSeen" = NOW() WHERE id = $1 AND "tenantId" = $2
    `, [nodeId, req.tenantId]);
  }

  res.status(204).send();
}));
