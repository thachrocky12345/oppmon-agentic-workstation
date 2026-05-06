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
 *
 * NOTE: Database columns are snake_case per Prisma @map() directives.
 * Events table uses 'severity' instead of 'threat_level'.
 * Filter by tenant through agents join since events don't have tenant_id.
 */
securityRouter.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Threat summary - group by severity (error = critical, warning = medium)
  const threats = await query(`
    SELECT
      e.severity,
      COUNT(*) as count
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1
      AND e.severity IN ('error', 'warning')
      AND e.timestamp > NOW() - INTERVAL '30 days'
    GROUP BY e.severity
  `, [req.tenantId]);

  // Recent critical events (severity = error)
  const criticalEvents = await query(`
    SELECT e.id, e.event_type, e.payload, e.severity, e.timestamp, a.name as agent_name
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1
      AND e.severity = 'error'
    ORDER BY e.timestamp DESC
    LIMIT 10
  `, [req.tenantId]);

  // Anomaly detection - use error events as anomalies
  const anomalies = await query(`
    SELECT
      e.event_type as anomaly_type,
      COUNT(*) as count,
      MAX(e.timestamp) as latest
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1
      AND e.timestamp > NOW() - INTERVAL '7 days'
      AND e.severity = 'error'
    GROUP BY e.event_type
  `, [req.tenantId]);

  res.json({
    threats: threats.rows,
    criticalEvents: criticalEvents.rows,
    anomalies: anomalies.rows,
    exfilAttempts24h: 0, // Not tracked in current schema
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/security/threats
 * List all threats (error/warning severity events)
 */
securityRouter.get('/threats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { level, limit = 50, offset = 0 } = req.query;

  let whereClause = `WHERE a.tenant_id = $1 AND e.severity IN ('error', 'warning')`;
  const params: unknown[] = [req.tenantId];

  // Map threat levels to severity
  if (level === 'critical' || level === 'high') {
    whereClause += ` AND e.severity = 'error'`;
  } else if (level === 'medium' || level === 'low') {
    whereClause += ` AND e.severity = 'warning'`;
  }

  const result = await query(`
    SELECT e.id, e.event_type, e.agent_id, e.payload, e.severity, e.timestamp,
           a.name as agent_name
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    ${whereClause}
    ORDER BY
      CASE e.severity
        WHEN 'error' THEN 1
        WHEN 'warning' THEN 2
        ELSE 3
      END,
      e.timestamp DESC
    LIMIT $2 OFFSET $3
  `, [req.tenantId, limit, offset]);

  res.json({ data: result.rows });
}));

/**
 * POST /api/security/threats/:id/dismiss
 * Dismiss a threat (update severity to 'info' to mark as dismissed)
 *
 * NOTE: Events table doesn't have dismissed columns.
 * We mark dismissed threats by updating payload with dismiss info.
 */
securityRouter.post('/threats/:id/dismiss', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { reason, falsePositive } = req.body;

  // Verify the event belongs to this tenant
  const check = await query(`
    SELECT e.id FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE e.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (check.rows.length === 0) {
    throw ApiError.notFound('Threat not found');
  }

  // Update the event payload to mark as dismissed
  const result = await query(`
    UPDATE events
    SET payload = payload || $3::jsonb
    WHERE id = $1
    RETURNING *
  `, [req.params.id, req.tenantId, JSON.stringify({
    dismissed: true,
    dismissedAt: new Date().toISOString(),
    dismissedBy: req.userId,
    dismissReason: reason || null,
    falsePositive: falsePositive || false,
  })]);

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
 * List detected anomalies (error events)
 *
 * NOTE: anomalies table doesn't exist. Returns error events as anomalies.
 */
securityRouter.get('/anomalies', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, limit = 50 } = req.query;

  let whereClause = `WHERE a.tenant_id = $1 AND e.severity = 'error'`;
  const params: unknown[] = [req.tenantId];

  if (type) {
    params.push(type);
    whereClause += ` AND e.event_type = $${params.length}`;
  }

  const result = await query(`
    SELECT e.id, e.agent_id, e.event_type as anomaly_type, e.severity,
           e.payload->>'message' as description, e.timestamp as detected_at,
           a.name as agent_name
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    ${whereClause}
    ORDER BY e.timestamp DESC
    LIMIT $${params.length + 1}
  `, [...params, limit]);

  res.json({ data: result.rows });
}));

/**
 * POST /api/security/anomalies/:id/resolve
 * Resolve an anomaly (mark error event as resolved in payload)
 */
securityRouter.post('/anomalies/:id/resolve', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { resolution } = req.body;

  // Verify the event belongs to this tenant
  const check = await query(`
    SELECT e.id FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE e.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (check.rows.length === 0) {
    throw ApiError.notFound('Anomaly not found');
  }

  // Update the event payload to mark as resolved
  const result = await query(`
    UPDATE events
    SET payload = payload || $2::jsonb
    WHERE id = $1
    RETURNING *
  `, [req.params.id, JSON.stringify({
    resolved: true,
    resolvedAt: new Date().toISOString(),
    resolvedBy: req.userId,
    resolution: resolution || null,
  })]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'security.anomaly.resolve',
    targetType: 'event',
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
 *
 * NOTE: Uses audit_logs table (not audit_log_v2).
 */
securityRouter.get('/audit-trail', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { days = 7, limit = 100 } = req.query;

  const result = await query(`
    SELECT * FROM audit_logs
    WHERE tenant_id = $1
      AND action IN ('CREATE', 'UPDATE', 'DELETE', 'DENIED')
      AND created_at > NOW() - ($2::int || ' days')::interval
    ORDER BY created_at DESC
    LIMIT $3
  `, [req.tenantId, days, limit]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/security/policies
 * Get security policies
 *
 * NOTE: security_policies table doesn't exist. Returns default policies.
 */
securityRouter.get('/policies', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Return default policies since the table doesn't exist
  const defaultPolicies = [
    {
      id: 'default-rate-limit',
      name: 'Default Rate Limit',
      type: 'rate_limit',
      rules: { maxRequests: 100, windowMs: 60000 },
      enabled: true,
      tenantId: req.tenantId,
    },
    {
      id: 'default-content-filter',
      name: 'Default Content Filter',
      type: 'content_filter',
      rules: { blockPII: true, blockCredentials: true },
      enabled: true,
      tenantId: req.tenantId,
    },
  ];

  res.json({ data: defaultPolicies });
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
 *
 * NOTE: security_policies table doesn't exist. Returns 501 Not Implemented.
 */
securityRouter.post('/policies', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Validate input but return not implemented
  policySchema.parse(req.body);

  res.status(501).json({
    error: 'Security policies table not yet implemented',
    message: 'Custom security policies will be available in a future release',
  });
}));
