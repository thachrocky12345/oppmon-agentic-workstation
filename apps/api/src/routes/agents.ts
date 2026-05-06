import { Router, Response } from 'express';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import { query, transaction } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import {
  embedAgent,
  deleteAgentEmbedding,
} from '../services/embedding-hooks.js';

export const agentsRouter = Router();

// Framework enum values (must match Prisma AgentFramework enum)
const FRAMEWORK_MAP = {
  openai: 'OPENAI',
  anthropic: 'ANTHROPIC',
  langchain: 'LANGCHAIN',
  custom: 'CUSTOM',
} as const;

// Validation schemas
const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  framework: z.enum(['openai', 'anthropic', 'langchain', 'custom']),
  config: z.record(z.unknown()).optional(),
});

const updateAgentSchema = createAgentSchema.partial();

/**
 * GET /api/agents
 * List all agents for the current tenant
 */
agentsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { limit = 50, offset = 0, status } = req.query;

  let whereClause = 'WHERE tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (status) {
    params.push(String(status).toUpperCase());
    whereClause += ` AND status = $${params.length}`;
  }

  const result = await query(
    `SELECT id, name, description, framework, status, config, created_at, updated_at
     FROM agents
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM agents ${whereClause}`,
    params,
  );

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * GET /api/agents/:id
 * Get a specific agent
 */
agentsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(
    `SELECT id, name, description, framework, status, config, created_at, updated_at
     FROM agents
     WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId],
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/agents
 * Create a new agent
 */
agentsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createAgentSchema.parse(req.body);
  const frameworkValue = FRAMEWORK_MAP[data.framework];

  const result = await query(
    `INSERT INTO agents (name, description, framework, config, tenant_id, status)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
     RETURNING id, name, description, framework, status, config, created_at`,
    [data.name, data.description || null, frameworkValue, data.config || {}, req.tenantId],
  );

  const agent = result.rows[0];

  // Trigger auto-embedding (non-blocking)
  embedAgent(req.tenantId!, {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    framework: agent.framework,
    status: agent.status,
    config: agent.config,
  });

  res.status(201).json(agent);
}));

/**
 * PUT /api/agents/:id
 * Update an agent
 */
agentsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = updateAgentSchema.parse(req.body);

  // Build dynamic update query
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.framework !== undefined) {
    updates.push(`framework = $${paramIndex++}`);
    values.push(FRAMEWORK_MAP[data.framework]);
  }
  if (data.config !== undefined) {
    updates.push(`config = $${paramIndex++}`);
    values.push(data.config);
  }

  if (updates.length === 0) {
    throw ApiError.badRequest('No fields to update');
  }

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id, req.tenantId);

  const result = await query(
    `UPDATE agents SET ${updates.join(', ')}
     WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
     RETURNING id, name, description, framework, status, config, created_at, updated_at`,
    values,
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  const agent = result.rows[0];

  // Trigger auto-embedding (non-blocking)
  embedAgent(req.tenantId!, {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    framework: agent.framework,
    status: agent.status,
    config: agent.config,
  });

  res.json(agent);
}));

/**
 * DELETE /api/agents/:id
 * Delete an agent (soft delete)
 */
agentsRouter.delete('/:id', requireRole('TENANT_ADMIN', 'TEAM_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(
    `UPDATE agents SET status = 'INACTIVE', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [req.params.id, req.tenantId],
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  // Delete embedding (non-blocking)
  deleteAgentEmbedding(req.tenantId!, req.params.id);

  res.status(204).send();
}));

/**
 * POST /api/agents/register
 * Register a new agent from external source
 */
agentsRouter.post('/register', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createAgentSchema.parse(req.body);
  const frameworkValue = FRAMEWORK_MAP[data.framework];

  const result = await transaction(async (client) => {
    // Check if agent with same name exists
    const existing = await client.query(
      'SELECT id FROM agents WHERE name = $1 AND tenant_id = $2',
      [data.name, req.tenantId],
    );

    if (existing.rows.length > 0) {
      // Update existing agent
      const updateResult = await client.query(
        `UPDATE agents SET
           description = COALESCE($1, description),
           framework = $2,
           config = $3,
           status = 'ACTIVE',
           updated_at = NOW()
         WHERE id = $4
         RETURNING id, name, description, framework, status, config`,
        [data.description, frameworkValue, data.config || {}, existing.rows[0].id],
      );
      return { ...updateResult.rows[0], isNew: false };
    }

    // Create new agent
    const insertResult = await client.query(
      `INSERT INTO agents (name, description, framework, config, tenant_id, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id, name, description, framework, status, config`,
      [data.name, data.description || null, frameworkValue, data.config || {}, req.tenantId],
    );
    return { ...insertResult.rows[0], isNew: true };
  });

  // Trigger auto-embedding (non-blocking)
  embedAgent(req.tenantId!, {
    id: result.id,
    name: result.name,
    description: result.description,
    framework: result.framework,
    status: result.status,
    config: result.config,
  });

  res.status(result.isNew ? 201 : 200).json(result);
}));

// ============================================================================
// Tool Calls Endpoints
// ============================================================================

const createToolCallSchema = z.object({
  toolName: z.string().min(1),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  status: z.enum(['pending', 'completed', 'error']).optional(),
  durationMs: z.number().int().positive().optional(),
  sessionKey: z.string().optional(),
  errorMsg: z.string().optional(),
});

/**
 * GET /api/agents/:agentId/tool-calls
 * List tool calls for an agent
 */
