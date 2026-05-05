# Auto-Embedding System

**Last Updated:** 2026-05-04
**Status:** Implemented
**Version:** 1.0.0

---

## Overview

The Auto-Embedding system automatically generates vector embeddings for entities (skills, agents) when they are created or updated. This ensures the RAG pipeline always has up-to-date semantic representations for search and retrieval.

### Key Features

- **Automatic embedding** on entity create/update
- **Automatic cleanup** on entity delete
- **Non-blocking** background processing
- **Re-indexing** support for bulk operations
- **Coverage monitoring** to track embedding completeness

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Entity Operations                         │
│  Skills Service → create/update/delete                       │
│  Agents Routes  → create/update/delete                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Embedding Hooks Service                     │
│  - embedSkill()      - Format & embed skill content          │
│  - embedAgent()      - Format & embed agent content          │
│  - deleteXxxEmbedding()  - Cleanup on delete                 │
│  - reindexAll()      - Bulk re-indexing                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Embedding Service                         │
│  - embed()           - Generate vector embedding             │
│  - embedBatch()      - Batch embedding for efficiency        │
│  - deleteSourceEmbeddings()  - Remove embeddings             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  OpenAI Embeddings API                       │
│  - text-embedding-3-small (1536 dimensions)                  │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
apps/api/src/
├── services/
│   ├── embedding-hooks.ts   # Auto-embedding logic
│   ├── embedding.ts         # Core embedding operations
│   └── skills.ts            # Skills with auto-embedding
├── routes/
│   ├── embedding.ts         # Embedding API (includes management)
│   └── agents.ts            # Agents with auto-embedding
└── lib/embedding/
    └── ...                  # Embedding client libraries
```

---

## Configuration

### Environment Variables

Add to `apps/api/.env`:

```env
# Enable automatic embedding of entities on create/update
AUTO_EMBEDDING_ENABLED=true
```

When disabled, entities are not automatically embedded. You can still:
- Manually embed via API
- Use the reindex endpoint for bulk embedding

---

## Supported Entities

### Skills

**Trigger Events:**
- `createSkill()` - Embeds new skill
- `updateSkill()` - Re-embeds if content changes
- `deleteSkill()` - Deletes embedding on soft delete

**Embedded Content Format:**
```
Skill: [name]
Description: [description]
Scope: [TENANT|TEAM]
Version: [version]

Content:
[skill content]
```

**Metadata Stored:**
```json
{
  "name": "skill_name",
  "scope": "TENANT",
  "version": 1,
  "teamId": "team_123"
}
```

### Agents

**Trigger Events:**
- `POST /api/agents` - Embeds new agent
- `PUT /api/agents/:id` - Re-embeds on update
- `DELETE /api/agents/:id` - Deletes embedding
- `POST /api/agents/register` - Embeds on create/update

**Embedded Content Format:**
```
Agent: [name]
Description: [description]
Framework: [framework]
Status: [status]
Config: [safe config keys]
```

**Metadata Stored:**
```json
{
  "name": "agent_name",
  "framework": "openai",
  "status": "active",
  "teamId": "team_123"
}
```

---

## API Reference

### POST /api/embedding/reindex

Trigger re-indexing of all embeddable content.

**Request:**
```json
{
  "types": ["skill", "agent"],
  "batchSize": 50,
  "dryRun": false
}
```

**Response:**
```json
{
  "data": {
    "dryRun": false,
    "results": {
      "skill": {
        "total": 100,
        "processed": 98,
        "failed": 2,
        "errors": [
          { "id": "skill_x", "error": "Content too long" }
        ]
      },
      "agent": {
        "total": 50,
        "processed": 50,
        "failed": 0,
        "errors": []
      }
    },
    "totals": {
      "total": 150,
      "processed": 148,
      "failed": 2
    }
  }
}
```

### GET /api/embedding/coverage

Get embedding coverage statistics.

**Response:**
```json
{
  "data": {
    "skills": {
      "total": 100,
      "embedded": 95,
      "coverage": 95.0
    },
    "agents": {
      "total": 50,
      "embedded": 50,
      "coverage": 100.0
    }
  }
}
```

### GET /api/embedding/status/:sourceType/:sourceId

Get embedding status for a specific entity.

**Response:**
```json
{
  "data": {
    "sourceType": "skill",
    "sourceId": "skill_123",
    "hasEmbedding": true,
    "embeddingId": "emb_456",
    "lastUpdated": "2026-05-04T10:30:00Z",
    "contentHash": "abc123..."
  }
}
```

### GET /api/embedding/config

Get auto-embedding configuration.

**Response:**
```json
{
  "data": {
    "autoEmbeddingEnabled": true,
    "supportedTypes": ["skill", "agent"]
  }
}
```

---

## Usage Examples

### Check Embedding Coverage

```bash
curl http://localhost:3001/api/embedding/coverage \
  -H "Authorization: Bearer <token>"
```

### Re-index All Skills

```bash
curl -X POST http://localhost:3001/api/embedding/reindex \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"types": ["skill"], "batchSize": 100}'
```

### Dry Run Re-index

```bash
curl -X POST http://localhost:3001/api/embedding/reindex \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

### Check Entity Status

```bash
curl http://localhost:3001/api/embedding/status/skill/skill_123 \
  -H "Authorization: Bearer <token>"
```

---

## Implementation Details

### Non-Blocking Embedding

Auto-embedding runs in the background using `setImmediate()` to avoid blocking the main request:

```typescript
// Example from embedSkill()
if (options.blocking) {
  await doEmbed();
} else {
  // Run in background
  setImmediate(() => {
    doEmbed().catch((error) => {
      logger.error({ error, skillId }, 'Background embedding failed');
    });
  });
}
```

### Content Hashing

Embeddings use SHA-256 hashes to detect content changes:
- If content hash matches existing embedding, skip re-embedding
- Different hash triggers new embedding generation
- Supports efficient `skipIfExists` optimization

### Error Handling

- Embedding failures are logged but don't fail the main operation
- Errors are captured in re-index results for troubleshooting
- Graceful degradation when OpenAI API is unavailable

---

## Monitoring & Troubleshooting

### Check Coverage

Monitor embedding coverage to ensure content is indexed:

```bash
curl http://localhost:3001/api/embedding/coverage
```

If coverage is below 100%, run a re-index:

```bash
curl -X POST http://localhost:3001/api/embedding/reindex
```

### View Embedding Stats

```bash
curl http://localhost:3001/api/embedding/stats
```

### Check Logs

Auto-embedding logs with `embedding-hooks` logger:

```
[embedding-hooks] Skill embedded successfully: skill_123
[embedding-hooks] Failed to embed skill: error details
```

### Common Issues

**Embedding Not Created**
- Check `AUTO_EMBEDDING_ENABLED=true` in environment
- Verify OpenAI API key is set
- Check for errors in logs

**Stale Embeddings**
- Run re-index to refresh all embeddings
- Check content hash matches current content

**Missing Embeddings After Delete**
- Embeddings are soft-deleted with the entity
- Run re-index to clean up orphaned embeddings

---

## Future Improvements

### Phase 2: Additional Entity Types

- Journal entries
- Workflows
- Documents
- Custom content types

### Phase 3: Advanced Features

- Event-driven embedding via message queue
- Differential re-indexing (only changed content)
- Embedding versioning for model upgrades

### Phase 4: Observability

- Embedding latency metrics
- Coverage dashboards
- Alert on coverage drops

---

## Related Documentation

- [Embedding Integration](./embeddings.md)
- [RAG Pipeline](./rag.md)
- [LLM Integration](./llm_models.md)
