/**
 * Distributed Tracing Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
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
  InMemorySpanExporter,
} from '../tracing.js'
import { SpanCategory } from '../types.js'

describe('ID Generation', () => {
  it('generates 32-char hex trace ID', () => {
    const id = generateTraceId()
    expect(id).toHaveLength(32)
    expect(id).toMatch(/^[0-9a-f]+$/)
  })

  it('generates 16-char hex span ID', () => {
    const id = generateSpanId()
    expect(id).toHaveLength(16)
    expect(id).toMatch(/^[0-9a-f]+$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateTraceId())
    }
    expect(ids.size).toBe(100)
  })
})

describe('TraceContext', () => {
  it('creates context with defaults', () => {
    const ctx = createTraceContext()

    expect(ctx.traceId).toHaveLength(32)
    expect(ctx.spanId).toHaveLength(16)
    expect(ctx.traceFlags).toBe(1)
    expect(ctx.traceState).toBe('')
  })

  it('creates context with custom values', () => {
    const ctx = createTraceContext({
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: 0,
      traceState: 'vendor=value',
    })

    expect(ctx.traceId).toBe('a'.repeat(32))
    expect(ctx.spanId).toBe('b'.repeat(16))
    expect(ctx.traceFlags).toBe(0)
    expect(ctx.traceState).toBe('vendor=value')
  })
})

describe('W3C Trace Context Propagation', () => {
  describe('serializeTraceparent', () => {
    it('serializes to W3C format', () => {
      const ctx = createTraceContext({
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: 1,
        traceState: '',
      })

      const header = serializeTraceparent(ctx)
      expect(header).toBe(
        '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
      )
    })

    it('pads trace flags', () => {
      const ctx = createTraceContext({ traceFlags: 0 })
      const header = serializeTraceparent(ctx)
      expect(header).toMatch(/-00$/)
    })
  })

  describe('parseTraceparent', () => {
    it('parses valid traceparent', () => {
      const header =
        '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
      const ctx = parseTraceparent(header)

      expect(ctx).not.toBeNull()
      expect(ctx!.traceId).toBe('0af7651916cd43dd8448eb211c80319c')
      expect(ctx!.spanId).toBe('b7ad6b7169203331')
      expect(ctx!.traceFlags).toBe(1)
    })

    it('returns null for invalid format', () => {
      expect(parseTraceparent('invalid')).toBeNull()
      expect(parseTraceparent('00-short-short-00')).toBeNull()
      expect(parseTraceparent('01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')).toBeNull()
    })
  })

  describe('inject/extract', () => {
    it('roundtrips through Map carrier', () => {
      const ctx = createTraceContext()
      const carrier = new Map<string, string>()

      injectTraceContext(ctx, carrier)
      const extracted = extractTraceContext(carrier)

      expect(extracted).not.toBeNull()
      expect(extracted!.traceId).toBe(ctx.traceId)
      expect(extracted!.spanId).toBe(ctx.spanId)
    })

    it('roundtrips through object carrier', () => {
      const ctx = createTraceContext({ traceState: 'vendor=value' })
      const carrier: Record<string, string> = {}

      injectTraceContext(ctx, carrier)
      const extracted = extractTraceContext(carrier)

      expect(extracted).not.toBeNull()
      expect(extracted!.traceId).toBe(ctx.traceId)
      expect(extracted!.traceState).toBe('vendor=value')
    })

    it('returns null when no traceparent', () => {
      const carrier = new Map<string, string>()
      expect(extractTraceContext(carrier)).toBeNull()
    })
  })
})

describe('Span', () => {
  it('creates span with required fields', () => {
    const span = createSpan(
      'a'.repeat(32),
      'test-span',
      SpanCategory.HTTP_REQUEST
    )

    expect(span.traceId).toBe('a'.repeat(32))
    expect(span.spanId).toHaveLength(16)
    expect(span.name).toBe('test-span')
    expect(span.category).toBe(SpanCategory.HTTP_REQUEST)
    expect(span.startTimeUs).toBeGreaterThan(0n)
    expect(span.endTimeUs).toBeUndefined()
    expect(span.status).toBe('unset')
  })

  it('creates child span with parent ID', () => {
    const span = createSpan(
      'a'.repeat(32),
      'child-span',
      SpanCategory.LLM_CALL,
      'parent12345678'
    )

    expect(span.parentSpanId).toBe('parent12345678')
  })

  it('ends span with status', () => {
    const span = createSpan('a'.repeat(32), 'test', SpanCategory.LLM_CALL)
    const ended = endSpan(span, 'ok')

    expect(ended.endTimeUs).toBeDefined()
    expect(ended.status).toBe('ok')
  })

  it('adds attributes', () => {
    const span = createSpan('a'.repeat(32), 'test', SpanCategory.LLM_CALL)
    const updated = addSpanAttributes(span, {
      'http.method': 'GET',
      'http.status_code': 200,
    })

    expect(updated.attributes['http.method']).toBe('GET')
    expect(updated.attributes['http.status_code']).toBe(200)
  })

  it('adds events', () => {
    const span = createSpan('a'.repeat(32), 'test', SpanCategory.LLM_CALL)
    const updated = addSpanEvent(span, 'token-received', { count: 10 })

    expect(updated.events).toHaveLength(1)
    expect(updated.events[0].name).toBe('token-received')
    expect(updated.events[0].attributes.count).toBe(10)
  })

  it('calculates duration', async () => {
    const span = createSpan('a'.repeat(32), 'test', SpanCategory.LLM_CALL)

    // Wait a bit
    await new Promise((r) => setTimeout(r, 10))

    const ended = endSpan(span)
    const duration = getSpanDurationUs(ended)

    expect(duration).not.toBeNull()
    expect(Number(duration)).toBeGreaterThan(0)
  })

  it('returns null duration for unfinished span', () => {
    const span = createSpan('a'.repeat(32), 'test', SpanCategory.LLM_CALL)
    expect(getSpanDurationUs(span)).toBeNull()
  })
})

describe('Tracer', () => {
  let tracer: Tracer
  let exporter: InMemorySpanExporter

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
    tracer = new Tracer({
      serviceName: 'test-service',
      onSpanEnd: (span) => exporter.export([span]),
    })
  })

  it('starts new trace', () => {
    const span = tracer.startTrace('request', SpanCategory.HTTP_REQUEST)

    expect(span.traceId).toHaveLength(32)
    expect(span.name).toBe('request')
    expect(span.attributes['service.name']).toBe('test-service')
  })

  it('starts child span', () => {
    const parent = tracer.startTrace('parent', SpanCategory.HTTP_REQUEST)
    const child = tracer.startSpan(parent, 'child', SpanCategory.LLM_CALL)

    expect(child.traceId).toBe(parent.traceId)
    expect(child.parentSpanId).toBe(parent.spanId)
  })

  it('ends span and exports', () => {
    const span = tracer.startTrace('test', SpanCategory.HTTP_REQUEST)
    tracer.endSpan(span)

    expect(exporter.getSpans()).toHaveLength(1)
    expect(exporter.getSpans()[0].status).toBe('ok')
  })

  it('records exception', () => {
    const span = tracer.startTrace('test', SpanCategory.HTTP_REQUEST)
    const error = new Error('Test error')
    const updated = tracer.recordException(span, error)

    expect(updated.status).toBe('error')
    expect(updated.events).toHaveLength(1)
    expect(updated.events[0].name).toBe('exception')
    expect(updated.events[0].attributes['exception.message']).toBe('Test error')
  })

  it('tracks active spans', () => {
    const span1 = tracer.startTrace('span1', SpanCategory.HTTP_REQUEST)
    const span2 = tracer.startSpan(span1, 'span2', SpanCategory.LLM_CALL)

    expect(tracer.getActiveSpans()).toHaveLength(2)
    expect(tracer.getActiveSpan(span1.spanId)).toBe(span1)

    tracer.endSpan(span2)
    expect(tracer.getActiveSpans()).toHaveLength(1)
  })
})

describe('InMemorySpanExporter', () => {
  it('collects spans', async () => {
    const exporter = new InMemorySpanExporter()
    const span = createSpan('a'.repeat(32), 'test', SpanCategory.LLM_CALL)

    await exporter.export([span])

    expect(exporter.getSpans()).toHaveLength(1)
  })

  it('clears spans', async () => {
    const exporter = new InMemorySpanExporter()
    await exporter.export([createSpan('a'.repeat(32), 'test', SpanCategory.LLM_CALL)])

    exporter.clear()

    expect(exporter.getSpans()).toHaveLength(0)
  })
})