agentsRouter.get('/:agentId/tool-calls', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const { limit = 50, offset = 0, status, toolName } = req.query;

  // Verify agent belongs to tenant
  const agentResult = await query(
    'SELECT id FROM agents WHERE id = $1 AND tenant_id = $2',
    [agentId, req.tenantId],
  );
  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  let whereClause = 'WHERE agent_id = $1';
  const params: unknown[] = [agentId];

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }
  if (toolName) {
    params.push(toolName);
    whereClause += ` AND tool_name = $${params.length}`;
  }

  const result = await query(
    `SELECT id, agent_id, tool_name, input, output, status, duration_ms, session_key, error_msg, created_at
     FROM tool_calls
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM tool_calls ${whereClause}`,
    params,
  );

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * POST /api/agents/:agentId/tool-calls
 * Record a new tool call
 */
agentsRouter.post('/:agentId/tool-calls', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const data = createToolCallSchema.parse(req.body);

  // Verify agent belongs to tenant
  const agentResult = await query(
    'SELECT id FROM agents WHERE id = $1 AND tenant_id = $2',
    [agentId, req.tenantId],
  );
  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  const result = await query(
    `INSERT INTO tool_calls (id, agent_id, tool_name, input, output, status, duration_ms, session_key, error_msg)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, agent_id, tool_name, input, output, status, duration_ms, session_key, error_msg, created_at`,
    [
      createId(),
      agentId,
      data.toolName,
      data.input || {},
      data.output || {},
      data.status || 'completed',
      data.durationMs || null,
      data.sessionKey || null,
      data.errorMsg || null,
    ],
  );

  res.status(201).json(result.rows[0]);
}));

// ============================================================================
// Events Endpoints
// ============================================================================

const createEventSchema = z.object({
  eventType: z.string().min(1),
  direction: z.enum(['inbound', 'outbound']).optional(),
  sessionKey: z.string().optional(),
  channelId: z.string().optional(),
  sender: z.string().optional(),
  content: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  threatLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']).optional(),
});

/**
 * GET /api/agents/:agentId/events
 * List events for an agent
 */
agentsRouter.get('/:agentId/events', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const { limit = 50, offset = 0, eventType, severity } = req.query;

  // Verify agent belongs to tenant
  const agentResult = await query(
    'SELECT id FROM agents WHERE id = $1 AND tenant_id = $2',
    [agentId, req.tenantId],
  );
  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  let whereClause = 'WHERE agent_id = $1';
  const params: unknown[] = [agentId];

  if (eventType) {
    params.push(eventType);
    whereClause += ` AND event_type = $${params.length}`;
  }
  if (severity) {
    params.push(severity);
    whereClause += ` AND severity = $${params.length}`;
  }

  const result = await query(
    `SELECT id, agent_id, event_type, direction, session_key, channel_id, sender, content,
            payload, severity, input_tokens, output_tokens, threat_level, timestamp, created_at
     FROM events
     ${whereClause}
     ORDER BY timestamp DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM events ${whereClause}`,
    params,
  );

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * POST /api/agents/:agentId/events
 * Record a new event
 */
agentsRouter.post('/:agentId/events', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const data = createEventSchema.parse(req.body);

  // Verify agent belongs to tenant
  const agentResult = await query(
    'SELECT id FROM agents WHERE id = $1 AND tenant_id = $2',
    [agentId, req.tenantId],
  );
  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  const result = await query(
    `INSERT INTO events (id, agent_id, event_type, direction, session_key, channel_id, sender, content,
                         payload, severity, input_tokens, output_tokens, threat_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, agent_id, event_type, direction, session_key, channel_id, sender, content,
               payload, severity, input_tokens, output_tokens, threat_level, timestamp, created_at`,
    [
      createId(),
      agentId,
      data.eventType,
      data.direction || null,
      data.sessionKey || null,
      data.channelId || null,
      data.sender || null,
      data.content || null,
      data.payload || {},
      data.severity || 'info',
      data.inputTokens || null,
      data.outputTokens || null,
      data.threatLevel || 'none',
    ],
  );

  res.status(201).json(result.rows[0]);
}));

// ============================================================================
// Daily Stats Endpoints
// ============================================================================

/**
 * GET /api/agents/:agentId/stats
 * Get aggregated daily stats for an agent
 */
agentsRouter.get('/:agentId/stats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const { days = 30 } = req.query;

  // Verify agent belongs to tenant
  const agentResult = await query(
    'SELECT id FROM agents WHERE id = $1 AND tenant_id = $2',
    [agentId, req.tenantId],
  );
  if (agentResult.rows.length === 0) {
    throw ApiError.notFound('Agent not found');
  }

  const result = await query(
    `SELECT day, messages_received, messages_sent, tool_calls, errors,
            input_tokens, output_tokens, estimated_cost_usd
     FROM daily_stats
     WHERE agent_id = $1 AND day >= CURRENT_DATE - $2::int
     ORDER BY day DESC`,
    [agentId, days],
  );

  // Calculate totals
  const totals = result.rows.reduce((acc, row) => ({
    messagesReceived: acc.messagesReceived + row.messages_received,
    messagesSent: acc.messagesSent + row.messages_sent,
    toolCalls: acc.toolCalls + row.tool_calls,
    errors: acc.errors + row.errors,
    inputTokens: acc.inputTokens + row.input_tokens,
    outputTokens: acc.outputTokens + row.output_tokens,
    estimatedCostUsd: acc.estimatedCostUsd + parseFloat(row.estimated_cost_usd || 0),
  }), {
    messagesReceived: 0,
    messagesSent: 0,
    toolCalls: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  });

  res.json({
    daily: result.rows,
    totals,
    period: Number(days),
  });
}));
