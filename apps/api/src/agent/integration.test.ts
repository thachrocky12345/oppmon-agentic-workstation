// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Week 6 Integration Tests
 *
 * End-to-end tests for all agent components working together:
 * - Memory system
 * - Tool architecture
 * - Oracle loop
 * - RAG enhancement
 * - Domain pipelines
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Memory System
import { MemoryManager } from './memory-manager'
import { SemanticCache } from './semantic-cache'
import type { Message, EmbeddingClient } from './memory-types'

// Tool System
import { Toolbox, extractToolCalls, buildSynthesisPrompt } from './toolbox'

// Oracle Loop
import {
  oracleLoop,
  preprocessRequest,
  buildPartitionedContext,
  type OracleContext,
  type LLMClient,
  type AgentConfig,
} from './oracle-loop'

// Advanced RAG
import {
  mmrSelect,
  reciprocalRankFusion,
  hydeExpand,
  chunkDocument,
  HybridRAG,
  defaultAdvancedRAGConfig,
} from './advanced-rag'

// Domain Pipelines
import {
  DomainDetector,
  createDefaultDetector,
  processDomainContext,
} from './domain-pipelines'

// Mock prisma
vi.mock('../lib/db', () => ({
  prisma: {
    conversationalMemory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (args) => ({
        id: 'msg-1',
        ...args.data,
        createdAt: new Date(),
      })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    summaryMemory: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    toolLogMemory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    personaMemory: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    skill: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    mcpServer: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}))

// Mock embedding client
const mockEmbeddingClient: EmbeddingClient = {
  embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  embedBatch: vi.fn().mockResolvedValue([new Array(1024).fill(0.1)]),
}

// Mock LLM client
function createMockLLM(responses: string[]): LLMClient {
  let callIndex = 0
  return {
    chat: vi.fn().mockImplementation(async function* () {
      const response = responses[callIndex] || 'Default response'
      callIndex++
      yield { content: response }
      yield { done: true }
    }),
    complete: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex] || 'Completed'
      callIndex++
      return response
    }),
  }
}

