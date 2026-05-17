// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * RAG Chat API Routes
 *
 * Endpoints for RAG-grounded chat:
 * - POST /api/rag/chat - Get a chat response with RAG context
 * - POST /api/rag/chat/stream - Stream a chat response (SSE)
 * - GET /api/rag/collections/accessible - Get collections user can access
 * - POST /api/rag/tools/execute - Execute a tool
 * - GET /api/rag/tools - Get available tools
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requestAuth } from '../middleware/request-auth.js';
import { ragChat, streamRagChat, createRagChat, ChatMessage, ModelCredentials } from '../services/rag-chat.js';
import { getAccessibleCollections } from '../services/rag-retriever.js';
import { createToolbox } from '../services/toolbox.js';
import { query } from '../lib/db.js';
import { retrieveSecret } from '../crypto/secret-vault.js';

export const ragChatRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
});

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  collectionIds: z.array(z.string()).optional(),
  model: z.string().optional(),
  provider: z.enum(['anthropic', 'openai', 'ollama', 'cerebras']).optional(),
  webFallback: z.boolean().optional(),
  enableTools: z.boolean().optional(),
  maxTokens: z.number().min(1).max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().optional(),
});

const ToolExecuteSchema = z.object({
  toolName: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

function getAuthContext(req: AuthenticatedRequest): { tenantId: string; userId: string } {
  if (!req.tenantId || !req.userId) {
    throw new Error('Authentication required');
  }
  return { tenantId: req.tenantId, userId: req.userId };
}

async function getUserTeamIds(tenantId: string, userId: string): Promise<string[]> {
  try {
    const result = await query(
      `SELECT team_id AS "teamId" FROM team_members WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map((row: any) => row.teamId);
  } catch {
    return [];
  }
}

/**
 * Get model credentials by model identifier and provider.
 *
 * Keyless providers (e.g. Ollama running on a LAN host) legitimately have no
 * `secret_ref`. In that case we still want to surface the registered
 * `base_url` / `timeout` from `public_config` so the LLM client connects to
 * the right host instead of silently defaulting to `http://localhost:11434`.
 */
async function getModelCredentials(
  tenantId: string,
  modelIdentifier: string | undefined,
  provider: string | undefined
): Promise<ModelCredentials | undefined> {
  if (!modelIdentifier || !provider) return undefined;

  try {
    // Find model by identifier and provider using raw SQL
    const result = await query(`
      SELECT
        secret_ref AS "secretRef",
        public_config AS "publicConfig"
      FROM models
      WHERE tenant_id = $1
        AND model_identifier = $2
        AND provider_template_id = $3
        AND enabled = true
        AND deleted_at IS NULL
      LIMIT 1
    `, [tenantId, modelIdentifier, provider]);

    if (result.rows.length === 0) return undefined;

    const model = result.rows[0];
    const publicConfig = (model.publicConfig || {}) as Record<string, unknown>;

    // Only retrieve the secret if one is registered. Keyless providers like
    // Ollama may have no secret but still need `base_url` from publicConfig.
    let apiKey: string | undefined;
    if (model.secretRef) {
      const secrets = await retrieveSecret(model.secretRef);
      apiKey = secrets.api_key;
    }

    return {
      apiKey,
      baseUrl: publicConfig.base_url as string | undefined,
      timeout: publicConfig.timeout as number | undefined,
    };
  } catch (err) {
    console.error('Failed to get model credentials:', err);
    return undefined;
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/rag/chat
 * Get a chat response with RAG context
 */
ragChatRouter.post('/chat', requestAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId, userId } = getAuthContext(authReq);

    // Validate request
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
    }

    const data = parsed.data;

    // Get user's team memberships
    const teamIds = await getUserTeamIds(tenantId, userId);

    // Get model credentials if using a non-default provider
    const modelCredentials = await getModelCredentials(tenantId, data.model, data.provider);

    // Call RAG chat
    const response = await ragChat({
      tenantId,
      userId,
      teamIds,
      messages: data.messages as ChatMessage[],
      collectionIds: data.collectionIds,
      model: data.model,
      provider: data.provider,
      modelCredentials,
      webFallback: data.webFallback,
      enableTools: data.enableTools,
      maxTokens: data.maxTokens,
      temperature: data.temperature,
      systemPrompt: data.systemPrompt,
    });

    return res.json({
      data: {
        message: response.message,
        citations: response.citations,
        toolCalls: response.toolCalls,
        source: response.source,
      },
      meta: {
        usage: response.usage,
      },
    });
  } catch (error) {
    console.error('RAG chat error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Chat failed',
    });
  }
});

/**
 * POST /api/rag/chat/stream
 * Stream a chat response using Server-Sent Events
 */
ragChatRouter.post('/chat/stream', requestAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId, userId } = getAuthContext(authReq);

    // Validate request
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
    }

    const data = parsed.data;

    // Get user's team memberships
    const teamIds = await getUserTeamIds(tenantId, userId);

    // Get model credentials if using a non-default provider
    const modelCredentials = await getModelCredentials(tenantId, data.model, data.provider);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Create chat service
    const chatService = createRagChat({
      tenantId,
      userId,
      teamIds,
      messages: data.messages as ChatMessage[],
      collectionIds: data.collectionIds,
      model: data.model,
      provider: data.provider,
      modelCredentials,
      webFallback: data.webFallback,
      enableTools: data.enableTools,
      maxTokens: data.maxTokens,
      temperature: data.temperature,
      systemPrompt: data.systemPrompt,
    });

    // Stream the response
    for await (const chunk of chatService.streamChat()) {
      const sseData = JSON.stringify(chunk);
      res.write(`data: ${sseData}\n\n`);

      // Flush the response
      if (res.flush) {
        res.flush();
      }
    }

    // End the stream
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('RAG stream error:', error);

    // If headers haven't been sent, send error response
    if (!res.headersSent) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Stream failed',
      });
    }

    // Otherwise send error in SSE format
    const errorData = JSON.stringify({
      type: 'error',
      data: { message: error instanceof Error ? error.message : 'Stream failed' },
    });
    res.write(`data: ${errorData}\n\n`);
    res.end();
  }
});

