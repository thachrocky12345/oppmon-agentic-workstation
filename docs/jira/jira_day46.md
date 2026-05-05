# TAG-46: Observability & Tracing Integration

## Description

**Suggested Points:** 8 (High — implementing distributed tracing with OpenTelemetry, Langfuse integration for LLM observability, consensus metrics for multi-agent systems, latency tracking across Go/Rust boundary)

## Objective

Implement comprehensive observability for the agent system, including distributed tracing across Go and Rust components, LLM-specific observability via Langfuse, consensus metrics for swarm decisions, and performance dashboards for latency analysis.

## Requirements

### Distributed Tracing (OpenTelemetry)

```typescript
// Trace context propagation across services

interface TraceContext {
  traceId: string       // 32-char hex
  spanId: string        // 16-char hex
  traceFlags: number    // 8-bit flags
  traceState: string    // vendor-specific state
}

// Span categories for agent system
enum SpanCategory {
  HTTP_REQUEST = 'http.request',
  ORACLE_LOOP = 'agent.oracle_loop',
  MEMORY_PREFETCH = 'agent.memory.prefetch',
  TOOL_EXECUTION = 'agent.tool.execute',
  LLM_CALL = 'llm.chat',
  VECTOR_SEARCH = 'vector.search',
  RUST_ENGINE = 'engine.rust',
  RISK_GATE = 'engine.risk_gate',
}
```

### Langfuse LLM Observability

```typescript
// packages/observability/src/langfuse.ts

import { Langfuse } from 'langfuse';

interface LLMObserver {
  // Start a new trace for a conversation
  startTrace(tenantId: string, threadId: string): Trace

  // Record LLM generation
  recordGeneration(trace: Trace, params: {
    model: string
    prompt: string
    completion: string
    promptTokens: number
    completionTokens: number
    latencyMs: number
  }): void

  // Record tool usage
  recordToolSpan(trace: Trace, params: {
    name: string
    input: unknown
    output: unknown
    durationMs: number
    status: 'success' | 'error'
  }): void

  // Record retrieval (RAG)
  recordRetrieval(trace: Trace, params: {
    query: string
    results: ScoredDocument[]
    topK: number
    latencyMs: number
    ndcg?: number
    mrr?: number
  }): void

  // Add feedback/scores
  recordScore(trace: Trace, params: {
    name: string
    value: number
    comment?: string
  }): void

  // Flush all pending events
  flush(): Promise<void>
}

class LangfuseObserver implements LLMObserver {
  private langfuse: Langfuse

  constructor(config: { publicKey: string; secretKey: string; baseUrl?: string }) {
    this.langfuse = new Langfuse(config)
  }

  startTrace(tenantId: string, threadId: string): Trace {
    return this.langfuse.trace({
      id: `${tenantId}-${threadId}-${Date.now()}`,
      metadata: { tenantId, threadId },
      tags: ['agent', 'oracle-loop'],
    })
  }

  recordGeneration(trace: Trace, params: GenerationParams): void {
    trace.generation({
      name: 'llm-chat',
      model: params.model,
      input: params.prompt,
      output: params.completion,
      usage: {
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
      },
      metadata: {
        latencyMs: params.latencyMs,
      },
    })
  }

  recordToolSpan(trace: Trace, params: ToolSpanParams): void {
    trace.span({
      name: `tool:${params.name}`,
      input: params.input,
      output: params.output,
      metadata: {
        durationMs: params.durationMs,
        status: params.status,
      },
    })
  }
}
```

### Consensus Metrics (Multi-Agent)

