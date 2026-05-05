# RAG (Retrieval Augmented Generation) Pipeline

**Last Updated:** 2026-05-04
**Status:** Implemented
**Version:** 1.0.0

---

## Overview

The RAG pipeline combines semantic search (embeddings) with LLM generation to provide grounded, context-aware responses. It retrieves relevant documents from the knowledge base and uses them to inform LLM responses.

### Pipeline Flow

```
User Query
    │
    ▼
┌─────────────────┐
│ 1. Preprocess   │  Clean and normalize query
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Retrieve     │  Semantic search via embeddings
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Format       │  Build context from documents
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Generate     │  LLM generates grounded response
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Format       │  Add citations and metadata
└────────┬────────┘
         │
         ▼
    Response
```

---

## Architecture

```
+-------------------------------------------------------------+
|                      API Routes                              |
|  POST /api/rag/query     - Full RAG query                    |
|  POST /api/rag/retrieve  - Retrieval only                    |
|  GET  /api/rag/status    - Pipeline status                   |
|  GET  /api/rag/sessions  - Conversation sessions             |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
|                      RAG Service                             |
|  - Query orchestration                                       |
|  - Session management                                        |
|  - Usage tracking                                            |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
|                    RAG Orchestrator                          |
|  - retrieve()  - Semantic search                             |
|  - generate()  - LLM generation                              |
|  - executeRAG() - Full pipeline                              |
+-------------------------------------------------------------+
         │                    │                    │
         ▼                    ▼                    ▼
+----------------+  +------------------+  +----------------+
| Embedding      |  | Context          |  | LLM            |
| Service        |  | Formatting       |  | Service        |
| (pgvector)     |  | (prompt build)   |  | (generation)   |
+----------------+  +------------------+  +----------------+
```

### File Structure

```
apps/api/src/
├── lib/rag/
│   ├── types.ts        # RAG types and interfaces
│   ├── context.ts      # Context formatting utilities
│   └── index.ts        # RAG orchestrator
├── services/
│   └── rag.ts          # Business logic layer
└── routes/
    └── rag.ts          # API endpoints
```

---

## Configuration

### Environment Variables

```env
# Default documents to retrieve
RAG_DEFAULT_TOP_K=5

# Minimum relevance threshold (0-1)
RAG_DEFAULT_THRESHOLD=0.7

# Max tokens for retrieved context
RAG_MAX_CONTEXT_TOKENS=4000

# Retrieval strategy
RAG_STRATEGY=simple

# Override providers (optional)
RAG_LLM_PROVIDER=anthropic
RAG_EMBEDDING_PROVIDER=openai

# Include source citations
RAG_INCLUDE_SOURCES=true
```

### Retrieval Strategies

| Strategy | Description |
|----------|-------------|
| `simple` | Basic semantic search, return top-K results |
| `hybrid` | Combine semantic + keyword search (future) |
| `rerank` | Use cross-encoder for re-ranking (future) |

---

## API Reference

### POST /api/rag/query

Execute a full RAG query with retrieval and generation.

**Request:**
```json
{
  "query": "How do I authenticate users in this system?",
  "sessionId": "rag_abc123",
  "sourceTypes": ["skill", "document"],
  "topK": 5,
  "threshold": 0.7,
  "llmProvider": "anthropic",
  "llmModel": "claude-sonnet-4-20250514",
  "temperature": 0.7,
  "maxTokens": 1000,
  "includeSources": true,
  "includeMetadata": true
}
```

**Response:**
```json
{
  "data": {
    "answer": "Based on the authentication skill documentation, users are authenticated using JWT tokens...",
    "sources": [
      {
        "id": "emb_123",
        "sourceType": "skill",
        "sourceId": "skill_auth",
        "score": 0.92,
        "excerpt": "JWT authentication with bcrypt..."
      }
    ],
    "sessionId": "rag_abc123",
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic",
    "usage": {
      "inputTokens": 1500,
      "outputTokens": 250,
      "totalTokens": 1750
    },
    "retrieval": {
      "documentsRetrieved": 3,
      "retrievalTimeMs": 45,
      "query": "authenticate users system"
    }
  }
}
```

### POST /api/rag/retrieve

Execute retrieval only (no LLM generation). Useful for debugging or custom processing.

**Request:**
```json
{
  "query": "authentication methods",
  "sourceTypes": ["skill"],
  "topK": 10,
  "threshold": 0.5
}
```

**Response:**
```json
{
  "data": {
    "documents": [
      {
        "id": "emb_123",
        "sourceType": "skill",
        "sourceId": "skill_auth",
        "content": "JWT authentication implementation...",
        "score": 0.92,
        "metadata": { "name": "Authentication" }
      }
    ],
    "query": "authentication methods",
    "totalSearched": 150,
    "retrievalTimeMs": 32
  }
}
```

### GET /api/rag/status

Get RAG pipeline configuration and status.

**Response:**
```json
{
  "data": {
    "configured": true,
    "embeddingProvider": "openai",
    "llmProvider": "anthropic",
    "config": {
      "defaultTopK": 5,
      "defaultThreshold": 0.7,
      "maxContextTokens": 4000,
      "strategy": "simple"
    }
  }
}
```

### GET /api/rag/sessions

List RAG conversation sessions.

