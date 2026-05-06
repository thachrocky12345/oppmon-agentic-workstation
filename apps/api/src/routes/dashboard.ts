import { Router, Response } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/overview
 * Get dashboard overview data
 *
 * NOTE: Column names use camelCase with quotes per Prisma convention.
 * See CLAUDE.md "Database Column Naming" section.
 */
dashboardRouter.get('/overview', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agents = await query(`
    SELECT a.id, a.name, a.config, a."createdAt", a."tenantId", a.status, a."lastSeen",
      (SELECT MAX(e.timestamp) FROM events e WHERE e."agentId" = a.id) as last_active,
      (SELECT COUNT(*) FROM events e WHERE e."agentId" = a.id AND e.timestamp > NOW() - INTERVAL '24 hours') as events_24h,
      (SELECT COUNT(*) FROM events e WHERE e."agentId" = a.id AND e.timestamp > NOW() - INTERVAL '7 days') as events_7d,
      (SELECT COUNT(*) FROM events e WHERE e."agentId" = a.id) as events_total
    FROM agents a
    WHERE a."tenantId" = $1
    ORDER BY last_active DESC NULLS LAST
  `, [req.tenantId]);

  // Return overview stats aggregated from agents
  const totalAgents = agents.rows.length;
  const activeAgents = agents.rows.filter((a: any) => a.status === 'ACTIVE').length;
  const totalEvents = agents.rows.reduce((sum: number, a: any) => sum + parseInt(a.events_total || '0'), 0);
  const eventsToday = agents.rows.reduce((sum: number, a: any) => sum + parseInt(a.events_24h || '0'), 0);

  res.json({
    agents: agents.rows,
    summary: {
      totalAgents,
      activeAgents,
      totalEvents,
      eventsToday,
    },
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/dashboard/activity
 * Get recent activity for dashboard
 *
 * NOTE: Events table doesn't have tenantId directly - filter through agents relation.
 */
dashboardRouter.get('/activity', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { limit = 50, offset = 0 } = req.query;

  const result = await query(`
    SELECT e.id, e."eventType", e."agentId", a.name as agent_name,
           e.payload, e.timestamp, e.severity
    FROM events e
    LEFT JOIN agents a ON a.id = e."agentId"
    WHERE a."tenantId" = $1
    ORDER BY e.timestamp DESC
    LIMIT $2 OFFSET $3
  `, [req.tenantId, limit, offset]);

  res.json({
    data: result.rows,
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * GET /api/dashboard/trends
 * Get usage trends for charts
 *
 * NOTE: Computes trends directly from events table since daily_stats doesn't exist.
 */
dashboardRouter.get('/trends', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { days = 30 } = req.query;

  const result = await query(`
    SELECT DATE(e.timestamp) as day,
      COUNT(*) as total_events,
      COUNT(DISTINCT e."agentId") as active_agents,
      COUNT(CASE WHEN e.severity = 'error' THEN 1 END) as errors
    FROM events e
    JOIN agents a ON a.id = e."agentId"
    WHERE a."tenantId" = $1 AND e.timestamp > NOW() - ($2::int || ' days')::interval
    GROUP BY DATE(e.timestamp)
    ORDER BY day ASC
  `, [req.tenantId, days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/dashboard/anomalies
 * Get detected anomalies
 *
 * NOTE: Returns high-severity events as anomalies since dedicated anomalies table doesn't exist.
 */
dashboardRouter.get('/anomalies', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { limit = 20 } = req.query;

  // Return error-level events as "anomalies"
  const result = await query(`
    SELECT e.id, e."agentId", e."eventType" as anomaly_type, e.severity,
           e.payload->>'message' as description, e.timestamp as detected_at
    FROM events e
    JOIN agents a ON a.id = e."agentId"
    WHERE a."tenantId" = $1 AND e.severity = 'error'
    ORDER BY e.timestamp DESC
    LIMIT $2
  `, [req.tenantId, limit]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/dashboard/agent/:id
 * Get detailed stats for a specific agent
 */
dashboardRouter.get('/agent/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentResult = await query(`
    SELECT a.*,
      (SELECT COUNT(*) FROM events e WHERE e."agentId" = a.id) as total_events,
      (SELECT MAX(e.timestamp) FROM events e WHERE e."agentId" = a.id) as last_active
    FROM agents a
    WHERE a.id = $1 AND a."tenantId" = $2
  `, [req.params.id, req.tenantId]);

  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  // Compute daily stats from events
  const statsResult = await query(`
    SELECT DATE(e.timestamp) as day,
      COUNT(*) as total_events,
      COUNT(CASE WHEN e.severity = 'error' THEN 1 END) as errors
    FROM events e
    WHERE e."agentId" = $1 AND e.timestamp > NOW() - INTERVAL '30 days'
    GROUP BY DATE(e.timestamp)
    ORDER BY day ASC
  `, [req.params.id]);

  res.json({
    agent: agentResult.rows[0],
    stats: statsResult.rows,
  });
}));