```rust
// packages/agent-engine/rust/engine/src/metrics.rs

use prometheus::{Counter, Gauge, Histogram, Registry};

pub struct SwarmMetrics {
    // Decision metrics
    pub verdicts_total: Counter,
    pub verdict_confidence: Histogram,
    pub agent_agreement: Gauge,  // avg stance std deviation

    // Latency metrics
    pub swarm_tick_latency: Histogram,
    pub agent_update_latency: Histogram,

    // Consensus metrics
    pub consensus_reached: Counter,
    pub consensus_failed: Counter,
    pub split_decisions: Counter,  // Close to 50/50
}

impl SwarmMetrics {
    pub fn record_verdict(&self, verdict: &SwarmVerdict) {
        self.verdicts_total.inc();
        self.verdict_confidence.observe(verdict.confidence as f64);
        self.agent_agreement.set(1.0 - verdict.stance_std_dev as f64);

        if verdict.confidence > 0.8 {
            self.consensus_reached.inc();
        } else if verdict.confidence < 0.3 {
            self.consensus_failed.inc();
        }

        // Detect split decisions
        let max_prob = verdict.prob_normal
            .max(verdict.prob_suspicious)
            .max(verdict.prob_malicious);
        if max_prob < 0.5 {
            self.split_decisions.inc();
        }
    }
}
```

### Latency Tracking

```typescript
// packages/observability/src/latency.ts

interface LatencyTracker {
  // Track end-to-end latency
  trackRequest(requestId: string): RequestTimer

  // Track component latencies
  trackComponent(requestId: string, component: string): ComponentTimer

  // Get latency breakdown
  getBreakdown(requestId: string): LatencyBreakdown
}

interface LatencyBreakdown {
  total: number
  components: {
    name: string
    start: number
    end: number
    duration: number
    percentage: number
  }[]
  criticalPath: string[]
}

// Track across Go/Rust boundary
interface CrossBoundaryLatency {
  goPreprocess: number
  goToRust: number          // Network + serialization
  rustProcess: number
  rustToGo: number          // Network + deserialization
  goPostprocess: number
}

const latencyBuckets = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
]

// Histogram for each component
const componentHistograms = {
  oracle_loop: new Histogram({ buckets: latencyBuckets }),
  memory_prefetch: new Histogram({ buckets: latencyBuckets }),
  llm_call: new Histogram({ buckets: latencyBuckets }),
  tool_execution: new Histogram({ buckets: latencyBuckets }),
  vector_search: new Histogram({ buckets: latencyBuckets }),
  rust_engine: new Histogram({ buckets: latencyBuckets }),
}
```

### Performance Dashboard

```typescript
// packages/observability/src/dashboard.ts

interface DashboardMetrics {
  // Request metrics
  requestsTotal: number
  requestsPerSecond: number
  errorRate: number

  // Latency metrics
  p50Latency: number
  p95Latency: number
  p99Latency: number

  // Component health
  components: {
    name: string
    status: 'healthy' | 'degraded' | 'unhealthy'
    latencyP95: number
    errorRate: number
  }[]

  // Agent metrics
  agent: {
    activeThreads: number
    toolCallsTotal: number
    averageIterations: number
    memoryUsageMB: number
  }

  // Swarm metrics (if using Go+Rust engine)
  swarm: {
    agentCount: number
    avgConfidence: number
    consensusRate: number
    tickLatencyP95: number
  }
}

// Real-time metrics endpoint
app.get('/api/metrics/dashboard', async (req, res) => {
  const metrics = await collectDashboardMetrics()
  res.json(metrics)
})

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain')
  res.send(await prometheus.register.metrics())
})
```

### Trace Context Propagation

```go
// packages/agent-engine/go/internal/tracing/propagation.go

package tracing

import (
    "context"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/trace"
)

// Inject trace context into wire format for Rust
func InjectToWire(ctx context.Context, carrier map[string]string) {
    propagator := otel.GetTextMapPropagator()
    propagator.Inject(ctx, propagation.MapCarrier(carrier))
}

// Extract trace context from wire format
func ExtractFromWire(carrier map[string]string) context.Context {
    propagator := otel.GetTextMapPropagator()
    return propagator.Extract(context.Background(), propagation.MapCarrier(carrier))
}

// Middleware for HTTP requests
func TracingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))

        tracer := otel.Tracer("orchestrator")
        ctx, span := tracer.Start(ctx, "http.request",
            trace.WithAttributes(
                attribute.String("http.method", r.Method),
                attribute.String("http.url", r.URL.Path),
            ),
        )
        defer span.End()

        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### Rust Tracing Integration

```rust
// packages/agent-engine/rust/engine/src/tracing.rs

