/**
 * Toolbox Tests
 *
 * Tests for tool registration, extraction, and parallel execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  Toolbox,
  extractToolCalls,
  buildSynthesisPrompt,
  type ToolCall,
} from './toolbox'
import type { ExecutionContext } from './toolbox'

describe('Toolbox', () => {
  let toolbox: Toolbox

  beforeEach(() => {
    toolbox = new Toolbox({ maxWorkers: 8 })
  })

  describe('tool registration', () => {
    it('registers tool with decorator pattern', async () => {
      await toolbox.register(
        'test_tool',
        'A test tool',
        { input: { type: 'string', required: true } },
        async (args) => ({ result: args.input }),
        { category: 'test' }
      )

      const tool = toolbox.get('test_tool')
      expect(tool).toBeDefined()
      expect(tool?.name).toBe('test_tool')
      expect(tool?.category).toBe('test')
    })

    it('extracts parameters from schema', async () => {
      await toolbox.register(
        'complex_tool',
        'Tool with complex params',
        {
          query: { type: 'string', required: true },
          limit: { type: 'number', default: 10 },
          options: {
            type: 'object',
            properties: {
              verbose: { type: 'boolean' },
            },
          },
        },
        async () => ({}),
        { category: 'test' }
      )

      const tools = toolbox.getToolsForLLM()
      const complexTool = tools.find((t) => t.function.name === 'complex_tool')

      expect(complexTool).toBeDefined()
      expect(complexTool?.function.parameters.required).toContain('query')
      expect(complexTool?.function.parameters.properties).toHaveProperty(
        'limit'
      )
    })
  })

  describe('tool augmentation', () => {
    it('generates 200-300 word description when augment=true', async () => {
      const augmentFn = vi.fn().mockResolvedValue(
        'This is an augmented description. '.repeat(20) // ~120 words
      )

      const augmentedToolbox = new Toolbox({ augmentFn })

      await augmentedToolbox.register(
        'augmented_tool',
        'Short description',
        {},
        async () => ({}),
        { augment: true }
      )

      expect(augmentFn).toHaveBeenCalled()
      const tool = augmentedToolbox.get('augmented_tool')
      expect(tool?.augmentedDescription).toBeDefined()
    })
  })

  describe('parallel execution', () => {
    it('executes tools in parallel', async () => {
      const executionOrder: string[] = []

      await toolbox.register(
        'slow_tool',
        'Slow tool',
        {},
        async () => {
          await new Promise((r) => setTimeout(r, 50))
          executionOrder.push('slow')
          return { done: 'slow' }
        }
      )

      await toolbox.register(
        'fast_tool',
        'Fast tool',
        {},
        async () => {
          executionOrder.push('fast')
          return { done: 'fast' }
        }
      )

      const calls: ToolCall[] = [
        { function: { name: 'slow_tool', arguments: '{}' } },
        { function: { name: 'fast_tool', arguments: '{}' } },
      ]

      const context: ExecutionContext = {
        tenantId: 'test',
        threadId: 'thread',
      }

      const start = Date.now()
      const results = await toolbox.executeParallel(calls, context)
      const duration = Date.now() - start

      // Both should complete
      expect(results).toHaveLength(2)

      // Should run in parallel (total time < sum of individual times)
      // If sequential, would be ~100ms. Parallel should be ~50ms
      expect(duration).toBeLessThan(100)
    })

    it('respects max 8 workers limit', async () => {
      let concurrent = 0
      let maxConcurrent = 0

      // Register a tool that tracks concurrency
      await toolbox.register(
        'concurrent_tool',
        'Tracks concurrency',
        {},
        async () => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await new Promise((r) => setTimeout(r, 10))
          concurrent--
          return {}
        }
      )

      // Create 20 tool calls
      const calls: ToolCall[] = Array(20)
        .fill(null)
        .map(() => ({
          function: { name: 'concurrent_tool', arguments: '{}' },
        }))

      const context: ExecutionContext = {
        tenantId: 'test',
        threadId: 'thread',
      }

      await toolbox.executeParallel(calls, context)

      // Should never exceed 8 concurrent
      expect(maxConcurrent).toBeLessThanOrEqual(8)
    })

    it('handles individual tool errors without failing batch', async () => {
      await toolbox.register(
        'failing_tool',
        'Always fails',
        {},
        async () => {
          throw new Error('Tool failure')
        }
      )

      await toolbox.register(
        'working_tool',
        'Always works',
        {},
        async () => ({ success: true })
      )

      const calls: ToolCall[] = [
        { function: { name: 'failing_tool', arguments: '{}' } },
        { function: { name: 'working_tool', arguments: '{}' } },
      ]

      const context: ExecutionContext = {
        tenantId: 'test',
        threadId: 'thread',
      }

      const results = await toolbox.executeParallel(calls, context)

      // Both should have results
      expect(results).toHaveLength(2)

      // One should be error, one success
      const failed = results.find((r) => r.status === 'ERROR')
      const succeeded = results.find((r) => r.status === 'SUCCESS')

      expect(failed).toBeDefined()
      expect(succeeded).toBeDefined()
      expect(failed?.result).toContain('Error')
    })
  })
})

describe('extractToolCalls', () => {
  it('extracts native tool_calls', () => {
    const response = {
      toolCalls: [
        {
          id: 'call_1',
          function: { name: 'search', arguments: '{"query":"test"}' },
        },
      ],
    }

    const calls = extractToolCalls(response)
    expect(calls).toHaveLength(1)
    expect(calls[0].function.name).toBe('search')
  })

  it('extracts from text fallback', () => {
    const response = {
      content: `
Let me search for that.

\`\`\`tool_call
{"tool": "search_skills", "args": {"query": "authentication"}}
\`\`\`

I'll check the results.
`,
    }

    const calls = extractToolCalls(response)
    expect(calls).toHaveLength(1)
    expect(calls[0].function.name).toBe('search_skills')
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      query: 'authentication',
    })
  })

  it('handles multiple tool calls in text', () => {
    const response = {
      content: `
\`\`\`tool_call
{"tool": "tool1", "args": {"a": 1}}
\`\`\`

\`\`\`tool_call
{"tool": "tool2", "args": {"b": 2}}
\`\`\`
`,
    }

    const calls = extractToolCalls(response)
    expect(calls).toHaveLength(2)
  })

  it('skips invalid JSON in text', () => {
    const response = {
      content: `
\`\`\`tool_call
{invalid json}
\`\`\`

\`\`\`tool_call
{"tool": "valid", "args": {}}
\`\`\`
`,
    }

    const calls = extractToolCalls(response)
    expect(calls).toHaveLength(1)
    expect(calls[0].function.name).toBe('valid')
  })
})

describe('buildSynthesisPrompt', () => {
  it('Case A: continues response when content buffered', () => {
    const prompt = buildSynthesisPrompt('I found some information about', [
      { name: 'search', result: 'Results here', status: 'SUCCESS', ms: 100 },
    ])

    expect(prompt).toContain('CONTINUE your response')
    expect(prompt).toContain('Do not repeat')
  })

  it('Case B: asks for complete answer without buffer', () => {
    const prompt = buildSynthesisPrompt('', [
      { name: 'search', result: 'Results here', status: 'SUCCESS', ms: 100 },
    ])

    expect(prompt).toContain('complete and comprehensive answer')
    expect(prompt).not.toContain('CONTINUE')
  })

  it('truncates long tool results', () => {
    const longResult = 'x'.repeat(5000)
    const prompt = buildSynthesisPrompt('', [
      { name: 'search', result: longResult, status: 'SUCCESS', ms: 100 },
    ])

    // Should be truncated to 2000 chars + ellipsis
    expect(prompt.length).toBeLessThan(5000)
    expect(prompt).toContain('...')
  })
})
