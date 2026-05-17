// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Parallel Tool Executor
 * TypeScript implementation of parallel tool execution (simulating Rust Rayon)
 */

import type { ToolCall, ToolResult, ToolBatch, ToolStatus } from './types.js'

// ============================================================================
// Tool Executor Types
// ============================================================================

export type ToolHandler = (
  call: ToolCall
) => Promise<{ output: string; status: ToolStatus }>

export interface ToolExecutorConfig {
  maxWorkers: number
  defaultTimeoutMs: number
}

export const DEFAULT_EXECUTOR_CONFIG: ToolExecutorConfig = {
  maxWorkers: 8,
  defaultTimeoutMs: 30000,
}

// ============================================================================
// Tool Executor
// ============================================================================

export class ToolExecutor {
  private handlers: Map<string, ToolHandler> = new Map()
  private config: ToolExecutorConfig

  constructor(config: Partial<ToolExecutorConfig> = {}) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config }
  }

  /**
   * Register a tool handler
   * @param name - Tool name
   * @param handler - Handler function
   */
  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler)
  }

  /**
   * Unregister a tool handler
   * @param name - Tool name
   */
  unregister(name: string): void {
    this.handlers.delete(name)
  }

  /**
   * Check if a tool is registered
   * @param name - Tool name
   * @returns True if registered
   */
  hasHandler(name: string): boolean {
    return this.handlers.has(name)
  }

  /**
   * List registered tool names
   * @returns Array of tool names
   */
  listTools(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Execute a single tool call
   * @param call - Tool call to execute
   * @param timeoutMs - Timeout in milliseconds
   * @returns Tool result
   */
  async executeSingle(call: ToolCall, timeoutMs?: number): Promise<ToolResult> {
    const start = Date.now()
    const timeout = timeoutMs ?? this.config.defaultTimeoutMs

    const handler = this.handlers.get(call.name)

    if (!handler) {
      return {
        id: call.id,
        name: call.name,
        status: 'error',
        output: `Tool '${call.name}' not found`,
        durationMs: Date.now() - start,
      }
    }

    try {
      const result = await Promise.race([
        handler(call),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout)
        ),
      ])

      return {
        id: call.id,
        name: call.name,
        status: result.status,
        output: result.output,
        durationMs: Date.now() - start,
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'Timeout'

      return {
        id: call.id,
        name: call.name,
        status: isTimeout ? 'timeout' : 'error',
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      }
    }
  }

  /**
   * Execute a batch of tools in parallel
   * @param batch - Batch of tool calls
   * @returns Array of results
   */
  async executeBatch(batch: ToolBatch): Promise<ToolResult[]> {
    const { tools, timeoutMs, maxParallel } = batch
    const results: ToolResult[] = []
    const effectiveMaxParallel = Math.min(maxParallel, this.config.maxWorkers)

    // Process in chunks to respect maxParallel
    for (let i = 0; i < tools.length; i += effectiveMaxParallel) {
      const chunk = tools.slice(i, i + effectiveMaxParallel)

      const chunkResults = await Promise.all(
        chunk.map((call) => this.executeSingle(call, timeoutMs))
      )

      results.push(...chunkResults)
    }

    return results
  }

  /**
   * Execute tools with error isolation
   * Each tool's error doesn't affect others
   * @param calls - Array of tool calls
   * @returns Array of results (all will be present, some may be errors)
   */
  async executeIsolated(calls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(
      calls.map((call) => this.executeSingle(call).catch((error) => ({
        id: call.id,
        name: call.name,
        status: 'error' as const,
        output: `Isolated error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: 0,
      })))
    )
  }
}

// ============================================================================
// Built-in Tool Handlers
// ============================================================================

/**
 * Create a mock tool handler for testing
 * @param responseTime - Simulated response time in ms
 * @param output - Output to return
 * @returns Tool handler
 */
export function createMockHandler(
  responseTime: number,
  output: string
): ToolHandler {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, responseTime))
    return { output, status: 'success' }
  }
}

/**
 * Create a handler that randomly fails
 * @param failRate - Probability of failure (0-1)
 * @param responseTime - Response time in ms
 * @returns Tool handler
 */
export function createUnreliableHandler(
  failRate: number,
  responseTime: number
): ToolHandler {
  return async (call) => {
    await new Promise((resolve) => setTimeout(resolve, responseTime))

    if (Math.random() < failRate) {
      return { output: 'Random failure', status: 'error' }
    }

    return { output: `Executed ${call.name}`, status: 'success' }
  }
}

// ============================================================================
// Metrics
// ============================================================================

export interface BatchMetrics {
  totalCalls: number
  successCount: number
  errorCount: number
  timeoutCount: number
  totalDurationMs: number
  avgDurationMs: number
  parallelSpeedup: number // vs sequential
}

/**
 * Calculate metrics for a batch of results
 * @param results - Tool results
 * @param sequentialDurationMs - Optional sequential duration for speedup calc
 * @returns Batch metrics
 */
export function calculateBatchMetrics(
  results: ToolResult[],
  sequentialDurationMs?: number
): BatchMetrics {
  const totalDurationMs = Math.max(...results.map((r) => r.durationMs), 0)
  const sumDurations = results.reduce((sum, r) => sum + r.durationMs, 0)

  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length
  const timeoutCount = results.filter((r) => r.status === 'timeout').length

  return {
    totalCalls: results.length,
    successCount,
    errorCount,
    timeoutCount,
    totalDurationMs,
    avgDurationMs: results.length > 0 ? sumDurations / results.length : 0,
    parallelSpeedup:
      sequentialDurationMs && totalDurationMs > 0
        ? sequentialDurationMs / totalDurationMs
        : sumDurations > 0
          ? sumDurations / totalDurationMs
          : 1,
  }
}
