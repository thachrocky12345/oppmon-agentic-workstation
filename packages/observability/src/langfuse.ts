/**
 * Langfuse LLM Observability
 *
 * Integration with Langfuse for LLM-specific observability including
 * generations, tool calls, retrieval, and feedback scoring.
 */

import type {
  Trace,
  LLMGenerationParams,
  ToolSpanParams,
  RetrievalParams,
  ScoreParams,
  ScoredDocument,
} from './types.js'

// =============================================================================
// LLM Observer Interface
// =============================================================================

export interface LLMObserver {
  /** Start a new trace for a conversation */
  startTrace(tenantId: string, threadId: string): Trace

  /** Record LLM generation */
  recordGeneration(trace: Trace, params: LLMGenerationParams): void

  /** Record tool usage */
  recordToolSpan(trace: Trace, params: ToolSpanParams): void

  /** Record retrieval (RAG) */
  recordRetrieval(trace: Trace, params: RetrievalParams): void

  /** Add feedback/scores */
  recordScore(trace: Trace, params: ScoreParams): void

  /** Flush all pending events */
  flush(): Promise<void>
}

// =============================================================================
// Event Types
// =============================================================================

type EventType = 'trace' | 'generation' | 'span' | 'score'

interface BaseEvent {
  type: EventType
  timestamp: Date
  traceId: string
}

interface TraceEvent extends BaseEvent {
  type: 'trace'
  tenantId: string
  threadId: string
  metadata: Record<string, unknown>
}

interface GenerationEvent extends BaseEvent {
  type: 'generation'
  model: string
  prompt: string
  completion: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  metadata?: Record<string, unknown>
}

interface SpanEvent extends BaseEvent {
  type: 'span'
  name: string
  input: unknown
  output: unknown
  durationMs: number
  status: 'success' | 'error'
  errorMessage?: string
}

interface ScoreEvent extends BaseEvent {
  type: 'score'
  name: string
  value: number
  comment?: string
}

type ObservabilityEvent =
  | TraceEvent
  | GenerationEvent
  | SpanEvent
  | ScoreEvent

// =============================================================================
// Langfuse Observer Implementation
// =============================================================================

export interface LangfuseConfig {
  publicKey: string
  secretKey: string
  baseUrl?: string
  flushInterval?: number
  maxBatchSize?: number
}

/**
 * Langfuse observer for LLM observability
 */
export class LangfuseObserver implements LLMObserver {
  private config: LangfuseConfig
  private eventBuffer: ObservabilityEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null

  constructor(config: LangfuseConfig) {
    this.config = {
      flushInterval: 5000,
      maxBatchSize: 100,
      ...config,
    }

    // Start periodic flush
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error)
    }, this.config.flushInterval)
  }

  /**
   * Start a new trace for a conversation
   */
  startTrace(tenantId: string, threadId: string): Trace {
    const trace: Trace = {
      id: `${tenantId}-${threadId}-${Date.now()}`,
      tenantId,
      threadId,
      startTime: new Date(),
      metadata: {},
    }

    this.bufferEvent({
      type: 'trace',
      timestamp: new Date(),
      traceId: trace.id,
      tenantId,
      threadId,
      metadata: { tags: ['agent', 'oracle-loop'] },
    })

    return trace
  }

  /**
   * Record LLM generation
   */
  recordGeneration(trace: Trace, params: LLMGenerationParams): void {
    this.bufferEvent({
      type: 'generation',
      timestamp: new Date(),
      traceId: trace.id,
      model: params.model,
      prompt: params.prompt,
      completion: params.completion,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      latencyMs: params.latencyMs,
      metadata: params.metadata,
    })
  }

  /**
   * Record tool usage
   */
  recordToolSpan(trace: Trace, params: ToolSpanParams): void {
    this.bufferEvent({
      type: 'span',
      timestamp: new Date(),
      traceId: trace.id,
      name: `tool:${params.name}`,
      input: params.input,
      output: params.output,
      durationMs: params.durationMs,
      status: params.status,
      errorMessage: params.errorMessage,
    })
  }

  /**
   * Record retrieval (RAG)
   */
  recordRetrieval(trace: Trace, params: RetrievalParams): void {
    this.bufferEvent({
      type: 'span',
      timestamp: new Date(),
      traceId: trace.id,
      name: 'retrieval',
      input: { query: params.query, topK: params.topK },
      output: {
        results: params.results.map((r) => ({
          id: r.id,
          score: r.score,
          preview: r.content.slice(0, 100),
        })),
        ndcg: params.ndcg,
        mrr: params.mrr,
      },
      durationMs: params.latencyMs,
      status: 'success',
    })
  }

  /**
   * Add feedback/scores
   */
  recordScore(trace: Trace, params: ScoreParams): void {
    this.bufferEvent({
      type: 'score',
      timestamp: new Date(),
      traceId: trace.id,
      name: params.name,
      value: params.value,
      comment: params.comment,
    })
  }

  /**
   * Flush all pending events
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return

    const events = this.eventBuffer.splice(0, this.config.maxBatchSize)

    // In production, this would POST to Langfuse API
    // For now, we just process the events
    await this.sendEvents(events)
  }

  /**
   * Shutdown the observer
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }

  /**
   * Get pending event count
   */
  getPendingCount(): number {
    return this.eventBuffer.length
  }

  private bufferEvent(event: ObservabilityEvent): void {
    this.eventBuffer.push(event)

    // Auto-flush if buffer is full
    if (this.eventBuffer.length >= (this.config.maxBatchSize ?? 100)) {
      this.flush().catch(console.error)
    }
  }

  private async sendEvents(events: ObservabilityEvent[]): Promise<void> {
    // In production, POST to Langfuse API
    // const response = await fetch(`${this.config.baseUrl}/api/public/ingestion`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'X-Langfuse-Public-Key': this.config.publicKey,
    //     'X-Langfuse-Secret-Key': this.config.secretKey,
    //   },
    //   body: JSON.stringify({ batch: events }),
    // })

    // For now, we just track that events were sent
    this.onEventsSent?.(events)
  }

  // Testing hook
  onEventsSent?: (events: ObservabilityEvent[]) => void
}