**Response:**
```json
{
  "data": [
    {
      "id": "rag_abc123",
      "title": "How do I authenticate users?",
      "messageCount": 4,
      "createdAt": "2026-05-04T10:00:00Z",
      "updatedAt": "2026-05-04T10:15:00Z"
    }
  ],
  "meta": { "total": 10, "limit": 50, "offset": 0 }
}
```

### GET /api/rag/sessions/:id

Get session with conversation history.

### DELETE /api/rag/sessions/:id

Delete a RAG session.

### GET /api/rag/usage

Get RAG usage statistics.

**Response:**
```json
{
  "data": {
    "sessions": 25,
    "byModel": [
      {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "messageCount": 50,
        "inputTokens": 75000,
        "outputTokens": 25000,
        "totalTokens": 100000
      }
    ]
  }
}
```

---

## Context Formatting

### Document Format

Retrieved documents are formatted as:

```
[Source: skill/skill_auth] (Score: 0.92)
JWT authentication implementation using bcrypt for password hashing...

---

[Source: document/doc_security] (Score: 0.85)
Security best practices for API authentication...
```

### Prompt Structure

```
SYSTEM: You are a helpful AI assistant with access to a knowledge base...

USER: I found 3 relevant document(s) in the knowledge base:

[Source: skill/skill_auth] (Score: 0.92)
...document content...

---

Based on the context above, please answer:
How do I authenticate users in this system?
```

### Token Management

The pipeline automatically manages context length:

1. **System prompt reserve**: 500 tokens
2. **Response reserve**: configurable (default 1000)
3. **Context budget**: 70% of remaining for documents
4. **History budget**: 30% of remaining for conversation

---

## Multi-Turn Conversations

RAG supports multi-turn conversations via session management:

```typescript
// First query
const response1 = await rag.query(tenantId, userId, {
  query: "How does authentication work?",
});
// Returns sessionId: "rag_abc123"

// Follow-up query (includes conversation history)
const response2 = await rag.query(tenantId, userId, {
  query: "What about OAuth?",
  sessionId: "rag_abc123",  // Continue conversation
});
```

Session messages are stored in `llm_sessions` and `llm_messages` tables.

---

## Usage Examples

### Basic Query

```bash
curl -X POST http://localhost:3001/api/rag/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do I create a new agent?",
    "includeSources": true
  }'
```

### Filtered Query

```bash
curl -X POST http://localhost:3001/api/rag/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What security features are available?",
    "sourceTypes": ["skill", "document"],
    "topK": 3,
    "threshold": 0.8
  }'
```

### Retrieve Only

```bash
curl -X POST http://localhost:3001/api/rag/retrieve \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "agent monitoring",
    "topK": 10
  }'
```

### Continue Conversation

```bash
curl -X POST http://localhost:3001/api/rag/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Can you give me more details?",
    "sessionId": "rag_abc123"
  }'
```

---

## Testing

### Verification Steps

```bash
# 1. Ensure embeddings exist
curl http://localhost:3001/api/embedding/stats \
  -H "Authorization: Bearer <token>"

# 2. Check RAG status
curl http://localhost:3001/api/rag/status \
  -H "Authorization: Bearer <token>"

# 3. Test retrieval
curl -X POST http://localhost:3001/api/rag/retrieve \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "test query"}'

# 4. Test full RAG query
curl -X POST http://localhost:3001/api/rag/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "How does this system work?"}'

# 5. Check usage stats
curl http://localhost:3001/api/rag/usage \
  -H "Authorization: Bearer <token>"
```

---

## Acceptance Criteria

- [x] `POST /api/rag/query` executes full RAG pipeline
- [x] `POST /api/rag/retrieve` returns relevant documents
- [x] Source citations included in responses
- [x] Multi-turn conversation support via sessions
- [x] Configurable retrieval parameters (topK, threshold)
- [x] Context window management
- [x] Token usage tracking
- [x] Audit logging for queries

---

## Future Improvements

### Phase 2: Hybrid Search

- Combine semantic + keyword search
- BM25 for exact matches
- Weighted fusion of results

### Phase 3: Re-ranking

- Cross-encoder re-ranking
- LLM-based relevance scoring
- Diversity optimization

### Phase 4: Advanced Features

- Streaming responses
- Document chunking strategies
- Query expansion with LLM
- Feedback loop for relevance

### Phase 5: Caching

- Query result caching
- Embedding cache
- LRU eviction strategy

---

## Troubleshooting

### No Documents Retrieved

```
Error: No relevant documents found
```

**Solutions:**
1. Check embedding count: `GET /api/embedding/stats`
2. Lower threshold: `"threshold": 0.5`
3. Increase topK: `"topK": 10`
4. Verify embeddings exist for source types

### Context Too Long

```
Error: Context exceeds maximum tokens
```

**Solutions:**
1. Reduce `topK` parameter
2. Increase `RAG_MAX_CONTEXT_TOKENS`
3. Use shorter documents

### Generation Failed

```
Error: LLM generation failed
```

**Solutions:**
1. Check LLM provider API key
2. Verify provider is available: `GET /api/llm/providers`
3. Try different provider: `"llmProvider": "ollama"`

---

## Related Documentation

- [Auto-Embedding System](./auto_embedding.md)
- [Embedding Integration](./embeddings.md)
- [LLM Integration](./llm_models.md)
- [Architecture Overview](./architecture.md)
