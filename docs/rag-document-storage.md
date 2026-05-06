# RAG Document Storage Guide

This guide explains how to upload, manage, and use documents with the Arkon RAG (Retrieval Augmented Generation) system.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Upload API    │────▶│  Local Storage  │────▶│   Extraction    │
│  (rag-admin.ts) │     │  (Docker Vol)   │     │   Pipeline      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              ▼
                        │   RAG Chat      │◀─────┌───────────────┐
                        │  (rag-chat.ts)  │      │  Vector Store │
                        └─────────────────┘      │  (pgvector)   │
                                                 └───────────────┘
```

## Storage Configuration

### Docker (Production/Development)

Documents are stored in a named Docker volume `arkon-documents`:

```yaml
# docker-compose.yml
volumes:
  arkon-documents:
    driver: local

services:
  api:
    volumes:
      - arkon-documents:/app/data/documents
```

### Local Development

Set the storage path in your `.env`:

```env
TAG_DOCUMENT_ROOT=./data/documents
```

The storage service will create the directory structure automatically.

## API Endpoints

### Collections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/rag/collections` | List collections |
| POST | `/api/admin/rag/collections` | Create collection |
| GET | `/api/admin/rag/collections/:id` | Get collection details |
| PATCH | `/api/admin/rag/collections/:id` | Update collection |
| DELETE | `/api/admin/rag/collections/:id` | Delete collection |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/rag/collections/:id/documents` | Upload document |
| GET | `/api/admin/rag/documents/:id` | Get document details |
| GET | `/api/admin/rag/documents/:id/status` | Check extraction status |
| GET | `/api/admin/rag/documents/:id/view` | View/download document |
| POST | `/api/admin/rag/documents/:id/reindex` | Re-extract document |
| DELETE | `/api/admin/rag/documents/:id` | Delete document |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rag/chat` | Chat with RAG context |
| POST | `/api/rag/chat/stream` | Stream chat response (SSE) |
| GET | `/api/rag/collections/accessible` | List accessible collections |
| GET | `/api/rag/tools` | List available tools |
| POST | `/api/rag/tools/execute` | Execute a tool |

## Usage Examples

### 1. Create a Collection

```bash
curl -X POST http://localhost:3001/api/admin/rag/collections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Technical Documentation",
    "description": "Internal technical docs",
    "scope": "TENANT"
  }'
```

Response:
```json
{
  "data": {
    "id": "clu1234567890abcdef",
    "name": "Technical Documentation",
    "scope": "TENANT",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### 2. Upload a Document

```bash
curl -X POST http://localhost:3001/api/admin/rag/collections/$COLLECTION_ID/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./docs/architecture.pdf"
```

Response:
```json
{
  "data": {
    "id": "doc1234567890abcdef",
    "originalFilename": "architecture.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1048576,
    "extractionStatus": "PENDING"
  },
  "message": "Document uploaded. Extraction in progress."
}
```

### 3. Check Extraction Status

```bash
curl http://localhost:3001/api/admin/rag/documents/$DOC_ID/status \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
{
  "data": {
    "extractionStatus": "EXTRACTED",
    "chunkCount": 42
  }
}
```

### 4. Chat with RAG Context

```bash
curl -X POST http://localhost:3001/api/rag/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is our deployment architecture?"}
    ],
    "collectionIds": ["clu1234567890abcdef"],
    "model": "claude-sonnet-4-20250514"
  }'
```

Response:
```json
{
  "data": {
    "message": {
      "role": "assistant",
      "content": "Based on the documentation [1], your deployment architecture...",
      "citations": [
        {
          "index": 1,
          "documentTitle": "architecture.pdf",
          "pageNumber": 5,
          "score": 0.92,
          "source": "rag"
        }
      ]
    },
    "source": "rag"
  },
  "meta": {
    "usage": {
      "inputTokens": 1500,
      "outputTokens": 350,
      "totalTokens": 1850
    }
  }
}
```

### 5. Stream Chat Response (SSE)

```javascript
const eventSource = new EventSource('/api/rag/chat/stream', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Explain the auth flow' }],
    collectionIds: ['clu1234567890abcdef']
  })
});

eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') {
    eventSource.close();
    return;
  }

  const chunk = JSON.parse(event.data);

  switch (chunk.type) {
    case 'citation':
      console.log('Citation:', chunk.data);
      break;
    case 'content':
      process.stdout.write(chunk.data.text);
      break;
    case 'done':
      console.log('Complete:', chunk.data);
      break;
  }
};
```

## Supported File Types

| Type | MIME Type | Max Size |
|------|-----------|----------|
| PDF | `application/pdf` | 50 MB |
| Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | 50 MB |
| Markdown | `text/markdown` | 50 MB |
| Plain Text | `text/plain` | 50 MB |
| HTML | `text/html` | 50 MB |

## Collection Scoping

Collections can be scoped to:

- **TENANT**: All users in the tenant can access
- **TEAM**: Only team members can access

```json
{
  "name": "Engineering Docs",
  "scope": "TEAM",
  "teamId": "team_engineering_001"
}
```

## Document Deduplication

The system automatically detects duplicate documents using SHA-256 hashing:

1. On upload, the file's SHA-256 hash is computed
2. If a document with the same hash exists in the collection, the upload is rejected
3. The existing document ID is returned instead

## Backup and Recovery

### Backup Documents

```bash
# Linux/macOS
./scripts/backup-documents.sh ./backups

# Windows PowerShell
.\scripts\backup-documents.ps1 -DestDir .\backups

# Backup to S3 (Linux/macOS)
./scripts/backup-documents.sh s3://my-bucket/arkon-backups
```

### Restore Documents

```bash
# Stop the API
docker compose stop api

# Restore from backup
docker run --rm \
  -v arkon-workstation_arkon-documents:/data \
  -v $(pwd)/backups:/backup:ro \
  alpine:3.19 \
  sh -c "cd /data && tar xzf /backup/arkon-documents-20240115_100000.tar.gz"

# Start the API
docker compose start api
```

## Advanced RAG Features

### Multi-Vector Search

The system uses query expansion to improve retrieval:

1. Original query
2. Question format: "What is {query}?"
3. Definition format: "Definition of {query}"
4. Mechanism format: "How does {query} work?"

### MMR Diversity Selection

Results are selected using Maximal Marginal Relevance to balance:
- **Relevance**: How well the chunk matches the query
- **Diversity**: How different chunks are from each other

Formula: `MMR = λ × Relevance - (1-λ) × MaxSimilarity`

Default λ = 0.7 (70% relevance, 30% diversity)

### Web Fallback

When RAG returns no results:
1. Web search is triggered automatically
2. Results are included with `source: "web"` citations
3. The model is instructed to use appropriate caveats

### Tool Calling

The chat system supports tool calling for:
- `web_search`: Search the web for information
- `arxiv_search`: Search academic papers
- `get_current_time`: Get current date/time
- `get_rag_stats`: Get RAG system statistics
- `calculate`: Perform mathematical calculations

Enable with:
```json
{
  "enableTools": true
}
```

## Security Considerations

1. **Path Traversal Prevention**: Document IDs are validated and paths are resolved to prevent directory traversal
2. **Tenant Isolation**: Documents are stored under tenant-specific directories
3. **RBAC**: Team-scoped collections enforce team membership checks
4. **Atomic Writes**: Uploads use temp files and atomic rename to prevent corruption
5. **Content Hashing**: SHA-256 hashes enable integrity verification

## Troubleshooting

### Document Not Found

Check:
1. Document ID is correct
2. User has access to the collection
3. Document hasn't been soft-deleted

### Extraction Failed

Check the extraction error:
```bash
curl http://localhost:3001/api/admin/rag/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

Common issues:
- PDF is encrypted or corrupted
- Document has no extractable text (scanned images)
- Memory limits exceeded for large documents

### No Results in Chat

Check:
1. Documents are in EXTRACTED status
2. Collection IDs are specified correctly
3. Query is relevant to document content
4. Relevance threshold isn't too high
