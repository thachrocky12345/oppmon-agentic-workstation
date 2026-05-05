/**
 * LLM Service
 *
 * Business logic for LLM operations:
 * - Chat completion across providers
 * - Session management
 * - Usage tracking and audit logging
 */

import { prisma } from '@arkon/database';
import { createId } from '@paralleldrive/cuid2';
import {
  createLLMClient,
  getDefaultProvider,
  isValidProvider,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMError,
} from '../lib/llm/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ChatInput {
  messages: LLMMessage[];
  provider?: LLMProvider;
  model?: string;
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  response: LLMResponse;
  sessionId: string;
}

export interface SessionInfo {
  id: string;
  title: string | null;
  provider: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Chat Service
// ============================================================================

/**
 * Send a chat completion request
 * Creates or updates a session and logs messages
 */
export async function chat(
  tenantId: string,
  userId: string,
  input: ChatInput
): Promise<ChatResult> {
  const provider = input.provider || getDefaultProvider();

  if (!isValidProvider(provider)) {
    throw new Error(`Invalid LLM provider: ${provider}`);
  }

  const client = createLLMClient(provider);

  // Call the LLM
  const response = await client.chat({
    messages: input.messages,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });

  // Create or update session
  let sessionId = input.sessionId;

  if (sessionId) {
    // Verify session exists and belongs to user
    const existingSession = await prisma.llmSession.findFirst({
      where: {
        id: sessionId,
        tenantId,
        userId,
      },
    });

    if (!existingSession) {
      // Session not found, create new one
      sessionId = undefined;
    }
  }

  // Use transaction to ensure consistency
  const result = await prisma.$transaction(async (tx) => {
    // Create session if needed
    if (!sessionId) {
      const newSession = await tx.llmSession.create({
        data: {
          tenantId,
          userId,
          provider,
          title: generateSessionTitle(input.messages),
        },
      });
      sessionId = newSession.id;
    } else {
      // Update existing session
      await tx.llmSession.update({
        where: { id: sessionId },
        data: {
          provider,
          updatedAt: new Date(),
        },
      });
    }

    // Log user messages
    const userMessages = input.messages.filter(
      (m) => m.role === 'user' || m.role === 'system'
    );

    for (const msg of userMessages) {
      await tx.llmMessage.create({
        data: {
          sessionId: sessionId!,
          provider,
          model: response.model,
          role: msg.role,
          content: msg.content,
          inputTokens: 0,
          outputTokens: 0,
        },
      });
    }

    // Log assistant response
    await tx.llmMessage.create({
      data: {
        sessionId: sessionId!,
        provider,
        model: response.model,
        role: 'assistant',
        content: response.content,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    });

    return { sessionId: sessionId! };
  });

  return {
    response,
    sessionId: result.sessionId,
  };
}

/**
 * Generate a session title from the first user message
 */
function generateSessionTitle(messages: LLMMessage[]): string | null {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (!firstUserMessage) return null;

  // Truncate to 100 chars
  const content = firstUserMessage.content.trim();
  if (content.length <= 100) return content;

  return content.substring(0, 97) + '...';
}

// ============================================================================
// Model Listing
// ============================================================================

/**
 * List available models for a provider
 */
export async function listModels(provider?: LLMProvider): Promise<string[]> {
  const p = provider || getDefaultProvider();

  if (!isValidProvider(p)) {
    throw new Error(`Invalid LLM provider: ${p}`);
  }

  const client = createLLMClient(p);
  return client.listModels();
}

/**
 * List all available providers with their status
 */
export function listProviders(): Array<{
  id: LLMProvider;
  name: string;
  available: boolean;
  isDefault: boolean;
}> {
  const defaultProvider = getDefaultProvider();

  return [
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      available: true, // Always available, may not be running
      isDefault: defaultProvider === 'ollama',
    },
    {
      id: 'cerebras',
      name: 'Cerebras',
      available: !!process.env.CEREBRAS_API_KEY,
      isDefault: defaultProvider === 'cerebras',
    },
    {
      id: 'anthropic',
      name: 'Anthropic (Claude)',
      available: !!process.env.ANTHROPIC_API_KEY,
      isDefault: defaultProvider === 'anthropic',
    },
  ];
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * List sessions for a user
 */
export async function listSessions(
  tenantId: string,
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ sessions: SessionInfo[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [sessions, total] = await Promise.all([
    prisma.llmSession.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: { messages: true },
        },
      },
    }),
    prisma.llmSession.count({ where: { tenantId, userId } }),
  ]);

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      provider: s.provider,
      messageCount: s._count.messages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    total,
  };
}

/**
 * Get a single session with messages
 */
export async function getSession(
  sessionId: string,
  tenantId: string,
  userId: string
) {
  const session = await prisma.llmSession.findFirst({
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

  return session;
}

/**
 * Get messages for a session
 */
export async function getSessionMessages(
  sessionId: string,
  tenantId: string,
  userId: string,
  options: { limit?: number; offset?: number } = {}
) {
  // First verify session belongs to user
  const session = await prisma.llmSession.findFirst({
    where: {
      id: sessionId,
      tenantId,
      userId,
    },
    select: { id: true },
  });

  if (!session) {
    return null;
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const [messages, total] = await Promise.all([
    prisma.llmMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.llmMessage.count({ where: { sessionId } }),
  ]);

  return { messages, total };
}

/**
 * Delete a session and all its messages
 */
export async function deleteSession(
  sessionId: string,
  tenantId: string,
  userId: string
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

  await prisma.llmSession.delete({
    where: { id: sessionId },
  });

  return true;
}

// ============================================================================
// Usage Statistics
// ============================================================================

/**
 * Get usage statistics for a user
 */
export async function getUsageStats(
  tenantId: string,
  userId: string,
  options: { startDate?: Date; endDate?: Date } = {}
) {
  const where: Record<string, unknown> = {
    session: {
      tenantId,
      userId,
    },
  };

  if (options.startDate || options.endDate) {
    where.createdAt = {};
    if (options.startDate) {
      (where.createdAt as Record<string, unknown>).gte = options.startDate;
    }
    if (options.endDate) {
      (where.createdAt as Record<string, unknown>).lte = options.endDate;
    }
  }

  const stats = await prisma.llmMessage.groupBy({
    by: ['provider'],
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
    },
    _count: {
      id: true,
    },
  });

  return stats.map((s) => ({
    provider: s.provider,
    messageCount: s._count.id,
    inputTokens: s._sum.inputTokens ?? 0,
    outputTokens: s._sum.outputTokens ?? 0,
    totalTokens: (s._sum.inputTokens ?? 0) + (s._sum.outputTokens ?? 0),
  }));
}
