// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Metrics
 *
 * Prometheus-compatible metrics for monitoring agent systems.
 */

import type {
  MetricLabels,
  SwarmVerdict,
  ConsensusMetrics,
  DashboardMetrics,
  ComponentStatus,
  AgentMetrics,
  SwarmMetrics,
} from './types.js'

// =============================================================================
// Metric Types
// =============================================================================

type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary'

interface MetricConfig {
  name: string
  help: string
  type: MetricType
  labels?: string[]
}

interface MetricValue {
  value: number
  labels: MetricLabels
  timestamp: number
}

// =============================================================================
// Counter Implementation
// =============================================================================

export class Counter {
  readonly name: string
  readonly help: string
  readonly labels: string[]
  private values: Map<string, number> = new Map()

  constructor(config: MetricConfig) {
    this.name = config.name
    this.help = config.help
    this.labels = config.labels ?? []
  }

  inc(valueOrLabels?: number | MetricLabels, labels?: MetricLabels): void {
    let value = 1
    let actualLabels: MetricLabels = {}

    if (typeof valueOrLabels === 'number') {
      value = valueOrLabels
      actualLabels = labels ?? {}
    } else if (valueOrLabels) {
      actualLabels = valueOrLabels
    }

    const key = this.labelKey(actualLabels)
    const current = this.values.get(key) ?? 0
    this.values.set(key, current + value)
  }

  get(labels?: MetricLabels): number {
    // If no labels provided and there are defined label names, sum all values
    if (!labels && this.labels.length > 0) {
      let total = 0
      for (const value of this.values.values()) {
        total += value
      }
      return total
    }
    return this.values.get(this.labelKey(labels ?? {})) ?? 0
  }

  reset(): void {
    this.values.clear()
  }

  collect(): MetricValue[] {
    const result: MetricValue[] = []
    const timestamp = Date.now()

    for (const [key, value] of this.values) {
      result.push({
        value,
        labels: this.parseKey(key),
        timestamp,
      })
    }

    return result
  }

  private labelKey(labels: MetricLabels): string {
    return this.labels.map((l) => `${l}="${labels[l] ?? ''}"`).join(',')
  }

  private parseKey(key: string): MetricLabels {
    const labels: MetricLabels = {}
    const parts = key.split(',')
    for (const part of parts) {
      const match = part.match(/^([^=]+)="([^"]*)"$/)
      if (match) {
        labels[match[1]] = match[2]
      }
    }
    return labels
  }
}

// =============================================================================
// Gauge Implementation
// =============================================================================

export class Gauge {
  readonly name: string
  readonly help: string
  readonly labels: string[]
  private values: Map<string, number> = new Map()

  constructor(config: MetricConfig) {
    this.name = config.name
    this.help = config.help
    this.labels = config.labels ?? []
  }

  set(value: number, labels?: MetricLabels): void {
    const key = this.labelKey(labels ?? {})
    this.values.set(key, value)
  }

  inc(labels?: MetricLabels): void {
    const key = this.labelKey(labels ?? {})
    const current = this.values.get(key) ?? 0
    this.values.set(key, current + 1)
  }

  dec(labels?: MetricLabels): void {
    const key = this.labelKey(labels ?? {})
    const current = this.values.get(key) ?? 0
    this.values.set(key, current - 1)
  }

  get(labels?: MetricLabels): number {
    return this.values.get(this.labelKey(labels ?? {})) ?? 0
  }

  reset(): void {
    this.values.clear()
  }

  collect(): MetricValue[] {
    const result: MetricValue[] = []
    const timestamp = Date.now()

    for (const [key, value] of this.values) {
      result.push({
        value,
        labels: this.parseKey(key),
        timestamp,
      })
    }

    return result
  }

  private labelKey(labels: MetricLabels): string {
    return this.labels.map((l) => `${l}="${labels[l] ?? ''}"`).join(',')
  }

  private parseKey(key: string): MetricLabels {
    const labels: MetricLabels = {}
    const parts = key.split(',')
    for (const part of parts) {
      const match = part.match(/^([^=]+)="([^"]*)"$/)
      if (match) {
        labels[match[1]] = match[2]
      }
    }
    return labels
  }
}

