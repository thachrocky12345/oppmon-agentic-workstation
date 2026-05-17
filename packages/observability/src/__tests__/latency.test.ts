// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Latency Tracking Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  RequestTimer,
  ComponentTimer,
  LatencyTracker,
  CrossBoundaryTracker,
  PercentileCalculator,
  LatencyHistogram,
} from '../latency.js'

describe('RequestTimer', () => {
  it('tracks request ID', () => {
    const timer = new RequestTimer('req-123')
    expect(timer.requestId).toBe('req-123')
  })

  it('tracks duration', async () => {
    const timer = new RequestTimer('req-1')

    await new Promise((r) => setTimeout(r, 50))
    const duration = timer.stop()

    expect(duration).toBeGreaterThanOrEqual(40)
    expect(duration).toBeLessThan(100)
  })

  it('reports running state', () => {
    const timer = new RequestTimer('req-1')

    expect(timer.isRunning()).toBe(true)
    timer.stop()
    expect(timer.isRunning()).toBe(false)
  })

  it('returns consistent duration after stop', async () => {
    const timer = new RequestTimer('req-1')
    timer.stop()

    const d1 = timer.getDuration()
    await new Promise((r) => setTimeout(r, 10))
    const d2 = timer.getDuration()

    expect(d1).toBe(d2)
  })
})

describe('ComponentTimer', () => {
  it('tracks component name', () => {
    const timer = new ComponentTimer('req-1', 'llm')
    expect(timer.component).toBe('llm')
    expect(timer.requestId).toBe('req-1')
  })

  it('provides start and end times', async () => {
    const timer = new ComponentTimer('req-1', 'llm')
    const start = timer.getStart()

    await new Promise((r) => setTimeout(r, 10))
    timer.stop()
    const end = timer.getEnd()

    expect(end).toBeGreaterThan(start)
  })
})

describe('LatencyTracker', () => {
  let tracker: LatencyTracker

  beforeEach(() => {
    tracker = new LatencyTracker()
  })

  it('tracks request', () => {
    const timer = tracker.trackRequest('req-1')
    expect(timer.requestId).toBe('req-1')
  })

  it('tracks components', () => {
    tracker.trackRequest('req-1')
    const comp = tracker.trackComponent('req-1', 'llm')

    expect(comp.component).toBe('llm')
  })

  it('throws for unknown request', () => {
    expect(() => tracker.trackComponent('unknown', 'comp')).toThrow()
  })

  it('gets latency breakdown', async () => {
    tracker.trackRequest('req-1')

    const llm = tracker.trackComponent('req-1', 'llm')
    await new Promise((r) => setTimeout(r, 10))
    llm.stop()

    const tools = tracker.trackComponent('req-1', 'tools')
    await new Promise((r) => setTimeout(r, 10))
    tools.stop()

    tracker.stopRequest('req-1')

    const breakdown = tracker.getBreakdown('req-1')

    expect(breakdown).not.toBeNull()
    expect(breakdown!.components).toHaveLength(2)
    expect(breakdown!.total).toBeGreaterThan(0)
    expect(breakdown!.criticalPath.length).toBeGreaterThan(0)
  })

  it('calculates percentages', async () => {
    tracker.trackRequest('req-1')

    const comp = tracker.trackComponent('req-1', 'main')
    await new Promise((r) => setTimeout(r, 10))
    comp.stop()

    tracker.stopRequest('req-1')

    const breakdown = tracker.getBreakdown('req-1')

    expect(breakdown!.components[0].percentage).toBeGreaterThan(0)
    expect(breakdown!.components[0].percentage).toBeLessThanOrEqual(100)
  })

  it('returns null for unknown request', () => {
    expect(tracker.getBreakdown('unknown')).toBeNull()
  })

  it('clears tracking', () => {
    tracker.trackRequest('req-1')
    tracker.clearRequest('req-1')

    expect(tracker.getBreakdown('req-1')).toBeNull()
  })
})

