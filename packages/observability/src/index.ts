/**
 * Observability Package
 *
 * Distributed tracing, metrics, and LLM observability for Arkon AI Gateway.
 *
 * @example
 * ```typescript
 * import {
 *   Tracer,
 *   SpanCategory,
 *   LangfuseObserver,
 *   LatencyTracker,
 *   MetricRegistry,
 * } from '@arkon/observability'
 *
 * // Create tracer
 * const tracer = new Tracer({ serviceName: 'agent-api' })
 * const span = tracer.startTrace('handle-request', SpanCategory.HTTP_REQUEST)
 *
 * // Create LLM observer
 * const observer = new LangfuseObserver({
 *   publicKey: 'pk-...',
 *   secretKey: 'sk-...',
 * })
 * const trace = observer.startTrace('tenant-1', 'thread-1')
 * observer.recordGeneration(trace, {
 *   model: 'claude-3',
 *   prompt: 'Hello',
 *   completion: 'Hi!',
 *   promptTokens: 10,
 *   completionTokens: 5,
 *   latencyMs: 500,
 * })
 *
 * // Track latency
 * const latencyTracker = new LatencyTracker()
 * const reqTimer = latencyTracker.trackRequest('req-1')
 * const compTimer = latencyTracker.trackComponent('req-1', 'llm')
 * // ... do work ...
 * compTimer.stop()
 * reqTimer.stop()
 * const breakdown = latencyTracker.getBreakdown('req-1')
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  TraceContext,
  Span,
  SpanStatus,
  SpanAttributes,
  SpanEvent,
  Trace,
  LLMGenerationParams,
  ToolSpanParams,
  RetrievalParams,
  ScoredDocument,
  ScoreParams,
  MetricLabels,
  ComponentTiming,
  LatencyBreakdown,
  CrossBoundaryLatency,
  ComponentHealth,
  ComponentStatus,
  AgentMetrics,
  SwarmMetrics,
  DashboardMetrics,
  SwarmVerdict,
  ConsensusMetrics,
} from './types.js'

export { SpanCategory, TraceContextSchema } from './types.js'

// Tracing
export {
  generateTraceId,
  generateSpanId,
  createTraceContext,
  serializeTraceparent,
  parseTraceparent,
  injectTraceContext,
  extractTraceContext,
  createSpan,
  endSpan,
  addSpanAttributes,
  addSpanEvent,
  getSpanDurationUs,
  Tracer,
  ConsoleSpanExporter,
  InMemorySpanExporter,
} from './tracing.js'

export type { TracerOptions, SpanExporter } from './tracing.js'

// Langfuse LLM Observability
export {
  LangfuseObserver,
  MockLLMObserver,
  calculateNDCG,
  calculateMRR,
} from './langfuse.js'

export type { LLMObserver, LangfuseConfig } from './langfuse.js'

// Latency Tracking
export {
  RequestTimer,
  ComponentTimer,
  LatencyTracker,
  CrossBoundaryTracker,
  PercentileCalculator,
  LatencyHistogram,
  DEFAULT_LATENCY_BUCKETS,
} from './latency.js'

// Metrics
export {
  Counter,
  Gauge,
  Histogram,
  SwarmMetricsCollector,
  MetricRegistry,
  DashboardMetricsCollector,
} from './metrics.js'
