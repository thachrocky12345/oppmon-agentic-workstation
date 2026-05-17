// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { Router, Response } from 'express';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const incidentsRouter = Router();

/**
 * Incidents Routes
 *
 * Uses the incidents table from Prisma schema.
 * Database columns are snake_case per Prisma @map() directives.
 */

const createIncidentSchema = z.object({
  title: z.string().min(1).max(255),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string(),
  agentId: z.string(),
});

/**
 * GET /api/incidents
 * List incidents
 */
incidentsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, severity, limit = 10, offset = 0 } = req.query;

  let whereClause = `WHERE a.tenant_id = $1`;
  const params: unknown[] = [req.tenantId];

  if (status) {
    params.push(status);
    whereClause += ` AND i.status = $${params.length}`;
  }

  if (severity) {
    params.push(severity);
    whereClause += ` AND i.severity = $${params.length}`;
  }

  const result = await query(`
    SELECT i.*, a.name as agent_name,
      (SELECT COUNT(*) FROM incident_updates iu WHERE iu.incident_id = i.id) as update_count
    FROM incidents i
    JOIN agents a ON a.id = i.agent_id
    ${whereClause}
    ORDER BY
      CASE i.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
      END,
      i.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total
    FROM incidents i
    JOIN agents a ON a.id = i.agent_id
    ${whereClause}
  `, params);

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
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
    SELECT i.*, a.name as agent_name
    FROM incidents i
    JOIN agents a ON a.id = i.agent_id
    WHERE i.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  // Get updates
  const updates = await query(`
    SELECT iu.*, u.name as user_name
    FROM incident_updates iu
    JOIN users u ON u.id = iu.user_id
    WHERE iu.incident_id = $1
    ORDER BY iu.created_at DESC
  `, [req.params.id]);

  res.json({
    ...result.rows[0],
    updates: updates.rows,
  });
}));

/**
 * POST /api/incidents
 * Create a new incident
 */
incidentsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createIncidentSchema.parse(req.body);

  // Verify agent belongs to tenant
  const agentCheck = await query(`
    SELECT id FROM agents WHERE id = $1 AND tenant_id = $2
  `, [data.agentId, req.tenantId]);

  if (agentCheck.rows.length === 0) {
    throw ApiError.badRequest('Agent not found');
  }

  const incidentId = createId();
  const result = await query(`
    INSERT INTO incidents (id, agent_id, title, description, severity, status, created_at)
    VALUES ($1, $2, $3, $4, $5, 'OPEN', NOW())
    RETURNING *
  `, [incidentId, data.agentId, data.title, data.description, data.severity]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'incident.create',
    targetType: 'incident',
    targetId: result.rows[0].id,
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json(result.rows[0]);
}));

const updateIncidentSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

/**
 * PUT /api/incidents/:id
 * Update incident status
 */
incidentsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = updateIncidentSchema.parse(req.body);

  // Verify incident belongs to tenant's agent
  const currentResult = await query(`
    SELECT i.* FROM incidents i
    JOIN agents a ON a.id = i.agent_id
    WHERE i.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (currentResult.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(data.status);
    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      updates.push(`resolved_at = NOW()`);
    }
  }

  if (data.severity !== undefined) {
    updates.push(`severity = $${paramIndex++}`);
    values.push(data.severity);
  }

  if (updates.length === 0) {
    return res.json(currentResult.rows[0]);
  }

  values.push(req.params.id);

  const result = await query(`
    UPDATE incidents SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
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
});

/**
 * POST /api/incidents/:id/updates
 * Add update to incident
 */
incidentsRouter.post('/:id/updates', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = addUpdateSchema.parse(req.body);

  // Verify incident exists and belongs to tenant
  const incidentResult = await query(`
    SELECT i.id FROM incidents i
    JOIN agents a ON a.id = i.agent_id
    WHERE i.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (incidentResult.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  const updateId = createId();
  const result = await query(`
    INSERT INTO incident_updates (id, incident_id, user_id, message, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING *
  `, [updateId, req.params.id, req.userId, data.message]);

  res.status(201).json(result.rows[0]);
}));

/**
 * GET /api/incidents/:id/updates
 * Get incident updates
 */
incidentsRouter.get('/:id/updates', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Verify incident exists and belongs to tenant
  const incidentResult = await query(`
    SELECT i.id FROM incidents i
    JOIN agents a ON a.id = i.agent_id
    WHERE i.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (incidentResult.rows.length === 0) {
    throw ApiError.notFound('Incident not found');
  }

  const result = await query(`
    SELECT iu.*, u.name as user_name
    FROM incident_updates iu
    JOIN users u ON u.id = iu.user_id
    WHERE iu.incident_id = $1
    ORDER BY iu.created_at DESC
  `, [req.params.id]);

  res.json({ data: result.rows });
}));
