import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const gatewayRouter = Router();

/**
 * GET /api/gateway/probe
 * Check gateway health and connectivity
 */
gatewayRouter.get('/probe', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT status, last_heartbeat, config, metadata
    FROM gateway_instances
    WHERE tenant_id = $1 AND status = 'active'
    ORDER BY last_heartbeat DESC
    LIMIT 1
  `, [req.tenantId]);

  if (result.rows.length === 0) {
    res.json({
      status: 'no_gateway',
      message: 'No active gateway instance found',
    });
    return;
  }

  const gateway = result.rows[0];
  const isHealthy = new Date().getTime() - new Date(gateway.last_heartbeat).getTime() < 60000;

  res.json({
    status: isHealthy ? 'healthy' : 'stale',
    lastHeartbeat: gateway.last_heartbeat,
    config: gateway.config,
  });
}));

/**
 * POST /api/gateway/proxy
 * Proxy request through gateway
 */
gatewayRouter.post('/proxy', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { targetUrl, method = 'GET', headers, body } = req.body;

  if (!targetUrl) {
    throw ApiError.badRequest('targetUrl is required');
  }

  // Log the proxy request
  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'gateway.proxy',
    metadata: { targetUrl, method },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  // In production, this would proxy the request through the gateway
  // For now, return a placeholder response
  res.json({
    message: 'Proxy request received',
    targetUrl,
    method,
    status: 'queued',
  });
}));

const killAgentSchema = z.object({
  agentId: z.string().uuid(),
  reason: z.string().optional(),
  force: z.boolean().default(false),
});

/**
 * POST /api/gateway/kill-agent
 * Kill a running agent
 */
gatewayRouter.post('/kill-agent', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = killAgentSchema.parse(req.body);

  // Verify agent exists and belongs to tenant
  const agentResult = await query(`
    SELECT * FROM agents WHERE id = $1 AND tenant_id = $2
  `, [data.agentId, req.tenantId]);

  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  // Update agent status
  await query(`
    UPDATE agents SET status = 'killed', updated_at = NOW()
    WHERE id = $1
  `, [data.agentId]);

  // Record the kill in active_runs
  await query(`
    UPDATE active_runs SET status = 'killed', ended_at = NOW(), kill_reason = $2
    WHERE agent_id = $1 AND status = 'running'
  `, [data.agentId, data.reason || 'Manual kill via gateway']);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'gateway.kill_agent',
    targetType: 'agent',
    targetId: data.agentId,
    metadata: { reason: data.reason, force: data.force },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({
    message: 'Agent kill signal sent',
    agentId: data.agentId,
    status: 'killed',
  });
}));

/**
 * POST /api/gateway/restart-gateway
 * Restart the gateway instance
 */
gatewayRouter.post('/restart-gateway', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { graceful = true } = req.body;

  await query(`
    UPDATE gateway_instances SET status = 'restarting', updated_at = NOW()
    WHERE tenant_id = $1 AND status = 'active'
  `, [req.tenantId]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'gateway.restart',
    metadata: { graceful },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({
    message: 'Gateway restart initiated',
    graceful,
  });
}));

/**
 * POST /api/gateway/stop-gateway
 * Stop the gateway instance
 */
gatewayRouter.post('/stop-gateway', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await query(`
    UPDATE gateway_instances SET status = 'stopped', updated_at = NOW()
    WHERE tenant_id = $1 AND status IN ('active', 'restarting')
  `, [req.tenantId]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'gateway.stop',
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({
    message: 'Gateway stopped',
  });
}));
