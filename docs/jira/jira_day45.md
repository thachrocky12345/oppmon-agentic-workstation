# TAG-45: High-Performance Agent Engine (Go + Rust)

## Description

**Suggested Points:** 13 (Critical — implementing multi-language architecture with Go orchestration and Rust compute engine; Postcard wire format; lock-free parallel processing; deterministic replay for debugging)

## Objective

Implement a high-performance agent execution engine using Go for orchestration/networking and Rust for compute-intensive operations (swarm simulation, vector operations, tool execution). This hybrid architecture enables sub-millisecond latency for critical paths while maintaining ergonomic async networking.

## Requirements

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Go Orchestrator                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ HTTP/SSE    │  │ WebSocket   │  │ Event Bus   │  │ Rate Limit  │    │
│  │ Server      │  │ Handler     │  │ (channels)  │  │ Middleware  │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘    │
│         │                │                │                             │
│         └────────────────┴────────────────┘                             │
│                          │                                              │
│                   ┌──────▼──────┐                                       │
│                   │ TCP Client  │ ◄─── Postcard Binary Protocol         │
│                   └──────┬──────┘                                       │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │
                    TCP (localhost:9999)
                           │
┌──────────────────────────▼──────────────────────────────────────────────┐
│                        Rust Engine                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ TCP Server  │  │ Swarm Sim   │  │ Vector Ops  │  │ Tool Exec   │    │
│  │ (Tokio)     │  │ (Rayon)     │  │ (SIMD)      │  │ (Sandbox)   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                          │                                              │
│                   ┌──────▼──────┐                                       │
│                   │ Risk Gate   │ ◄─── Interceptor Chain                │
│                   └─────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Message Types (Rust)

```rust
// packages/agent-engine/rust/common/src/envelope.rs

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Generic message wrapper with sequence and timestamps
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope<T> {
    pub seq: u64,           // Monotonic sequence number
    pub ts_event_us: u64,   // Event timestamp (microseconds since epoch)
    pub ts_recv_us: u64,    // Receive timestamp
    pub payload: T,
}

impl<T> Envelope<T> {
    pub fn new(seq: u64, payload: T) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;

        Self {
            seq,
            ts_event_us: now,
            ts_recv_us: now,
            payload,
        }
    }

    pub fn mark_received(&mut self) {
        self.ts_recv_us = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;
    }

    pub fn latency_us(&self) -> u64 {
        self.ts_recv_us.saturating_sub(self.ts_event_us)
    }

    pub fn map<U, F: FnOnce(T) -> U>(self, f: F) -> Envelope<U> {
        Envelope {
            seq: self.seq,
            ts_event_us: self.ts_event_us,
            ts_recv_us: self.ts_recv_us,
            payload: f(self.payload),
        }
    }
}
```

### Agent Request/Response Types

```rust
// packages/agent-engine/rust/common/src/messages.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentRequest {
    /// Process a chat message through the oracle loop
    Chat(ChatRequest),
    /// Execute tools in parallel
    ExecuteTools(ToolBatch),
    /// Perform vector similarity search
    VectorSearch(VectorQuery),
    /// Compute embeddings for text
    Embed(EmbedRequest),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub tenant_id: String,
    pub thread_id: String,
    pub message: String,
    pub context: Option<String>,
    pub tools: Vec<ToolDefinition>,
    pub max_iterations: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolBatch {
    pub tools: Vec<ToolCall>,
    pub timeout_ms: u32,
    pub max_parallel: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorQuery {
    pub embedding: Vec<f32>,
    pub top_k: u16,
    pub tenant_filter: String,
    pub min_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentResponse {
    ChatStream(StreamEvent),
    ToolResults(Vec<ToolResult>),
    VectorResults(Vec<ScoredDocument>),
    Embeddings(Vec<Vec<f32>>),
    Error(ErrorResponse),
}
```

### Postcard Wire Format

```rust
// Binary serialization using Postcard (deterministic, compact)

use postcard::{from_bytes, to_allocvec};

/// Framed message format:
/// ┌────────────────┬──────────────────────────┐
/// │ Length (4 BE)  │ Postcard-encoded message │
/// └────────────────┴──────────────────────────┘

pub fn encode<T: Serialize>(msg: &Envelope<T>) -> Result<Vec<u8>, Error> {
    let payload = to_allocvec(msg)?;
    let len = (payload.len() as u32).to_be_bytes();

    let mut frame = Vec::with_capacity(4 + payload.len());
    frame.extend_from_slice(&len);
    frame.extend_from_slice(&payload);

    Ok(frame)
}

pub fn decode<T: DeserializeOwned>(frame: &[u8]) -> Result<Envelope<T>, Error> {
    if frame.len() < 4 {
        return Err(Error::InsufficientData);
    }

    let len = u32::from_be_bytes([frame[0], frame[1], frame[2], frame[3]]) as usize;
    if frame.len() < 4 + len {
        return Err(Error::InsufficientData);
    }

    let envelope: Envelope<T> = from_bytes(&frame[4..4 + len])?;
    Ok(envelope)
}
```

