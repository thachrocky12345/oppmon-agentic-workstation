import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const infraRouter = Router();

/**
 * GET /api/infra/nodes
 * List infrastructure nodes
 */
infraRouter.get('/nodes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, status } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (type) {
    params.push(type);
    whereClause += ` AND node_type = $${params.length}`;
  }

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  const result = await query(`
    SELECT * FROM infra_nodes
    ${whereClause}
    ORDER BY node_type, name
  `, params);

  res.json({ data: result.rows });
}));

/**
 * GET /api/infra/nodes/:id
 * Get node details
 */
infraRouter.get('/nodes/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM infra_nodes WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Node not found');
  }

  // Get recent metrics
  const metrics = await query(`
    SELECT * FROM infra_metrics
    WHERE node_id = $1 AND collected_at > NOW() - INTERVAL '24 hours'
    ORDER BY collected_at DESC
    LIMIT 100
  `, [req.params.id]);

  res.json({
    ...result.rows[0],
    metrics: metrics.rows,
  });
}));

const nodeActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'drain', 'cordon']),
  force: z.boolean().default(false),
});

/**
 * POST /api/infra/nodes/:id/action
 * Execute action on node
 */
infraRouter.post('/nodes/:id/action', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = nodeActionSchema.parse(req.body);

  const nodeResult = await query(`
    SELECT * FROM infra_nodes WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (nodeResult.rows.length === 0) {
    throw ApiError.notFound('Node not found');
  }

  // Map action to new status
  const statusMap: Record<string, string> = {
    start: 'running',
    stop: 'stopped',
    restart: 'restarting',
    drain: 'draining',
    cordon: 'cordoned',
  };

  const newStatus = statusMap[data.action];

  const result = await query(`
    UPDATE infra_nodes
    SET status = $3, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, [req.params.id, req.tenantId, newStatus]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: `infra.node.${data.action}`,
    targetType: 'infra_node',
    targetId: req.params.id,
    metadata: { action: data.action, force: data.force },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * GET /api/infra/topology
 * Get infrastructure topology
 */
infraRouter.get('/topology', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const nodes = await query(`
    SELECT id, name, node_type, status, parent_id, metadata
    FROM infra_nodes
    WHERE tenant_id = $1
    ORDER BY node_type, name
  `, [req.tenantId]);

  const connections = await query(`
    SELECT * FROM infra_connections
    WHERE tenant_id = $1
  `, [req.tenantId]);

  res.json({
    nodes: nodes.rows,
    connections: connections.rows,
  });
}));

/**
 * GET /api/infra/report
 * Get infrastructure health report
 */
infraRouter.get('/report', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const summary = await query(`
    SELECT
      node_type,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'running') as running,
      COUNT(*) FILTER (WHERE status = 'stopped') as stopped,
      COUNT(*) FILTER (WHERE status = 'error') as error
    FROM infra_nodes
    WHERE tenant_id = $1
    GROUP BY node_type
  `, [req.tenantId]);

  const recentAlerts = await query(`
    SELECT * FROM infra_alerts
    WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY severity DESC, created_at DESC
    LIMIT 20
  `, [req.tenantId]);

  const resourceUsage = await query(`
    SELECT
      node_type,
      AVG(cpu_percent) as avg_cpu,
      AVG(memory_percent) as avg_memory,
      AVG(disk_percent) as avg_disk
    FROM infra_metrics m
    JOIN infra_nodes n ON n.id = m.node_id
    WHERE n.tenant_id = $1 AND m.collected_at > NOW() - INTERVAL '1 hour'
    GROUP BY node_type
  `, [req.tenantId]);

  res.json({
    summary: summary.rows,
    recentAlerts: recentAlerts.rows,
    resourceUsage: resourceUsage.rows,
    generatedAt: new Date().toISOString(),
  });
}));

const collectMetricsSchema = z.object({
  nodeId: z.string().uuid(),
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  diskPercent: z.number().min(0).max(100),
  networkInBytes: z.number().min(0),
  networkOutBytes: z.number().min(0),
});

/**
 * POST /api/infra/collect
 * Collect metrics from nodes (agent endpoint)
 */
infraRouter.post('/collect', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = collectMetricsSchema.parse(req.body);

  // Verify node belongs to tenant
  const nodeResult = await query(`
    SELECT id FROM infra_nodes WHERE id = $1 AND tenant_id = $2
  `, [data.nodeId, req.tenantId]);

  if (nodeResult.rows.length === 0) {
    throw ApiError.notFound('Node not found');
  }

  await query(`
    INSERT INTO infra_metrics (node_id, cpu_percent, memory_percent, disk_percent, network_in_bytes, network_out_bytes)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [data.nodeId, data.cpuPercent, data.memoryPercent, data.diskPercent, data.networkInBytes, data.networkOutBytes]);

  // Update node last_seen
  await query(`
    UPDATE infra_nodes SET last_seen = NOW() WHERE id = $1
  `, [data.nodeId]);

  res.status(204).send();
}));
