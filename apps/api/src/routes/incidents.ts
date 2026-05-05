import { Router, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const incidentsRouter = Router();

const createIncidentSchema = z.object({
  title: z.string().min(1).max(255),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().optional(),
  agentIds: z.array(z.string().uuid()).optional(),
  eventIds: z.array(z.string().uuid()).optional(),
});

/**
 * GET /api/incidents
 * List incidents
 */
incidentsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, severity, limit = 50, offset = 0 } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  if (severity) {
    params.push(severity);
    whereClause += ` AND severity = $${params.length}`;
  }

  const result = await query(`
    SELECT i.*,
      (SELECT COUNT(*) FROM incident_updates iu WHERE iu.incident_id = i.id) as update_count
    FROM incidents i
    ${whereClause}
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM incidents ${whereClause}
  `, params);

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * GET /api/incidents/:id
 * Get incident details
 */
incidentsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  // Get related events
  const events = await query(`
    SELECT e.* FROM events e
    JOIN incident_events ie ON ie.event_id = e.id
    WHERE ie.incident_id = $1
    ORDER BY e.created_at DESC
  `, [req.params.id]);

  // Get updates
  const updates = await query(`
    SELECT * FROM incident_updates
    WHERE incident_id = $1
    ORDER BY created_at DESC
  `, [req.params.id]);

  res.json({
    ...result.rows[0],
    events: events.rows,
    updates: updates.rows,
  });
}));

/**
 * POST /api/incidents
 * Create a new incident
 */
incidentsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createIncidentSchema.parse(req.body);

  const result = await transaction(async (client) => {
    const incidentResult = await client.query(`
      INSERT INTO incidents (title, severity, description, status, tenant_id, created_by)
      VALUES ($1, $2, $3, 'open', $4, $5)
      RETURNING *
    `, [data.title, data.severity, data.description || null, req.tenantId, req.userId]);

    const incident = incidentResult.rows[0];

    // Link events if provided
    if (data.eventIds && data.eventIds.length > 0) {
      for (const eventId of data.eventIds) {
        await client.query(`
          INSERT INTO incident_events (incident_id, event_id) VALUES ($1, $2)
        `, [incident.id, eventId]);
      }
    }

    // Link agents if provided
    if (data.agentIds && data.agentIds.length > 0) {
      await client.query(`
        UPDATE incidents SET agent_ids = $1 WHERE id = $2
      `, [data.agentIds, incident.id]);
    }

    return incident;
  });

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'incident.create',
    targetType: 'incident',
    targetId: result.id,
    newValue: result,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json(result);
}));

const updateIncidentSchema = z.object({
  status: z.enum(['open', 'investigating', 'mitigating', 'resolved', 'closed']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

/**
 * PUT /api/incidents/:id
 * Update incident status
 */
incidentsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = updateIncidentSchema.parse(req.body);

  // Get current state for audit
  const currentResult = await query(`
    SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (currentResult.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(data.status);
    if (data.status === 'resolved' || data.status === 'closed') {
      updates.push(`resolved_at = NOW()`);
    }
  }

  if (data.severity !== undefined) {
    updates.push(`severity = $${paramIndex++}`);
    values.push(data.severity);
  }

  if (data.assignedTo !== undefined) {
    updates.push(`assigned_to = $${paramIndex++}`);
    values.push(data.assignedTo);
  }

  values.push(req.params.id, req.tenantId);

  const result = await query(`
    UPDATE incidents SET ${updates.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `, values);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'incident.update',
    targetType: 'incident',
    targetId: req.params.id,
    oldValue: currentResult.rows[0],
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json(result.rows[0]);
}));

const addUpdateSchema = z.object({
  message: z.string().min(1),
  isPublic: z.boolean().default(false),
});

/**
 * POST /api/incidents/:id/updates
 * Add update to incident
 */
incidentsRouter.post('/:id/updates', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = addUpdateSchema.parse(req.body);

  // Verify incident exists
  const incidentResult = await query(`
    SELECT id FROM incidents WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (incidentResult.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  const result = await query(`
    INSERT INTO incident_updates (incident_id, message, is_public, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [req.params.id, data.message, data.isPublic, req.userId]);

  res.status(201).json(result.rows[0]);
}));

/**
 * GET /api/incidents/:id/updates
 * Get incident updates
 */
incidentsRouter.get('/:id/updates', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Verify incident exists and belongs to tenant
  const incidentResult = await query(`
    SELECT id FROM incidents WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (incidentResult.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  const result = await query(`
    SELECT * FROM incident_updates
    WHERE incident_id = $1
    ORDER BY created_at DESC
  `, [req.params.id]);

  res.json({ data: result.rows });
}));