### Rust TCP Server

```rust
// packages/agent-engine/rust/engine/src/server.rs

use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct EngineServer {
    listener: TcpListener,
    swarm: SwarmSimulator,
    vector_store: VectorStore,
    tool_executor: ToolExecutor,
    risk_gate: RiskGate,
}

impl EngineServer {
    pub async fn run(&mut self) -> Result<(), Error> {
        loop {
            let (mut socket, addr) = self.listener.accept().await?;
            tracing::info!("Connection from {}", addr);

            let swarm = self.swarm.clone();
            let vectors = self.vector_store.clone();
            let tools = self.tool_executor.clone();
            let risk = self.risk_gate.clone();

            tokio::spawn(async move {
                let mut buf = vec![0u8; 64 * 1024];

                loop {
                    // Read frame length
                    let mut len_buf = [0u8; 4];
                    if socket.read_exact(&mut len_buf).await.is_err() {
                        break;
                    }
                    let len = u32::from_be_bytes(len_buf) as usize;

                    // Read payload
                    if socket.read_exact(&mut buf[..len]).await.is_err() {
                        break;
                    }

                    // Decode and process
                    let request: Envelope<AgentRequest> = decode(&buf[..len])?;
                    let response = process_request(request, &swarm, &vectors, &tools, &risk).await;

                    // Encode and send response
                    let frame = encode(&response)?;
                    socket.write_all(&frame).await?;
                }
            });
        }
    }
}
```

### Parallel Tool Execution (Rayon)

```rust
// packages/agent-engine/rust/engine/src/tools.rs

use rayon::prelude::*;

pub struct ToolExecutor {
    max_workers: usize,
    timeout: Duration,
}

impl ToolExecutor {
    pub fn execute_batch(&self, batch: ToolBatch) -> Vec<ToolResult> {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(batch.max_parallel as usize)
            .build()
            .unwrap();

        pool.install(|| {
            batch.tools
                .par_iter()
                .map(|tool_call| {
                    let start = Instant::now();

                    let result = match self.execute_single(tool_call) {
                        Ok(output) => ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            status: ToolStatus::Success,
                            output,
                            duration_ms: start.elapsed().as_millis() as u32,
                        },
                        Err(e) => ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            status: ToolStatus::Error,
                            output: format!("Error: {}", e),
                            duration_ms: start.elapsed().as_millis() as u32,
                        },
                    };

                    result
                })
                .collect()
        })
    }
}
```

### Risk Gate (Interceptor Chain)

```rust
// packages/agent-engine/rust/engine/src/risk.rs

pub trait Interceptor: Send + Sync {
    fn check(&self, request: &AgentRequest, response: &AgentResponse) -> Decision;
}

pub enum Decision {
    Allow,
    Deny { reason: String },
    Modify { response: AgentResponse },
}

pub struct RiskGate {
    interceptors: Vec<Box<dyn Interceptor>>,
}

impl RiskGate {
    pub fn check(&self, request: &AgentRequest, response: &AgentResponse) -> Decision {
        for interceptor in &self.interceptors {
            match interceptor.check(request, response) {
                Decision::Allow => continue,
                decision => return decision,
            }
        }
        Decision::Allow
    }
}

// Built-in interceptors
pub struct KillSwitch {
    enabled: AtomicBool,
}

pub struct RateLimiter {
    requests_per_minute: u32,
    counters: DashMap<String, AtomicU32>,
}

pub struct ConfidenceThreshold {
    min_confidence: f32,
}

pub struct ContentFilter {
    blocked_patterns: Vec<Regex>,
}
```

### Go Orchestrator

```go
// packages/agent-engine/go/cmd/orchestrator/main.go

package main

import (
    "context"
    "net/http"

    "github.com/team-ai-gateway/engine/internal/client"
    "github.com/team-ai-gateway/engine/internal/eventbus"
)

type Orchestrator struct {
    engineClient *client.EngineClient
    eventBus     *eventbus.EventBus
}

func (o *Orchestrator) HandleChat(w http.ResponseWriter, r *http.Request) {
    // Parse request
    var req ChatRequest
    json.NewDecoder(r.Body).Decode(&req)

    // Set up SSE
    flusher, _ := w.(http.Flusher)
    w.Header().Set("Content-Type", "text/event-stream")

    // Create channel for streaming
    events := make(chan StreamEvent)

    go func() {
        // Send to Rust engine
        response, err := o.engineClient.Chat(r.Context(), req)
        if err != nil {
            events <- StreamEvent{Type: "error", Data: err.Error()}
            close(events)
            return
        }

        // Stream responses
        for event := range response.Events {
            events <- event
        }
        close(events)
    }()

    // Write SSE events
    for event := range events {
        data, _ := json.Marshal(event)
        fmt.Fprintf(w, "data: %s\n\n", data)
        flusher.Flush()
    }
}
```

