// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const gatewayRouter = Router();

/**
 * Gateway Routes
 *
 * NOTE: The current Prisma schema does not include `gateway_instances` or
 * `active_runs` tables. Gateway lifecycle endpoints are stubbed; kill-agent
 * still flips the agent's status to INACTIVE (the only valid AgentStatus values
 * are ACTIVE, INACTIVE, ERROR, PENDING).
 */

/**
 * GET /api/gateway/probe
 * Check gateway health and connectivity
 */
gatewayRouter.get('/probe', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    status: 'no_gateway',
    message: 'Gateway instance registry not yet implemented',
  });
}));

/**
 * POST /api/gateway/proxy
 * Proxy request through gateway (placeholder)
 */
gatewayRouter.post('/proxy', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { targetUrl, method = 'GET' } = req.body;

  if (!targetUrl) {
    throw ApiError.badRequest('targetUrl is required');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'gateway.proxy',
    metadata: { targetUrl, method },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({
    message: 'Proxy request received',
    targetUrl,
    method,
    status: 'queued',
  });
}));

const killAgentSchema = z.object({
  agentId: z.string(),
  reason: z.string().optional(),
  force: z.boolean().default(false),
});

/**
 * POST /api/gateway/kill-agent
 * Kill a running agent (sets status to INACTIVE)
 */
gatewayRouter.post('/kill-agent', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = killAgentSchema.parse(req.body);

  // Verify agent exists and belongs to tenant
  const agentResult = await query(`
    SELECT id, status FROM agents WHERE id = $1 AND tenant_id = $2
  `, [data.agentId, req.tenantId]);

  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  // AgentStatus enum doesn't include 'killed'; mark INACTIVE
  await query(`
    UPDATE agents SET status = 'INACTIVE', updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
  `, [data.agentId, req.tenantId]);

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
    status: 'INACTIVE',
  });
}));

/**
 * POST /api/gateway/restart-gateway
 * Restart the gateway instance
 *
 * NOTE: gateway_instances table does not exist; returns 501.
 */
gatewayRouter.post('/restart-gateway', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { graceful = true } = req.body;

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'gateway.restart',
    metadata: { graceful },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(501).json({
    error: 'Gateway lifecycle management not yet implemented',
    message: 'gateway_instances table is not present in this schema.',
  });
}));

/**
 * POST /api/gateway/stop-gateway
 * Stop the gateway instance
 *
 * NOTE: gateway_instances table does not exist; returns 501.
 */
gatewayRouter.post('/stop-gateway', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'gateway.stop',
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(501).json({
    error: 'Gateway lifecycle management not yet implemented',
    message: 'gateway_instances table is not present in this schema.',
  });
}));
