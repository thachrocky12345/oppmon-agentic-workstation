// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';
import { requireRole, requireSystemTenant } from '../middleware/rbac.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const complianceRouter = Router();

// All compliance routes require admin role
complianceRouter.use(requireRole('TENANT_ADMIN'));

/**
 * Compliance Routes
 *
 * NOTE: The audit table is `audit_logs` (not `audit_log_v2`).
 * Columns: id, tenant_id, resource_type, resource_id, action, actor_id,
 *          before_state, after_state, ip_address, user_agent, metadata, created_at
 *
 * Events have agent_id (not tenant_id) — tenant scoping is via JOIN to agents.
 */

/**
 * GET /api/compliance/audit-log
 * Query audit log with filters
 */
complianceRouter.get('/audit-log', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    action,
    resourceType,
    actorId,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (action) {
    params.push(`%${action}%`);
    whereClause += ` AND action::text ILIKE $${params.length}`;
  }

  if (resourceType) {
    params.push(resourceType);
    whereClause += ` AND resource_type = $${params.length}`;
  }

  if (actorId) {
    params.push(actorId);
    whereClause += ` AND actor_id = $${params.length}`;
  }

  if (startDate) {
    params.push(startDate);
    whereClause += ` AND created_at >= $${params.length}::timestamp`;
  }

  if (endDate) {
    params.push(endDate);
    whereClause += ` AND created_at <= $${params.length}::timestamp`;
  }

  const result = await query(`
    SELECT
      id,
      actor_id      AS "actorId",
      action,
      resource_type AS "resourceType",
      resource_id   AS "resourceId",
      before_state  AS "beforeState",
      after_state   AS "afterState",
      metadata,
      ip_address    AS "ipAddress",
      user_agent    AS "userAgent",
      created_at    AS "createdAt"
    FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM audit_logs ${whereClause}
  `, params);

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * GET /api/compliance/export
 * Export compliance data for audits
 */
complianceRouter.get('/export', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate, format = 'json' } = req.query;

  if (!startDate || !endDate) {
    throw ApiError.badRequest('startDate and endDate are required');
  }

  const auditLog = await query(`
    SELECT * FROM audit_logs
    WHERE tenant_id = $1 AND created_at BETWEEN $2::timestamp AND $3::timestamp
    ORDER BY created_at ASC
  `, [req.tenantId, startDate, endDate]);

  // Events don't have tenant_id; scope via agent
  const events = await query(`
    SELECT
      e.id,
      e.event_type AS "eventType",
      e.agent_id   AS "agentId",
      e.payload,
      e.severity,
      e.timestamp,
      e.created_at AS "createdAt"
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1 AND e.created_at BETWEEN $2::timestamp AND $3::timestamp
    ORDER BY e.created_at ASC
  `, [req.tenantId, startDate, endDate]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'compliance.export',
    description: `Exported compliance data from ${startDate} to ${endDate}`,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  const exportData = {
    exportedAt: new Date().toISOString(),
    period: { startDate, endDate },
    tenantId: req.tenantId,
    auditLog: auditLog.rows,
    events: events.rows,
  };

  if (format === 'csv') {
    // In production, would convert to CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=compliance-export.csv');
    // Simplified - just return JSON for now
    res.json(exportData);
  } else {
    res.json(exportData);
  }
}));

const purgeSchema = z.object({
  retentionDays: z.number().min(30).max(3650),
  dryRun: z.boolean().default(true),
});

/**
 * POST /api/compliance/purge
 * Purge old data based on retention policy
 */
complianceRouter.post('/purge', requireSystemTenant(), requireRole('SYSTEM_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = purgeSchema.parse(req.body);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - data.retentionDays);

  if (data.dryRun) {
    // Dry run - just count what would be deleted
    // events scoped via agent join
    const eventCount = await query(`
      SELECT COUNT(*) as count
      FROM events e
      JOIN agents a ON a.id = e.agent_id
      WHERE a.tenant_id = $1 AND e.created_at < $2
    `, [req.tenantId, cutoffDate]);

    const auditCount = await query(`
      SELECT COUNT(*) as count FROM audit_logs
      WHERE tenant_id = $1 AND created_at < $2
    `, [req.tenantId, cutoffDate]);

    res.json({
      dryRun: true,
      cutoffDate: cutoffDate.toISOString(),
      wouldDelete: {
        events: parseInt(eventCount.rows[0].count, 10),
        auditLogs: parseInt(auditCount.rows[0].count, 10),
      },
    });
  } else {
    // Actual purge
    const eventResult = await query(`
      DELETE FROM events
      USING agents a
      WHERE events.agent_id = a.id
        AND a.tenant_id = $1
        AND events.created_at < $2
    `, [req.tenantId, cutoffDate]);

    const auditResult = await query(`
      DELETE FROM audit_logs
      WHERE tenant_id = $1 AND created_at < $2
    `, [req.tenantId, cutoffDate]);

    logAudit({
      actorType: 'user',
      actorId: req.userId,
      action: 'compliance.purge',
      description: `Purged data older than ${data.retentionDays} days`,
      metadata: {
        eventsDeleted: eventResult.rowCount,
        auditLogsDeleted: auditResult.rowCount,
        cutoffDate: cutoffDate.toISOString(),
      },
      tenantId: req.tenantId,
      ipAddress: getClientIp(req),
    });

    res.json({
      dryRun: false,
      cutoffDate: cutoffDate.toISOString(),
      deleted: {
        events: eventResult.rowCount,
        auditLogs: auditResult.rowCount,
      },
    });
  }
}));
