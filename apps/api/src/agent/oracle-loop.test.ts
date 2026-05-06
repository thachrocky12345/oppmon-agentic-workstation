/**
 * Oracle Loop Tests
 *
 * Tests for the 6-step agent pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  preprocessRequest,
  buildPartitionedContext,
  oracleLoop,
  type AgentConfig,
  type PreprocessingResult,
  type OracleContext,
  type LLMClient,
  type StreamEvent,
} from './oracle-loop'
import type { PrefetchResult } from './memory-types'
import type { MemoryManager } from './memory-manager'
import { Toolbox } from './toolbox'

// Mock memory manager
const mockMemoryManager = {
  prefetchAll: vi.fn(),
  syncAll: vi.fn(),
  readConversationalMemory: vi.fn(),
  writeConversationalMemory: vi.fn(),
  writeToolLog: vi.fn(),
} as unknown as MemoryManager

describe('Oracle Loop', () => {
  describe('preprocessRequest', () => {
    it('detects domain patterns', async () => {
      const config: AgentConfig = {
        baseSystemPrompt: 'You are a helpful assistant.',
        domains: [
          {
            name: 'security',
            patterns: [/CVE-\d{4}-\d{4,}/gi],
            enricher: async () => '## Security Context\nAnalyzing CVE...',
          },
        ],
      }

      const result = await preprocessRequest(
        'Check CVE-2024-1234 vulnerability',
        config
      )

      expect(result.detectedDomain).toBe('security')
      expect(result.enrichedSystemPrompt).toContain('Security Context')
    })

    it('enriches system prompt for detected domain', async () => {
      const config: AgentConfig = {
        baseSystemPrompt: 'Base prompt.',
        domains: [
          {
            name: 'code',
            patterns: [/JIRA-\d+/gi],
            enricher: async () => 'Code analysis context here.',
          },
        ],
      }

      const result = await preprocessRequest('Fix JIRA-123', config)

      expect(result.enrichedSystemPrompt).toContain('Base prompt.')
      expect(result.enrichedSystemPrompt).toContain('Code analysis context')
    })

    it('returns base prompt when no domain matches', async () => {
      const config: AgentConfig = {
        baseSystemPrompt: 'Base prompt only.',
        domains: [
          {
            name: 'security',
            patterns: [/CVE-\d{4}-\d{4,}/gi],
            enricher: async () => 'Security context',
          },
        ],
      }

      const result = await preprocessRequest('Hello world', config)

      expect(result.detectedDomain).toBeNull()
      expect(result.enrichedSystemPrompt).toBe('Base prompt only.')
    })
  })

  describe('buildPartitionedContext', () => {
    it('includes all sections', () => {
      const prefetch: PrefetchResult = {
        conversational: [
          { role: 'USER', content: 'Previous question' },
          { role: 'ASSISTANT', content: 'Previous answer' },
        ],
        semantic: [{ id: '1', content: 'KB doc', score: 0.9, relevance: 0.9 }],
        workflow: [{ id: '2', content: 'Workflow pattern', score: 0.8, relevance: 0.8 }],
        entity: [{ id: '3', content: 'Entity info', score: 0.7, relevance: 0.7 }],
        summary: [{ id: '4', content: 'Summary content', score: 1, relevance: 1 }],
        scores: { ndcg: 0.9, mrr: 1.0 },
      }

      const preprocessing: PreprocessingResult = {
        detectedDomain: null,
        enrichedSystemPrompt: 'System prompt',
        extractedEntities: [],
      }

      const context = buildPartitionedContext(
        'User question',
        prefetch,
        preprocessing
      )

      expect(context).toContain('# Question')
      expect(context).toContain('User question')
      expect(context).toContain('## Conversation Memory')
      expect(context).toContain('## Knowledge Base')
      expect(context).toContain('## Relevant Workflows')
      expect(context).toContain('## Entities')
      expect(context).toContain('## Previous Context Summaries')
    })

    it('truncates long content', () => {
      const longContent = 'x'.repeat(1000)
      const prefetch: PrefetchResult = {
        conversational: [],
        semantic: [{ id: '1', content: longContent, score: 0.9, relevance: 0.9 }],
        workflow: [],
        entity: [],
        summary: [],
        scores: { ndcg: 0.9, mrr: 1.0 },
      }

      const preprocessing: PreprocessingResult = {
        detectedDomain: null,
        enrichedSystemPrompt: '',
        extractedEntities: [],
      }

      const context = buildPartitionedContext('Q', prefetch, preprocessing)

      // KB content should be truncated to 400 chars
      const kbSection = context.split('## Knowledge Base')[1]
      expect(kbSection.length).toBeLessThan(1000)
    })
  })

  describe('oracleLoop', () => {
    let toolbox: Toolbox
    let mockLLMClient: LLMClient
    let context: OracleContext

    beforeEach(() => {
      vi.clearAllMocks()

      toolbox = new Toolbox()

      // Register a test tool
      toolbox.register(
        'test_tool',
        'A test tool',
        { query: { type: 'string' } },
        async () => ({ result: 'tool result' })
      )

      mockLLMClient = {
        chat: vi.fn().mockImplementation(async function* () {
          yield { content: 'Here is the answer.' }
          yield { done: true }
        }),
        complete: vi.fn().mockResolvedValue('Completed text'),
      }

      vi.mocked(mockMemoryManager.prefetchAll).mockResolvedValue({
        conversational: [],
        semantic: [],
        workflow: [],
        entity: [],
        summary: [],
        scores: { ndcg: 0.8, mrr: 0.9 },
      })

      vi.mocked(mockMemoryManager.syncAll).mockResolvedValue(undefined)

      context = {
        tenantId: 'tenant1',
        threadId: 'thread1',
        memoryManager: mockMemoryManager,
        toolbox,
        llmClient: mockLLMClient,
        config: {
          baseSystemPrompt: 'You are helpful.',
          maxIterations: 5,
        },
      }
    })

    it('executes full pipeline for simple question', async () => {
      const events: StreamEvent[] = []

      for await (const event of oracleLoop('What is 2+2?', context)) {
        events.push(event)
      }

      // Should have preprocessing, context, tokens, done, trace
      const types = events.map((e) => e.type)
      expect(types).toContain('preprocessing')
      expect(types).toContain('context')
      expect(types).toContain('token')
      expect(types).toContain('done')
      expect(types).toContain('trace')
    })

    it('executes tools when called', async () => {
      // LLM returns tool call, then final response
      let callCount = 0
      mockLLMClient.chat = vi.fn().mockImplementation(async function* () {
        callCount++
        if (callCount === 1) {
          yield {
            content: 'Let me check.',
            toolCalls: [
              {
                function: {
                  name: 'test_tool',
                  arguments: '{"query":"test"}',
                },
              },
            ],
          }
        } else {
          yield { content: 'Based on the results, the answer is 42.' }
        }
        yield { done: true }
      })

      const events: StreamEvent[] = []

      for await (const event of oracleLoop('Use a tool', context)) {
        events.push(event)
      }

      const types = events.map((e) => e.type)
      expect(types).toContain('action')
      expect(types).toContain('tool_result')
      expect(types).toContain('done')
    })

    it('stops at max iterations', async () => {
      // LLM always returns tool calls
      mockLLMClient.chat = vi.fn().mockImplementation(async function* () {
        yield {
          content: 'Calling tool...',
          toolCalls: [
            {
              function: {
                name: 'test_tool',
                arguments: '{}',
              },
            },
          ],
        }
        yield { done: true }
      })

      context.config.maxIterations = 3

      const events: StreamEvent[] = []

      for await (const event of oracleLoop('Loop forever', context)) {
        events.push(event)
      }

      // Should have warning about max iterations
      const warning = events.find((e) => e.type === 'warning')
      expect(warning).toBeDefined()

      // Should have exactly 3 action events (iterations)
      const actions = events.filter((e) => e.type === 'action')
      expect(actions.length).toBe(3)
    })

    it('syncs memory after completion', async () => {
      for await (const _ of oracleLoop('Test message', context)) {
        // consume events
      }

      expect(mockMemoryManager.syncAll).toHaveBeenCalledWith(
        'tenant1',
        'thread1',
        expect.arrayContaining([
          expect.objectContaining({ role: 'USER', content: 'Test message' }),
          expect.objectContaining({ role: 'ASSISTANT' }),
        ])
      )
    })

    it('emits SSE events in correct format', async () => {
      const events: StreamEvent[] = []

      for await (const event of oracleLoop('Hello', context)) {
        events.push(event)
      }

      // Check preprocessing event
      const prep = events.find((e) => e.type === 'preprocessing')
      expect(prep).toHaveProperty('domain')

      // Check context event
      const ctx = events.find((e) => e.type === 'context')
      expect(ctx).toHaveProperty('scores')

      // Check trace event
      const trace = events.find((e) => e.type === 'trace') as
        | { type: 'trace'; steps: Array<{ step: string; durationMs: number }> }
        | undefined
      expect(trace?.steps).toBeInstanceOf(Array)
    })
  })

  describe('retrieval scores', () => {
    it('prefetch returns NDCG score', async () => {
      vi.mocked(mockMemoryManager.prefetchAll).mockResolvedValue({
        conversational: [],
        semantic: [
          { id: '1', content: 'Best', score: 0.95, relevance: 0.95 },
          { id: '2', content: 'Good', score: 0.85, relevance: 0.85 },
        ],
        workflow: [],
        entity: [],
        summary: [],
        scores: { ndcg: 0.95, mrr: 1.0 },
      })

      const toolbox = new Toolbox()
      const mockLLM: LLMClient = {
        chat: vi.fn().mockImplementation(async function* () {
          yield { content: 'Answer' }
        }),
        complete: vi.fn(),
      }

      const context: OracleContext = {
        tenantId: 'tenant1',
        threadId: 'thread1',
        memoryManager: mockMemoryManager,
        toolbox,
        llmClient: mockLLM,
        config: { baseSystemPrompt: 'Test' },
      }

      const events: StreamEvent[] = []
      for await (const event of oracleLoop('Query', context)) {
        events.push(event)
      }

      const contextEvent = events.find((e) => e.type === 'context') as
        | { type: 'context'; scores: { ndcg: number; mrr: number } }
        | undefined
      expect(contextEvent?.scores.ndcg).toBe(0.95)
      expect(contextEvent?.scores.mrr).toBe(1.0)
    })
  })
})
