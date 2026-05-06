/**
 * Latency Tracking
 *
 * Component-level latency tracking with breakdown analysis
 * and percentile calculations.
 */

import type {
  ComponentTiming,
  LatencyBreakdown,
  CrossBoundaryLatency,
} from './types.js'

// =============================================================================
// Timer Classes
// =============================================================================

/**
 * Timer for tracking request latency
 */
export class RequestTimer {
  readonly requestId: string
  private startTime: number
  private endTime: number | null = null

  constructor(requestId: string) {
    this.requestId = requestId
    this.startTime = performance.now()
  }

  stop(): number {
    this.endTime = performance.now()
    return this.getDuration()
  }

  getDuration(): number {
    const end = this.endTime ?? performance.now()
    return end - this.startTime
  }

  isRunning(): boolean {
    return this.endTime === null
  }
}

/**
 * Timer for tracking component latency
 */
export class ComponentTimer {
  readonly requestId: string
  readonly component: string
  private startTime: number
  private endTime: number | null = null

  constructor(requestId: string, component: string) {
    this.requestId = requestId
    this.component = component
    this.startTime = performance.now()
  }

  stop(): number {
    this.endTime = performance.now()
    return this.getDuration()
  }

  getDuration(): number {
    const end = this.endTime ?? performance.now()
    return end - this.startTime
  }

  getStart(): number {
    return this.startTime
  }

  getEnd(): number {
    return this.endTime ?? performance.now()
  }

  isRunning(): boolean {
    return this.endTime === null
  }
}

// =============================================================================
// Latency Tracker
// =============================================================================

interface TrackedRequest {
  timer: RequestTimer
  components: ComponentTimer[]
}

/**
 * Tracks latency for requests and their components
 */
export class LatencyTracker {
  private requests: Map<string, TrackedRequest> = new Map()

  /**
   * Start tracking a new request
   */
  trackRequest(requestId: string): RequestTimer {
    const timer = new RequestTimer(requestId)
    this.requests.set(requestId, { timer, components: [] })
    return timer
  }

  /**
   * Start tracking a component within a request
   */
  trackComponent(requestId: string, component: string): ComponentTimer {
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error(`Request ${requestId} not found`)
    }

    const timer = new ComponentTimer(requestId, component)
    request.components.push(timer)
    return timer
  }

  /**
   * Get latency breakdown for a request
   */
  getBreakdown(requestId: string): LatencyBreakdown | null {
    const request = this.requests.get(requestId)
    if (!request) return null

    const total = request.timer.getDuration()

    const components: ComponentTiming[] = request.components.map((c) => {
      const duration = c.getDuration()
      return {
        name: c.component,
        start: c.getStart(),
        end: c.getEnd(),
        duration,
        percentage: total > 0 ? (duration / total) * 100 : 0,
      }
    })

    // Sort by start time
    components.sort((a, b) => a.start - b.start)

    // Find critical path (sequential components that add up to most time)
    const criticalPath = this.findCriticalPath(components)

    return {
      requestId,
      total,
      components,
      criticalPath,
    }
  }

  /**
   * Stop tracking a request
   */
  stopRequest(requestId: string): number {
    const request = this.requests.get(requestId)
    if (!request) return 0
    return request.timer.stop()
  }

  /**
   * Clear a request from tracking
   */
  clearRequest(requestId: string): void {
    this.requests.delete(requestId)
  }

  /**
   * Clear all tracked requests
   */
  clear(): void {
    this.requests.clear()
  }

  private findCriticalPath(components: ComponentTiming[]): string[] {
    if (components.length === 0) return []

    // Simple heuristic: components sorted by duration descending
    // In a real implementation, would analyze dependencies
    return components
      .slice()
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3)
      .map((c) => c.name)
  }
}

// =============================================================================
// Cross-Boundary Latency
// =============================================================================

/**
 * Track latency across language boundaries (Go <-> Rust)
 */
export class CrossBoundaryTracker {
  private timings: Map<string, Partial<CrossBoundaryLatency>> = new Map()

  /**
   * Start tracking a cross-boundary call
   */
  startCall(callId: string): void {
    this.timings.set(callId, {})
  }

  /**
   * Record Go preprocessing time
   */
  recordGoPreprocess(callId: string, durationMs: number): void {
    const timing = this.timings.get(callId)
    if (timing) {
      timing.goPreprocess = durationMs
    }
  }

  /**
   * Record Go to Rust transition time (serialization + network)
   */
  recordGoToRust(callId: string, durationMs: number): void {
    const timing = this.timings.get(callId)
    if (timing) {
      timing.goToRust = durationMs
    }
  }

  /**
   * Record Rust processing time
   */
  recordRustProcess(callId: string, durationMs: number): void {
    const timing = this.timings.get(callId)
    if (timing) {
      timing.rustProcess = durationMs
    }
  }

  /**
   * Record Rust to Go transition time (serialization + network)
   */
  recordRustToGo(callId: string, durationMs: number): void {
    const timing = this.timings.get(callId)
    if (timing) {
      timing.rustToGo = durationMs
    }
  }

