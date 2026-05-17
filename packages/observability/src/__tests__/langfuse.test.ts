// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Langfuse LLM Observability Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  LangfuseObserver,
  MockLLMObserver,
  calculateNDCG,
  calculateMRR,
} from '../langfuse.js'
import type { ScoredDocument } from '../types.js'

describe('LangfuseObserver', () => {
  let observer: LangfuseObserver

  beforeEach(() => {
    vi.useFakeTimers()
    observer = new LangfuseObserver({
      publicKey: 'pk-test',
      secretKey: 'sk-test',
      flushInterval: 1000,
      maxBatchSize: 10,
    })
  })

  afterEach(async () => {
    await observer.shutdown()
    vi.useRealTimers()
  })

  describe('startTrace', () => {
    it('creates trace with tenant and thread IDs', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')

      expect(trace.id).toContain('tenant-1')
      expect(trace.id).toContain('thread-1')
      expect(trace.tenantId).toBe('tenant-1')
      expect(trace.threadId).toBe('thread-1')
      expect(trace.startTime).toBeInstanceOf(Date)
    })

    it('buffers trace event', () => {
      observer.startTrace('tenant-1', 'thread-1')
      expect(observer.getPendingCount()).toBe(1)
    })
  })

  describe('recordGeneration', () => {
    it('records LLM generation', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')

      observer.recordGeneration(trace, {
        model: 'claude-3-opus',
        prompt: 'Hello, world!',
        completion: 'Hello! How can I help you today?',
        promptTokens: 10,
        completionTokens: 15,
        latencyMs: 500,
      })

      expect(observer.getPendingCount()).toBe(2)
    })

    it('includes metadata', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')
      const sentEvents: unknown[] = []
      observer.onEventsSent = (events) => sentEvents.push(...events)

      observer.recordGeneration(trace, {
        model: 'claude-3-opus',
        prompt: 'Test',
        completion: 'Response',
        promptTokens: 5,
        completionTokens: 10,
        latencyMs: 200,
        metadata: { temperature: 0.7 },
      })

      // Force flush
      vi.advanceTimersByTime(1000)
    })
  })

  describe('recordToolSpan', () => {
    it('records tool usage', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')

      observer.recordToolSpan(trace, {
        name: 'search',
        input: { query: 'test' },
        output: { results: ['a', 'b'] },
        durationMs: 100,
        status: 'success',
      })

      expect(observer.getPendingCount()).toBe(2)
    })

    it('records tool errors', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')

      observer.recordToolSpan(trace, {
        name: 'fetch',
        input: { url: 'https://example.com' },
        output: null,
        durationMs: 50,
        status: 'error',
        errorMessage: 'Connection timeout',
      })

      expect(observer.getPendingCount()).toBe(2)
    })
  })

  describe('recordRetrieval', () => {
    it('records RAG retrieval', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')

      observer.recordRetrieval(trace, {
        query: 'What is the capital of France?',
        results: [
          { id: 'doc1', content: 'Paris is the capital...', score: 0.95, metadata: {} },
          { id: 'doc2', content: 'France is a country...', score: 0.8, metadata: {} },
        ],
        topK: 5,
        latencyMs: 50,
        ndcg: 0.9,
        mrr: 1.0,
      })

      expect(observer.getPendingCount()).toBe(2)
    })
  })

  describe('recordScore', () => {
    it('records feedback score', () => {
      const trace = observer.startTrace('tenant-1', 'thread-1')

      observer.recordScore(trace, {
        name: 'relevance',
        value: 0.8,
        comment: 'Good response',
      })

      expect(observer.getPendingCount()).toBe(2)
    })
  })

  describe('flush', () => {
    it('flushes pending events', async () => {
      const sentEvents: unknown[] = []
      observer.onEventsSent = (events) => sentEvents.push(...events)

      observer.startTrace('tenant-1', 'thread-1')
      await observer.flush()

      expect(sentEvents.length).toBe(1)
      expect(observer.getPendingCount()).toBe(0)
    })

    it('auto-flushes on interval', () => {
      const sentEvents: unknown[] = []
      observer.onEventsSent = (events) => sentEvents.push(...events)

      observer.startTrace('tenant-1', 'thread-1')

      // Advance past flush interval
      vi.advanceTimersByTime(5000)

      expect(sentEvents.length).toBeGreaterThan(0)
    })

    it('auto-flushes when buffer is full', async () => {
      const sentEvents: unknown[] = []
      observer.onEventsSent = (events) => sentEvents.push(...events)

      // Add more than maxBatchSize events
      for (let i = 0; i < 15; i++) {
        observer.startTrace('tenant', `thread-${i}`)
      }

      // Should have auto-flushed
      expect(sentEvents.length).toBeGreaterThan(0)
    })
  })
})

