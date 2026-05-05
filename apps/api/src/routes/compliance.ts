import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const complianceRouter = Router();

// All compliance routes require admin role
complianceRouter.use(requireRole('TENANT_ADMIN'));

/**
 * GET /api/compliance/audit-log
 * Query audit log with filters
 */
complianceRouter.get('/audit-log', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    actorType,
    action,
    targetType,
    startDate,
    endDate,
    limit = 100,
    offset = 0
  } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (actorType) {
    params.push(actorType);
    whereClause += ` AND actor_type = $${params.length}`;
  }

  if (action) {
    params.push(`%${action}%`);
    whereClause += ` AND action ILIKE $${params.length}`;
  }

  if (targetType) {
    params.push(targetType);
    whereClause += ` AND target_type = $${params.length}`;
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
    SELECT id, actor_type, actor_id, action, target_type, target_id,
           description, metadata, created_at, ip_address
    FROM audit_log_v2
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM audit_log_v2 ${whereClause}
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
    SELECT * FROM audit_log_v2
    WHERE tenant_id = $1 AND created_at BETWEEN $2::timestamp AND $3::timestamp
    ORDER BY created_at ASC
  `, [req.tenantId, startDate, endDate]);

  const events = await query(`
    SELECT id, event_type, agent_id, created_at, metadata
    FROM events
    WHERE tenant_id = $1 AND created_at BETWEEN $2::timestamp AND $3::timestamp
    ORDER BY created_at ASC
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
complianceRouter.post('/purge', requireRole('SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = purgeSchema.parse(req.body);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - data.retentionDays);

  if (data.dryRun) {
    // Dry run - just count what would be deleted
    const eventCount = await query(`
      SELECT COUNT(*) as count FROM events
      WHERE tenant_id = $1 AND created_at < $2
    `, [req.tenantId, cutoffDate]);

    const auditCount = await query(`
      SELECT COUNT(*) as count FROM audit_log_v2
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
      WHERE tenant_id = $1 AND created_at < $2
    `, [req.tenantId, cutoffDate]);

    const auditResult = await query(`
      DELETE FROM audit_log_v2
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
