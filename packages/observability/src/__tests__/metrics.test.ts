// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Metrics Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  Counter,
  Gauge,
  Histogram,
  SwarmMetricsCollector,
  MetricRegistry,
  DashboardMetricsCollector,
} from '../metrics.js'
import type { SwarmVerdict } from '../types.js'

describe('Counter', () => {
  let counter: Counter

  beforeEach(() => {
    counter = new Counter({
      name: 'test_counter',
      help: 'Test counter',
      type: 'counter',
      labels: ['method', 'path'],
    })
  })

  it('increments by 1', () => {
    counter.inc()
    expect(counter.get()).toBe(1)
  })

  it('increments by value', () => {
    counter.inc(5)
    expect(counter.get()).toBe(5)
  })

  it('increments with labels', () => {
    counter.inc({ method: 'GET', path: '/api' })
    counter.inc({ method: 'POST', path: '/api' })
    counter.inc({ method: 'GET', path: '/api' })

    expect(counter.get({ method: 'GET', path: '/api' })).toBe(2)
    expect(counter.get({ method: 'POST', path: '/api' })).toBe(1)
  })

  it('collects values', () => {
    counter.inc({ method: 'GET', path: '/api' })
    counter.inc(5, { method: 'POST', path: '/api' })

    const collected = counter.collect()

    expect(collected.length).toBe(2)
    expect(collected.find((v) => v.labels.method === 'GET')?.value).toBe(1)
    expect(collected.find((v) => v.labels.method === 'POST')?.value).toBe(5)
  })

  it('resets', () => {
    counter.inc(10)
    counter.reset()
    expect(counter.get()).toBe(0)
  })
})

describe('Gauge', () => {
  let gauge: Gauge

  beforeEach(() => {
    gauge = new Gauge({
      name: 'test_gauge',
      help: 'Test gauge',
      type: 'gauge',
      labels: ['region'],
    })
  })

  it('sets value', () => {
    gauge.set(42)
    expect(gauge.get()).toBe(42)
  })

  it('increments', () => {
    gauge.set(10)
    gauge.inc()
    expect(gauge.get()).toBe(11)
  })

  it('decrements', () => {
    gauge.set(10)
    gauge.dec()
    expect(gauge.get()).toBe(9)
  })

  it('handles labels', () => {
    gauge.set(100, { region: 'us' })
    gauge.set(200, { region: 'eu' })

    expect(gauge.get({ region: 'us' })).toBe(100)
    expect(gauge.get({ region: 'eu' })).toBe(200)
  })

  it('collects values', () => {
    gauge.set(10, { region: 'us' })
    gauge.set(20, { region: 'eu' })

    const collected = gauge.collect()
    expect(collected.length).toBe(2)
  })
})

describe('Histogram', () => {
  let histogram: Histogram

  beforeEach(() => {
    histogram = new Histogram({
      name: 'test_histogram',
      help: 'Test histogram',
      type: 'histogram',
      buckets: [0.1, 0.5, 1.0],
      labels: ['method'],
    })
  })

  it('observes values', () => {
    histogram.observe(0.3)
    histogram.observe(0.7)
    histogram.observe(2.0)

    expect(histogram.getCount()).toBe(3)
    expect(histogram.getSum()).toBeCloseTo(3.0, 5)
  })

  it('handles labels', () => {
    histogram.observe(0.1, { method: 'GET' })
    histogram.observe(0.2, { method: 'POST' })

    expect(histogram.getCount({ method: 'GET' })).toBe(1)
    expect(histogram.getCount({ method: 'POST' })).toBe(1)
  })

  it('collects with buckets', () => {
    histogram.observe(0.05)  // goes to bucket <= 0.1
    histogram.observe(0.3)   // goes to bucket <= 0.5
    histogram.observe(0.8)   // goes to bucket <= 1.0

    const collected = histogram.collect()
    expect(collected.length).toBe(1)

    // Buckets are cumulative in collect()
    const buckets = collected[0].buckets
    expect(buckets.find((b) => b.le === 0.1)?.count).toBe(1)  // 1 value <= 0.1
    expect(buckets.find((b) => b.le === 0.5)?.count).toBe(2)  // 2 values <= 0.5
    expect(buckets.find((b) => b.le === 1.0)?.count).toBe(3)  // 3 values <= 1.0
    expect(collected[0].count).toBe(3)
  })

  it('provides timer', async () => {
    const end = histogram.startTimer()
    await new Promise((r) => setTimeout(r, 10))
    const elapsed = end()

    expect(elapsed).toBeGreaterThan(0)
    expect(histogram.getCount()).toBe(1)
  })
})

