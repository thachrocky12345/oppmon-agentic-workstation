# Data Flow

**Last Updated:** 2026-05-07 (init sync)

## Overview

This diagram shows how data enters the OppMon (Arkon) system, gets validated, processed, stored, and returned to clients. The system supports traditional CRUD, real-time event streaming, LLM interactions (direct and via the LiteLLM router), agent oracle loops with semantic caching, document ingestion (PDF/DOCX), and semantic search via embeddings.

## Data Entry Points

```mermaid
flowchart TD
    subgraph Entry["Data Entry Points"]
        API["REST API<br/>/api/*"]
        WS["WebSocket<br/>Real-time events"]
        Push["Web Push<br/>Notifications"]
        LLM["LLM Proxy<br/>/api/llm/*"]
    end

    subgraph Validation["Validation Layer"]
        Zod["Zod Schema<br/>Validation"]
        Auth["JWT<br/>Authentication"]
        RBAC["RBAC<br/>Authorization"]
        TenantFilter["Tenant<br/>Isolation"]
    end

    subgraph Processing["Processing Layer"]
        Transform["Data<br/>Transformation"]
        Enrich["Data<br/>Enrichment"]
        Aggregate["Aggregation<br/>(Analytics)"]
        Embed["Embedding<br/>Generation"]
    end

    subgraph Storage["Storage Layer"]
        PG["PostgreSQL<br/>(Relational)"]
        TS["TimescaleDB<br/>(Time-series)"]
        PGV["pgvector<br/>(Embeddings)"]
    end

    subgraph Output["Output"]
        JSON["JSON<br/>Response"]
        Stream["Event<br/>Stream"]
        Notify["Push<br/>Notification"]
        RAG["RAG<br/>Context"]
    end

    API --> Auth
    WS --> Auth
    LLM --> Auth
    Auth --> RBAC
    RBAC --> TenantFilter
    TenantFilter --> Zod
    Zod --> Transform
    Transform --> Enrich
    Enrich --> PG
    Enrich --> TS
    Enrich --> Embed
    Embed --> PGV
    Aggregate --> TS
    PG --> JSON
    TS --> Stream
    Push --> Notify
    PGV --> RAG
```

## Event Ingestion Flow

```mermaid
sequenceDiagram
    autonumber
    participant Agent as AI Agent
    participant API as Events API
    participant Val as Validator
    participant Svc as Event Service
    participant P as Prisma
    participant TS as TimescaleDB
    participant WS as WebSocket

    Agent->>API: POST /api/events
    Note over Agent,API: {agentId, eventType, payload}

    API->>Val: Validate event schema
    Val-->>API: Valid

    API->>Svc: processEvent(event)

    par Store event
        Svc->>P: prisma.event.create()
        P->>TS: INSERT INTO events
        TS-->>P: Stored
    and Broadcast
        Svc->>WS: broadcast(event)
        WS-->>WS: Send to subscribers
    end

    Svc-->>API: Event ID
    API-->>Agent: 201 Created
```

## LLM Chat Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as LLM Route
    participant Svc as LLM Service
    participant Provider as LLM Provider
    participant P as Prisma
    participant DB as PostgreSQL

    C->>API: POST /api/llm/chat
    Note over C,API: {sessionId?, provider, model, messages}

    API->>Svc: chat(request)

    alt New Session
        Svc->>P: prisma.llmSession.create()
        P->>DB: INSERT
    end

    Svc->>Provider: Send to provider
    Note over Provider: Anthropic/Cerebras/Ollama

    Provider-->>Svc: Response + token counts

    Svc->>P: prisma.llmMessage.create()
    P->>DB: INSERT (user + assistant messages)

    Svc-->>API: {content, tokens, sessionId}
    API-->>C: 200 OK
