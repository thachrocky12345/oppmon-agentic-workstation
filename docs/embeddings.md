# Embedding Provider Integration

**Last Updated:** 2026-05-04
**Status:** Implemented
**Version:** 1.0.0

---

## Overview

Arkon supports multi-provider embedding integration for semantic search capabilities. Embeddings convert text into high-dimensional vectors that capture semantic meaning, enabling similarity search across documents, skills, agents, and other content.

### Supported Providers

| Provider | Model | Dimensions | Use Case |
|----------|-------|------------|----------|
| OpenAI | text-embedding-3-small | 1536 | Default, cost-effective |
| OpenAI | text-embedding-3-large | 3072 | Higher quality |
| Gemini | gemini-embedding-001 | 1536 | Google Cloud |
| Voyage | voyage-2 | 1024 | High quality |
| Cohere | embed-english-v3.0 | 1024 | Enterprise |

---

## Architecture

```
+-------------------------------------------------------------+
|                      API Routes                              |
|  POST /api/embedding/embed       - Generate embedding        |
|  POST /api/embedding/embed-batch - Batch embeddings          |
|  POST /api/embedding/search      - Semantic search           |
|  GET  /api/embedding             - List embeddings           |
|  GET  /api/embedding/stats       - Usage statistics          |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                  Embedding Service Layer                     |
|  - Provider abstraction                                      |
|  - pgvector storage                                          |
|  - Similarity search                                         |
|  - Deduplication (content hash)                              |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    OpenAI Client                             |
|  - text-embedding-3-small (default)                          |
|  - Batch support (up to 2048 inputs)                         |
|  - Configurable dimensions                                   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    PostgreSQL + pgvector                     |
|  - HNSW index for fast ANN search                            |
|  - Cosine similarity scoring                                 |
|  - Filtered queries by source type                           |
+-------------------------------------------------------------+
```

### File Structure

```
apps/api/src/
├── lib/embedding/
│   ├── types.ts        # Shared types and interfaces
│   ├── openai.ts       # OpenAI embedding client
│   └── index.ts        # Factory and utilities
├── services/
│   └── embedding.ts    # Business logic layer
├── routes/
│   └── embedding.ts    # API endpoints
└── scripts/migrations/
    └── 001_add_embedding_vector.sql  # pgvector migration

packages/database/prisma/
└── schema.prisma       # Embedding model
```

---

## Configuration

### Environment Variables

Add these to `apps/api/.env`:

```env
# Default embedding provider
POC_SEARCH_EMBEDDING_PROVIDER=openai

# OpenAI Embeddings
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
OPENAI_EMBEDDING_TIMEOUT=60000
OPENAI_EMBEDDING_BATCH_SIZE=2048
```

### Model Comparison

| Model | Dimensions | Max Tokens | Cost | Quality |
|-------|------------|------------|------|---------|
| text-embedding-3-small | 1536 | 8191 | Low | Good |
| text-embedding-3-large | 3072 | 8191 | Medium | Best |
| text-embedding-ada-002 | 1536 | 8191 | Low | Legacy |

---

## API Reference

### POST /api/embedding/embed

Generate embedding for a single text.

**Request:**
```json
{
  "content": "Text to embed for semantic search",
  "sourceType": "skill",
  "sourceId": "skill_123",
  "provider": "openai",
  "model": "text-embedding-3-small",
  "metadata": { "category": "documentation" },
  "skipIfExists": true
}
```

**Response:**
```json
{
  "data": {
    "id": "clx123...",
    "sourceType": "skill",
    "sourceId": "skill_123",
    "contentHash": "a1b2c3...",
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimensions": 1536,
    "created": true
  }
}
```

### POST /api/embedding/embed-batch

Generate embeddings for multiple texts efficiently.

**Request:**
```json
{
  "items": [
    { "content": "First document", "sourceType": "doc", "sourceId": "doc_1" },
    { "content": "Second document", "sourceType": "doc", "sourceId": "doc_2" }
  ],
  "provider": "openai",
  "skipIfExists": true
}
```

**Response:**
```json
{
  "data": [
    { "id": "clx1...", "sourceType": "doc", "sourceId": "doc_1", "created": true },
    { "id": "clx2...", "sourceType": "doc", "sourceId": "doc_2", "created": true }
  ],
  "meta": {
    "total": 2,
    "created": 2,
    "skipped": 0
  }
}
```

### POST /api/embedding/search

Semantic similarity search.

**Request:**
```json
{
  "query": "How do I authenticate users?",
  "sourceType": "skill",
  "limit": 10,
  "threshold": 0.7,
  "includeContent": true,
  "includeMetadata": true
}
```

**Response:**
```json
{
  "data": [
    {
      "id": "clx123...",
      "sourceType": "skill",
      "sourceId": "skill_auth",
      "content": "Authentication skill content...",
      "metadata": { "category": "security" },
      "similarity": 0.92
    }
  ],
  "meta": {
    "total": 1,
    "query": "How do I authenticate users?"
  }
}
```

### POST /api/embedding/similar/:sourceType/:sourceId

Find similar items to an existing source.

**Query Parameters:**
- `limit` (optional): Max results (default 10)
- `threshold` (optional): Minimum similarity (default 0.5)
- `includeContent` (optional): Include content in results

### GET /api/embedding

