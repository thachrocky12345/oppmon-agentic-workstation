// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';

export const costsRouter = Router();

// Estimated cost per token (very rough estimate)
const COST_PER_TOKEN = 0.000001; // $0.001 per 1K tokens

/**
 * GET /api/costs/overview
 * Get cost overview with totals
 *
 * NOTE: Computes costs from llm_messages since daily_stats doesn't exist.
 */
costsRouter.get('/overview', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  // Get token usage from llm_messages
  const result = await query(`
    SELECT
      COALESCE(SUM(m.input_tokens + m.output_tokens), 0) as total_tokens,
      COUNT(DISTINCT DATE(m.created_at)) as active_days,
      COUNT(DISTINCT s.user_id) as active_users
    FROM llm_messages m
    JOIN llm_sessions s ON s.id = m.session_id
    WHERE s.tenant_id = $1 AND m.created_at > NOW() - ($2 || ' days')::interval
  `, [req.tenantId, days]);

  // Get daily trend
  const trend = await query(`
    SELECT DATE(m.created_at) as day,
      SUM(m.input_tokens + m.output_tokens) as tokens
    FROM llm_messages m
    JOIN llm_sessions s ON s.id = m.session_id
    WHERE s.tenant_id = $1 AND m.created_at > NOW() - ($2 || ' days')::interval
    GROUP BY DATE(m.created_at)
    ORDER BY day ASC
  `, [req.tenantId, days]);

  const totalTokens = parseInt(result.rows[0]?.total_tokens || '0');
  const totalCost = totalTokens * COST_PER_TOKEN;

  res.json({
    summary: {
      total_cost: totalCost,
      total_tokens: totalTokens,
      avg_daily_cost: trend.rows.length > 0 ? totalCost / trend.rows.length : 0,
      active_users: parseInt(result.rows[0]?.active_users || '0'),
    },
    trend: trend.rows.map((r: any) => ({
      day: r.day,
      cost: parseInt(r.tokens || '0') * COST_PER_TOKEN,
      tokens: parseInt(r.tokens || '0'),
    })),
  });
}));

/**
 * GET /api/costs/by-agent
 * Get cost breakdown by agent
 *
 * NOTE: Agent costs not directly tracked. Returns agents with event counts.
 */
costsRouter.get('/by-agent', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d', limit = 10 } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  // Agents don't have direct cost tracking in current schema
  // Return agents with their activity as a proxy for cost
  const result = await query(`
    SELECT
      a.id as agent_id,
      a.name as agent_name,
      COUNT(e.id) as total_events,
      COUNT(DISTINCT DATE(e.timestamp)) as active_days
    FROM agents a
    LEFT JOIN events e ON e.agent_id = a.id AND e.timestamp > NOW() - ($2 || ' days')::interval
    WHERE a.tenant_id = $1
    GROUP BY a.id, a.name
    ORDER BY total_events DESC
    LIMIT $3
  `, [req.tenantId, days, limit]);

  // Add estimated costs (events as proxy)
  const data = result.rows.map((r: any) => ({
    ...r,
    total_cost: 0, // No cost tracking per agent
    total_tokens: 0, // No token tracking per agent
  }));

  res.json({ data });
}));

/**
 * GET /api/costs/by-model
 * Get cost breakdown by model from llm_messages
 */
costsRouter.get('/by-model', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { period = '30d' } = req.query;

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT
      m.model as model_id,
      m.provider,
      COALESCE(SUM(m.input_tokens), 0) as input_tokens,
      COALESCE(SUM(m.output_tokens), 0) as output_tokens,
      COUNT(*) as request_count
    FROM llm_messages m
    JOIN llm_sessions s ON s.id = m.session_id
    WHERE s.tenant_id = $1 AND m.created_at > NOW() - ($2 || ' days')::interval
    GROUP BY m.model, m.provider
    ORDER BY SUM(m.input_tokens) + SUM(m.output_tokens) DESC
  `, [req.tenantId, days]);

  // Add calculated costs
  const data = result.rows.map((r: any) => {
    const totalTokens = parseInt(r.input_tokens || '0') + parseInt(r.output_tokens || '0');
    return {
      ...r,
      total_tokens: totalTokens,
      total_cost: totalTokens * COST_PER_TOKEN,
    };
  });

  res.json({ data });
}));

/**
 * GET /api/costs/budgets
 * Get budget status and alerts
 *
 * NOTE: budgets table doesn't exist. Returns empty or default budgets.
 */
costsRouter.get('/budgets', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // budgets table doesn't exist - return empty array or defaults
  res.json({
    data: [],
    message: 'Budget management not yet implemented',
  });
}));

const budgetAlertSchema = z.object({
  budgetId: z.string(),
  threshold: z.number().min(0).max(100),
});

/**
 * POST /api/costs/budgets/alert
 * Update budget alert threshold
 *
 * NOTE: budgets table doesn't exist. Returns 501.
 */
costsRouter.post('/budgets/alert', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  budgetAlertSchema.parse(req.body);

  res.status(501).json({
    error: 'Budget management not yet implemented',
    message: 'Budget alerts will be available in a future release',
  });
}));
