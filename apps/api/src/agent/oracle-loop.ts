// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Oracle Agent Loop
 *
 * 6-step agentic pipeline with:
 * 1. Domain Preprocessing
 * 2. Memory Prefetch with NDCG/MRR scoring
 * 3. Observability Start
 * 4. Partitioned Context Building
 * 5. Oracle Loop (iterative tool calling, max 5)
 * 6. Memory Sync + Observability Close
 */

import type { MemoryManager } from './memory-manager'
import type {
  Message,
  PrefetchResult,
  RetrievalScores,
  MemoryRole,
} from './memory-types'
import { Toolbox, extractToolCalls, buildSynthesisPrompt } from './toolbox'
import type { ToolCall, ToolResult, ExecutionContext } from './toolbox'

// ============================================================================
// Types
// ============================================================================

// SSE Event Types
export type StreamEvent =
  | { type: 'preprocessing'; domain: string | null }
  | { type: 'context'; scores: RetrievalScores }
  | { type: 'thinking'; content: string }
  | { type: 'token'; content: string }
  | { type: 'action'; iteration: number; tools: string[] }
  | { type: 'tool_result'; name: string; status: string; ms: number }
  | { type: 'done'; content: string }
  | { type: 'trace'; steps: StepTiming[] }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }

export interface StepTiming {
  step: string
  durationMs: number
}

// Domain configuration
export interface DomainConfig {
  name: string
  patterns: RegExp[]
  enricher: (text: string) => Promise<string>
}

// Agent configuration
export interface AgentConfig {
  baseSystemPrompt: string
  domains?: DomainConfig[]
  maxIterations?: number
  maxTokens?: number
}

// Preprocessing result
export interface PreprocessingResult {
  detectedDomain: string | null
  enrichedSystemPrompt: string
  extractedEntities: Array<{ type: string; value: string }>
}

// LLM Client interface
export interface LLMClient {
  chat(options: {
    messages: Array<{ role: string; content: string; tool_calls?: ToolCall[] }>
    tools?: unknown[]
    stream?: boolean
  }): AsyncIterable<{
    content?: string
    thinking?: string
    toolCalls?: ToolCall[]
    done?: boolean
  }>

  complete(prompt: string, options?: { temperature?: number }): Promise<string>
}

// Oracle context
export interface OracleContext {
  tenantId: string
  threadId: string
  userId?: string
  memoryManager: MemoryManager
  toolbox: Toolbox
  llmClient: LLMClient
  config: AgentConfig
}

// ============================================================================
// Step 1: Domain Preprocessing
// ============================================================================

export async function preprocessRequest(
  message: string,
  config: AgentConfig
): Promise<PreprocessingResult> {
  const domains = config.domains || []

  for (const domain of domains) {
    const matches = domain.patterns.some((p) => p.test(message))
    if (matches) {
      // Enrich with domain context
      const enriched = await domain.enricher(message)

      return {
        detectedDomain: domain.name,
        enrichedSystemPrompt: `${config.baseSystemPrompt}\n\n${enriched}`,
        extractedEntities: extractEntities(message, domain),
      }
    }
  }

  return {
    detectedDomain: null,
    enrichedSystemPrompt: config.baseSystemPrompt,
    extractedEntities: [],
  }
}

function extractEntities(
  text: string,
  domain: DomainConfig
): Array<{ type: string; value: string }> {
  const entities: Array<{ type: string; value: string }> = []

  for (const pattern of domain.patterns) {
    const matches = text.matchAll(new RegExp(pattern, 'g'))
    for (const match of matches) {
      entities.push({
        type: domain.name,
        value: match[0],
      })
    }
  }

  return entities
}

// ============================================================================
// Step 2: Memory Prefetch with Scoring
// ============================================================================

export async function prefetchWithScoring(
  context: OracleContext,
  query: string
): Promise<PrefetchResult> {
  return context.memoryManager.prefetchAll(
    context.tenantId,
    context.threadId,
    query
  )
}

// ============================================================================
// Step 4: Partitioned Context Building
// ============================================================================

export function buildPartitionedContext(
  userMessage: string,
  prefetch: PrefetchResult,
  preprocessing: PreprocessingResult
): string {
  const parts: string[] = []

  // Question section
  parts.push(`# Question\n${userMessage}`)

  // Conversation history (last 10 messages)
  if (prefetch.conversational.length > 0) {
    const conv = prefetch.conversational
      .slice(-10)
      .map((m) => `${m.role.toLowerCase()}: ${m.content}`)
      .join('\n')
    parts.push(`## Conversation Memory\n${conv}`)
  }

  // Knowledge base (truncate to 400 chars each)
  if (prefetch.semantic.length > 0) {
    const kb = prefetch.semantic
      .map((d) => d.content.slice(0, 400))
      .join('\n\n')
    parts.push(`## Knowledge Base\n${kb}`)
  }

  // Workflow patterns
  if (prefetch.workflow.length > 0) {
    const wf = prefetch.workflow
      .map((d) => d.content.slice(0, 300))
      .join('\n\n')
    parts.push(`## Relevant Workflows\n${wf}`)
  }

  // Entities
  if (
    prefetch.entity.length > 0 ||
    preprocessing.extractedEntities.length > 0
  ) {
    const entities = [
      ...prefetch.entity.map((e) => e.content),
      ...preprocessing.extractedEntities.map((e) => `${e.type}: ${e.value}`),
    ]
      .slice(0, 10)
      .join('\n')
    parts.push(`## Entities\n${entities}`)
  }

  // Summaries (JIT expandable)
  if (prefetch.summary.length > 0) {
    const sum = prefetch.summary
      .map((s) => `[Summary ${s.id}]: ${s.content.slice(0, 200)}...`)
      .join('\n')
    parts.push(`## Previous Context Summaries\n${sum}`)
  }

  return parts.join('\n\n')
}

