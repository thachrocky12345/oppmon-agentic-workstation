// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * LLM API Routes
 *
 * Endpoints:
 * - POST   /api/llm/chat             - Send message to LLM
 * - GET    /api/llm/models           - List available models
 * - GET    /api/llm/providers        - List available providers
 * - GET    /api/llm/sessions         - List user's sessions
 * - GET    /api/llm/sessions/:id     - Get session with messages
 * - DELETE /api/llm/sessions/:id     - Delete a session
 * - GET    /api/llm/usage            - Get usage statistics
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';
import { LLMError, LLMProvider } from '../lib/llm/index.js';
import * as llmService from '../services/llm.js';
import { logCreate } from '../services/audit.js';
import { getAuditContext } from '../services/audit.js';

export const llmRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
});

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  provider: z.enum(['ollama', 'cerebras', 'anthropic']).optional(),
  model: z.string().optional(),
  sessionId: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(100000).optional(),
});

const listSessionsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const listModelsQuerySchema = z.object({
  provider: z.enum(['ollama', 'cerebras', 'anthropic']).optional(),
});

const usageQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ============================================================================
// Chat Endpoint
// ============================================================================

/**
 * POST /api/llm/chat
 * Send a chat completion request to an LLM provider
 */
llmRouter.post(
  '/chat',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = chatRequestSchema.parse(req.body);

    try {
      const { response, sessionId } = await llmService.chat(
        req.user.tenantId,
        req.user.id,
        {
          messages: input.messages,
          provider: input.provider as LLMProvider | undefined,
          model: input.model,
          sessionId: input.sessionId,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        }
      );

      // Audit log
      const auditCtx = getAuditContext(req);
      if (auditCtx) {
        await logCreate(auditCtx, 'llm_chat', sessionId, {
          provider: response.provider,
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        });
      }

      res.json({
        data: {
          content: response.content,
          model: response.model,
          provider: response.provider,
          usage: response.usage,
          finishReason: response.finishReason,
          sessionId,
        },
      });
    } catch (error) {
      if (error instanceof LLMError) {
        // Map LLM errors to appropriate HTTP status codes
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
          error: error.message,
          code: error.code,
          provider: error.provider,
          details: error.details,
        });
        return;
      }
      throw error;
    }
  })
);

// ============================================================================
// Model Listing
// ============================================================================

/**
 * GET /api/llm/models
 * List available models for a provider
 */
llmRouter.get(
  '/models',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = listModelsQuerySchema.parse(req.query);

    try {
      const models = await llmService.listModels(
        query.provider as LLMProvider | undefined
      );

      res.json({
        data: models,
        provider: query.provider || 'default',
      });
    } catch (error) {
      if (error instanceof LLMError) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          code: error.code,
          provider: error.provider,
        });
        return;
      }
      throw error;
    }
  })
);

/**
 * GET /api/llm/providers
 * List available LLM providers and their status
 */
llmRouter.get(
  '/providers',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const providers = llmService.listProviders();

    res.json({ data: providers });
  })
);

/**
 * GET /api/llm/status
 * Get LLM service status and default provider
 */
llmRouter.get(
  '/status',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const providers = llmService.listProviders();
    const defaultProvider = providers.find(p => p.isDefault);

    res.json({
      data: {
        defaultProvider: defaultProvider?.name || 'anthropic',
        availableProviders: providers.filter(p => p.available).map(p => p.name),
        configured: providers.some(p => p.available),
      },
    });
  })
);

// ============================================================================
// Session Management
// ============================================================================

/**
 * GET /api/llm/sessions
 * List user's chat sessions
 */
llmRouter.get(
  '/sessions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = listSessionsQuerySchema.parse(req.query);

    const { sessions, total } = await llmService.listSessions(
      req.user.tenantId,
      req.user.id,
      {
        limit: query.limit,
        offset: query.offset,
      }
    );

    res.json({
      data: sessions,
      meta: {
        total,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      },
    });
  })
);

/**
 * GET /api/llm/sessions/:id
 * Get a session with its messages
 */
llmRouter.get(
  '/sessions/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const session = await llmService.getSession(
      req.params.id,
      req.user.tenantId,
      req.user.id
    );

    if (!session) {
      throw ApiError.notFound('Session not found');
    }

    res.json({ data: session });
  })
);

/**
 * GET /api/llm/sessions/:id/messages
 * Get messages for a session
 */
llmRouter.get(
  '/sessions/:id/messages',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = listSessionsQuerySchema.parse(req.query);

    const result = await llmService.getSessionMessages(
      req.params.id,
      req.user.tenantId,
      req.user.id,
      {
        limit: query.limit,
        offset: query.offset,
      }
    );

    if (!result) {
      throw ApiError.notFound('Session not found');
    }

    res.json({
      data: result.messages,
      meta: {
        total: result.total,
        limit: query.limit ?? 100,
        offset: query.offset ?? 0,
      },
    });
  })
);

/**
 * DELETE /api/llm/sessions/:id
 * Delete a session and all its messages
 */
llmRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const deleted = await llmService.deleteSession(
      req.params.id,
      req.user.tenantId,
      req.user.id
    );

    if (!deleted) {
      throw ApiError.notFound('Session not found');
    }

    res.json({ success: true });
  })
);

// ============================================================================
// Usage Statistics
// ============================================================================

/**
 * GET /api/llm/usage
 * Get LLM usage statistics for the current user
 */
llmRouter.get(
  '/usage',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const query = usageQuerySchema.parse(req.query);

    const stats = await llmService.getUsageStats(
      req.user.tenantId,
      req.user.id,
      {
        startDate: query.startDate,
        endDate: query.endDate,
      }
    );

    res.json({ data: stats });
  })
);
