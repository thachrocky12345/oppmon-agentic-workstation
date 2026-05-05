# TAG-45-GO: Go Orchestrator (Rust Engine Already Exists)

## Description

**Suggested Points:** 8 (High — Go HTTP/SSE/WebSocket server, TCP client to Rust engine, event bus architecture; Rust engine already exists from Week 2)

**Track:** Rust Early

## Objective

Implement the Go orchestrator layer for high-throughput HTTP handling, SSE streaming, and WebSocket connections. The Rust engine already exists (from Week 2), so this ticket focuses on the Go side and the TCP/Postcard communication between them.

## Requirements

### Architecture (Rust Already Exists)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Go Orchestrator (NEW)                             │
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
│                   Rust Engine (EXISTS FROM WEEK 2)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ TCP Server  │  │ Vectors     │  │ Hashing     │  │ Tool Exec   │    │
│  │ (Tokio)     │  │ (Rayon)     │  │ (SHA/BLAKE) │  │ (Sandbox)   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Go Project Structure

```
packages/orchestrator/
├── go.mod
├── go.sum
├── cmd/
│   └── orchestrator/
│       └── main.go
├── internal/
│   ├── config/
│   │   └── config.go
│   ├── server/
│   │   ├── server.go
│   │   ├── routes.go
│   │   ├── middleware.go
│   │   └── sse.go
│   ├── client/
│   │   ├── engine.go      # TCP client to Rust
│   │   ├── postcard.go    # Wire format
│   │   └── pool.go        # Connection pool
│   ├── eventbus/
│   │   ├── bus.go
│   │   └── subscriber.go
│   └── ratelimit/
│       └── limiter.go
├── pkg/
│   └── wire/
│       ├── messages.go    # Shared message types
│       └── envelope.go
└── Dockerfile
```

### Postcard Wire Format (Go Implementation)

```go
// packages/orchestrator/pkg/wire/envelope.go
package wire

import (
	"encoding/binary"
	"io"
	"time"
)

// Envelope wraps all messages with sequence and timestamps
type Envelope[T any] struct {
	Seq       uint64 `json:"seq"`
	TsEventUs uint64 `json:"ts_event_us"`
	TsRecvUs  uint64 `json:"ts_recv_us"`
	Payload   T      `json:"payload"`
}

func NewEnvelope[T any](seq uint64, payload T) Envelope[T] {
	now := uint64(time.Now().UnixMicro())
	return Envelope[T]{
		Seq:       seq,
		TsEventUs: now,
		TsRecvUs:  now,
		Payload:   payload,
	}
}

func (e *Envelope[T]) MarkReceived() {
	e.TsRecvUs = uint64(time.Now().UnixMicro())
}

func (e *Envelope[T]) LatencyUs() uint64 {
	return e.TsRecvUs - e.TsEventUs
}

// Frame format: 4-byte big-endian length + postcard-encoded payload
func WriteFrame(w io.Writer, data []byte) error {
	length := uint32(len(data))
	if err := binary.Write(w, binary.BigEndian, length); err != nil {
		return err
	}
	_, err := w.Write(data)
	return err
}

func ReadFrame(r io.Reader) ([]byte, error) {
	var length uint32
	if err := binary.Read(r, binary.BigEndian, &length); err != nil {
		return nil, err
	}
	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, err
	}
	return data, nil
}
```

### TCP Client to Rust Engine

```go
// packages/orchestrator/internal/client/engine.go
package client

import (
	"context"
	"net"
	"sync"
	"time"

	"github.com/team/orchestrator/pkg/wire"
)

type EngineClient struct {
	addr     string
	conn     net.Conn
	mu       sync.Mutex
	seq      uint64
	timeout  time.Duration
}

func NewEngineClient(addr string) *EngineClient {
	return &EngineClient{
		addr:    addr,
		timeout: 30 * time.Second,
	}
}

func (c *EngineClient) Connect(ctx context.Context) error {
	dialer := net.Dialer{Timeout: 5 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", c.addr)
	if err != nil {
		return err
	}
	c.conn = conn
	return nil
}

func (c *EngineClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

func (c *EngineClient) Send(ctx context.Context, request any) (*wire.Envelope[any], error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.seq++
	env := wire.NewEnvelope(c.seq, request)

	// Encode with postcard-compatible format
	data, err := encodePostcard(env)
	if err != nil {
		return nil, err
	}

	// Set deadline
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(c.timeout)
	}
	c.conn.SetDeadline(deadline)

	// Write request
	if err := wire.WriteFrame(c.conn, data); err != nil {
		return nil, err
	}

	// Read response
	respData, err := wire.ReadFrame(c.conn)
	if err != nil {
		return nil, err
	}

	var response wire.Envelope[any]
	if err := decodePostcard(respData, &response); err != nil {
		return nil, err
	}

	response.MarkReceived()
	return &response, nil
}
```

### HTTP/SSE Server

```go
// packages/orchestrator/internal/server/server.go
package server

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/team/orchestrator/internal/client"
)

type Server struct {
	router       *chi.Mux
	engineClient *client.EngineClient
	eventBus     *eventbus.Bus
}

func New(engineAddr string) *Server {
	s := &Server{
		router:       chi.NewRouter(),
		engineClient: client.NewEngineClient(engineAddr),
		eventBus:     eventbus.New(),
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	r := s.router

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// Health
	r.Get("/health", s.handleHealth)

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Use(s.authMiddleware)

		// Chat with SSE streaming
		r.Post("/chat", s.handleChat)
		r.Get("/chat/stream", s.handleChatSSE)

		// Direct engine calls
		r.Post("/vectors/search", s.handleVectorSearch)
		r.Post("/tools/execute", s.handleToolExecute)
	})
}

func (s *Server) Run(addr string) error {
	// Connect to Rust engine
	ctx := context.Background()
	if err := s.engineClient.Connect(ctx); err != nil {
		return err
	}
	defer s.engineClient.Close()

	return http.ListenAndServe(addr, s.router)
}
```