```

## Embedding Generation Flow

```mermaid
sequenceDiagram
    autonumber
    participant Trigger as Model Change
    participant Hook as Embedding Hook
    participant Svc as Embedding Service
    participant OpenAI as OpenAI API
    participant P as Prisma
    participant PGV as pgvector

    Trigger->>Hook: Skill/Agent/Journal created/updated

    Hook->>Hook: Extract text content

    Hook->>Svc: generateEmbedding(content)

    Svc->>Svc: Hash content (SHA-256)

    Svc->>P: Check for existing hash
    P->>PGV: SELECT by contentHash

    alt Already embedded
        PGV-->>P: Existing embedding
        P-->>Svc: Skip
    else New content
        Svc->>OpenAI: POST /embeddings
        Note over OpenAI: text-embedding-3-small
        OpenAI-->>Svc: vector[1536]

        Svc->>P: prisma.embedding.create()
        P->>PGV: INSERT with vector
    end

    Svc-->>Hook: Embedding ID
```

## RAG Context Retrieval Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as RAG Route
    participant Svc as RAG Service
    participant Embed as Embedding Service
    participant P as Prisma
    participant PGV as pgvector

    C->>API: POST /api/rag/query
    Note over C,API: {query, sourceTypes?, limit?}

    API->>Svc: getContext(query)

    Svc->>Embed: generateEmbedding(query)
    Embed-->>Svc: queryVector[1536]

    Svc->>P: Semantic search
    P->>PGV: SELECT with cosine similarity
    Note over PGV: ORDER BY embedding <=> queryVector

    PGV-->>P: Top K results
    P-->>Svc: Matching embeddings

    Svc->>Svc: Build context from results

    Svc-->>API: {context, sources}
    API-->>C: 200 OK
```

## Analytics Data Flow

```mermaid
flowchart LR
    subgraph Raw["Raw Events"]
        E1["Event 1"]
        E2["Event 2"]
        E3["Event N"]
    end

    subgraph Aggregation["TimescaleDB Aggregation"]
        Hourly["Hourly<br/>Continuous Aggregate"]
        Daily["Daily<br/>Continuous Aggregate"]
    end

    subgraph API["Analytics API"]
        Dashboard["Dashboard<br/>Endpoint"]
        Reports["Reports<br/>Endpoint"]
    end

    E1 --> Hourly
    E2 --> Hourly
    E3 --> Hourly
    Hourly --> Daily
    Hourly --> Dashboard
    Daily --> Reports
```

## Data Transformation Pipeline

```mermaid
flowchart TD
    A[Raw Input] --> B{Input Type}

    B -->|Agent Event| C[Normalize Event]
    B -->|User Action| D[Enrich with Context]
    B -->|LLM Request| E[Validate Provider]
    B -->|Skill Upload| F[Hash Content]

    C --> G[Validate Schema]
    D --> G
    E --> G
    F --> G

    G --> H{Valid?}
    H -->|Yes| I[Store]
    H -->|No| J[Log Error]

    I --> K{Data Type}
    K -->|Relational| L[PostgreSQL]
    K -->|Time-series| M[TimescaleDB]
    K -->|Vector| N[pgvector]
```

## Document Ingestion Flow (PDF / DOCX → Embeddings)

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as RAG Admin Route
    participant BB as busboy (multipart)
    participant Parse as pdf-parse / mammoth
    participant Store as lib/storage/local-disk
    participant Chunk as Chunker
    participant Embed as Embedding Service
    participant PGV as pgvector

    C->>API: POST /api/rag/admin (multipart/form-data)
    API->>BB: stream parse fields + files
    BB-->>API: file stream(s)
    API->>Store: persist to oppmon-documents volume
    par per file
        API->>Parse: extract text (pdf-parse or mammoth)
        Parse-->>API: plaintext
        API->>Chunk: split into chunks
        Chunk->>Embed: generateEmbedding(chunk)
        Embed->>PGV: INSERT vector + metadata
    end
    API-->>C: 201 Created (doc id, chunk count)
