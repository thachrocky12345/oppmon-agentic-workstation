/**
 * Memory Manager Tests
 *
 * Tests for the 8-table memory system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryManager } from './memory-manager'
import type { EmbeddingClient, Message } from './memory-types'

// Mock prisma
vi.mock('../lib/db', () => ({
  prisma: {
    conversationalMemory: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    summaryMemory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    toolLogMemory: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    personaMemory: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '../lib/db'

// Mock embedding client
const mockEmbeddingClient: EmbeddingClient = {
  embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  embedBatch: vi.fn().mockResolvedValue([new Array(1024).fill(0.1)]),
}

describe('MemoryManager', () => {
  let manager: MemoryManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new MemoryManager({
      databaseUrl: 'postgresql://test',
      embeddingClient: mockEmbeddingClient,
      maxCacheSize: 10,
    })
  })

  describe('prefetchAll', () => {
    it('returns all memory types', async () => {
      const mockMessages: Message[] = [
        { role: 'USER', content: 'Hello' },
        { role: 'ASSISTANT', content: 'Hi there!' },
      ]

      vi.mocked(prisma.conversationalMemory.findMany).mockResolvedValue(
        mockMessages.map((m, i) => ({
          id: `msg-${i}`,
          tenantId: 'tenant1',
          threadId: 'thread1',
          role: m.role,
          content: m.content,
          metadata: {},
          createdAt: new Date(),
        }))
      )

      vi.mocked(prisma.summaryMemory.findMany).mockResolvedValue([])
      vi.mocked(prisma.$queryRaw).mockResolvedValue([])

      const result = await manager.prefetchAll('tenant1', 'thread1', 'test query')

      expect(result).toHaveProperty('conversational')
      expect(result).toHaveProperty('semantic')
      expect(result).toHaveProperty('workflow')
      expect(result).toHaveProperty('entity')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('scores')
      expect(result.conversational).toHaveLength(2)
    })
  })

  describe('syncAll', () => {
    it('writes conversational and workflow memory', async () => {
      const messages: Message[] = [
        { role: 'USER', content: 'Test message' },
        { role: 'ASSISTANT', content: 'Test response' },
      ]

      vi.mocked(prisma.conversationalMemory.create).mockImplementation(
        async (args) => ({
          id: 'new-id',
          tenantId: args.data.tenantId as string,
          threadId: args.data.threadId as string,
          role: args.data.role as string,
          content: args.data.content as string,
          metadata: {},
          createdAt: new Date(),
        })
      )

      await manager.syncAll('tenant1', 'thread1', messages)

      expect(prisma.conversationalMemory.create).toHaveBeenCalledTimes(2)
    })
  })

  describe('conversational memory', () => {
    it('respects thread isolation', async () => {
      vi.mocked(prisma.conversationalMemory.findMany).mockResolvedValue([
        {
          id: 'msg-1',
          tenantId: 'tenant1',
          threadId: 'thread-A',
          role: 'USER',
          content: 'Thread A message',
          metadata: {},
          createdAt: new Date(),
        },
      ])

      const result = await manager.readConversationalMemory(
        'tenant1',
        'thread-A'
      )

      expect(prisma.conversationalMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant1', threadId: 'thread-A' },
        })
      )
      expect(result[0].content).toBe('Thread A message')
    })
  })

  describe('semantic memory (knowledge base)', () => {
    it('returns relevant docs with cosine similarity', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: 'doc-1',
          content: 'Relevant document',
          metadata: {},
          similarity: 0.95,
        },
        {
          id: 'doc-2',
          content: 'Less relevant',
          metadata: {},
          similarity: 0.7,
        },
      ])

      const result = await manager.readKnowledgeBase('tenant1', 'search query', 5)

      expect(result).toHaveLength(2)
      expect(result[0].score).toBe(0.95)
      expect(result[1].score).toBe(0.7)
      expect(mockEmbeddingClient.embed).toHaveBeenCalledWith('search query')
    })
  })

  describe('semantic cache', () => {
    it('prevents redundant queries', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { id: 'doc-1', content: 'Cached doc', metadata: {}, similarity: 0.9 },
      ])

      // First query - hits database
      await manager.readKnowledgeBase('tenant1', 'cached query', 5)

      // Second identical query - should use cache
      await manager.readKnowledgeBase('tenant1', 'cached query', 5)

      // Database should only be called once
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    })
  })

  describe('context management', () => {
    it('triggers summarization at 80%', async () => {
      // Mock long conversation
      const longMessages = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `msg-${i}`,
          tenantId: 'tenant1',
          threadId: 'thread1',
          role: 'USER',
          content: 'A'.repeat(5000), // ~1250 tokens each
          metadata: {},
          createdAt: new Date(),
        }))

      vi.mocked(prisma.conversationalMemory.findMany).mockResolvedValue(
        longMessages
      )

      const usage = await manager.calculateContextUsage(
        'tenant1',
        'thread1',
        128000
      )

      // 100 messages * ~1250 tokens = ~125000 tokens > 80% of 128000
      expect(usage.shouldSummarize).toBe(true)
      expect(usage.usagePercent).toBeGreaterThan(0.8)
    })
  })

  describe('tool log memory', () => {
    it('logs tool execution with timing', async () => {
      vi.mocked(prisma.toolLogMemory.create).mockResolvedValue({
        id: 'log-1',
        tenantId: 'tenant1',
        threadId: 'thread1',
        toolName: 'search_skills',
        input: { query: 'test' },
        output: { results: [] },
        status: 'SUCCESS',
        durationMs: 150,
        createdAt: new Date(),
      })

      await manager.writeToolLog({
        tenantId: 'tenant1',
        threadId: 'thread1',
        toolName: 'search_skills',
        input: { query: 'test' },
        output: { results: [] },
        status: 'SUCCESS',
        durationMs: 150,
      })

      expect(prisma.toolLogMemory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          toolName: 'search_skills',
          durationMs: 150,
          status: 'SUCCESS',
        }),
      })
    })
  })

  describe('retrieval scores', () => {
    it('calculates NDCG correctly', async () => {
      vi.mocked(prisma.conversationalMemory.findMany).mockResolvedValue([])
      vi.mocked(prisma.summaryMemory.findMany).mockResolvedValue([])
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { id: 'doc-1', content: 'Best', metadata: {}, similarity: 0.95 },
        { id: 'doc-2', content: 'Good', metadata: {}, similarity: 0.85 },
        { id: 'doc-3', content: 'OK', metadata: {}, similarity: 0.7 },
      ])

      const result = await manager.prefetchAll('tenant1', 'thread1', 'query')

      // NDCG should be 1.0 when results are already in ideal order
      expect(result.scores.ndcg).toBeCloseTo(1.0, 1)
    })

    it('calculates MRR correctly', async () => {
      vi.mocked(prisma.conversationalMemory.findMany).mockResolvedValue([])
      vi.mocked(prisma.summaryMemory.findMany).mockResolvedValue([])
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { id: 'doc-1', content: 'Irrelevant', metadata: {}, similarity: 0.3 },
        { id: 'doc-2', content: 'Relevant', metadata: {}, similarity: 0.8 },
      ])

      const result = await manager.prefetchAll('tenant1', 'thread1', 'query')

      // First relevant (>0.5) is at index 1, so MRR = 1/2 = 0.5
      expect(result.scores.mrr).toBe(0.5)
    })
  })
})