// =============================================================================
// Histogram Implementation
// =============================================================================

export class Histogram {
  readonly name: string
  readonly help: string
  readonly labels: string[]
  readonly buckets: number[]
  private bucketCounts: Map<string, number[]> = new Map()
  private sums: Map<string, number> = new Map()
  private counts: Map<string, number> = new Map()

  constructor(
    config: MetricConfig & { buckets?: number[] }
  ) {
    this.name = config.name
    this.help = config.help
    this.labels = config.labels ?? []
    this.buckets = config.buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  }

  observe(value: number, labels?: MetricLabels): void {
    const key = this.labelKey(labels ?? {})

    // Initialize if needed
    if (!this.bucketCounts.has(key)) {
      this.bucketCounts.set(key, new Array(this.buckets.length).fill(0))
      this.sums.set(key, 0)
      this.counts.set(key, 0)
    }

    // Update buckets (each bucket tracks if value <= bucket boundary)
    const counts = this.bucketCounts.get(key)!
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        counts[i]++
        break // Only increment the first matching bucket
      }
    }

    // Update sum and count
    this.sums.set(key, (this.sums.get(key) ?? 0) + value)
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
  }

  startTimer(labels?: MetricLabels): () => number {
    const start = process.hrtime.bigint()
    return () => {
      const elapsed = Number(process.hrtime.bigint() - start) / 1e9 // seconds
      this.observe(elapsed, labels)
      return elapsed
    }
  }

  getSum(labels?: MetricLabels): number {
    return this.sums.get(this.labelKey(labels ?? {})) ?? 0
  }

  getCount(labels?: MetricLabels): number {
    return this.counts.get(this.labelKey(labels ?? {})) ?? 0
  }

  reset(): void {
    this.bucketCounts.clear()
    this.sums.clear()
    this.counts.clear()
  }

  collect(): {
    buckets: { le: number; count: number }[]
    sum: number
    count: number
    labels: MetricLabels
  }[] {
    const result: {
      buckets: { le: number; count: number }[]
      sum: number
      count: number
      labels: MetricLabels
    }[] = []

    for (const [key, counts] of this.bucketCounts) {
      const labels = this.parseKey(key)
      const buckets: { le: number; count: number }[] = []

      // Cumulative counts
      let cumulative = 0
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative += counts[i]
        buckets.push({ le: this.buckets[i], count: cumulative })
      }

      result.push({
        buckets,
        sum: this.sums.get(key) ?? 0,
        count: this.counts.get(key) ?? 0,
        labels,
      })
    }

    return result
  }

  private labelKey(labels: MetricLabels): string {
    return this.labels.map((l) => `${l}="${labels[l] ?? ''}"`).join(',')
  }

  private parseKey(key: string): MetricLabels {
    const labels: MetricLabels = {}
    const parts = key.split(',')
    for (const part of parts) {
      const match = part.match(/^([^=]+)="([^"]*)"$/)
      if (match) {
        labels[match[1]] = match[2]
      }
    }
    return labels
  }
}

// =============================================================================
// Swarm Metrics
// =============================================================================

export class SwarmMetricsCollector {
  readonly verdictsTotal: Counter
  readonly verdictConfidence: Histogram
  readonly agentAgreement: Gauge
  readonly swarmTickLatency: Histogram
  readonly agentUpdateLatency: Histogram
  readonly consensusReached: Counter
  readonly consensusFailed: Counter
  readonly splitDecisions: Counter