describe('CrossBoundaryTracker', () => {
  let tracker: CrossBoundaryTracker

  beforeEach(() => {
    tracker = new CrossBoundaryTracker()
  })

  it('tracks all phases', () => {
    tracker.startCall('call-1')
    tracker.recordGoPreprocess('call-1', 10)
    tracker.recordGoToRust('call-1', 5)
    tracker.recordRustProcess('call-1', 50)
    tracker.recordRustToGo('call-1', 5)
    tracker.recordGoPostprocess('call-1', 10)

    const timing = tracker.getTiming('call-1')

    expect(timing).not.toBeNull()
    expect(timing!.goPreprocess).toBe(10)
    expect(timing!.goToRust).toBe(5)
    expect(timing!.rustProcess).toBe(50)
    expect(timing!.rustToGo).toBe(5)
    expect(timing!.goPostprocess).toBe(10)
  })

  it('calculates total latency', () => {
    tracker.startCall('call-1')
    tracker.recordGoPreprocess('call-1', 10)
    tracker.recordGoToRust('call-1', 5)
    tracker.recordRustProcess('call-1', 50)
    tracker.recordRustToGo('call-1', 5)
    tracker.recordGoPostprocess('call-1', 10)

    expect(tracker.getTotalLatency('call-1')).toBe(80)
  })

  it('calculates breakdown percentage', () => {
    tracker.startCall('call-1')
    tracker.recordGoPreprocess('call-1', 20)
    tracker.recordGoToRust('call-1', 0)
    tracker.recordRustProcess('call-1', 80)
    tracker.recordRustToGo('call-1', 0)
    tracker.recordGoPostprocess('call-1', 0)

    const breakdown = tracker.getBreakdownPercentage('call-1')

    expect(breakdown.goPreprocess).toBe(20)
    expect(breakdown.rustProcess).toBe(80)
  })

  it('returns null for unknown call', () => {
    expect(tracker.getTiming('unknown')).toBeNull()
    expect(tracker.getTotalLatency('unknown')).toBe(0)
  })
})

describe('PercentileCalculator', () => {
  let calc: PercentileCalculator

  beforeEach(() => {
    calc = new PercentileCalculator()
  })

  it('calculates percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      calc.add(i)
    }

    // With 100 values 1-100, p50 should be around 50.5 (middle of sorted array)
    expect(calc.percentile(50)).toBeCloseTo(50.5, 1)
    expect(calc.percentile(90)).toBeCloseTo(90.1, 1)
    expect(calc.percentile(99)).toBeCloseTo(99, 1)
  })

  it('interpolates between values', () => {
    calc.add(10)
    calc.add(20)

    expect(calc.percentile(50)).toBe(15)
  })

  it('handles single value', () => {
    calc.add(42)

    expect(calc.percentile(0)).toBe(42)
    expect(calc.percentile(50)).toBe(42)
    expect(calc.percentile(100)).toBe(42)
  })

  it('handles empty values', () => {
    expect(calc.percentile(50)).toBe(0)
  })

  it('throws for invalid percentile', () => {
    calc.add(1)
    expect(() => calc.percentile(-1)).toThrow()
    expect(() => calc.percentile(101)).toThrow()
  })

  it('gets common percentiles', () => {
    for (let i = 1; i <= 1000; i++) {
      calc.add(i)
    }

    const common = calc.getCommonPercentiles()

    expect(common.p50).toBeCloseTo(500, -1)
    expect(common.p95).toBeCloseTo(950, -1)
    expect(common.p99).toBeCloseTo(990, -1)
  })

  it('gets stats', () => {
    calc.add(10)
    calc.add(20)
    calc.add(30)

    const stats = calc.getStats()

    expect(stats.min).toBe(10)
    expect(stats.max).toBe(30)
    expect(stats.avg).toBe(20)
    expect(stats.count).toBe(3)
  })

  it('clears values', () => {
    calc.add(1)
    calc.add(2)
    calc.clear()

    expect(calc.getStats().count).toBe(0)
  })
})

describe('LatencyHistogram', () => {
  it('observes values', () => {
    const hist = new LatencyHistogram([0.1, 0.5, 1.0])

    hist.observe(0.05)
    hist.observe(0.3)
    hist.observe(0.8)
    hist.observe(2.0)

    expect(hist.getCount()).toBe(4)
    expect(hist.getSum()).toBeCloseTo(3.15)
  })

  it('buckets correctly', () => {
    const hist = new LatencyHistogram([0.1, 0.5, 1.0])

    hist.observe(0.05)
    hist.observe(0.3)
    hist.observe(0.8)
    hist.observe(2.0)

    const data = hist.getData()

    // Cumulative counts
    expect(data[0].count).toBe(1) // <= 0.1
    expect(data[1].count).toBe(2) // <= 0.5
    expect(data[2].count).toBe(3) // <= 1.0
    expect(data[3].count).toBe(4) // +Inf
  })

  it('calculates average', () => {
    const hist = new LatencyHistogram()

    hist.observe(0.1)
    hist.observe(0.2)
    hist.observe(0.3)

    expect(hist.getAverage()).toBeCloseTo(0.2, 5)
  })

  it('handles empty histogram', () => {
    const hist = new LatencyHistogram()

    expect(hist.getCount()).toBe(0)
    expect(hist.getSum()).toBe(0)
    expect(hist.getAverage()).toBe(0)
  })

  it('resets', () => {
    const hist = new LatencyHistogram()
    hist.observe(1)
    hist.observe(2)

    hist.reset()

    expect(hist.getCount()).toBe(0)
    expect(hist.getSum()).toBe(0)
  })
})