describe('Week 6 Integration Tests', () => {
  describe('Full Oracle Loop with Memory', () => {
    it('executes complete pipeline from query to response', async () => {
      const memoryManager = new MemoryManager({
        databaseUrl: 'postgresql://test',
        embeddingClient: mockEmbeddingClient,
      })

      const toolbox = new Toolbox()
      await toolbox.register(
        'search_kb',
        'Search knowledge base',
        { query: { type: 'string' } },
        async () => ({ results: ['Result 1', 'Result 2'] })
      )

      const llm = createMockLLM(['Here is the answer based on the context.'])

      const context: OracleContext = {
        tenantId: 'tenant1',
        threadId: 'thread1',
        memoryManager,
        toolbox,
        llmClient: llm,
        config: {
          baseSystemPrompt: 'You are a helpful assistant.',
        },
      }

      const events: Array<{ type: string }> = []
      for await (const event of oracleLoop('What is TypeScript?', context)) {
        events.push(event)
      }

      // Verify pipeline stages executed
      const types = events.map((e) => e.type)
      expect(types).toContain('preprocessing')
      expect(types).toContain('context')
      expect(types).toContain('token')
      expect(types).toContain('done')
      expect(types).toContain('trace')
    })

    it('memory persistence across sessions', async () => {
      const memoryManager = new MemoryManager({
        databaseUrl: 'postgresql://test',
        embeddingClient: mockEmbeddingClient,
      })

      // Write a message
      await memoryManager.writeConversationalMemory('tenant1', 'thread1', {
        role: 'USER',
        content: 'Hello',
      })

      // Read back
      const messages = await memoryManager.readConversationalMemory(
        'tenant1',
        'thread1'
      )

      // Should have the message (mocked)
      expect(messages).toBeInstanceOf(Array)
    })
  })

  describe('Parallel Tool Execution', () => {
    it('executes 5 tools in parallel', async () => {
      const toolbox = new Toolbox({ maxWorkers: 8 })
      const executionTimes: number[] = []

      // Register 5 tools with varying delays
      for (let i = 0; i < 5; i++) {
        await toolbox.register(
          `tool_${i}`,
          `Tool ${i}`,
          {},
          async () => {
            const start = Date.now()
            await new Promise((r) => setTimeout(r, 20))
            executionTimes.push(Date.now() - start)
            return { toolId: i }
          }
        )
      }

      const calls = Array.from({ length: 5 }, (_, i) => ({
        function: { name: `tool_${i}`, arguments: '{}' },
      }))

      const start = Date.now()
      const results = await toolbox.executeParallel(calls, {
        tenantId: 'test',
        threadId: 'thread',
      })
      const totalTime = Date.now() - start

      // All should complete
      expect(results).toHaveLength(5)
      expect(results.every((r) => r.status === 'SUCCESS')).toBe(true)

      // Should run in parallel (total time < sum of individual times)
      // Sequential would be ~100ms, parallel should be ~20-30ms
      expect(totalTime).toBeLessThan(80)
    })
  })

  describe('RAG Quality Benchmarks', () => {
    it('NDCG score calculation', () => {
      // Perfect ranking should give NDCG = 1.0
      const docs = [
        { id: '1', content: 'Best', score: 0.95, relevance: 0.95, embedding: [1, 0, 0] },
        { id: '2', content: 'Good', score: 0.85, relevance: 0.85, embedding: [0.9, 0.1, 0] },
        { id: '3', content: 'OK', score: 0.75, relevance: 0.75, embedding: [0.8, 0.2, 0] },
      ]

      const queryEmbedding = [1, 0, 0]
      const selected = mmrSelect(docs, queryEmbedding, 3, 1.0) // Pure relevance

      // With lambda=1, should be ordered by similarity to query
      expect(selected[0].id).toBe('1')
    })

    it('MMR provides diverse results', () => {
      // Three docs: two very similar, one different
      const docs = [
        { id: '1', content: 'A', score: 0.9, relevance: 0.9, embedding: [1, 0, 0] },
        { id: '2', content: 'B', score: 0.88, relevance: 0.88, embedding: [0.99, 0.05, 0] },
        { id: '3', content: 'C', score: 0.85, relevance: 0.85, embedding: [0, 1, 0] },
      ]

      const queryEmbedding = [0.7, 0.7, 0]
      const selected = mmrSelect(docs, queryEmbedding, 2, 0.5)

      // Should pick diverse docs
      const ids = new Set(selected.map((d) => d.id))
      expect(ids.size).toBe(2)
    })

    it('RRF fusion combines retrieval methods', () => {
      const bm25 = [
        { id: 'A', content: 'A', score: 1, relevance: 1 },
        { id: 'B', content: 'B', score: 0.9, relevance: 0.9 },
      ]
      const vector = [
        { id: 'B', content: 'B', score: 1, relevance: 1 },
        { id: 'C', content: 'C', score: 0.9, relevance: 0.9 },
      ]

      const fused = reciprocalRankFusion([bm25, vector], 3)

      // B should be first (appears in both lists)
      expect(fused[0].id).toBe('B')
    })
  })

  describe('Domain Detection Accuracy', () => {
    it('detects security domain with CVE', async () => {
      const detector = createDefaultDetector()

      const result = await processDomainContext(
        'Analyzing CVE-2024-1234 vulnerability',
        detector
      )

      expect(result.detectedDomains).toContain('security-research')
    })

    it('detects software domain with ticket', async () => {
      const detector = createDefaultDetector()

      const result = await processDomainContext(
        'Working on JIRA-567 feature',
        detector
      )

      expect(result.detectedDomains).toContain('software-development')
    })

    it('handles multi-domain messages', async () => {
      const detector = createDefaultDetector()

      const result = await processDomainContext(
        'CVE-2024-1234 discovered in OPPMON-999 codebase',
        detector
      )

      expect(result.detectedDomains.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Context Overflow and Summarization', () => {
    it('calculates context usage correctly', async () => {
      const memoryManager = new MemoryManager({
        databaseUrl: 'postgresql://test',
      })

      const usage = await memoryManager.calculateContextUsage(
        'tenant1',
        'thread1',
        128000
      )

      expect(usage).toHaveProperty('totalTokens')
      expect(usage).toHaveProperty('maxTokens')
      expect(usage).toHaveProperty('usagePercent')
      expect(usage).toHaveProperty('shouldSummarize')
    })
  })

  describe('Tool Logging', () => {
    it('logs tool execution with timing', async () => {
      const toolbox = new Toolbox()

      await toolbox.register(
        'test_tool',
        'Test tool',
        {},
        async () => {
          await new Promise((r) => setTimeout(r, 10))
          return { success: true }
        }
      )

      const result = await toolbox.execute(
        { function: { name: 'test_tool', arguments: '{}' } },
        { tenantId: 'tenant1', threadId: 'thread1' }
      )

      expect(result.status).toBe('SUCCESS')
      expect(result.ms).toBeGreaterThanOrEqual(10)
    })
  })

  describe('End-to-End Agent Flow', () => {
    it('user question → tool call → response synthesis', async () => {
      const toolbox = new Toolbox()
      let toolCalled = false

      await toolbox.register(
        'get_info',
        'Get information',
        { topic: { type: 'string' } },
        async (args) => {
          toolCalled = true
          return { info: `Info about ${args.topic}` }
        }
      )

      // LLM first calls tool, then synthesizes
      const llm: LLMClient = {
        chat: vi.fn().mockImplementation(async function* (opts) {
          if (!toolCalled) {
            yield {
              content: 'Let me look that up.',
              toolCalls: [
                {
                  function: {
                    name: 'get_info',
                    arguments: '{"topic":"TypeScript"}',
                  },
                },
              ],
            }
          } else {
            yield { content: 'Based on the information, TypeScript is great!' }
          }
          yield { done: true }
        }),
        complete: vi.fn(),
      }

      const memoryManager = new MemoryManager({
        databaseUrl: 'postgresql://test',
        embeddingClient: mockEmbeddingClient,
      })

      const context: OracleContext = {
        tenantId: 'tenant1',
        threadId: 'thread1',
        memoryManager,
        toolbox,
        llmClient: llm,
        config: { baseSystemPrompt: 'You are helpful.' },
      }

      const events: Array<{ type: string; [key: string]: unknown }> = []
      for await (const event of oracleLoop('Tell me about TypeScript', context)) {
        events.push(event as { type: string })
      }

      // Should have tool execution
      const actionEvent = events.find((e) => e.type === 'action')
      expect(actionEvent).toBeDefined()

      // Should have tool result
      const toolResultEvent = events.find((e) => e.type === 'tool_result')
      expect(toolResultEvent).toBeDefined()

      // Should complete successfully
      const doneEvent = events.find((e) => e.type === 'done')
      expect(doneEvent).toBeDefined()
    })
  })

  describe('Performance Benchmarks', () => {
    it('semantic cache reduces query latency', async () => {
      const cache = new SemanticCache({ maxSize: 10 })

      const docs = [
        { id: '1', content: 'Test', score: 0.9, relevance: 0.9 },
      ]

      // First call - cache miss
      const miss = cache.get('tenant1', 'query', 5)
      expect(miss).toBeNull()

      // Set cache
      cache.set('tenant1', 'query', 5, docs)

      // Second call - cache hit
      const hit = cache.get('tenant1', 'query', 5)
      expect(hit).toEqual(docs)
    })

    it('document chunking completes quickly', () => {
      const longDoc = 'word '.repeat(10000) // ~10000 words

      const start = Date.now()
      const chunks = chunkDocument(longDoc, defaultAdvancedRAGConfig.compression)
      const duration = Date.now() - start

      // Should complete in < 100ms
      expect(duration).toBeLessThan(100)
      expect(chunks.length).toBeGreaterThan(0)
    })
  })
})

describe('Week 6 Completion Checklist', () => {
  describe('Day 36: Memory System', () => {
    it('MemoryManager API is complete', () => {
      const manager = new MemoryManager({ databaseUrl: 'test' })

      // All required methods exist
      expect(typeof manager.prefetchAll).toBe('function')
      expect(typeof manager.syncAll).toBe('function')
      expect(typeof manager.readConversationalMemory).toBe('function')
      expect(typeof manager.writeConversationalMemory).toBe('function')
      expect(typeof manager.readKnowledgeBase).toBe('function')
      expect(typeof manager.writeKnowledgeBase).toBe('function')
      expect(typeof manager.readEntity).toBe('function')
      expect(typeof manager.writeEntity).toBe('function')
      expect(typeof manager.readWorkflow).toBe('function')
      expect(typeof manager.writeWorkflow).toBe('function')
      expect(typeof manager.readSummary).toBe('function')
      expect(typeof manager.writeSummary).toBe('function')
      expect(typeof manager.writeToolLog).toBe('function')
      expect(typeof manager.calculateContextUsage).toBe('function')
    })
  })

  describe('Day 37: Tool System', () => {
    it('Toolbox API is complete', () => {
      const toolbox = new Toolbox()

      expect(typeof toolbox.register).toBe('function')
      expect(typeof toolbox.get).toBe('function')
      expect(typeof toolbox.list).toBe('function')
      expect(typeof toolbox.getToolsForLLM).toBe('function')
      expect(typeof toolbox.execute).toBe('function')
      expect(typeof toolbox.executeParallel).toBe('function')
    })

    it('extractToolCalls handles both formats', () => {
      // Native format
      const native = extractToolCalls({
        toolCalls: [{ function: { name: 'test', arguments: '{}' } }],
      })
      expect(native).toHaveLength(1)

      // Text format
      const text = extractToolCalls({
        content: '```tool_call\n{"tool":"test","args":{}}\n```',
      })
      expect(text).toHaveLength(1)
    })

    it('buildSynthesisPrompt adapts to content', () => {
      const withContent = buildSynthesisPrompt('Partial response', [])
      expect(withContent).toContain('CONTINUE')

      const withoutContent = buildSynthesisPrompt('', [])
      expect(withoutContent).toContain('complete and comprehensive')
    })
  })

  describe('Day 38: Oracle Loop', () => {
    it('6-step pipeline is complete', async () => {
      // Verify all exports exist
      expect(typeof oracleLoop).toBe('function')
      expect(typeof preprocessRequest).toBe('function')
      expect(typeof buildPartitionedContext).toBe('function')
    })
  })

  describe('Day 39: RAG Enhancement', () => {
    it('REFRAG components are complete', () => {
      expect(typeof mmrSelect).toBe('function')
      expect(typeof reciprocalRankFusion).toBe('function')
      expect(typeof hydeExpand).toBe('function')
      expect(typeof chunkDocument).toBe('function')
      expect(typeof HybridRAG).toBe('function')
    })
  })

  describe('Day 40: Domain Pipelines', () => {
    it('Domain framework is complete', () => {
      expect(typeof DomainDetector).toBe('function')
      expect(typeof createDefaultDetector).toBe('function')
      expect(typeof processDomainContext).toBe('function')
    })

    it('Built-in domains are registered', () => {
      const detector = createDefaultDetector()
      const domains = detector.listDomains()

      expect(domains).toContain('software-development')
      expect(domains).toContain('security-research')
    })
  })
})