  constructor() {
    this.verdictsTotal = new Counter({
      name: 'swarm_verdicts_total',
      help: 'Total number of swarm verdicts',
      type: 'counter',
      labels: ['decision'],
    })

    this.verdictConfidence = new Histogram({
      name: 'swarm_verdict_confidence',
      help: 'Distribution of verdict confidence scores',
      type: 'histogram',
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    })

    this.agentAgreement = new Gauge({
      name: 'swarm_agent_agreement',
      help: 'Average agent agreement (1 - stance std dev)',
      type: 'gauge',
    })

    this.swarmTickLatency = new Histogram({
      name: 'swarm_tick_latency_seconds',
      help: 'Latency of swarm tick processing',
      type: 'histogram',
    })

    this.agentUpdateLatency = new Histogram({
      name: 'swarm_agent_update_latency_seconds',
      help: 'Latency of individual agent updates',
      type: 'histogram',
    })

    this.consensusReached = new Counter({
      name: 'swarm_consensus_reached_total',
      help: 'Total times consensus was reached (confidence > 0.8)',
      type: 'counter',
    })

    this.consensusFailed = new Counter({
      name: 'swarm_consensus_failed_total',
      help: 'Total times consensus failed (confidence < 0.3)',
      type: 'counter',
    })

    this.splitDecisions = new Counter({
      name: 'swarm_split_decisions_total',
      help: 'Total split decisions (max prob < 0.5)',
      type: 'counter',
    })
  }

  recordVerdict(verdict: SwarmVerdict): void {
    this.verdictsTotal.inc({ decision: verdict.decision })
    this.verdictConfidence.observe(verdict.confidence)
    this.agentAgreement.set(1 - verdict.stanceStdDev)

    if (verdict.confidence > 0.8) {
      this.consensusReached.inc()
    } else if (verdict.confidence < 0.3) {
      this.consensusFailed.inc()
    }

    // Detect split decisions
    const maxProb = Math.max(
      verdict.probNormal,
      verdict.probSuspicious,
      verdict.probMalicious
    )
    if (maxProb < 0.5) {
      this.splitDecisions.inc()
    }
  }

  getConsensusMetrics(): ConsensusMetrics {
    return {
      verdictsTotal: this.verdictsTotal.get(),
      consensusReached: this.consensusReached.get(),
      consensusFailed: this.consensusFailed.get(),
      splitDecisions: this.splitDecisions.get(),
      avgConfidence: this.verdictConfidence.getSum() / Math.max(this.verdictConfidence.getCount(), 1),
      avgAgreement: this.agentAgreement.get(),
    }
  }

  reset(): void {
    this.verdictsTotal.reset()
    this.verdictConfidence.reset()
    this.agentAgreement.reset()
    this.swarmTickLatency.reset()
    this.agentUpdateLatency.reset()
    this.consensusReached.reset()
    this.consensusFailed.reset()
    this.splitDecisions.reset()
  }
}

// =============================================================================
// Registry
// =============================================================================

type AnyMetric = Counter | Gauge | Histogram

export class MetricRegistry {
  private metrics: Map<string, AnyMetric> = new Map()

  register(metric: AnyMetric): void {
    this.metrics.set(metric.name, metric)
  }

  get(name: string): AnyMetric | undefined {
    return this.metrics.get(name)
  }

