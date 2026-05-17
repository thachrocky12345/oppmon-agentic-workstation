// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Distributed Tracing
 *
 * OpenTelemetry-compatible tracing with W3C Trace Context propagation.
 */

import type {
  TraceContext,
  Span,
  SpanCategory,
  SpanStatus,
  SpanAttributes,
  SpanEvent,
} from './types.js'

// =============================================================================
// Trace ID Generation
// =============================================================================

/**
 * Generate a random 32-character hex trace ID
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a random 16-character hex span ID
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Create a new trace context
 */
export function createTraceContext(
  options: Partial<TraceContext> = {}
): TraceContext {
  return {
    traceId: options.traceId ?? generateTraceId(),
    spanId: options.spanId ?? generateSpanId(),
    traceFlags: options.traceFlags ?? 1, // Sampled by default
    traceState: options.traceState ?? '',
  }
}

// =============================================================================
// W3C Trace Context Propagation
// =============================================================================

const TRACEPARENT_HEADER = 'traceparent'
const TRACESTATE_HEADER = 'tracestate'
const TRACEPARENT_VERSION = '00'

/**
 * Serialize trace context to W3C traceparent header
 * Format: version-traceid-spanid-traceflags
 */
export function serializeTraceparent(ctx: TraceContext): string {
  const flags = ctx.traceFlags.toString(16).padStart(2, '0')
  return `${TRACEPARENT_VERSION}-${ctx.traceId}-${ctx.spanId}-${flags}`
}

/**
 * Parse W3C traceparent header to trace context
 */
export function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split('-')
  if (parts.length < 4) return null

  const [version, traceId, spanId, flagsHex] = parts

  if (version !== TRACEPARENT_VERSION) return null
  if (traceId.length !== 32) return null
  if (spanId.length !== 16) return null

  const traceFlags = parseInt(flagsHex, 16)
  if (isNaN(traceFlags)) return null

  return { traceId, spanId, traceFlags, traceState: '' }
}

/**
 * Inject trace context into carrier (headers map)
 */
export function injectTraceContext(
  ctx: TraceContext,
  carrier: Map<string, string> | Record<string, string>
): void {
  const traceparent = serializeTraceparent(ctx)
  if (carrier instanceof Map) {
    carrier.set(TRACEPARENT_HEADER, traceparent)
    if (ctx.traceState) {
      carrier.set(TRACESTATE_HEADER, ctx.traceState)
    }
  } else {
    carrier[TRACEPARENT_HEADER] = traceparent
    if (ctx.traceState) {
      carrier[TRACESTATE_HEADER] = ctx.traceState
    }
  }
}

/**
 * Extract trace context from carrier (headers map)
 */
export function extractTraceContext(
  carrier: Map<string, string> | Record<string, string>
): TraceContext | null {
  const traceparent =
    carrier instanceof Map
      ? carrier.get(TRACEPARENT_HEADER)
      : carrier[TRACEPARENT_HEADER]

  if (!traceparent) return null

  const ctx = parseTraceparent(traceparent)
  if (!ctx) return null

  const tracestate =
    carrier instanceof Map
      ? carrier.get(TRACESTATE_HEADER)
      : carrier[TRACESTATE_HEADER]

  if (tracestate) {
    ctx.traceState = tracestate
  }

  return ctx
}

// =============================================================================
// Span Builder
// =============================================================================

/**
 * Create a new span
 */
export function createSpan(
  traceId: string,
  name: string,
  category: SpanCategory,
  parentSpanId?: string
): Span {
  return {
    traceId,
    spanId: generateSpanId(),
    parentSpanId,
    name,
    category,
    startTimeUs: BigInt(Date.now()) * 1000n,
    endTimeUs: undefined,
    status: 'unset',
    attributes: {},
    events: [],
  }
}

/**
 * End a span and record duration
 */
export function endSpan(span: Span, status: SpanStatus = 'ok'): Span {
  return {
    ...span,
    endTimeUs: BigInt(Date.now()) * 1000n,
    status,
  }
}

/**
 * Add attributes to a span
 */
export function addSpanAttributes(
  span: Span,
  attributes: SpanAttributes
): Span {
  return {
    ...span,
    attributes: { ...span.attributes, ...attributes },
  }
}

/**
 * Add an event to a span
 */
export function addSpanEvent(
  span: Span,
  name: string,
  attributes: SpanAttributes = {}
): Span {
  const event: SpanEvent = {
    name,
    timestampUs: BigInt(Date.now()) * 1000n,
    attributes,
  }
  return {
    ...span,
    events: [...span.events, event],
  }
}

/**
 * Calculate span duration in microseconds
 */
export function getSpanDurationUs(span: Span): bigint | null {
  if (!span.endTimeUs) return null
  return span.endTimeUs - span.startTimeUs
}

// =============================================================================
// Tracer
// =============================================================================

export interface TracerOptions {
  serviceName: string
  onSpanEnd?: (span: Span) => void
}

/**
 * Tracer for creating and managing spans
 */
export class Tracer {
  private serviceName: string
  private onSpanEnd?: (span: Span) => void
  private activeSpans: Map<string, Span> = new Map()

  constructor(options: TracerOptions) {
    this.serviceName = options.serviceName
    this.onSpanEnd = options.onSpanEnd
  }

  /**
   * Start a new trace
   */
  startTrace(name: string, category: SpanCategory): Span {
    const ctx = createTraceContext()
    const span = createSpan(ctx.traceId, name, category)
    span.attributes['service.name'] = this.serviceName
    this.activeSpans.set(span.spanId, span)
    return span
  }

  /**
   * Start a child span
   */
  startSpan(
    parent: Span | TraceContext,
    name: string,
    category: SpanCategory
  ): Span {
    const traceId = parent.traceId
    const parentSpanId = parent.spanId
    const span = createSpan(traceId, name, category, parentSpanId)
    span.attributes['service.name'] = this.serviceName
    this.activeSpans.set(span.spanId, span)
    return span
  }

  /**
   * End a span
   */
  endSpan(span: Span, status: SpanStatus = 'ok'): Span {
    const ended = endSpan(span, status)
    this.activeSpans.delete(span.spanId)
    this.onSpanEnd?.(ended)
    return ended
  }

  /**
   * Record an exception on a span
   */
  recordException(span: Span, error: Error): Span {
    const updated = addSpanEvent(span, 'exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack ?? '',
    })
    return { ...updated, status: 'error' }
  }

  /**
   * Get active span by ID
   */
  getActiveSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId)
  }

  /**
   * Get all active spans
   */
  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values())
  }
}

// =============================================================================
// Span Exporter Interface
// =============================================================================

export interface SpanExporter {
  export(spans: Span[]): Promise<void>
  shutdown(): Promise<void>
}

/**
 * Console exporter for debugging
 */
export class ConsoleSpanExporter implements SpanExporter {
  async export(spans: Span[]): Promise<void> {
    for (const span of spans) {
      const duration = getSpanDurationUs(span)
      console.log(
        `[SPAN] ${span.name} (${span.category}) - ${duration ? Number(duration) / 1000 : '?'}ms - ${span.status}`
      )
    }
  }

  async shutdown(): Promise<void> {
    // No-op for console exporter
  }
}

/**
 * In-memory exporter for testing
 */
export class InMemorySpanExporter implements SpanExporter {
  private spans: Span[] = []

  async export(spans: Span[]): Promise<void> {
    this.spans.push(...spans)
  }

  async shutdown(): Promise<void> {
    this.spans = []
  }

  getSpans(): Span[] {
    return [...this.spans]
  }

  clear(): void {
    this.spans = []
  }
}
