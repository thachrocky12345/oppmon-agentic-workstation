// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Observability Types
 *
 * Core types for distributed tracing, metrics, and LLM observability.
 */

import { z } from 'zod'

// =============================================================================
// Trace Context
// =============================================================================

/**
 * W3C Trace Context format
 * https://www.w3.org/TR/trace-context/
 */
export interface TraceContext {
  /** 32-character hex trace ID */
  traceId: string
  /** 16-character hex span ID */
  spanId: string
  /** 8-bit trace flags (sampled, etc.) */
  traceFlags: number
  /** Vendor-specific trace state */
  traceState: string
}

export const TraceContextSchema = z.object({
  traceId: z.string().length(32).regex(/^[0-9a-f]+$/i),
  spanId: z.string().length(16).regex(/^[0-9a-f]+$/i),
  traceFlags: z.number().int().min(0).max(255),
  traceState: z.string(),
})

/**
 * Span categories for agent system
 */
export enum SpanCategory {
  HTTP_REQUEST = 'http.request',
  ORACLE_LOOP = 'agent.oracle_loop',
  MEMORY_PREFETCH = 'agent.memory.prefetch',
  TOOL_EXECUTION = 'agent.tool.execute',
  LLM_CALL = 'llm.chat',
  VECTOR_SEARCH = 'vector.search',
  RUST_ENGINE = 'engine.rust',
  RISK_GATE = 'engine.risk_gate',
}

// =============================================================================
// Span Types
// =============================================================================

export type SpanStatus = 'ok' | 'error' | 'unset'

export interface SpanAttributes {
  [key: string]: string | number | boolean | string[]
}

export interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  category: SpanCategory
  startTimeUs: bigint
  endTimeUs?: bigint
  status: SpanStatus
  attributes: SpanAttributes
  events: SpanEvent[]
}

export interface SpanEvent {
  name: string
  timestampUs: bigint
  attributes: SpanAttributes
}

// =============================================================================
// Langfuse Types
// =============================================================================

export interface LLMGenerationParams {
  model: string
  prompt: string
  completion: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  metadata?: Record<string, unknown>
}

export interface ToolSpanParams {
  name: string
  input: unknown
  output: unknown
  durationMs: number
  status: 'success' | 'error'
  errorMessage?: string
}

export interface RetrievalParams {
  query: string
  results: ScoredDocument[]
  topK: number
  latencyMs: number
  /** Normalized Discounted Cumulative Gain */
  ndcg?: number
  /** Mean Reciprocal Rank */
  mrr?: number
}

export interface ScoredDocument {
  id: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

export interface ScoreParams {
  name: string
  value: number
  comment?: string
}

/**
 * Trace handle returned by LLM observer
 */
export interface Trace {
  id: string
  tenantId: string
  threadId: string
  startTime: Date
  metadata: Record<string, unknown>
}

// =============================================================================
// Metrics Types
// =============================================================================

export interface MetricLabels {
  [key: string]: string
}

export interface Counter {
  inc(labels?: MetricLabels): void
  inc(value: number, labels?: MetricLabels): void
}

export interface Gauge {
  set(value: number, labels?: MetricLabels): void
  inc(labels?: MetricLabels): void
  dec(labels?: MetricLabels): void
}

export interface Histogram {
  observe(value: number, labels?: MetricLabels): void
  startTimer(labels?: MetricLabels): () => number
}

export interface Summary {
  observe(value: number, labels?: MetricLabels): void
}

// =============================================================================
// Latency Types
// =============================================================================

export interface ComponentTiming {
  name: string
  start: number
  end: number
  duration: number
  percentage: number
}

export interface LatencyBreakdown {
  requestId: string
  total: number
  components: ComponentTiming[]
  criticalPath: string[]
}

export interface CrossBoundaryLatency {
  goPreprocess: number
  goToRust: number
  rustProcess: number
  rustToGo: number
  goPostprocess: number
}

// =============================================================================
// Dashboard Types
// =============================================================================

export type ComponentHealth = 'healthy' | 'degraded' | 'unhealthy'

export interface ComponentStatus {
  name: string
  status: ComponentHealth
  latencyP95: number
  errorRate: number
}

export interface AgentMetrics {
  activeThreads: number
  toolCallsTotal: number
  averageIterations: number
  memoryUsageMB: number
}

export interface SwarmMetrics {
  agentCount: number
  avgConfidence: number
  consensusRate: number
  tickLatencyP95: number
}

export interface DashboardMetrics {
  requestsTotal: number
  requestsPerSecond: number
  errorRate: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  components: ComponentStatus[]
  agent: AgentMetrics
  swarm: SwarmMetrics
}

// =============================================================================
// Consensus Types (for multi-agent)
// =============================================================================

export interface SwarmVerdict {
  decision: 'normal' | 'suspicious' | 'malicious'
  confidence: number
  probNormal: number
  probSuspicious: number
  probMalicious: number
  stanceStdDev: number
  agentVotes: number
}

export interface ConsensusMetrics {
  verdictsTotal: number
  consensusReached: number
  consensusFailed: number
  splitDecisions: number
  avgConfidence: number
  avgAgreement: number
}