// =============================================================================
// Mock Observer for Testing
// =============================================================================

/**
 * Mock observer that captures all events for testing
 */
export class MockLLMObserver implements LLMObserver {
  readonly traces: Trace[] = []
  readonly generations: { trace: Trace; params: LLMGenerationParams }[] = []
  readonly toolSpans: { trace: Trace; params: ToolSpanParams }[] = []
  readonly retrievals: { trace: Trace; params: RetrievalParams }[] = []
  readonly scores: { trace: Trace; params: ScoreParams }[] = []

  startTrace(tenantId: string, threadId: string): Trace {
    const trace: Trace = {
      id: `mock-${tenantId}-${threadId}-${Date.now()}`,
      tenantId,
      threadId,
      startTime: new Date(),
      metadata: {},
    }
    this.traces.push(trace)
    return trace
  }

  recordGeneration(trace: Trace, params: LLMGenerationParams): void {
    this.generations.push({ trace, params })
  }

  recordToolSpan(trace: Trace, params: ToolSpanParams): void {
    this.toolSpans.push({ trace, params })
  }

  recordRetrieval(trace: Trace, params: RetrievalParams): void {
    this.retrievals.push({ trace, params })
  }

  recordScore(trace: Trace, params: ScoreParams): void {
    this.scores.push({ trace, params })
  }

  async flush(): Promise<void> {
    // No-op for mock
  }

  clear(): void {
    this.traces.length = 0
    this.generations.length = 0
    this.toolSpans.length = 0
    this.retrievals.length = 0
    this.scores.length = 0
  }
}

// =============================================================================
// Metrics Helpers
// =============================================================================

/**
 * Calculate NDCG@k for retrieval results
 */
export function calculateNDCG(
  results: ScoredDocument[],
  relevanceScores: Map<string, number>,
  k: number
): number {
  if (results.length === 0 || k === 0) return 0

  const topK = results.slice(0, k)

  // Calculate DCG
  let dcg = 0
  for (let i = 0; i < topK.length; i++) {
    const rel = relevanceScores.get(topK[i].id) ?? 0
    dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2)
  }

  // Calculate ideal DCG
  const sortedRelevance = Array.from(relevanceScores.values())
    .sort((a, b) => b - a)
    .slice(0, k)

  let idcg = 0
  for (let i = 0; i < sortedRelevance.length; i++) {
    idcg += (Math.pow(2, sortedRelevance[i]) - 1) / Math.log2(i + 2)
  }

  return idcg === 0 ? 0 : dcg / idcg
}

/**
 * Calculate MRR for retrieval results
 */
export function calculateMRR(
  results: ScoredDocument[],
  relevantIds: Set<string>
): number {
  for (let i = 0; i < results.length; i++) {
    if (relevantIds.has(results[i].id)) {
      return 1 / (i + 1)
    }
  }
  return 0
}
