import { Router, Response } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const analyticsRouter = Router();

/**
 * GET /api/analytics/overview
 * Get analytics overview
 */
analyticsRouter.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  // Aggregate stats
  const stats = await query(`
    SELECT
      COALESCE(SUM(messages_received), 0) as total_messages_received,
      COALESCE(SUM(messages_sent), 0) as total_messages_sent,
      COALESCE(SUM(tool_calls), 0) as total_tool_calls,
      COALESCE(SUM(errors), 0) as total_errors,
      COALESCE(SUM(estimated_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
      COUNT(DISTINCT agent_id) as active_agents,
      COUNT(DISTINCT day) as active_days
    FROM daily_stats
    WHERE tenant_id = $1 AND day > CURRENT_DATE - $2::int
  `, [req.tenantId, days]);

  // Daily trend
  const trend = await query(`
    SELECT day,
      SUM(messages_received) as received,
      SUM(messages_sent) as sent,
      SUM(tool_calls) as tools,
      SUM(errors) as errors,
      SUM(estimated_cost_usd) as cost
    FROM daily_stats
    WHERE tenant_id = $1 AND day > CURRENT_DATE - $2::int
    GROUP BY day
    ORDER BY day ASC
  `, [req.tenantId, days]);

  // Top agents
  const topAgents = await query(`
    SELECT a.id, a.name,
      COALESCE(SUM(ds.messages_received + ds.messages_sent), 0) as total_messages,
      COALESCE(SUM(ds.tool_calls), 0) as total_tools,
      COALESCE(SUM(ds.estimated_cost_usd), 0) as total_cost
    FROM agents a
    LEFT JOIN daily_stats ds ON ds.agent_id = a.id AND ds.day > CURRENT_DATE - $2::int
    WHERE a.tenant_id = $1
    GROUP BY a.id, a.name
    ORDER BY total_messages DESC
    LIMIT 10
  `, [req.tenantId, days]);

  res.json({
    summary: stats.rows[0],
    trend: trend.rows,
    topAgents: topAgents.rows,
    period: { days, startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() },
  });
}));

/**
 * GET /api/analytics/agents
 * Get per-agent analytics
 */
analyticsRouter.get('/agents', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      a.id,
      a.name,
      a.framework,
      a.status,
      COUNT(DISTINCT ds.day) as active_days,
      COALESCE(SUM(ds.messages_received), 0) as total_received,
      COALESCE(SUM(ds.messages_sent), 0) as total_sent,
      COALESCE(SUM(ds.tool_calls), 0) as total_tools,
      COALESCE(SUM(ds.errors), 0) as total_errors,
      COALESCE(SUM(ds.estimated_tokens), 0) as total_tokens,
      COALESCE(SUM(ds.estimated_cost_usd), 0) as total_cost,
      COALESCE(AVG(ds.estimated_cost_usd), 0) as avg_daily_cost,
      MAX(ds.day) as last_active_day
    FROM agents a
    LEFT JOIN daily_stats ds ON ds.agent_id = a.id AND ds.day > CURRENT_DATE - $2::int
    WHERE a.tenant_id = $1
    GROUP BY a.id, a.name, a.framework, a.status
    ORDER BY total_cost DESC
  `, [req.tenantId, days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/analytics/models
 * Get per-model analytics
 */
analyticsRouter.get('/models', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      model_id,
      COUNT(*) as request_count,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COALESCE(AVG(latency_ms), 0) as avg_latency,
      COUNT(DISTINCT DATE(created_at)) as active_days
    FROM model_usage
    WHERE tenant_id = $1 AND created_at > NOW() - $2::int * INTERVAL '1 day'
    GROUP BY model_id
    ORDER BY total_cost DESC
  `, [req.tenantId, days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/analytics/errors
 * Get error analytics
 */
analyticsRouter.get('/errors', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '7d' } = req.query;

  const days = period === '24h' ? 1 : period === '30d' ? 30 : 7;

  // Error count by type
  const byType = await query(`
    SELECT
      COALESCE(metadata->>'error_type', 'unknown') as error_type,
      COUNT(*) as count
    FROM events
    WHERE tenant_id = $1
      AND event_type = 'error'
      AND created_at > NOW() - $2::int * INTERVAL '1 day'
    GROUP BY metadata->>'error_type'
    ORDER BY count DESC
    LIMIT 10
  `, [req.tenantId, days]);

  // Error trend
  const trend = await query(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM events
    WHERE tenant_id = $1
      AND event_type = 'error'
      AND created_at > NOW() - $2::int * INTERVAL '1 day'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [req.tenantId, days]);

  // Top error agents
  const byAgent = await query(`
    SELECT a.id, a.name, COUNT(*) as error_count
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE e.tenant_id = $1
      AND e.event_type = 'error'
      AND e.created_at > NOW() - $2::int * INTERVAL '1 day'
    GROUP BY a.id, a.name
    ORDER BY error_count DESC
    LIMIT 10
  `, [req.tenantId, days]);

  res.json({
    byType: byType.rows,
    trend: trend.rows,
    byAgent: byAgent.rows,
  });
}));

/**
 * GET /api/analytics/performance
 * Get performance metrics
 */
analyticsRouter.get('/performance', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '24h' } = req.query;

  const hours = period === '1h' ? 1 : period === '7d' ? 168 : 24;

  const latency = await query(`
    SELECT
      COALESCE(AVG(latency_ms), 0) as avg_latency,
      COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms), 0) as p50,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) as p95,
      COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms), 0) as p99,
      COALESCE(MAX(latency_ms), 0) as max_latency
    FROM model_usage
    WHERE tenant_id = $1 AND created_at > NOW() - $2::int * INTERVAL '1 hour'
  `, [req.tenantId, hours]);

  const throughput = await query(`
    SELECT
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE status = 'success') as successful,
      COUNT(*) FILTER (WHERE status = 'error') as failed,
      ROUND(COUNT(*) FILTER (WHERE status = 'success')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
    FROM model_usage
    WHERE tenant_id = $1 AND created_at > NOW() - $2::int * INTERVAL '1 hour'
  `, [req.tenantId, hours]);

  res.json({
    latency: latency.rows[0],
    throughput: throughput.rows[0],
    period: { hours },
  });
}));