use tracing::{info, warn, span, Level};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use opentelemetry::sdk::trace::TracerProvider;

pub fn init_tracing() {
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(opentelemetry_otlp::new_exporter().tonic())
        .install_batch(opentelemetry::runtime::Tokio)
        .unwrap();

    let telemetry = tracing_opentelemetry::layer().with_tracer(tracer);

    tracing_subscriber::registry()
        .with(telemetry)
        .with(tracing_subscriber::fmt::layer())
        .init();
}

// Instrument async functions
#[tracing::instrument(skip(batch), fields(tool_count = batch.tools.len()))]
pub async fn execute_tools(batch: ToolBatch) -> Vec<ToolResult> {
    let span = span!(Level::INFO, "tool_execution");
    let _guard = span.enter();

    // ... execution logic ...

    info!(tool_count = batch.tools.len(), "Tools executed");
    results
}
```

## Implementation Notes
- Backend: `packages/observability/` package, Rust tracing crate
- Frontend: Dashboard UI at `/admin/observability`
- CLI: `tag metrics`, `tag trace`
- Database: Time-series storage for metrics (optional: InfluxDB/TimescaleDB)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/observability/src/__tests__/langfuse.test.ts` | `records generation` | Event sent |
| `packages/observability/src/__tests__/langfuse.test.ts` | `records tool span` | Span created |
| `packages/observability/src/__tests__/latency.test.ts` | `tracks breakdown` | All components |
| `packages/observability/src/__tests__/latency.test.ts` | `calculates percentiles` | P50/P95/P99 |
| `rust/engine/src/tests/metrics.rs` | `records verdict` | Counters updated |
| `rust/engine/src/tests/metrics.rs` | `detects split decision` | Counter incremented |
| `go/internal/tracing/tracing_test.go` | `propagates context` | Trace ID preserved |
| `go/internal/tracing/tracing_test.go` | `injects to wire` | Carrier populated |

### Test Coverage Requirements
- All metric types recorded
- Trace propagation verified
- Dashboard data accurate

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `end-to-end trace` | OTEL collector | 1. Send request 2. Check collector | Trace complete |
| `cross-boundary trace` | Go + Rust | 1. Request 2. Check spans | Spans linked |
| `Langfuse recording` | Langfuse mock | 1. Chat 2. Check events | Events recorded |
| `dashboard metrics` | Load test | 1. Generate load 2. Query | Metrics accurate |
| `consensus metrics` | Swarm active | 1. Process requests | Consensus tracked |

### End-to-End Flows
- Request → Go span → Rust span → Tool spans → Response → Trace complete
- Agent decision → Consensus metrics → Dashboard update

## Acceptance Criteria
1. OpenTelemetry tracing across all components
2. Trace context propagation Go ↔ Rust
3. Langfuse integration for LLM observability
4. Consensus metrics for multi-agent decisions
5. Latency breakdown by component
6. Real-time dashboard with key metrics
7. Prometheus-compatible metrics endpoint
8. Deterministic replay traces

## Review Checklist
- [ ] Are all components instrumented?
- [ ] Does trace propagation work across languages?
- [ ] Are Langfuse events buffered and flushed?
- [ ] Do consensus metrics capture split decisions?
- [ ] Is dashboard responsive under load?
- [ ] Are metric names consistent?

## Dependencies
- Depends on: Day 45 (Go + Rust engine), Day 38 (Oracle loop)
- Blocks: Day 48 (Integration testing)

## Risk Factors
- **Trace volume** — Mitigation: Sampling, tail-based sampling
- **Langfuse latency** — Mitigation: Async send, batching
- **Metric cardinality** — Mitigation: Limit label values
- **Cross-language trace gaps** — Mitigation: Wire format includes trace context
