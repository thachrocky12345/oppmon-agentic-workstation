import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';

export const costsRouter = Router();

/**
 * GET /api/costs/overview
 * Get cost overview with totals
 */
costsRouter.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
      COALESCE(SUM(estimated_tokens), 0) as total_tokens,
      COALESCE(AVG(estimated_cost_usd), 0) as avg_daily_cost,
      COUNT(DISTINCT agent_id) as active_agents
    FROM daily_stats
    WHERE tenant_id = $1 AND day > CURRENT_DATE - $2::int
  `, [req.tenantId, days]);

  const trend = await query(`
    SELECT day, SUM(estimated_cost_usd) as cost
    FROM daily_stats
    WHERE tenant_id = $1 AND day > CURRENT_DATE - $2::int
    GROUP BY day
    ORDER BY day ASC
  `, [req.tenantId, days]);

  res.json({
    summary: result.rows[0],
    trend: trend.rows,
  });
}));

/**
 * GET /api/costs/by-agent
 * Get cost breakdown by agent
 */
costsRouter.get('/by-agent', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d', limit = 10 } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      a.id as agent_id,
      a.name as agent_name,
      COALESCE(SUM(ds.estimated_cost_usd), 0) as total_cost,
      COALESCE(SUM(ds.estimated_tokens), 0) as total_tokens,
      COUNT(DISTINCT ds.day) as active_days
    FROM agents a
    LEFT JOIN daily_stats ds ON ds.agent_id = a.id AND ds.day > CURRENT_DATE - $2::int
    WHERE a.tenant_id = $1
    GROUP BY a.id, a.name
    ORDER BY total_cost DESC
    LIMIT $3
  `, [req.tenantId, days, limit]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/costs/by-model
 * Get cost breakdown by model
 */
costsRouter.get('/by-model', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      model_id,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as request_count
    FROM model_usage
    WHERE tenant_id = $1 AND created_at > NOW() - $2::int * INTERVAL '1 day'
    GROUP BY model_id
    ORDER BY total_cost DESC
  `, [req.tenantId, days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/costs/budgets
 * Get budget status and alerts
 */
costsRouter.get('/budgets', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const budgets = await query(`
    SELECT b.*,
      (SELECT COALESCE(SUM(ds.estimated_cost_usd), 0)
       FROM daily_stats ds
       WHERE ds.tenant_id = b.tenant_id
         AND (b.agent_ids IS NULL OR ds.agent_id = ANY(b.agent_ids))
         AND ds.day >= CASE
           WHEN b.period = 'daily' THEN CURRENT_DATE
           WHEN b.period = 'weekly' THEN DATE_TRUNC('week', CURRENT_DATE)
           WHEN b.period = 'monthly' THEN DATE_TRUNC('month', CURRENT_DATE)
         END
      ) as current_spend
    FROM budgets b
    WHERE b.tenant_id = $1
  `, [req.tenantId]);

  const budgetsWithStatus = budgets.rows.map((b: any) => ({
    ...b,
    percentUsed: (b.current_spend / b.amount) * 100,
    isOverThreshold: (b.current_spend / b.amount) * 100 >= b.alert_threshold,
    isOverBudget: b.current_spend >= b.amount,
  }));

  res.json({ data: budgetsWithStatus });
}));

const budgetAlertSchema = z.object({
  budgetId: z.string().uuid(),
  threshold: z.number().min(0).max(100),
});

/**
 * POST /api/costs/budgets/alert
 * Update budget alert threshold
 */
costsRouter.post('/budgets/alert', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = budgetAlertSchema.parse(req.body);

  const result = await query(`
    UPDATE budgets
    SET alert_threshold = $1, updated_at = NOW()
    WHERE id = $2 AND tenant_id = $3
    RETURNING *
  `, [data.threshold, data.budgetId, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Budget not found');
  }

  res.json(result.rows[0]);
}));
