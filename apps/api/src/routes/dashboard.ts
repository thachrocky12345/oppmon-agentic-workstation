import { Router, Response } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/overview
 * Get dashboard overview data
 */
dashboardRouter.get('/overview', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agents = await query(`
    SELECT a.id, a.name, a.metadata, a.created_at, a.tenant_id,
      (SELECT MAX(e.created_at) FROM events e WHERE e.agent_id = a.id) as last_active,
      (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '24 hours') as events_24h,
      (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '7 days') as events_7d,
      (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id) as events_total,
      (SELECT COALESCE(SUM(e.token_estimate), 0) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '24 hours') as tokens_24h,
      (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.threat_level IS NOT NULL AND e.threat_level != 'none' AND e.created_at > NOW() - INTERVAL '30 days') as threats_30d,
      (SELECT COALESCE(SUM(ds.estimated_cost_usd), 0) FROM daily_stats ds WHERE ds.agent_id = a.id AND ds.day > CURRENT_DATE - INTERVAL '30 days') as cost_30d
    FROM agents a
    WHERE a.tenant_id = $1
    ORDER BY last_active DESC NULLS LAST
  `, [req.tenantId]);

  const todayStats = await query(`
    SELECT agent_id, tenant_id,
      COALESCE(SUM(messages_received), 0) as received,
      COALESCE(SUM(messages_sent), 0) as sent,
      COALESCE(SUM(tool_calls), 0) as tools,
      COALESCE(SUM(errors), 0) as errors,
      COALESCE(SUM(estimated_tokens), 0) as tokens
    FROM daily_stats
    WHERE day = CURRENT_DATE AND tenant_id = $1
    GROUP BY agent_id, tenant_id
  `, [req.tenantId]);

  res.json({
    agents: agents.rows,
    todayStats: todayStats.rows,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/dashboard/activity
 * Get recent activity for dashboard
 */
dashboardRouter.get('/activity', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { limit = 50, offset = 0 } = req.query;

  const result = await query(`
    SELECT e.id, e.event_type, e.agent_id, a.name as agent_name,
           e.metadata, e.created_at, e.threat_level
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    WHERE e.tenant_id = $1
    ORDER BY e.created_at DESC
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
 */
dashboardRouter.get('/trends', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { days = 30 } = req.query;

  const result = await query(`
    SELECT day,
      SUM(messages_received) as messages_received,
      SUM(messages_sent) as messages_sent,
      SUM(tool_calls) as tool_calls,
      SUM(errors) as errors,
      SUM(estimated_tokens) as tokens,
      SUM(estimated_cost_usd) as cost
    FROM daily_stats
    WHERE tenant_id = $1 AND day > CURRENT_DATE - $2::int
    GROUP BY day
    ORDER BY day ASC
  `, [req.tenantId, days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/dashboard/anomalies
 * Get detected anomalies
 */
dashboardRouter.get('/anomalies', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { limit = 20 } = req.query;

  const result = await query(`
    SELECT id, agent_id, anomaly_type, severity, description,
           detected_at, resolved_at, metadata
    FROM anomalies
    WHERE tenant_id = $1
    ORDER BY detected_at DESC
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
      (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id) as total_events,
      (SELECT MAX(e.created_at) FROM events e WHERE e.agent_id = a.id) as last_active
    FROM agents a
    WHERE a.id = $1 AND a.tenant_id = $2
  `, [req.params.id, req.tenantId]);

  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  const statsResult = await query(`
    SELECT day, messages_received, messages_sent, tool_calls,
           errors, estimated_tokens, estimated_cost_usd
    FROM daily_stats
    WHERE agent_id = $1 AND day > CURRENT_DATE - 30
    ORDER BY day ASC
  `, [req.params.id]);

  res.json({
    agent: agentResult.rows[0],
    stats: statsResult.rows,
  });
}));