describe('MockLLMObserver', () => {
  let observer: MockLLMObserver

  beforeEach(() => {
    observer = new MockLLMObserver()
  })

  it('captures all events', () => {
    const trace = observer.startTrace('tenant', 'thread')

    observer.recordGeneration(trace, {
      model: 'test',
      prompt: 'p',
      completion: 'c',
      promptTokens: 1,
      completionTokens: 1,
      latencyMs: 100,
    })

    observer.recordToolSpan(trace, {
      name: 'tool',
      input: {},
      output: {},
      durationMs: 50,
      status: 'success',
    })

    observer.recordRetrieval(trace, {
      query: 'q',
      results: [],
      topK: 5,
      latencyMs: 20,
    })

    observer.recordScore(trace, {
      name: 'score',
      value: 0.9,
    })

    expect(observer.traces).toHaveLength(1)
    expect(observer.generations).toHaveLength(1)
    expect(observer.toolSpans).toHaveLength(1)
    expect(observer.retrievals).toHaveLength(1)
    expect(observer.scores).toHaveLength(1)
  })

  it('clears all events', () => {
    observer.startTrace('tenant', 'thread')
    observer.clear()

    expect(observer.traces).toHaveLength(0)
  })
})

describe('calculateNDCG', () => {
  const createDoc = (id: string, score: number): ScoredDocument => ({
    id,
    content: `Content ${id}`,
    score,
    metadata: {},
  })

  it('returns 1 for perfect ranking', () => {
    const results = [
      createDoc('doc1', 0.9),
      createDoc('doc2', 0.8),
      createDoc('doc3', 0.7),
    ]
    const relevance = new Map([
      ['doc1', 3],
      ['doc2', 2],
      ['doc3', 1],
    ])

    const ndcg = calculateNDCG(results, relevance, 3)
    expect(ndcg).toBeCloseTo(1.0, 5)
  })

  it('returns lower score for imperfect ranking', () => {
    const results = [
      createDoc('doc3', 0.9), // Least relevant first
      createDoc('doc2', 0.8),
      createDoc('doc1', 0.7), // Most relevant last
    ]
    const relevance = new Map([
      ['doc1', 3],
      ['doc2', 2],
      ['doc3', 1],
    ])

    const ndcg = calculateNDCG(results, relevance, 3)
    expect(ndcg).toBeLessThan(1.0)
    expect(ndcg).toBeGreaterThan(0)
  })

  it('handles empty results', () => {
    const ndcg = calculateNDCG([], new Map(), 5)
    expect(ndcg).toBe(0)
  })

  it('handles k=0', () => {
    const results = [createDoc('doc1', 0.9)]
    const ndcg = calculateNDCG(results, new Map([['doc1', 1]]), 0)
    expect(ndcg).toBe(0)
  })
})

describe('calculateMRR', () => {
  const createDoc = (id: string): ScoredDocument => ({
    id,
    content: `Content ${id}`,
    score: 0.9,
    metadata: {},
  })

  it('returns 1 for first position', () => {
    const results = [createDoc('relevant'), createDoc('other')]
    const relevant = new Set(['relevant'])

    expect(calculateMRR(results, relevant)).toBe(1)
  })

  it('returns 0.5 for second position', () => {
    const results = [createDoc('other'), createDoc('relevant')]
    const relevant = new Set(['relevant'])

    expect(calculateMRR(results, relevant)).toBe(0.5)
  })

  it('returns 0 when not found', () => {
    const results = [createDoc('a'), createDoc('b')]
    const relevant = new Set(['c'])

    expect(calculateMRR(results, relevant)).toBe(0)
  })

  it('handles multiple relevant docs', () => {
    const results = [createDoc('a'), createDoc('rel1'), createDoc('rel2')]
    const relevant = new Set(['rel1', 'rel2'])

    // First relevant doc at position 2
    expect(calculateMRR(results, relevant)).toBe(0.5)
  })
})
