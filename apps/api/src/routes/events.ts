import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const eventsRouter = Router();

/**
 * GET /api/events
 * List events with pagination
 */
eventsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId, eventType, threatLevel, limit = 50, offset = 0 } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (agentId) {
    params.push(agentId);
    whereClause += ` AND agent_id = $${params.length}`;
  }

  if (eventType) {
    params.push(eventType);
    whereClause += ` AND event_type = $${params.length}`;
  }

  if (threatLevel) {
    params.push(threatLevel);
    whereClause += ` AND threat_level = $${params.length}`;
  }

  const result = await query(`
    SELECT e.*, a.name as agent_name
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM events ${whereClause}
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
    SELECT e.*, a.name as agent_name
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    WHERE e.id = $1 AND e.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Event not found');
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/events/:id/dismiss
 * Dismiss a threat event
 */
eventsRouter.post('/:id/dismiss', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { reason } = req.body;

  const result = await query(`
    UPDATE events
    SET dismissed = true, dismissed_at = NOW(), dismissed_by = $3, dismiss_reason = $4
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, [req.params.id, req.tenantId, req.userId, reason || null]);

  if (result.rows.length === 0) {
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

  res.json(result.rows[0]);
}));

/**
 * POST /api/events/:id/redact
 * Redact sensitive data from an event
 */
eventsRouter.post('/:id/redact', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { fields } = req.body;

  if (!Array.isArray(fields) || fields.length === 0) {
    throw ApiError.badRequest('Fields to redact are required');
  }

  // Get the event first
  const eventResult = await query(`
    SELECT * FROM events WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (eventResult.rows.length === 0) {
    throw ApiError.notFound('Event not found');
  }

  const event = eventResult.rows[0];
  const oldMetadata = { ...event.metadata };

  // Redact specified fields from metadata
  const newMetadata = { ...event.metadata };
  for (const field of fields) {
    if (field in newMetadata) {
      newMetadata[field] = '[REDACTED]';
    }
  }

  const result = await query(`
    UPDATE events
    SET metadata = $3, redacted_at = NOW(), redacted_by = $4
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, [req.params.id, req.tenantId, newMetadata, req.userId]);

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
    DELETE FROM events WHERE id = $1 AND tenant_id = $2 RETURNING id
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
  eventIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * POST /api/events/bulk-purge
 * Bulk delete events
 */
eventsRouter.post('/bulk-purge', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = bulkPurgeSchema.parse(req.body);

  const result = await query(`
    DELETE FROM events
    WHERE id = ANY($1) AND tenant_id = $2
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
