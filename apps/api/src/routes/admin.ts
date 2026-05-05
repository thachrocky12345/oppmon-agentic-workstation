import { Router, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';

export const adminRouter = Router();

// All admin routes require admin role
adminRouter.use(requireRole('TENANT_ADMIN'));

/**
 * GET /api/admin/tenants
 * List all tenants (super admin only)
 */
adminRouter.get('/tenants', requireRole('SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT id, name, domain, plan, created_at, settings
    FROM tenants
    ORDER BY name ASC
  `);

  res.json({ data: result.rows });
}));

/**
 * GET /api/admin/agents
 * List all agents with detailed stats
 */
adminRouter.get('/agents', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  const result = await query(`
    SELECT a.*,
      (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id) as total_events,
      (SELECT MAX(e.created_at) FROM events e WHERE e.agent_id = a.id) as last_active,
      (SELECT COALESCE(SUM(ds.estimated_cost_usd), 0) FROM daily_stats ds WHERE ds.agent_id = a.id) as total_cost
    FROM agents a
    ${whereClause}
    ORDER BY a.created_at DESC
  `, params);

  res.json({ data: result.rows });
}));

/**
 * GET /api/admin/budgets
 * Get budget configurations
 */
adminRouter.get('/budgets', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM budgets
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `, [req.tenantId]);

  res.json({ data: result.rows });
}));

const budgetSchema = z.object({
  name: z.string().min(1).max(255),
  amount: z.number().positive(),
  period: z.enum(['daily', 'weekly', 'monthly']),
  agentIds: z.array(z.string().uuid()).optional(),
  alertThreshold: z.number().min(0).max(100).default(80),
});

/**
 * POST /api/admin/budgets
 * Create a new budget
 */
adminRouter.post('/budgets', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = budgetSchema.parse(req.body);

  const result = await query(`
    INSERT INTO budgets (name, amount, period, agent_ids, alert_threshold, tenant_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [data.name, data.amount, data.period, data.agentIds || [], data.alertThreshold, req.tenantId]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'budget.create',
    targetType: 'budget',
    targetId: result.rows[0].id,
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json(result.rows[0]);
}));

/**
 * GET /api/admin/crons
 * List scheduled cron jobs
 */
adminRouter.get('/crons', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM cron_jobs
    WHERE tenant_id = $1
    ORDER BY next_run ASC
  `, [req.tenantId]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/admin/infra-costs
 * Get infrastructure cost breakdown
 */
adminRouter.get('/infra-costs', requireRole('SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      tenant_id,
      SUM(compute_cost) as compute_cost,
      SUM(storage_cost) as storage_cost,
      SUM(network_cost) as network_cost,
      SUM(api_cost) as api_cost
    FROM infra_costs
    WHERE created_at > NOW() - $1::int * INTERVAL '1 day'
    GROUP BY tenant_id
  `, [days]);

  res.json({ data: result.rows });
}));

/**
 * GET /api/admin/pricing
 * Get current pricing configuration
 */
adminRouter.get('/pricing', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT model_id, provider, input_price_per_1k, output_price_per_1k, updated_at
    FROM model_pricing
    ORDER BY provider, model_id
  `);

  res.json({ data: result.rows });
}));

/**
 * POST /api/admin/pricing/sync
 * Sync pricing from external sources
 */
adminRouter.post('/pricing/sync', requireRole('SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // In production, this would fetch from OpenRouter, Anthropic, etc.
  const syncedAt = new Date().toISOString();

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'pricing.sync',
    description: 'Manual pricing sync triggered',
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({
    message: 'Pricing sync completed',
    syncedAt,
  });
}));

/**
 * GET /api/admin/reconciliation
 * Get cost reconciliation report
 */
adminRouter.get('/reconciliation', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = req.query;

  const result = await query(`
    SELECT
      DATE(created_at) as date,
      SUM(calculated_cost) as calculated_cost,
      SUM(actual_cost) as actual_cost,
      SUM(actual_cost - calculated_cost) as variance
    FROM cost_reconciliation
    WHERE tenant_id = $1
      AND created_at BETWEEN COALESCE($2::date, CURRENT_DATE - 30) AND COALESCE($3::date, CURRENT_DATE)
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `, [req.tenantId, startDate || null, endDate || null]);

  res.json({ data: result.rows });
}));
