/**
 * RAG Service
 *
 * Business logic for RAG operations:
 * - Query execution with retrieval and generation
 * - Session management for multi-turn conversations
 * - Usage tracking and audit logging
 */

import { prisma } from '@arkon/database';
import { Prisma } from '@arkon/database';
import {
  executeRAG,
  retrieve,
  getRAGConfig,
  getRAGStatus,
  RAGRequest,
  RAGResponse,
  RetrievalResult,
  RAGError,
} from '../lib/rag/index.js';
import { LLMMessage, LLMProvider } from '../lib/llm/index.js';
import { EmbeddingProvider } from '../lib/embedding/index.js';

// ============================================================================
// Types
// ============================================================================

export interface RAGQueryInput {
  query: string;
  sessionId?: string;
  sourceTypes?: string[];
  sourceIds?: string[];
  topK?: number;
  threshold?: number;
  llmProvider?: LLMProvider;
  llmModel?: string;
  embeddingProvider?: EmbeddingProvider;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  includeSources?: boolean;
  includeMetadata?: boolean;
}

export interface RAGSessionInfo {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Execute a RAG query
 */
export async function query(
  tenantId: string,
  userId: string,
  input: RAGQueryInput
): Promise<RAGResponse> {
  // Load conversation history if session exists
  let history: LLMMessage[] = [];

  if (input.sessionId) {
    const sessionMessages = await getSessionHistory(tenantId, userId, input.sessionId);
    if (sessionMessages) {
      history = sessionMessages;
    }
  }

  // Execute RAG pipeline
  const response = await executeRAG(tenantId, {
    query: input.query,
    history,
    sessionId: input.sessionId,
    sourceTypes: input.sourceTypes,
    sourceIds: input.sourceIds,
    topK: input.topK,
    threshold: input.threshold,
    llmProvider: input.llmProvider,
    llmModel: input.llmModel,
    embeddingProvider: input.embeddingProvider,
    systemPrompt: input.systemPrompt,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    includeSources: input.includeSources,
    includeMetadata: input.includeMetadata,
  });

  // Store messages in session
  await storeSessionMessages(tenantId, userId, response.sessionId, input.query, response);

  return response;
}

/**
 * Execute a retrieval-only query (no LLM generation)
 */
export async function retrieveOnly(
  tenantId: string,
  input: {
    query: string;
    sourceTypes?: string[];
    sourceIds?: string[];
    topK?: number;
    threshold?: number;
    embeddingProvider?: EmbeddingProvider;
  }
): Promise<RetrievalResult> {
  return retrieve(tenantId, input.query, {
    topK: input.topK,
    threshold: input.threshold,
    sourceTypes: input.sourceTypes,
    sourceIds: input.sourceIds,
    embeddingProvider: input.embeddingProvider,
  });
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get conversation history for a session
 */
async function getSessionHistory(
  tenantId: string,
  userId: string,
  sessionId: string
): Promise<LLMMessage[] | null> {
  // Try to get from LLM sessions first
  const session = await prisma.llmSession.findFirst({
    where: {
      id: sessionId,
      tenantId,
      userId,
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 20, // Last 20 messages for context
      },
    },
  });

  if (!session) {
    return null;
  }

  return session.messages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content,
  }));
}

/**
 * Store query and response in session
 */
async function storeSessionMessages(
  tenantId: string,
  userId: string,
  sessionId: string,
  query: string,
  response: RAGResponse
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // Ensure session exists
      const session = await tx.llmSession.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          tenantId,
          userId,
          provider: response.provider,
          title: generateSessionTitle(query),
        },
        update: {
          provider: response.provider,
          updatedAt: new Date(),
        },
      });

      // Store user message
      await tx.llmMessage.create({
        data: {
          sessionId: session.id,
          provider: response.provider,
          model: response.model,
          role: 'user',
          content: query,
          inputTokens: 0,
          outputTokens: 0,
        },
      });

      // Store assistant response
      await tx.llmMessage.create({
        data: {
          sessionId: session.id,
          provider: response.provider,
          model: response.model,
          role: 'assistant',
          content: response.answer,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
      });
    });
  } catch (error) {
    // Log but don't fail the request
    console.error('[RAG] Failed to store session messages:', error);
  }
}

/**
 * Generate a session title from the first query
 */
function generateSessionTitle(query: string): string {
  const maxLength = 100;
  const cleaned = query.trim().replace(/\s+/g, ' ');

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.substring(0, maxLength - 3) + '...';
}

/**
 * List RAG sessions for a user
 */
export async function listSessions(
  tenantId: string,
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ sessions: RAGSessionInfo[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Filter to RAG sessions (those with rag_ prefix)
  const [sessions, total] = await Promise.all([
    prisma.llmSession.findMany({
      where: {
        tenantId,
        userId,
        id: { startsWith: 'rag_' },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: { select: { messages: true } },
      },
    }),
    prisma.llmSession.count({
      where: {
        tenantId,
        userId,
        id: { startsWith: 'rag_' },
      },
    }),
  ]);

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      messageCount: s._count.messages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    total,
  };
}

/**
 * Get a RAG session with messages
 */
export async function getSession(
  tenantId: string,
  userId: string,
  sessionId: string
) {
  return prisma.llmSession.findFirst({
    where: {
      id: sessionId,
      tenantId,
      userId,
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

/**
 * Delete a RAG session
 */
export async function deleteSession(
  tenantId: string,
  userId: string,
  sessionId: string
): Promise<boolean> {
  const session = await prisma.llmSession.findFirst({
    where: {
      id: sessionId,
      tenantId,
      userId,
    },
  });

  if (!session) {
    return false;
  }

  await prisma.llmSession.delete({ where: { id: sessionId } });
  return true;
}

// ============================================================================
// Status & Configuration
// ============================================================================

/**
 * Get RAG pipeline status
 */
export function getStatus() {
  return getRAGStatus();
}

/**
 * Get RAG configuration
 */
export function getConfig() {
  return getRAGConfig();
}

// ============================================================================
// Usage Statistics
// ============================================================================

/**
 * Get RAG usage statistics
 */
export async function getUsageStats(
  tenantId: string,
  userId: string,
  options: { startDate?: Date; endDate?: Date } = {}
) {
  const where: Prisma.LlmMessageWhereInput = {
    session: {
      tenantId,
      userId,
      id: { startsWith: 'rag_' },
    },
  };

  if (options.startDate || options.endDate) {
    where.createdAt = {};
    if (options.startDate) {
      where.createdAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.createdAt.lte = options.endDate;
    }
  }

  const stats = await prisma.llmMessage.groupBy({
    by: ['provider', 'model'],
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
    },
    _count: {
      id: true,
    },
  });

  // Get session count
  const sessionCount = await prisma.llmSession.count({
    where: {
      tenantId,
      userId,
      id: { startsWith: 'rag_' },
    },
  });

  return {
    sessions: sessionCount,
    byModel: stats.map((s) => ({
      provider: s.provider,
      model: s.model,
      messageCount: s._count.id,
      inputTokens: s._sum.inputTokens ?? 0,
      outputTokens: s._sum.outputTokens ?? 0,
      totalTokens: (s._sum.inputTokens ?? 0) + (s._sum.outputTokens ?? 0),
    })),
  };
}
