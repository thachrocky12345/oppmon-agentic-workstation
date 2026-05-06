import { Router, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../lib/db.js';
import { prisma } from '@oppmon/database';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';
import { listSkills, createSkill, deleteSkill, type SkillFilter } from '../services/skills.js';
import { listProvidersWithRegistry } from '../services/llm.js';

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

// ============================================================================
// Admin Skills Routes
// ============================================================================

const listSkillsQuerySchema = z.object({
  scope: z.enum(['TENANT', 'TEAM']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

/**
 * GET /api/admin/skills
 * List all skills for the tenant
 */
adminRouter.get('/skills', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const queryParams = listSkillsQuerySchema.parse(req.query);

  // Admin can see all skills regardless of team membership
  const where: Record<string, unknown> = {
    tenantId: req.tenantId,
    deletedAt: null,
  };

  if (queryParams.scope) {
    where.scope = queryParams.scope;
  }

  if (queryParams.search) {
    where.OR = [
      { name: { contains: queryParams.search, mode: 'insensitive' } },
      { description: { contains: queryParams.search, mode: 'insensitive' } },
    ];
  }

  const limit = queryParams.limit ?? 50;
  const offset = queryParams.offset ?? 0;

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    }),
    prisma.skill.count({ where }),
  ]);

  res.json({
    data: skills,
    meta: { total, limit, offset },
  });
}));

const createSkillSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  content: z.string().min(1),
  scope: z.enum(['TENANT', 'TEAM']),
  teamId: z.string().optional().nullable(),
});

/**
 * POST /api/admin/skills
 * Create a new skill
 */
adminRouter.post('/skills', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = createSkillSchema.parse(req.body);

  const skill = await createSkill(req.tenantId!, req.userId!, {
    name: input.name,
    description: input.description,
    content: input.content,
    scope: input.scope as 'TENANT' | 'TEAM',
    teamId: input.teamId,
  });

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'skill.create',
    targetType: 'skill',
    targetId: skill.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ data: skill });
}));

/**
 * PATCH /api/admin/skills/:id/toggle
 * Toggle skill enabled/disabled status
 */
adminRouter.patch('/skills/:id/toggle', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

  const skill = await prisma.skill.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
  });

  if (!skill) {
    throw ApiError.notFound('Skill not found');
  }

  const updated = await prisma.skill.update({
    where: { id: req.params.id },
    data: { enabled },
  });

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: enabled ? 'skill.enable' : 'skill.disable',
    targetType: 'skill',
    targetId: skill.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({ data: updated });
}));

/**
 * DELETE /api/admin/skills/:id
 * Soft delete a skill
 */
adminRouter.delete('/skills/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const skill = await prisma.skill.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
  });

  if (!skill) {
    throw ApiError.notFound('Skill not found');
  }

  if (skill.deletedAt) {
    throw ApiError.badRequest('Skill already deleted');
  }

  const deleted = await prisma.skill.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'skill.delete',
    targetType: 'skill',
    targetId: skill.id,
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({ success: true, data: deleted });
}));

// ============================================================================
// Admin LLM Usage Routes
// ============================================================================

const llmUsageQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  provider: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
});

/**
 * GET /api/admin/llm-usage
 * Get LLM usage statistics for the entire tenant
 */