  /**
   * Record Go postprocessing time
   */
  recordGoPostprocess(callId: string, durationMs: number): void {
    const timing = this.timings.get(callId)
    if (timing) {
      timing.goPostprocess = durationMs
    }
  }

  /**
   * Get complete timing for a call
   */
  getTiming(callId: string): CrossBoundaryLatency | null {
    const timing = this.timings.get(callId)
    if (!timing) return null

    return {
      goPreprocess: timing.goPreprocess ?? 0,
      goToRust: timing.goToRust ?? 0,
      rustProcess: timing.rustProcess ?? 0,
      rustToGo: timing.rustToGo ?? 0,
      goPostprocess: timing.goPostprocess ?? 0,
    }
  }

  /**
   * Get total latency for a call
   */
  getTotalLatency(callId: string): number {
    const timing = this.getTiming(callId)
    if (!timing) return 0
    return (
      timing.goPreprocess +
      timing.goToRust +
      timing.rustProcess +
      timing.rustToGo +
      timing.goPostprocess
    )
  }

  /**
   * Get breakdown percentage for a call
   */
  getBreakdownPercentage(callId: string): Record<string, number> {
    const timing = this.getTiming(callId)
    if (!timing) return {}

    const total = this.getTotalLatency(callId)
    if (total === 0) return {}

    return {
      goPreprocess: (timing.goPreprocess / total) * 100,
      goToRust: (timing.goToRust / total) * 100,
      rustProcess: (timing.rustProcess / total) * 100,
      rustToGo: (timing.rustToGo / total) * 100,
      goPostprocess: (timing.goPostprocess / total) * 100,
    }
  }

  /**
   * Clear a call from tracking
   */
  clearCall(callId: string): void {
    this.timings.delete(callId)
  }

  /**
   * Clear all tracked calls
   */
  clear(): void {
    this.timings.clear()
  }
}

// =============================================================================
// Percentile Calculator
// =============================================================================

/**
 * Calculates percentiles from a series of latency values
 */
export class PercentileCalculator {
  private values: number[] = []
  private sorted: boolean = true

  /**
   * Add a latency value
   */
  add(value: number): void {
    this.values.push(value)
    this.sorted = false
  }

  /**
   * Calculate a specific percentile
   */
  percentile(p: number): number {
    if (this.values.length === 0) return 0
    if (p < 0 || p > 100) throw new Error('Percentile must be 0-100')

    this.ensureSorted()

    const index = (p / 100) * (this.values.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)

    if (lower === upper) {
      return this.values[lower]
    }

    // Linear interpolation
    const fraction = index - lower
    return this.values[lower] * (1 - fraction) + this.values[upper] * fraction
  }

  /**
   * Get common percentiles
   */
  getCommonPercentiles(): {
    p50: number
    p90: number
    p95: number
    p99: number
    p999: number
  } {
    return {
      p50: this.percentile(50),
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99),
      p999: this.percentile(99.9),
    }
  }

  /**
   * Get min, max, average
   */
  getStats(): { min: number; max: number; avg: number; count: number } {
    if (this.values.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 }
    }

    this.ensureSorted()

    const sum = this.values.reduce((a, b) => a + b, 0)
    return {
      min: this.values[0],
      max: this.values[this.values.length - 1],
      avg: sum / this.values.length,
      count: this.values.length,
    }
  }

  /**
   * Clear all values
   */
  clear(): void {
    this.values = []
    this.sorted = true
  }

  private ensureSorted(): void {
    if (!this.sorted) {
      this.values.sort((a, b) => a - b)
      this.sorted = true
    }
  }
}

// =============================================================================
// Histogram Buckets
// =============================================================================

export const DEFAULT_LATENCY_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]

/**
 * Simple histogram for latency distribution
 */
export class LatencyHistogram {
  private buckets: number[]
  private counts: number[]
  private sum: number = 0
  private count: number = 0

  constructor(buckets: number[] = DEFAULT_LATENCY_BUCKETS) {
    this.buckets = [...buckets].sort((a, b) => a - b)
    this.counts = new Array(this.buckets.length + 1).fill(0)
  }

  /**
   * Observe a latency value (in seconds)
   */
  observe(value: number): void {
    this.sum += value
    this.count++

    // Find bucket
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i]++
        return
      }
    }
    // +Inf bucket
    this.counts[this.buckets.length]++
  }

  /**
   * Get histogram data
   */
  getData(): { bucket: string; count: number }[] {
    const result: { bucket: string; count: number }[] = []
    let cumulative = 0

    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.counts[i]
      result.push({
        bucket: `le="${this.buckets[i]}"`,
        count: cumulative,
      })
    }

    cumulative += this.counts[this.buckets.length]
    result.push({ bucket: 'le="+Inf"', count: cumulative })

    return result
  }

  /**
   * Get sum of all observed values
   */
  getSum(): number {
    return this.sum
  }

  /**
   * Get count of observations
   */
  getCount(): number {
    return this.count
  }

  /**
   * Get average latency
   */
  getAverage(): number {
    return this.count > 0 ? this.sum / this.count : 0
  }

  /**
   * Reset histogram
   */
  reset(): void {
    this.counts = new Array(this.buckets.length + 1).fill(0)
    this.sum = 0
    this.count = 0
  }
}