/**
 * GET /api/rag/collections/accessible
 * Get collections the current user can access
 */
ragChatRouter.get('/collections/accessible', requestAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId, userId } = getAuthContext(authReq);

    // Get user's team memberships
    const teamIds = await getUserTeamIds(tenantId, userId);

    // Get accessible collections
    const collections = await getAccessibleCollections(tenantId, teamIds);

    return res.json({
      data: collections,
    });
  } catch (error) {
    console.error('Get accessible collections error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get collections',
    });
  }
});

/**
 * GET /api/rag/tools
 * Get available tools for the current user
 */
ragChatRouter.get('/tools', requestAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId, userId } = getAuthContext(authReq);

    const toolbox = createToolbox(tenantId, userId);
    const tools = toolbox.getAllTools();

    return res.json({
      data: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
        augment: tool.augment,
      })),
    });
  } catch (error) {
    console.error('Get tools error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get tools',
    });
  }
});

/**
 * POST /api/rag/tools/execute
 * Execute a tool
 */
ragChatRouter.post('/tools/execute', requestAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId, userId } = getAuthContext(authReq);

    // Validate request
    const parsed = ToolExecuteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
    }

    const { toolName, params = {} } = parsed.data;

    const toolbox = createToolbox(tenantId, userId);
    const result = await toolbox.executeTool(toolName, params);

    return res.json({
      data: {
        toolName: result.toolName,
        output: result.output,
        status: result.status,
        durationMs: result.durationMs,
      },
    });
  } catch (error) {
    console.error('Tool execute error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Tool execution failed',
    });
  }
});

/**
 * POST /api/rag/tools/discover
 * Find relevant tools for a query
 */
ragChatRouter.post('/tools/discover', requestAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId, userId } = getAuthContext(authReq);

    const { query: queryText, topK = 5 } = req.body;

    if (!queryText || typeof queryText !== 'string') {
      return res.status(400).json({
        error: 'Query is required',
      });
    }

    const toolbox = createToolbox(tenantId, userId);
    const matches = await toolbox.findRelevantTools(queryText, topK);

    return res.json({
      data: matches,
    });
  } catch (error) {
    console.error('Tool discover error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Tool discovery failed',
    });
  }
});

/**
 * GET /api/rag/tools/history
 * Get tool execution history
 */
ragChatRouter.get('/tools/history', requestAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId, userId } = getAuthContext(authReq);

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const toolbox = createToolbox(tenantId, userId);
    const history = await toolbox.getExecutionHistory(limit);

    return res.json({
      data: history,
    });
  } catch (error) {
    console.error('Tool history error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get history',
    });
  }
});