adminRouter.get('/llm-usage', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const queryParams = llmUsageQuerySchema.parse(req.query);

  // Build date filter
  const dateFilter: Record<string, unknown> = {};
  if (queryParams.startDate) {
    dateFilter.gte = new Date(queryParams.startDate);
  }
  if (queryParams.endDate) {
    dateFilter.lte = new Date(queryParams.endDate);
  }

  // Get usage by provider/model
  const usageByModel = await prisma.llmMessage.groupBy({
    by: ['provider', 'model'],
    where: {
      session: { tenantId: req.tenantId },
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      ...(queryParams.provider && { provider: queryParams.provider }),
    },
    _sum: {
      inputTokens: true,
      outputTokens: true,
    },
    _count: {
      id: true,
    },
  });

  // Get usage by day (last 30 days)
  const dailyUsage = await prisma.$queryRaw<Array<{
    date: Date;
    provider: string;
    calls: bigint;
    input_tokens: bigint;
    output_tokens: bigint;
  }>>`
    SELECT
      DATE(lm."createdAt") as date,
      lm.provider,
      COUNT(*) as calls,
      COALESCE(SUM(lm."inputTokens"), 0) as input_tokens,
      COALESCE(SUM(lm."outputTokens"), 0) as output_tokens
    FROM llm_messages lm
    JOIN llm_sessions ls ON lm."sessionId" = ls.id
    WHERE ls."tenantId" = ${req.tenantId}
      AND lm."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(lm."createdAt"), lm.provider
    ORDER BY date DESC
    LIMIT 30
  `;

  // Get total stats
  const totals = await prisma.llmMessage.aggregate({
    where: {
      session: { tenantId: req.tenantId },
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    },
    _sum: {
      inputTokens: true,
      outputTokens: true,
    },
    _count: {
      id: true,
    },
  });

  // Get unique users
  const uniqueUsers = await prisma.llmSession.groupBy({
    by: ['userId'],
    where: {
      tenantId: req.tenantId,
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    },
  });

  // Get recent messages
  const recentMessages = await prisma.llmMessage.findMany({
    where: {
      session: { tenantId: req.tenantId },
      role: 'assistant',
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      provider: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      createdAt: true,
      session: {
        select: {
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  // Get available providers with registry check
  const providers = await listProvidersWithRegistry(req.tenantId!);

  res.json({
    data: {
      summary: {
        totalCalls: totals._count.id,
        totalInputTokens: totals._sum.inputTokens || 0,
        totalOutputTokens: totals._sum.outputTokens || 0,
        totalTokens: (totals._sum.inputTokens || 0) + (totals._sum.outputTokens || 0),
        uniqueUsers: uniqueUsers.length,
      },
      byModel: usageByModel.map((u) => ({
        provider: u.provider,
        model: u.model,
        calls: u._count.id,
        inputTokens: u._sum.inputTokens || 0,
        outputTokens: u._sum.outputTokens || 0,
        totalTokens: (u._sum.inputTokens || 0) + (u._sum.outputTokens || 0),
      })),
      dailyUsage: dailyUsage.map((d) => ({
        date: d.date,
        provider: d.provider,
        calls: Number(d.calls),
        inputTokens: Number(d.input_tokens),
        outputTokens: Number(d.output_tokens),
      })),
      recentMessages: recentMessages.map((m) => ({
        id: m.id,
        provider: m.provider,
        model: m.model,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        createdAt: m.createdAt,
        user: m.session.user,
      })),
      providers,
    },
  });
}));

/**
 * GET /api/admin/llm-usage/sessions
 * Get all LLM sessions for the tenant
 */
adminRouter.get('/llm-usage/sessions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const queryParams = z.object({
    limit: z.coerce.number().min(1).max(100).optional(),
    offset: z.coerce.number().min(0).optional(),
    userId: z.string().optional(),
  }).parse(req.query);

  const limit = queryParams.limit || 20;
  const offset = queryParams.offset || 0;

  const where: Record<string, unknown> = {
    tenantId: req.tenantId,
  };

  if (queryParams.userId) {
    where.userId = queryParams.userId;
  }

  const [sessions, total] = await Promise.all([
    prisma.llmSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.llmSession.count({ where }),
  ]);

  res.json({
    data: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      provider: s.provider,
      user: s.user,
      messageCount: s._count.messages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    meta: { total, limit, offset },
  });
}));

/**
 * GET /api/admin/llm-usage/users
 * Get LLM usage by user
 */
adminRouter.get('/llm-usage/users', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userUsage = await prisma.$queryRaw<Array<{
    user_id: string;
    user_name: string;
    user_email: string;
    sessions: bigint;
    messages: bigint;
    input_tokens: bigint;
    output_tokens: bigint;
  }>>`
    SELECT
      u.id as user_id,
      u.name as user_name,
      u.email as user_email,
      COUNT(DISTINCT ls.id) as sessions,
      COUNT(lm.id) as messages,
      COALESCE(SUM(lm."inputTokens"), 0) as input_tokens,
      COALESCE(SUM(lm."outputTokens"), 0) as output_tokens
    FROM users u
    LEFT JOIN llm_sessions ls ON u.id = ls."userId" AND ls."tenantId" = ${req.tenantId}
    LEFT JOIN llm_messages lm ON ls.id = lm."sessionId"
    WHERE u."tenantId" = ${req.tenantId}
    GROUP BY u.id, u.name, u.email
    HAVING COUNT(lm.id) > 0
    ORDER BY output_tokens DESC
  `;

  res.json({
    data: userUsage.map((u) => ({
      userId: u.user_id,
      userName: u.user_name,
      userEmail: u.user_email,
      sessions: Number(u.sessions),
      messages: Number(u.messages),
      inputTokens: Number(u.input_tokens),
      outputTokens: Number(u.output_tokens),
      totalTokens: Number(u.input_tokens) + Number(u.output_tokens),
    })),
  });
}));