### Deterministic Replay

```rust
// packages/agent-engine/rust/engine/src/replay.rs

pub struct ReplayLog {
    path: PathBuf,
    writer: Option<BufWriter<File>>,
}

impl ReplayLog {
    pub fn record<T: Serialize>(&mut self, envelope: &Envelope<T>) -> Result<(), Error> {
        if let Some(writer) = &mut self.writer {
            let frame = encode(envelope)?;
            writer.write_all(&frame)?;
        }
        Ok(())
    }

    pub fn replay<T: DeserializeOwned>(&self) -> impl Iterator<Item = Envelope<T>> {
        let file = File::open(&self.path).unwrap();
        let mut reader = BufReader::new(file);

        std::iter::from_fn(move || {
            let mut len_buf = [0u8; 4];
            reader.read_exact(&mut len_buf).ok()?;
            let len = u32::from_be_bytes(len_buf) as usize;

            let mut buf = vec![0u8; len];
            reader.read_exact(&mut buf).ok()?;

            decode(&buf).ok()
        })
    }
}

// Seeds for deterministic RNG
pub struct SeededRng {
    seed: u64,
    rng: StdRng,
}

impl SeededRng {
    pub fn new(seed: u64) -> Self {
        Self {
            seed,
            rng: StdRng::seed_from_u64(seed),
        }
    }

    pub fn get_seed(&self) -> u64 {
        self.seed
    }
}
```

## Implementation Notes
- Backend: `packages/agent-engine/rust/` (Cargo workspace), `packages/agent-engine/go/`
- Frontend: Engine status dashboard
- CLI: `tag engine start`, `tag engine status`, `tag engine replay`
- Database: N/A (engine is stateless, state in memory system)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `rust/common/src/tests/envelope.rs` | `roundtrip serialization` | Bytes match |
| `rust/common/src/tests/envelope.rs` | `latency calculation` | Correct microseconds |
| `rust/common/src/tests/wire.rs` | `frame encoding` | Length prefix correct |
| `rust/common/src/tests/wire.rs` | `partial read handling` | Error returned |
| `rust/engine/src/tests/tools.rs` | `parallel execution` | All complete |
| `rust/engine/src/tests/tools.rs` | `error isolation` | Others succeed |
| `rust/engine/src/tests/risk.rs` | `interceptor chain` | All checked |
| `rust/engine/src/tests/risk.rs` | `kill switch veto` | Request denied |
| `go/internal/client/client_test.go` | `connection retry` | Reconnects |
| `go/internal/client/client_test.go` | `timeout handling` | Error returned |

### Test Coverage Requirements
- 100% coverage on wire format
- All interceptors tested
- Deterministic replay verified

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `Go-Rust roundtrip` | Both running | 1. Send request 2. Receive response | Data intact |
| `parallel tools` | 8 tools | 1. Execute batch | All complete, parallel |
| `risk gate veto` | Kill switch on | 1. Send request | Denied |
| `deterministic replay` | Recorded log | 1. Replay | Same outputs |
| `connection recovery` | Engine restart | 1. Restart engine 2. Retry | Auto-reconnect |

### End-to-End Flows
- HTTP request → Go orchestrator → Rust engine → Tool execution → Response → SSE stream

## Acceptance Criteria
1. Go orchestrator handles HTTP/SSE/WebSocket
2. Rust engine processes requests via TCP
3. Postcard binary protocol for IPC
4. Parallel tool execution with Rayon
5. Risk gate with pluggable interceptors
6. Deterministic replay for debugging
7. Sub-millisecond latency for vector ops
8. Connection recovery and retry logic

## Review Checklist
- [ ] Is wire format documented for cross-language use?
- [ ] Are all message types defined in both languages?
- [ ] Does parallel execution respect max workers?
- [ ] Is risk gate chain ordered correctly?
- [ ] Does replay produce identical outputs?
- [ ] Are errors properly propagated across languages?

## Dependencies
- Depends on: Day 37 (Tool system), Day 38 (Oracle loop)
- Blocks: Day 46 (Observability), Day 48 (Integration)

## Risk Factors
- **Cross-language debugging** — Mitigation: Detailed logging, replay capability
- **Serialization mismatch** — Mitigation: Shared test fixtures, roundtrip tests
- **Connection instability** — Mitigation: Retry logic, circuit breaker
- **Performance regression** — Mitigation: Benchmark suite, CI checks
