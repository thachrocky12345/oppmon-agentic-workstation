import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const securityRouter = Router();

/**
 * GET /api/security/overview
 * Get security overview and threat summary
 */
securityRouter.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Threat summary
  const threats = await query(`
    SELECT
      threat_level,
      COUNT(*) as count
    FROM events
    WHERE tenant_id = $1
      AND threat_level IS NOT NULL
      AND threat_level != 'none'
      AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY threat_level
  `, [req.tenantId]);

  // Recent critical events
  const criticalEvents = await query(`
    SELECT e.*, a.name as agent_name
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    WHERE e.tenant_id = $1
      AND e.threat_level IN ('high', 'critical')
      AND e.dismissed = false
    ORDER BY e.created_at DESC
    LIMIT 10
  `, [req.tenantId]);

  // Anomaly detection stats
  const anomalies = await query(`
    SELECT
      anomaly_type,
      COUNT(*) as count,
      MAX(detected_at) as latest
    FROM anomalies
    WHERE tenant_id = $1
      AND detected_at > NOW() - INTERVAL '7 days'
      AND resolved_at IS NULL
    GROUP BY anomaly_type
  `, [req.tenantId]);

  // Exfiltration attempts
  const exfilAttempts = await query(`
    SELECT COUNT(*) as count
    FROM events
    WHERE tenant_id = $1
      AND metadata->>'exfil_detected' = 'true'
      AND created_at > NOW() - INTERVAL '24 hours'
  `, [req.tenantId]);

  res.json({
    threats: threats.rows,
    criticalEvents: criticalEvents.rows,
    anomalies: anomalies.rows,
    exfilAttempts24h: parseInt(exfilAttempts.rows[0]?.count || '0', 10),
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/security/threats
 * List all threats
 */
securityRouter.get('/threats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { level, dismissed, limit = 50, offset = 0 } = req.query;

  let whereClause = `WHERE tenant_id = $1 AND threat_level IS NOT NULL AND threat_level != 'none'`;
  const params: unknown[] = [req.tenantId];

  if (level) {
    params.push(level);
    whereClause += ` AND threat_level = $${params.length}`;
  }

  if (dismissed !== undefined) {
    params.push(dismissed === 'true');
    whereClause += ` AND dismissed = $${params.length}`;
  }

  const result = await query(`
    SELECT e.*, a.name as agent_name
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    ${whereClause}
    ORDER BY
      CASE threat_level
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      e.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  res.json({ data: result.rows });
}));

/**
 * POST /api/security/threats/:id/dismiss
 * Dismiss a threat
 */
securityRouter.post('/threats/:id/dismiss', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { reason, falsePositive } = req.body;

  const result = await query(`
    UPDATE events
    SET dismissed = true, dismissed_at = NOW(), dismissed_by = $3,
        dismiss_reason = $4,
        metadata = metadata || jsonb_build_object('false_positive', $5::boolean)
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, [req.params.id, req.tenantId, req.userId, reason || null, falsePositive || false]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Threat not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'security.threat.dismiss',
    targetType: 'event',
    targetId: req.params.id,
    metadata: { reason, falsePositive },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * GET /api/security/anomalies
 * List detected anomalies
 */
securityRouter.get('/anomalies', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, resolved, limit = 50 } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (type) {
    params.push(type);
    whereClause += ` AND anomaly_type = $${params.length}`;
  }

  if (resolved !== undefined) {
    if (resolved === 'true') {
      whereClause += ' AND resolved_at IS NOT NULL';
    } else {
      whereClause += ' AND resolved_at IS NULL';
    }
  }

  const result = await query(`
    SELECT * FROM anomalies
    ${whereClause}
    ORDER BY detected_at DESC
    LIMIT $${params.length + 1}
  `, [...params, limit]);

  res.json({ data: result.rows });
}));

/**
 * POST /api/security/anomalies/:id/resolve
 * Resolve an anomaly
 */
securityRouter.post('/anomalies/:id/resolve', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { resolution } = req.body;

  const result = await query(`
    UPDATE anomalies
    SET resolved_at = NOW(), resolved_by = $3, resolution = $4
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, [req.params.id, req.tenantId, req.userId, resolution || null]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Anomaly not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'security.anomaly.resolve',
    targetType: 'anomaly',
    targetId: req.params.id,
    metadata: { resolution },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * GET /api/security/audit-trail
 * Get security audit trail
 */
securityRouter.get('/audit-trail', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { days = 7, limit = 100 } = req.query;

  const result = await query(`
    SELECT * FROM audit_log_v2
    WHERE tenant_id = $1
      AND action LIKE 'security.%'
      AND created_at > NOW() - $2::int * INTERVAL '1 day'
    ORDER BY created_at DESC
    LIMIT $3
  `, [req.tenantId, days, limit]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/security/policies
 * Get security policies
 */
securityRouter.get('/policies', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM security_policies
    WHERE tenant_id = $1
    ORDER BY name
  `, [req.tenantId]);

  res.json({ data: result.rows });
}));

const policySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['exfil', 'rate_limit', 'content_filter', 'ip_allowlist']),
  rules: z.record(z.unknown()),
  enabled: z.boolean().default(true),
});

/**
 * POST /api/security/policies
 * Create a security policy
 */
securityRouter.post('/policies', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = policySchema.parse(req.body);

  const result = await query(`
    INSERT INTO security_policies (name, type, rules, enabled, tenant_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [data.name, data.type, JSON.stringify(data.rules), data.enabled, req.tenantId, req.userId]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'security.policy.create',
    targetType: 'security_policy',
    targetId: result.rows[0].id,
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json(result.rows[0]);
}));