List embeddings with filtering.

**Query Parameters:**
- `sourceType` (optional): Filter by type
- `sourceId` (optional): Filter by source
- `limit` (optional): Max results (default 50)
- `offset` (optional): Pagination offset

### GET /api/embedding/stats

Get embedding statistics.

**Response:**
```json
{
  "data": {
    "total": 1500,
    "bySource": [
      { "sourceType": "skill", "provider": "openai", "model": "text-embedding-3-small", "count": 500 },
      { "sourceType": "document", "provider": "openai", "model": "text-embedding-3-small", "count": 1000 }
    ]
  }
}
```

### DELETE /api/embedding/:id

Delete a single embedding.

### DELETE /api/embedding/source/:sourceType/:sourceId

Delete all embeddings for a source.

---

## Database Schema

### Embedding Model

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| tenantId | String | Tenant reference |
| sourceType | String | Type: 'skill', 'agent', 'document', etc. |
| sourceId | String | Source record ID |
| content | String | Text that was embedded |
| contentHash | String | SHA-256 hash for deduplication |
| embedding | vector(1536) | pgvector column (via raw SQL) |
| provider | String | 'openai', 'gemini', etc. |
| model | String | Model used |
| dimensions | Int | Vector dimensions |
| metadata | Json | Additional context |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update |

### Indexes

- `embeddings_embedding_hnsw_idx` - HNSW index for fast ANN search
- `embeddings_tenant_source_idx` - Composite index for filtered queries
- Unique constraint on `(tenantId, sourceType, sourceId, contentHash)`

---

## pgvector Setup

### Prerequisites

Ensure pgvector extension is installed:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Migration

After `prisma db push`, run the vector migration (cross-platform):

```bash
pnpm --filter @arkon/api migrate
```

This creates:
1. The `embedding vector(1536)` column
2. HNSW index for similarity search
3. `search_embeddings()` function for queries

---

## Usage Examples

### Embed a Skill

```typescript
import { embed } from './services/embedding';

const result = await embed(tenantId, {
  content: skillDefinition,
  sourceType: 'skill',
  sourceId: skill.id,
  metadata: { name: skill.name, scope: skill.scope },
});
```

### Search for Similar Content

```typescript
import { search } from './services/embedding';

const results = await search(tenantId, {
  query: "How to implement authentication?",
  sourceType: 'skill',
  limit: 5,
  threshold: 0.7,
  includeContent: true,
});

for (const result of results) {
  console.log(`${result.sourceId}: ${result.similarity.toFixed(2)}`);
}
```

### Batch Embed Documents

```typescript
import { embedBatch } from './services/embedding';

const results = await embedBatch(tenantId, {
  items: documents.map(doc => ({
    content: doc.body,
    sourceType: 'document',
    sourceId: doc.id,
    metadata: { title: doc.title },
  })),
  skipIfExists: true,
});

console.log(`Created ${results.filter(r => r.created).length} embeddings`);
```

---

## Testing

### Verification Steps

```bash
# 1. Install dependencies
pnpm --filter @arkon/api add openai

# 2. Push database schema
cd packages/database && npx prisma db push

# 3. Run pgvector migration (cross-platform)
pnpm --filter @arkon/api migrate

# 4. Start API
pnpm --filter @arkon/api dev

# 5. Test embed
curl -X POST http://localhost:3001/api/embedding/embed \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is a test document for embedding",
    "sourceType": "test",
    "sourceId": "test_1"
  }'

# 6. Test search
curl -X POST http://localhost:3001/api/embedding/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test document",
    "limit": 5,
    "includeContent": true
  }'

# 7. Get stats
curl http://localhost:3001/api/embedding/stats \
  -H "Authorization: Bearer <token>"
```

---

## Acceptance Criteria

- [x] `POST /api/embedding/embed` generates and stores embeddings
- [x] `POST /api/embedding/embed-batch` handles multiple inputs
- [x] `POST /api/embedding/search` returns similarity-ranked results
- [x] Content deduplication via hash
- [x] pgvector HNSW index for fast search
- [x] Audit logging for embedding operations
- [x] Provider abstraction for future expansion

---

## Future Improvements

### Phase 2: Additional Providers

- Gemini embeddings via Google AI
- Voyage AI for domain-specific
- Cohere for multilingual

### Phase 3: Advanced Features

- Hybrid search (keyword + semantic)
- Re-ranking with cross-encoders
- Chunking for long documents
- Embedding decay/refresh

### Phase 4: Integrations

- Auto-embed skills on create/update
- Agent memory with embeddings
- Journal entry semantic search
- RAG pipeline support

---

## Troubleshooting

### pgvector Not Found

```
Error: type "vector" does not exist
```

**Solution:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### OpenAI Rate Limited

```
Error: Rate limit exceeded
```

**Solution:**
1. Implement request queuing
2. Add exponential backoff
3. Reduce batch sizes

### Dimension Mismatch

```
Error: different vector dimensions
```

**Solution:**
- Ensure all embeddings use same model/dimensions
- Re-embed with consistent settings
- Use `reEmbed()` function for migration

---

## Related Documentation

- [Auto-Embedding System](./auto_embedding.md)
- [RAG Pipeline](./rag.md)
- [LLM Integration](./llm_models.md)
- [Architecture Overview](./architecture.md)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
