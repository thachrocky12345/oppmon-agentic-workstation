/**
 * Tool Executor Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ToolExecutor,
  createMockHandler,
  createUnreliableHandler,
  calculateBatchMetrics,
} from '../tools.js'
import type { ToolCall, ToolBatch, ToolResult } from '../types.js'

describe('ToolExecutor', () => {
  let executor: ToolExecutor

  beforeEach(() => {
    executor = new ToolExecutor({ maxWorkers: 4, defaultTimeoutMs: 1000 })
  })

  describe('registration', () => {
    it('registers tool handlers', () => {
      executor.register('test', createMockHandler(0, 'output'))

      expect(executor.hasHandler('test')).toBe(true)
      expect(executor.listTools()).toContain('test')
    })

    it('unregisters tool handlers', () => {
      executor.register('test', createMockHandler(0, 'output'))
      executor.unregister('test')

      expect(executor.hasHandler('test')).toBe(false)
    })
  })

  describe('executeSingle', () => {
    it('executes registered tool', async () => {
      executor.register('greet', createMockHandler(0, 'Hello, World!'))

      const call: ToolCall = { id: '1', name: 'greet', arguments: {} }
      const result = await executor.executeSingle(call)

      expect(result.status).toBe('success')
      expect(result.output).toBe('Hello, World!')
      expect(result.id).toBe('1')
    })

    it('returns error for unregistered tool', async () => {
      const call: ToolCall = { id: '1', name: 'unknown', arguments: {} }
      const result = await executor.executeSingle(call)

      expect(result.status).toBe('error')
      expect(result.output).toContain('not found')
    })

    it('handles tool timeout', async () => {
      executor.register('slow', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        return { output: 'Done', status: 'success' }
      })

      const call: ToolCall = { id: '1', name: 'slow', arguments: {} }
      const result = await executor.executeSingle(call, 100) // 100ms timeout

      expect(result.status).toBe('timeout')
    })

    it('handles tool errors', async () => {
      executor.register('failing', async () => {
        throw new Error('Tool failure')
      })

      const call: ToolCall = { id: '1', name: 'failing', arguments: {} }
      const result = await executor.executeSingle(call)

      expect(result.status).toBe('error')
      expect(result.output).toContain('Tool failure')
    })

    it('tracks duration', async () => {
      executor.register('delayed', createMockHandler(50, 'output'))

      const call: ToolCall = { id: '1', name: 'delayed', arguments: {} }
      const result = await executor.executeSingle(call)

      expect(result.durationMs).toBeGreaterThanOrEqual(40) // Allow some variance
    })
  })

  describe('executeBatch', () => {
    it('executes all tools in parallel', async () => {
      // Each tool takes 50ms
      executor.register('tool1', createMockHandler(50, 'result1'))
      executor.register('tool2', createMockHandler(50, 'result2'))
      executor.register('tool3', createMockHandler(50, 'result3'))

      const batch: ToolBatch = {
        tools: [
          { id: '1', name: 'tool1', arguments: {} },
          { id: '2', name: 'tool2', arguments: {} },
          { id: '3', name: 'tool3', arguments: {} },
        ],
        timeoutMs: 5000,
        maxParallel: 4,
      }

      const start = Date.now()
      const results = await executor.executeBatch(batch)
      const elapsed = Date.now() - start

      expect(results.length).toBe(3)
      // Parallel execution should be faster than sequential (150ms)
      // With variance, should be under 150ms
      expect(elapsed).toBeLessThan(150)
    })

    it('respects maxParallel limit', async () => {
      const executionOrder: number[] = []

      for (let i = 1; i <= 4; i++) {
        executor.register(`tool${i}`, async () => {
          executionOrder.push(i)
          await new Promise((resolve) => setTimeout(resolve, 50))
          return { output: `${i}`, status: 'success' }
        })
      }

      const batch: ToolBatch = {
        tools: [
          { id: '1', name: 'tool1', arguments: {} },
          { id: '2', name: 'tool2', arguments: {} },
          { id: '3', name: 'tool3', arguments: {} },
          { id: '4', name: 'tool4', arguments: {} },
        ],
        timeoutMs: 5000,
        maxParallel: 2, // Only 2 at a time
      }

      await executor.executeBatch(batch)

      // With maxParallel=2, first batch should start together
      // Second batch should start after first completes
    })

    it('returns all results even with errors', async () => {
      executor.register('good', createMockHandler(0, 'success'))
      executor.register('bad', async () => {
        throw new Error('Failure')
      })

      const batch: ToolBatch = {
        tools: [
          { id: '1', name: 'good', arguments: {} },
          { id: '2', name: 'bad', arguments: {} },
          { id: '3', name: 'good', arguments: {} },
        ],
        timeoutMs: 1000,
        maxParallel: 4,
      }

      const results = await executor.executeBatch(batch)

      expect(results.length).toBe(3)
      expect(results.filter((r) => r.status === 'success').length).toBe(2)
      expect(results.filter((r) => r.status === 'error').length).toBe(1)
    })
  })

  describe('executeIsolated', () => {
    it('isolates errors between tools', async () => {
      executor.register('good', createMockHandler(0, 'ok'))
      executor.register('bad', async () => {
        throw new Error('Failure')
      })

      const calls: ToolCall[] = [
        { id: '1', name: 'good', arguments: {} },
        { id: '2', name: 'bad', arguments: {} },
        { id: '3', name: 'good', arguments: {} },
      ]

      const results = await executor.executeIsolated(calls)

      expect(results.length).toBe(3)
      expect(results[0].status).toBe('success')
      expect(results[1].status).toBe('error')
      expect(results[2].status).toBe('success')
    })
  })
})

describe('createMockHandler', () => {
  it('returns specified output', async () => {
    const handler = createMockHandler(0, 'mock output')
    const result = await handler({ id: '1', name: 'mock', arguments: {} })

    expect(result.output).toBe('mock output')
    expect(result.status).toBe('success')
  })

  it('delays by specified time', async () => {
    const handler = createMockHandler(100, 'output')

    const start = Date.now()
    await handler({ id: '1', name: 'mock', arguments: {} })
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(90)
  })
})

describe('createUnreliableHandler', () => {
  it('sometimes fails', async () => {
    const handler = createUnreliableHandler(0.5, 0)

    let failures = 0
    const iterations = 100

    for (let i = 0; i < iterations; i++) {
      const result = await handler({ id: `${i}`, name: 'unreliable', arguments: {} })
      if (result.status === 'error') failures++
    }

    // With 50% fail rate, expect roughly half to fail
    expect(failures).toBeGreaterThan(20)
    expect(failures).toBeLessThan(80)
  })
})

describe('calculateBatchMetrics', () => {
  it('calculates metrics correctly', () => {
    const results: ToolResult[] = [
      { id: '1', name: 'a', status: 'success', output: '', durationMs: 100 },
      { id: '2', name: 'b', status: 'success', output: '', durationMs: 150 },
      { id: '3', name: 'c', status: 'error', output: '', durationMs: 50 },
      { id: '4', name: 'd', status: 'timeout', output: '', durationMs: 200 },
    ]

    const metrics = calculateBatchMetrics(results)

    expect(metrics.totalCalls).toBe(4)
    expect(metrics.successCount).toBe(2)
    expect(metrics.errorCount).toBe(1)
    expect(metrics.timeoutCount).toBe(1)
    expect(metrics.totalDurationMs).toBe(200) // Max duration
    expect(metrics.avgDurationMs).toBe(125) // 500 / 4
  })

  it('calculates parallel speedup', () => {
    const results: ToolResult[] = [
      { id: '1', name: 'a', status: 'success', output: '', durationMs: 100 },
      { id: '2', name: 'b', status: 'success', output: '', durationMs: 100 },
    ]

    const metrics = calculateBatchMetrics(results, 200)

    // Sequential would be 200ms, parallel is 100ms = 2x speedup
    expect(metrics.parallelSpeedup).toBe(2)
  })

  it('handles empty results', () => {
    const metrics = calculateBatchMetrics([])

    expect(metrics.totalCalls).toBe(0)
    expect(metrics.totalDurationMs).toBe(0)
  })
})