```

## Agent Oracle Loop Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant Rt as Route (chat/agent)
    participant Or as Oracle Loop
    participant SC as Semantic Cache
    participant MM as Memory Manager
    participant TB as Toolbox
    participant G as Guardrails
    participant LLM as LLM Provider

    C->>Rt: POST /api/rag/chat | /api/llm/chat
    Rt->>Or: run(prompt, context)
    Or->>SC: lookup(embedding(prompt))
    alt Cache hit
        SC-->>Or: cached completion
    else Cache miss
        Or->>MM: load short/long term memory
        loop until done or max iterations
            Or->>G: scope + constitution + filter check
            G-->>Or: allow / deny
            Or->>LLM: completion (Anthropic / Cerebras / Ollama)
            LLM-->>Or: tokens / tool call
            opt tool call
                Or->>TB: execute(tool, args)
                TB-->>Or: tool result
            end
        end
        Or->>SC: store(embedding(prompt), final)
        Or->>MM: persist memory deltas
    end
    Or-->>Rt: final message
    Rt-->>C: 200 OK
```

## Hybrid Search Flow (BM25 + Vector + RRF)

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as Search Route
    participant Svc as Search Service
    participant BM25 as BM25 Engine
    participant Vec as Vector Search
    participant RRF as RRF Fusion
    participant P as Prisma
    participant PGV as pgvector

    C->>API: POST /api/search
    Note over C,API: {query, types?, limit?}

    API->>Svc: hybridSearch(query)

    par BM25 Keyword Search
        Svc->>BM25: textSearch(query)
        BM25->>P: Text pattern matching
        P-->>BM25: Keyword results
    and Vector Similarity Search
        Svc->>Vec: vectorSearch(query)
        Vec->>PGV: Cosine similarity
        PGV-->>Vec: Vector results
    end

    BM25-->>Svc: Keyword ranked results
    Vec-->>Svc: Similarity ranked results

    Svc->>RRF: reciprocalRankFusion(keyword, vector)
    Note over RRF: RRF(d) = Σ 1/(k + rank_i)

    RRF-->>Svc: Fused rankings

    Svc->>Svc: Apply confidence scoring

    Svc-->>API: {results, confidence}
    API-->>C: 200 OK
```

## Data Read Patterns

| Pattern | Table | Index Used | Typical Query |
|---------|-------|-----------|---------------|
| Latest events | events | (timestamp DESC) | Dashboard widget |
| Agent events | events | (agentId, timestamp) | Agent detail page |
| Event analytics | event_hourly | (bucket DESC) | Charts |
| User lookup | users | (email) | Authentication |
| Active agents | agents | (status) | Agent list |
| Tenant resources | * | (tenantId) | All queries |
| Semantic search | embeddings | HNSW (embedding) | RAG context |
| Hybrid search | embeddings + skills | BM25 + HNSW | Skill search |
| Skill lookup | skills | (tenantId, name) | Skill registry |
| LLM history | llm_messages | (sessionId, createdAt) | Chat history |
| MCP servers | mcp_servers | (tenantId, name) | MCP registry |
| Usage analytics | usage_events | (tenantId, bucketTimestamp) | Privacy-first metrics |
| Tenant settings | tenant_settings | (tenantId) | Privacy controls |

## Caching Strategy

```mermaid
flowchart LR
    Client --> API
    API --> Cache{Redis Cache}
    Cache -->|Hit| API
    Cache -->|Miss| DB[(Database)]
    DB --> Cache
    Cache --> API
    API --> Client
```

### Cache Configuration (Redis, full profile)

| Data Type | TTL | Key Pattern |
|-----------|-----|-------------|
| Dashboard aggregations | 1 min | `dashboard:{tenantId}` |
| Agent configurations | 5 min | `agent:{id}:config` |
| Skill content | 10 min | `skill:{tenantId}:{name}:{version}` |
| Embedding vectors | 1 hour | `embedding:{contentHash}` |
| User sessions | 24 hours | `session:{token}` |
