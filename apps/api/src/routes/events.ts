import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const eventsRouter = Router();

/**
 * Events Routes
 *
 * NOTE: events schema columns:
 *   id, agent_id, event_type, direction, session_key, channel_id, sender,
 *   content, payload, severity, input_tokens, output_tokens, threat_level,
 *   timestamp, created_at
 *
 * There is no tenant_id column on events — tenant scoping is via JOIN to agents.
 * There are no dismissed/redacted_* columns; those endpoints are not supported
 * by the current schema and respond accordingly.
 */

/**
 * GET /api/events
 * List events with pagination
 */
eventsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId, eventType, threatLevel, limit = 50, offset = 0 } = req.query;

  let whereClause = 'WHERE a.tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (agentId) {
    params.push(agentId);
    whereClause += ` AND e.agent_id = $${params.length}`;
  }

  if (eventType) {
    params.push(eventType);
    whereClause += ` AND e.event_type = $${params.length}`;
  }

  if (threatLevel) {
    params.push(threatLevel);
    whereClause += ` AND e.threat_level = $${params.length}`;
  }

  const result = await query(`
    SELECT
      e.id,
      e.agent_id     AS "agentId",
      e.event_type   AS "eventType",
      e.direction,
      e.session_key  AS "sessionKey",
      e.channel_id   AS "channelId",
      e.sender,
      e.content,
      e.payload,
      e.severity,
      e.input_tokens  AS "inputTokens",
      e.output_tokens AS "outputTokens",
      e.threat_level  AS "threatLevel",
      e.timestamp,
      e.created_at    AS "createdAt",
      a.name          AS agent_name
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    ${whereClause}
  `, params);

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * GET /api/events/:id
 * Get a single event
 */
eventsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT
      e.id,
      e.agent_id     AS "agentId",
      e.event_type   AS "eventType",
      e.direction,
      e.session_key  AS "sessionKey",
      e.channel_id   AS "channelId",
      e.sender,
      e.content,
      e.payload,
      e.severity,
      e.input_tokens  AS "inputTokens",
      e.output_tokens AS "outputTokens",
      e.threat_level  AS "threatLevel",
      e.timestamp,
      e.created_at    AS "createdAt",
      a.name          AS agent_name
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    WHERE e.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Event not found');
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/events/:id/dismiss
 * Dismiss a threat event
 *
 * NOTE: events table has no dismissed/dismissed_at/dismissed_by/dismiss_reason
 * columns. Dismissal is recorded in the audit log only.
 */
eventsRouter.post('/:id/dismiss', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { reason } = req.body;

  // Verify event exists and belongs to tenant
  const eventResult = await query(`
    SELECT e.id
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE e.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (eventResult.rows.length === 0) {
    throw ApiError.notFound('Event not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'event.dismiss',
    targetType: 'event',
    targetId: req.params.id,
    metadata: { reason },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({ id: req.params.id, dismissed: true, reason: reason || null });
}));

/**
 * POST /api/events/:id/redact
 * Redact sensitive data from an event payload
 */
eventsRouter.post('/:id/redact', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { fields } = req.body;

  if (!Array.isArray(fields) || fields.length === 0) {
    throw ApiError.badRequest('Fields to redact are required');
  }

  // Get the event first (scoped via agent)
  const eventResult = await query(`
    SELECT e.id, e.payload
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE e.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (eventResult.rows.length === 0) {
    throw ApiError.notFound('Event not found');
  }

  const event = eventResult.rows[0];
  const currentPayload = (event.payload || {}) as Record<string, unknown>;

  // Redact specified fields from payload
  const newPayload: Record<string, unknown> = { ...currentPayload };
  for (const field of fields) {
    if (field in newPayload) {
      newPayload[field] = '[REDACTED]';
    }
  }

  const result = await query(`
    UPDATE events
    SET payload = $2
    WHERE id = $1
    RETURNING
      id,
      agent_id     AS "agentId",
      event_type   AS "eventType",
      payload,
      severity,
      timestamp,
      created_at   AS "createdAt"
  `, [req.params.id, newPayload]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'event.redact',
    targetType: 'event',
    targetId: req.params.id,
    oldValue: { redactedFields: fields },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

/**
 * POST /api/events/:id/purge
 * Permanently delete an event
 */
eventsRouter.post('/:id/purge', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    DELETE FROM events
    USING agents a
    WHERE events.id = $1
      AND events.agent_id = a.id
      AND a.tenant_id = $2
    RETURNING events.id
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Event not found');
  }

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'event.purge',
    targetType: 'event',
    targetId: req.params.id,
    description: 'Event permanently deleted',
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(204).send();
}));

const bulkPurgeSchema = z.object({
  eventIds: z.array(z.string()).min(1).max(100),
});

/**
 * POST /api/events/bulk-purge
 * Bulk delete events
 */
eventsRouter.post('/bulk-purge', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = bulkPurgeSchema.parse(req.body);

  const result = await query(`
    DELETE FROM events
    USING agents a
    WHERE events.agent_id = a.id
      AND a.tenant_id = $2
      AND events.id = ANY($1)
  `, [data.eventIds, req.tenantId]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'event.bulk_purge',
    description: `Bulk deleted ${result.rowCount} events`,
    metadata: { count: result.rowCount },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({ deleted: result.rowCount });
}));