  /**
   * Export metrics in Prometheus text format
   */
  toPrometheusText(): string {
    const lines: string[] = []

    for (const [name, metric] of this.metrics) {
      if (metric instanceof Counter) {
        lines.push(`# HELP ${name} ${metric.help}`)
        lines.push(`# TYPE ${name} counter`)
        for (const v of metric.collect()) {
          const labelStr = this.formatLabels(v.labels)
          lines.push(`${name}${labelStr} ${v.value}`)
        }
      } else if (metric instanceof Gauge) {
        lines.push(`# HELP ${name} ${metric.help}`)
        lines.push(`# TYPE ${name} gauge`)
        for (const v of metric.collect()) {
          const labelStr = this.formatLabels(v.labels)
          lines.push(`${name}${labelStr} ${v.value}`)
        }
      } else if (metric instanceof Histogram) {
        lines.push(`# HELP ${name} ${metric.help}`)
        lines.push(`# TYPE ${name} histogram`)
        for (const h of metric.collect()) {
          const labelStr = this.formatLabels(h.labels)
          for (const b of h.buckets) {
            lines.push(`${name}_bucket{le="${b.le}"${labelStr ? ',' + labelStr.slice(1, -1) : ''}} ${b.count}`)
          }
          lines.push(`${name}_bucket{le="+Inf"${labelStr ? ',' + labelStr.slice(1, -1) : ''}} ${h.count}`)
          lines.push(`${name}_sum${labelStr} ${h.sum}`)
          lines.push(`${name}_count${labelStr} ${h.count}`)
        }
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  private formatLabels(labels: MetricLabels): string {
    const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`)
    return parts.length > 0 ? `{${parts.join(',')}}` : ''
  }
}

// =============================================================================
// Dashboard Metrics Collector
// =============================================================================

export class DashboardMetricsCollector {
  private requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    type: 'counter',
    labels: ['method', 'path', 'status'],
  })

  private requestLatency = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency',
    type: 'histogram',
    labels: ['method', 'path'],
  })

  private componentLatency = new Histogram({
    name: 'component_latency_seconds',
    help: 'Component latency',
    type: 'histogram',
    labels: ['component'],
  })

  private componentErrors = new Counter({
    name: 'component_errors_total',
    help: 'Component errors',
    type: 'counter',
    labels: ['component'],
  })

  private activeThreads = new Gauge({
    name: 'agent_active_threads',
    help: 'Number of active agent threads',
    type: 'gauge',
  })

  private toolCallsTotal = new Counter({
    name: 'agent_tool_calls_total',
    help: 'Total tool calls',
    type: 'counter',
    labels: ['tool'],
  })

  private swarmMetrics = new SwarmMetricsCollector()

  private startTime = Date.now()

  recordRequest(
    method: string,
    path: string,
    status: number,
    durationSec: number
  ): void {
    this.requestsTotal.inc({ method, path, status: String(status) })
    this.requestLatency.observe(durationSec, { method, path })
  }

  recordComponentLatency(component: string, durationSec: number): void {
    this.componentLatency.observe(durationSec, { component })
  }

  recordComponentError(component: string): void {
    this.componentErrors.inc({ component })
  }

  setActiveThreads(count: number): void {
    this.activeThreads.set(count)
  }

  recordToolCall(tool: string): void {
    this.toolCallsTotal.inc({ tool })
  }

  recordSwarmVerdict(verdict: SwarmVerdict): void {
    this.swarmMetrics.recordVerdict(verdict)
  }

  getDashboardMetrics(): DashboardMetrics {
    const uptimeSec = (Date.now() - this.startTime) / 1000
    const totalRequests = this.requestsTotal.get()

    return {
      requestsTotal: totalRequests,
      requestsPerSecond: totalRequests / uptimeSec,
      errorRate: this.calculateErrorRate(),
      p50Latency: 0, // Would need percentile tracker
      p95Latency: 0,
      p99Latency: 0,
      components: this.getComponentStatuses(),
      agent: this.getAgentMetrics(),
      swarm: this.getSwarmMetrics(),
    }
  }

  private calculateErrorRate(): number {
    // Simplified - would need to track errors vs total
    return 0
  }

  private getComponentStatuses(): ComponentStatus[] {
    // Would query actual component health
    return [
      { name: 'llm', status: 'healthy', latencyP95: 0.5, errorRate: 0.01 },
      { name: 'vector', status: 'healthy', latencyP95: 0.05, errorRate: 0 },
      { name: 'tools', status: 'healthy', latencyP95: 0.1, errorRate: 0.02 },
    ]
  }

  private getAgentMetrics(): AgentMetrics {
    return {
      activeThreads: this.activeThreads.get(),
      toolCallsTotal: this.toolCallsTotal.get(),
      averageIterations: 3.5,
      memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
    }
  }

  private getSwarmMetrics(): SwarmMetrics {
    const consensus = this.swarmMetrics.getConsensusMetrics()
    return {
      agentCount: 5,
      avgConfidence: consensus.avgConfidence,
      consensusRate:
        consensus.verdictsTotal > 0
          ? consensus.consensusReached / consensus.verdictsTotal
          : 0,
      tickLatencyP95: 0.05,
    }
  }
}
