// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Toolbox - Tool Registration and Management
 *
 * Decorator-based tool registration with LLM-augmented descriptions
 * and parallel execution support.
 */

import type { MemoryManager } from './memory-manager'
import type { ToolLogEntry, ToolLogStatus } from './memory-types'

// Tool parameter schema (JSON Schema format)
export interface ParameterSchema {
  type: string
  description?: string
  required?: boolean
  properties?: Record<string, ParameterSchema>
  items?: ParameterSchema
  enum?: string[]
  default?: unknown
}

// Tool definition
export interface ToolDefinition {
  name: string
  description: string
  augmentedDescription?: string
  parameters: Record<string, ParameterSchema>
  category: string
  handler: ToolHandler
}

// Tool handler function type
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ExecutionContext
) => Promise<unknown>

// Execution context passed to tools
export interface ExecutionContext {
  tenantId: string
  threadId: string
  userId?: string
  tracer?: Tracer
  memoryManager?: MemoryManager
}

// Simple tracer interface
export interface Tracer {
  addToolSpan(
    name: string,
    input: unknown,
    output: unknown,
    durationMs: number
  ): void
}

// Tool call from LLM
export interface ToolCall {
  id?: string
  function: {
    name: string
    arguments: string
  }
}

// Tool execution result
export interface ToolResult {
  id?: string
  name: string
  result: unknown
  status: ToolLogStatus
  ms: number
}

// Registration options
export interface ToolRegistrationOptions {
  augment?: boolean
  category?: string
}

/**
 * Toolbox - Manages tool registration and execution
 */
export class Toolbox {
  private tools: Map<string, ToolDefinition> = new Map()
  private memoryManager?: MemoryManager
  private augmentFn?: (tool: ToolDefinition) => Promise<string>
  private maxWorkers: number

  constructor(options: {
    memoryManager?: MemoryManager
    augmentFn?: (tool: ToolDefinition) => Promise<string>
    maxWorkers?: number
  } = {}) {
    this.memoryManager = options.memoryManager
    this.augmentFn = options.augmentFn
    this.maxWorkers = options.maxWorkers ?? 8
  }

  /**
   * Register a tool
   */
  async register(
    name: string,
    description: string,
    parameters: Record<string, ParameterSchema>,
    handler: ToolHandler,
    options: ToolRegistrationOptions = {}
  ): Promise<void> {
    const tool: ToolDefinition = {
      name,
      description,
      parameters,
      category: options.category ?? 'general',
      handler,
    }

    // Augment description if requested
    if (options.augment && this.augmentFn) {
      tool.augmentedDescription = await this.augmentFn(tool)

      // Store in toolbox memory if available
      if (this.memoryManager) {
        // Note: This would need tenantId in a real implementation
        // For now, we store augmented descriptions in-memory only
      }
    }

    this.tools.set(name, tool)
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  /**
   * List all tools
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * Get tools formatted for LLM
   */
  getToolsForLLM(): Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: {
        type: 'object'
        properties: Record<string, ParameterSchema>
        required: string[]
      }
    }
  }> {
    return this.list().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.augmentedDescription ?? tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters,
          required: Object.entries(tool.parameters)
            .filter(([_, schema]) => schema.required)
            .map(([name]) => name),
        },
      },
    }))
  }

  /**
   * Execute a single tool
   */
  async execute(
    toolCall: ToolCall,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const toolName = toolCall.function.name

    try {
      const tool = this.tools.get(toolName)
      if (!tool) {
        return {
          id: toolCall.id,
          name: toolName,
          result: `Error: Unknown tool '${toolName}'`,
          status: 'ERROR',
          ms: Date.now() - startTime,
        }
      }

      const args = JSON.parse(toolCall.function.arguments)
      const result = await tool.handler(args, context)
      const duration = Date.now() - startTime

      // Log execution
      if (this.memoryManager) {
        await this.memoryManager.writeToolLog({
          tenantId: context.tenantId,
          threadId: context.threadId,
          toolName,
          input: args,
          output: result as Record<string, unknown>,
          status: 'SUCCESS',
          durationMs: duration,
        })
      }

      // Add tracer span
      context.tracer?.addToolSpan(toolName, args, result, duration)

      return {
        id: toolCall.id,
        name: toolName,
        result,
        status: 'SUCCESS',
        ms: duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      // Log error
      if (this.memoryManager) {
        await this.memoryManager.writeToolLog({
          tenantId: context.tenantId,
          threadId: context.threadId,
          toolName,
          input: {},
          output: { error: errorMessage },
          status: 'ERROR',
          durationMs: duration,
        })
      }

      return {
        id: toolCall.id,
        name: toolName,
        result: `Error: ${errorMessage}`,
        status: 'ERROR',
        ms: duration,
      }
    }
  }

  /**
   * Execute tools in parallel with worker limit
   */
  async executeParallel(
    toolCalls: ToolCall[],
    context: ExecutionContext
  ): Promise<ToolResult[]> {
    // Proper semaphore-based parallel execution
    const results: ToolResult[] = new Array(toolCalls.length)
    let currentIndex = 0
    let activeWorkers = 0
    let resolveAll: () => void

    const allDone = new Promise<void>((resolve) => {
      resolveAll = resolve
    })

    const processNext = async () => {
      while (currentIndex < toolCalls.length && activeWorkers < this.maxWorkers) {
        const index = currentIndex
        const toolCall = toolCalls[index]
        currentIndex++
        activeWorkers++

        // Don't await - fire and forget
        this.execute(toolCall, context)
          .then((result) => {
            results[index] = result
          })
          .finally(() => {
            activeWorkers--
            if (currentIndex >= toolCalls.length && activeWorkers === 0) {
              resolveAll()
            } else {
              // Process next item
              processNext()
            }
          })
      }
    }

    // Start initial batch
    processNext()

    // Wait for all to complete
    if (toolCalls.length > 0) {
      await allDone
    }

    return results
  }
}