// ============================================================================
// Oracle Loop (Main Agent Loop)
// ============================================================================

export async function* oracleLoop(
  userMessage: string,
  context: OracleContext
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now()
  const stepTimings: StepTiming[] = []
  const maxIterations = context.config.maxIterations ?? 5

  try {
    // Step 1: Domain Preprocessing
    const prepStart = Date.now()
    const preprocessing = await preprocessRequest(
      userMessage,
      context.config
    )
    stepTimings.push({ step: 'preprocessing', durationMs: Date.now() - prepStart })
    yield { type: 'preprocessing', domain: preprocessing.detectedDomain }

    // Step 2: Memory Prefetch
    const prefetchStart = Date.now()
    const prefetch = await prefetchWithScoring(context, userMessage)
    stepTimings.push({ step: 'prefetch', durationMs: Date.now() - prefetchStart })
    yield { type: 'context', scores: prefetch.scores }

    // Step 3: Observability Start (placeholder for Langfuse/OpenTelemetry)
    const traceId = `trace-${Date.now()}`

    // Step 4: Build Partitioned Context
    const contextStart = Date.now()
    const partitionedContext = buildPartitionedContext(
      userMessage,
      prefetch,
      preprocessing
    )
    stepTimings.push({ step: 'context_build', durationMs: Date.now() - contextStart })

    // Build initial messages
    const messages: Array<{
      role: string
      content: string
      tool_calls?: ToolCall[]
    }> = [
      { role: 'system', content: preprocessing.enrichedSystemPrompt },
      { role: 'user', content: partitionedContext },
    ]

    // Oracle Loop
    let iteration = 0
    let bufferedContent = ''
    let finalContent = ''

    while (iteration < maxIterations) {
      iteration++
      const loopStart = Date.now()

      // Call LLM with tools
      const llmTools = context.toolbox.getToolsForLLM()

      let toolCallsReceived: ToolCall[] = []

      for await (const chunk of context.llmClient.chat({
        messages,
        tools: llmTools,
        stream: true,
      })) {
        if (chunk.content) {
          bufferedContent += chunk.content
          yield { type: 'token', content: chunk.content }
        }

        if (chunk.thinking) {
          yield { type: 'thinking', content: chunk.thinking }
        }

        if (chunk.toolCalls) {
          toolCallsReceived = chunk.toolCalls
        }
      }

      // Also try extracting tool calls from text
      const extractedCalls = extractToolCalls({
        toolCalls: toolCallsReceived,
        content: bufferedContent,
      })

      stepTimings.push({
        step: `loop_iteration_${iteration}`,
        durationMs: Date.now() - loopStart,
      })

      // Check for tool calls
      if (extractedCalls.length === 0) {
        // No tools called, we're done
        finalContent = bufferedContent
        yield { type: 'done', content: finalContent }
        break
      }

      // Execute tools in parallel
      yield {
        type: 'action',
        iteration,
        tools: extractedCalls.map((tc) => tc.function.name),
      }

      const execContext: ExecutionContext = {
        tenantId: context.tenantId,
        threadId: context.threadId,
        userId: context.userId,
        memoryManager: context.memoryManager,
      }

      const results = await context.toolbox.executeParallel(
        extractedCalls,
        execContext
      )

      for (const result of results) {
        yield {
          type: 'tool_result',
          name: result.name,
          status: result.status,
          ms: result.ms,
        }
      }

      // Build synthesis prompt
      const synthesisPrompt = buildSynthesisPrompt(bufferedContent, results)

      // Add tool results to message history
      messages.push({
        role: 'assistant',
        content: bufferedContent,
        tool_calls: extractedCalls,
      })

      for (const result of results) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(result.result),
        })
      }

      messages.push({
        role: 'user',
        content: synthesisPrompt,
      })

      // Reset for next iteration
      bufferedContent = ''
    }

    if (iteration >= maxIterations && !finalContent) {
      finalContent = bufferedContent
      yield { type: 'warning', message: 'Max iterations reached' }
      yield { type: 'done', content: finalContent }
    }

    // Step 5: Memory Sync
    const syncStart = Date.now()
    await context.memoryManager.syncAll(context.tenantId, context.threadId, [
      { role: 'USER' as MemoryRole, content: userMessage },
      { role: 'ASSISTANT' as MemoryRole, content: finalContent },
    ])
    stepTimings.push({ step: 'memory_sync', durationMs: Date.now() - syncStart })

    // Step 6: Observability Close
    stepTimings.push({ step: 'total', durationMs: Date.now() - startTime })
    yield { type: 'trace', steps: stepTimings }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    yield { type: 'error', message: errorMessage }
  }
}

// ============================================================================
// SSE Response Helper
// ============================================================================

export function formatSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export async function streamToResponse(
  generator: AsyncGenerator<StreamEvent>,
  writer: { write: (data: string) => void; end: () => void }
): Promise<void> {
  try {
    for await (const event of generator) {
      writer.write(formatSSE(event))
    }
  } finally {
    writer.end()
  }
}