### SSE Streaming Handler

```go
// packages/orchestrator/internal/server/sse.go
package server

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func (s *Server) handleChatSSE(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	// Subscribe to events for this request
	requestID := middleware.GetReqID(r.Context())
	events := s.eventBus.Subscribe(requestID)
	defer s.eventBus.Unsubscribe(requestID)

	// Stream events
	for {
		select {
		case <-r.Context().Done():
			return
		case event := <-events:
			data, _ := json.Marshal(event)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()

			if event.Type == "done" || event.Type == "error" {
				return
			}
		}
	}
}

func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Get tenant from JWT (middleware populated context)
	tenantID := r.Context().Value("tenant_id").(string)
	req.TenantID = tenantID

	// Send to Rust engine
	response, err := s.engineClient.Send(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Publish events for SSE subscribers
	requestID := middleware.GetReqID(r.Context())
	s.eventBus.Publish(requestID, response.Payload)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response.Payload)
}
```

### Event Bus

```go
// packages/orchestrator/internal/eventbus/bus.go
package eventbus

import (
	"sync"
)

type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data,omitempty"`
}

type Bus struct {
	mu          sync.RWMutex
	subscribers map[string]chan Event
}

func New() *Bus {
	return &Bus{
		subscribers: make(map[string]chan Event),
	}
}

func (b *Bus) Subscribe(id string) <-chan Event {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan Event, 100)
	b.subscribers[id] = ch
	return ch
}

func (b *Bus) Unsubscribe(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if ch, ok := b.subscribers[id]; ok {
		close(ch)
		delete(b.subscribers, id)
	}
}

func (b *Bus) Publish(id string, event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if ch, ok := b.subscribers[id]; ok {
		select {
		case ch <- event:
		default:
			// Channel full, drop event
		}
	}
}
```

### Rate Limiting

```go
// packages/orchestrator/internal/ratelimit/limiter.go
package ratelimit

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type Limiter struct {
	mu       sync.RWMutex
	limiters map[string]*rate.Limiter
	rate     rate.Limit
	burst    int
}

func New(rps float64, burst int) *Limiter {
	return &Limiter{
		limiters: make(map[string]*rate.Limiter),
		rate:     rate.Limit(rps),
		burst:    burst,
	}
}

func (l *Limiter) getLimiter(key string) *rate.Limiter {
	l.mu.RLock()
	limiter, exists := l.limiters[key]
	l.mu.RUnlock()

	if exists {
		return limiter
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	limiter = rate.NewLimiter(l.rate, l.burst)
	l.limiters[key] = limiter
	return limiter
}

func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Rate limit by tenant
		tenantID := r.Context().Value("tenant_id").(string)
		limiter := l.getLimiter(tenantID)

		if !limiter.Allow() {
			http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}
```

## Implementation Notes

- **Backend:** Go HTTP server with chi router
- **Rust:** Already exists from Week 2 (vectors, hashing, tools)
- **IPC:** TCP with Postcard-compatible wire format
- **CLI:** N/A for this ticket

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `pkg/wire/envelope_test.go` | `roundtrip serialization` | Data preserved |
| `pkg/wire/envelope_test.go` | `latency calculation` | Correct microseconds |
| `internal/client/engine_test.go` | `connect and send` | Response received |
| `internal/client/engine_test.go` | `timeout handling` | Error returned |
| `internal/eventbus/bus_test.go` | `subscribe and publish` | Event received |
| `internal/eventbus/bus_test.go` | `unsubscribe closes channel` | Channel closed |
| `internal/ratelimit/limiter_test.go` | `allows under limit` | Request passes |
| `internal/ratelimit/limiter_test.go` | `blocks over limit` | 429 returned |

### Test Coverage Requirements

- Wire format roundtrip verified
- TCP client retry logic tested
- Event bus edge cases covered

## Integration Tests

### Required Integration Tests

| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `Go-Rust roundtrip` | Both running | 1. Send request 2. Receive | Data intact |
| `SSE streaming` | Go server | 1. Connect SSE 2. Trigger events | Events received |
| `rate limiting` | Limiter active | 1. Exceed rate | 429 response |
| `connection recovery` | Rust restart | 1. Restart Rust 2. Retry | Auto-reconnect |

### End-to-End Flows

- HTTP → Go → TCP/Postcard → Rust → Response → Go → SSE → Client

## Acceptance Criteria

1. Go HTTP server with chi router
2. TCP client to existing Rust engine
3. Postcard-compatible wire format
4. SSE streaming for chat responses
5. Event bus for request multiplexing
6. Rate limiting by tenant
7. Connection pooling and retry
8. Health check endpoint

## Review Checklist

- [ ] Does wire format match Rust Postcard?
- [ ] Is connection pool properly managed?
- [ ] Does SSE handle client disconnects?
- [ ] Is rate limiting per-tenant?
- [ ] Are all errors properly logged?
- [ ] Is graceful shutdown implemented?

## Dependencies

- Depends on: Day 4 (Rust vectors exist), Day 37 (Tool system)
- Blocks: Day 46 (Observability spans in Go)

## Risk Factors

- **Wire format mismatch** — Mitigation: Shared test fixtures
- **Connection pool exhaustion** — Mitigation: Limits, timeouts
- **SSE memory leaks** — Mitigation: Proper cleanup on disconnect