/**
 * Extract tool calls from LLM response
 * Handles both native tool_calls and text fallback
 */
export function extractToolCalls(response: {
  toolCalls?: ToolCall[]
  content?: string
}): ToolCall[] {
  // Strategy 1: Native tool_calls from model
  if (response.toolCalls && response.toolCalls.length > 0) {
    return response.toolCalls
  }

  // Strategy 2: Parse ```tool_call {...}``` blocks from text
  if (!response.content) {
    return []
  }

  const toolCallPattern = /```tool_call\s*(\{[\s\S]*?\})\s*```/g
  const matches = response.content.matchAll(toolCallPattern)

  const extracted: ToolCall[] = []
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.tool && parsed.args) {
        extracted.push({
          function: {
            name: parsed.tool,
            arguments: JSON.stringify(parsed.args),
          },
        })
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return extracted
}

/**
 * Build synthesis prompt based on buffered content
 */
export function buildSynthesisPrompt(
  bufferedContent: string,
  toolResults: ToolResult[]
): string {
  const resultsSummary = toolResults
    .map((r) => {
      const resultStr =
        typeof r.result === 'string'
          ? r.result
          : JSON.stringify(r.result, null, 2)
      const truncated =
        resultStr.length > 2000 ? resultStr.slice(0, 2000) + '...' : resultStr
      return `[${r.name}]: ${truncated}`
    })
    .join('\n\n')

  if (bufferedContent.length > 0) {
    // Case A: Model already started response, continue from there
    return `
You have just called tools for more information. Here are the results:

${resultsSummary}

CONTINUE your response from where you left off, incorporating the tool results naturally.
Do not repeat what you already said.
`
  } else {
    // Case B: No content yet, ask for complete answer
    return `
You called tools to gather additional information. Here are the results:

${resultsSummary}

Now provide a complete and comprehensive answer using both the initial memory context and the new tool results.
`
  }
}

// Singleton instance
let toolbox: Toolbox | null = null

export function getToolbox(options?: {
  memoryManager?: MemoryManager
  augmentFn?: (tool: ToolDefinition) => Promise<string>
  maxWorkers?: number
}): Toolbox {
  if (!toolbox) {
    toolbox = new Toolbox(options)
  }
  return toolbox
}