describe('SwarmMetricsCollector', () => {
  let collector: SwarmMetricsCollector

  beforeEach(() => {
    collector = new SwarmMetricsCollector()
  })

  const createVerdict = (
    confidence: number,
    decision: 'normal' | 'suspicious' | 'malicious' = 'normal'
  ): SwarmVerdict => ({
    decision,
    confidence,
    probNormal: decision === 'normal' ? 0.8 : 0.1,
    probSuspicious: decision === 'suspicious' ? 0.8 : 0.1,
    probMalicious: decision === 'malicious' ? 0.8 : 0.1,
    stanceStdDev: 1 - confidence,
    agentVotes: 5,
  })

  it('records verdict', () => {
    collector.recordVerdict(createVerdict(0.9))

    expect(collector.verdictsTotal.get({ decision: 'normal' })).toBe(1)
  })

  it('tracks consensus reached', () => {
    collector.recordVerdict(createVerdict(0.9))
    collector.recordVerdict(createVerdict(0.85))

    expect(collector.consensusReached.get()).toBe(2)
  })

  it('tracks consensus failed', () => {
    collector.recordVerdict(createVerdict(0.2))
    collector.recordVerdict(createVerdict(0.1))

    expect(collector.consensusFailed.get()).toBe(2)
  })

  it('detects split decisions', () => {
    // All probabilities low = split
    const splitVerdict: SwarmVerdict = {
      decision: 'normal',
      confidence: 0.4,
      probNormal: 0.35,
      probSuspicious: 0.35,
      probMalicious: 0.30,
      stanceStdDev: 0.6,
      agentVotes: 5,
    }

    collector.recordVerdict(splitVerdict)
    expect(collector.splitDecisions.get()).toBe(1)
  })

  it('gets consensus metrics', () => {
    collector.recordVerdict(createVerdict(0.9))
    collector.recordVerdict(createVerdict(0.85))
    collector.recordVerdict(createVerdict(0.2))

    const metrics = collector.getConsensusMetrics()

    expect(metrics.verdictsTotal).toBe(3)
    expect(metrics.consensusReached).toBe(2)
    expect(metrics.consensusFailed).toBe(1)
    expect(metrics.avgConfidence).toBeGreaterThan(0)
  })

  it('resets all metrics', () => {
    collector.recordVerdict(createVerdict(0.9))
    collector.reset()

    expect(collector.verdictsTotal.get()).toBe(0)
    expect(collector.consensusReached.get()).toBe(0)
  })
})

describe('MetricRegistry', () => {
  let registry: MetricRegistry

  beforeEach(() => {
    registry = new MetricRegistry()
  })

  it('registers metrics', () => {
    const counter = new Counter({
      name: 'requests_total',
      help: 'Total requests',
      type: 'counter',
    })

    registry.register(counter)

    expect(registry.get('requests_total')).toBe(counter)
  })

  it('exports to Prometheus format', () => {
    const counter = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      type: 'counter',
      labels: ['method'],
    })
    counter.inc({ method: 'GET' })
    counter.inc(5, { method: 'POST' })

    registry.register(counter)

    const output = registry.toPrometheusText()

    expect(output).toContain('# HELP http_requests_total Total HTTP requests')
    expect(output).toContain('# TYPE http_requests_total counter')
    expect(output).toContain('http_requests_total{method="GET"} 1')
    expect(output).toContain('http_requests_total{method="POST"} 5')
  })

  it('exports histogram to Prometheus format', () => {
    const histogram = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Request duration',
      type: 'histogram',
      buckets: [0.1, 0.5],
    })
    histogram.observe(0.05)
    histogram.observe(0.3)

    registry.register(histogram)

    const output = registry.toPrometheusText()

    expect(output).toContain('# TYPE http_request_duration_seconds histogram')
    expect(output).toContain('http_request_duration_seconds_bucket{le="0.1"}')
    expect(output).toContain('http_request_duration_seconds_sum')
    expect(output).toContain('http_request_duration_seconds_count')
  })
})

describe('DashboardMetricsCollector', () => {
  let collector: DashboardMetricsCollector

  beforeEach(() => {
    collector = new DashboardMetricsCollector()
  })

  it('records requests', () => {
    collector.recordRequest('GET', '/api/agents', 200, 0.1)
    collector.recordRequest('POST', '/api/agents', 201, 0.2)

    const metrics = collector.getDashboardMetrics()
    expect(metrics.requestsTotal).toBe(2)
  })

  it('records component latency', () => {
    collector.recordComponentLatency('llm', 0.5)
    collector.recordComponentLatency('vector', 0.05)

    const metrics = collector.getDashboardMetrics()
    expect(metrics.components.length).toBeGreaterThan(0)
  })

  it('tracks active threads', () => {
    collector.setActiveThreads(5)

    const metrics = collector.getDashboardMetrics()
    expect(metrics.agent.activeThreads).toBe(5)
  })

  it('records tool calls', () => {
    collector.recordToolCall('search')
    collector.recordToolCall('search')
    collector.recordToolCall('fetch')

    const metrics = collector.getDashboardMetrics()
    expect(metrics.agent.toolCallsTotal).toBe(3)
  })

  it('records swarm verdicts', () => {
    const verdict: SwarmVerdict = {
      decision: 'normal',
      confidence: 0.9,
      probNormal: 0.9,
      probSuspicious: 0.05,
      probMalicious: 0.05,
      stanceStdDev: 0.1,
      agentVotes: 5,
    }

    collector.recordSwarmVerdict(verdict)

    const metrics = collector.getDashboardMetrics()
    expect(metrics.swarm.avgConfidence).toBeGreaterThan(0)
  })

  it('calculates requests per second', async () => {
    collector.recordRequest('GET', '/', 200, 0.1)
    collector.recordRequest('GET', '/', 200, 0.1)

    const metrics = collector.getDashboardMetrics()
    expect(metrics.requestsPerSecond).toBeGreaterThan(0)
  })

  it('includes memory usage', () => {
    const metrics = collector.getDashboardMetrics()
    expect(metrics.agent.memoryUsageMB).toBeGreaterThan(0)
  })
})
