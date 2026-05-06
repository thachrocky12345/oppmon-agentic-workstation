import { Router, Response } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const analyticsRouter = Router();

/**
 * GET /api/analytics/overview
 * Get analytics overview
 *
 * NOTE: Uses events and llm_messages tables.
 * Database columns are snake_case per Prisma @map() directives.
 */
analyticsRouter.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  // Aggregate stats from events
  const eventStats = await query(`
    SELECT
      COUNT(*) as total_events,
      COUNT(CASE WHEN e.severity = 'error' THEN 1 END) as total_errors,
      COUNT(DISTINCT e.agent_id) as active_agents,
      COUNT(DISTINCT DATE(e.timestamp)) as active_days
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1 AND e.timestamp > NOW() - ($2 || ' days')::interval
  `, [req.tenantId, days]);

  // Token/cost stats from llm_messages
  const tokenStats = await query(`
    SELECT
      COALESCE(SUM(m.input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(m.output_tokens), 0) as total_output_tokens,
      COUNT(*) as total_requests
    FROM llm_messages m
    JOIN llm_sessions s ON s.id = m.session_id
    WHERE s.tenant_id = $1 AND m.created_at > NOW() - ($2 || ' days')::interval
  `, [req.tenantId, days]);

  // Daily trend from events
  const trend = await query(`
    SELECT DATE(e.timestamp) as day,
      COUNT(*) as events,
      COUNT(CASE WHEN e.severity = 'error' THEN 1 END) as errors
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1 AND e.timestamp > NOW() - ($2 || ' days')::interval
    GROUP BY DATE(e.timestamp)
    ORDER BY day ASC
  `, [req.tenantId, days]);

  // Top agents by event count
  const topAgents = await query(`
    SELECT a.id, a.name,
      COUNT(e.id) as total_events,
      COUNT(CASE WHEN e.severity = 'error' THEN 1 END) as total_errors
    FROM agents a
    LEFT JOIN events e ON e.agent_id = a.id AND e.timestamp > NOW() - ($2 || ' days')::interval
    WHERE a.tenant_id = $1
    GROUP BY a.id, a.name
    ORDER BY total_events DESC
    LIMIT 10
  `, [req.tenantId, days]);

  const totalTokens = parseInt(tokenStats.rows[0]?.total_input_tokens || '0') +
                      parseInt(tokenStats.rows[0]?.total_output_tokens || '0');

  res.json({
    summary: {
      totalEvents: parseInt(eventStats.rows[0]?.total_events || '0'),
      totalErrors: parseInt(eventStats.rows[0]?.total_errors || '0'),
      activeAgents: parseInt(eventStats.rows[0]?.active_agents || '0'),
      activeDays: parseInt(eventStats.rows[0]?.active_days || '0'),
      totalTokens,
      totalRequests: parseInt(tokenStats.rows[0]?.total_requests || '0'),
      // Estimate cost at ~$0.001 per 1K tokens
      estimatedCost: totalTokens * 0.000001,
    },
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
      a.status,
      a.last_seen,
      COUNT(DISTINCT DATE(e.timestamp)) as active_days,
      COUNT(e.id) as total_events,
      COUNT(CASE WHEN e.severity = 'error' THEN 1 END) as total_errors,
      MAX(e.timestamp) as last_event_at
    FROM agents a
    LEFT JOIN events e ON e.agent_id = a.id AND e.timestamp > NOW() - ($2 || ' days')::interval
    WHERE a.tenant_id = $1
    GROUP BY a.id, a.name, a.status, a.last_seen
    ORDER BY total_events DESC
  `, [req.tenantId, days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/analytics/models
 * Get per-model analytics from llm_messages
 */
analyticsRouter.get('/models', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      m.model,
      m.provider,
      COUNT(*) as request_count,
      COALESCE(SUM(m.input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(m.output_tokens), 0) as total_output_tokens,
      COUNT(DISTINCT DATE(m.created_at)) as active_days
    FROM llm_messages m
    JOIN llm_sessions s ON s.id = m.session_id
    WHERE s.tenant_id = $1 AND m.created_at > NOW() - ($2 || ' days')::interval
    GROUP BY m.model, m.provider
    ORDER BY request_count DESC
  `, [req.tenantId, days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/analytics/errors
 * Get error analytics from events
 */
analyticsRouter.get('/errors', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '7d' } = req.query;

  const days = period === '24h' ? 1 : period === '30d' ? 30 : 7;

  // Error count by event type
  const byType = await query(`
    SELECT
      e.event_type as error_type,
      COUNT(*) as count
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1
      AND e.severity = 'error'
      AND e.timestamp > NOW() - ($2 || ' days')::interval
    GROUP BY e.event_type
    ORDER BY count DESC
    LIMIT 10
  `, [req.tenantId, days]);

  // Error trend
  const trend = await query(`
    SELECT DATE(e.timestamp) as date, COUNT(*) as count
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1
      AND e.severity = 'error'
      AND e.timestamp > NOW() - ($2 || ' days')::interval
    GROUP BY DATE(e.timestamp)
    ORDER BY date ASC
  `, [req.tenantId, days]);

  // Top error agents
  const byAgent = await query(`
    SELECT a.id, a.name, COUNT(*) as error_count
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE a.tenant_id = $1
      AND e.severity = 'error'
      AND e.timestamp > NOW() - ($2 || ' days')::interval
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
 *
 * NOTE: model_usage table doesn't exist. Returns basic stats from llm_messages.
 */
analyticsRouter.get('/performance', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '24h' } = req.query;

  const hours = period === '1h' ? 1 : period === '7d' ? 168 : 24;

  // Get request stats from llm_messages
  const stats = await query(`
    SELECT
      COUNT(*) as total_requests,
      COALESCE(SUM(m.input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(m.output_tokens), 0) as total_output_tokens,
      COUNT(DISTINCT m.model) as unique_models
    FROM llm_messages m
    JOIN llm_sessions s ON s.id = m.session_id
    WHERE s.tenant_id = $1 AND m.created_at > NOW() - ($2 || ' hours')::interval
  `, [req.tenantId, hours]);

  // Latency data not available in current schema - return placeholder
  res.json({
    latency: {
      avg_latency: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max_latency: 0,
      note: 'Latency tracking not available in current schema',
    },
    throughput: {
      total_requests: parseInt(stats.rows[0]?.total_requests || '0'),
      total_input_tokens: parseInt(stats.rows[0]?.total_input_tokens || '0'),
      total_output_tokens: parseInt(stats.rows[0]?.total_output_tokens || '0'),
      unique_models: parseInt(stats.rows[0]?.unique_models || '0'),
      success_rate: 100, // Assume all stored messages were successful
    },
    period: { hours },
  });
}));
