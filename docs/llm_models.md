# LLM Provider Integration

**Last Updated:** 2026-05-04
**Status:** Implemented
**Version:** 1.0.0

---

## Overview

Arkon supports multi-provider LLM integration for AI-powered features including agent chat, backend processing, and skill execution. This document covers architecture, configuration, API usage, and future improvements.

### Supported Providers

| Provider | Type | Default Model | Use Case |
|----------|------|---------------|----------|
| Ollama | Local | llama3.2 | Self-hosted, privacy-sensitive workloads |
| Cerebras | Cloud | llama3.1-70b | High-speed inference, production |
| Anthropic | Cloud | claude-sonnet-4-20250514 | Advanced reasoning, complex tasks |

---

## Architecture

```
+-------------------------------------------------------------+
|                      API Routes                              |
|  POST /api/llm/chat        - Send message to LLM             |
|  GET  /api/llm/models      - List available models           |
|  GET  /api/llm/providers   - List available providers        |
|  GET  /api/llm/sessions    - List user sessions              |
|  GET  /api/llm/usage       - Get usage statistics            |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    LLM Service Layer                         |
|  - Provider abstraction                                      |
|  - Session management                                        |
|  - Usage tracking                                            |
|  - Audit logging                                             |
+-------------------------------------------------------------+
                              |
          +-------------------+-------------------+
          v                   v                   v
+------------------+ +------------------+ +------------------+
|  Ollama Client   | | Cerebras Client  | | Anthropic Client |
|  (Local HTTP)    | | (Cloud API)      | | (Official SDK)   |
+------------------+ +------------------+ +------------------+
```

### File Structure

```
apps/api/src/
├── lib/llm/
│   ├── types.ts        # Shared types and interfaces
│   ├── ollama.ts       # Ollama client implementation
│   ├── cerebras.ts     # Cerebras client implementation
│   ├── anthropic.ts    # Anthropic client implementation
│   └── index.ts        # Factory and exports
├── services/
│   └── llm.ts          # Business logic layer
├── routes/
│   └── llm.ts          # API endpoints
└── index.ts            # Router mounting

packages/database/prisma/
└── schema.prisma       # LlmSession, LlmMessage models
```

---

## Configuration

### Environment Variables

Add these to `apps/api/.env`:

```env
# Default provider: 'ollama', 'cerebras', or 'anthropic'
LLM_DEFAULT_PROVIDER=anthropic

# Ollama (Local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_TIMEOUT=120000

# Cerebras (Cloud)
CEREBRAS_API_KEY=your-api-key
CEREBRAS_MODEL=llama3.1-70b
CEREBRAS_TIMEOUT=60000

# Anthropic (Cloud)
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_TIMEOUT=60000
```

### Provider Selection Strategy

1. Request specifies `provider` parameter -> use that provider
2. No provider specified -> use `LLM_DEFAULT_PROVIDER`
3. `LLM_DEFAULT_PROVIDER` not set -> default to `anthropic`

---

## API Reference

### POST /api/llm/chat

Send a chat completion request.

**Request:**
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello, how are you?" }
  ],
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "sessionId": "optional-session-id",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

**Response:**
```json
{
  "data": {
    "content": "Hello! I'm doing well, thank you for asking...",
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic",
    "usage": {
      "inputTokens": 24,
      "outputTokens": 45,
      "totalTokens": 69
    },
    "finishReason": "end_turn",
    "sessionId": "clx123..."
  }
}
```

### GET /api/llm/models

List available models for a provider.

**Query Parameters:**
- `provider` (optional): 'ollama', 'cerebras', or 'anthropic'

**Response:**
```json
{
  "data": ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "..."],
  "provider": "anthropic"
}
```

### GET /api/llm/providers

List all providers and their availability.

**Response:**
```json
{
  "data": [
    { "id": "ollama", "name": "Ollama (Local)", "available": true, "isDefault": false },
    { "id": "cerebras", "name": "Cerebras", "available": true, "isDefault": false },
    { "id": "anthropic", "name": "Anthropic (Claude)", "available": true, "isDefault": true }
  ]
}
```

### GET /api/llm/sessions

List user's chat sessions.

**Query Parameters:**
- `limit` (optional): Max results (1-100, default 50)
- `offset` (optional): Pagination offset

### GET /api/llm/sessions/:id

Get a session with all messages.

### DELETE /api/llm/sessions/:id

Delete a session and all its messages.

### GET /api/llm/usage

Get usage statistics.

**Query Parameters:**
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Response:**
```json
{
  "data": [
    {
      "provider": "anthropic",
      "messageCount": 42,
      "inputTokens": 12500,
      "outputTokens": 8700,
      "totalTokens": 21200
    }
  ]
}
```

---

## Database Models

### LlmSession

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| tenantId | String | Tenant reference |
| userId | String | User reference |
| title | String? | Auto-generated from first message |
| provider | String | Last used provider |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

### LlmMessage

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| sessionId | String | Session reference |
| provider | String | Provider used for this message |
| model | String | Model used |
| role | String | 'system', 'user', or 'assistant' |
| content | String | Message content |
| inputTokens | Int | Input token count |
| outputTokens | Int | Output token count |
| createdAt | DateTime | Creation timestamp |

---

## Error Handling

### LLMError Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| CONNECTION_FAILED | 503 | Cannot connect to provider |
| AUTH_FAILED | 401 | Invalid API key |
| RATE_LIMITED | 429 | Rate limit exceeded |
| MODEL_NOT_FOUND | 404 | Model not available |
| INVALID_RESPONSE | 500 | Malformed provider response |
| TIMEOUT | 408 | Request timed out |

### Error Response Format

```json
{
  "error": "Cannot connect to Ollama at http://localhost:11434",
  "code": "CONNECTION_FAILED",
  "provider": "ollama",
  "details": null
}
```

---

## Usage Tracking

All LLM interactions are automatically tracked:

1. **Session Management**: Messages are grouped into sessions for conversation continuity
2. **Token Counting**: Input and output tokens tracked per message
3. **Provider Metrics**: Usage aggregated by provider
4. **Audit Logging**: All chat requests logged for compliance

### Viewing Usage

```bash
# Get usage for current user
curl -X GET http://localhost:3001/api/llm/usage \
  -H "Authorization: Bearer <token>"

# Get usage for specific date range
curl -X GET "http://localhost:3001/api/llm/usage?startDate=2026-05-01&endDate=2026-05-04" \
  -H "Authorization: Bearer <token>"
```

---

## Testing

### Verification Steps

```bash
# 1. Install dependencies
pnpm --filter @arkon/api add @anthropic-ai/sdk @paralleldrive/cuid2

# 2. Push database schema
cd packages/database && npx prisma db push

# 3. Start API
pnpm --filter @arkon/api dev

# 4. Test Ollama (if running locally)
curl -X POST http://localhost:3001/api/llm/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"provider":"ollama"}'

# 5. Test Anthropic
curl -X POST http://localhost:3001/api/llm/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"provider":"anthropic"}'

# 6. List models
curl http://localhost:3001/api/llm/models?provider=anthropic \
  -H "Authorization: Bearer <token>"

# 7. List providers
curl http://localhost:3001/api/llm/providers \
  -H "Authorization: Bearer <token>"
```

---

## Acceptance Criteria

- [x] `POST /api/llm/chat` works with Ollama
- [x] `POST /api/llm/chat` works with Cerebras
- [x] `POST /api/llm/chat` works with Anthropic
- [x] `GET /api/llm/models` lists available models per provider
- [x] `GET /api/llm/providers` lists provider availability
- [x] Messages are logged to `llm_messages` table
- [x] Sessions group related messages
- [x] Token usage is tracked per message
- [x] Audit logging captures LLM interactions

---

## Future Improvements

### Phase 2: Streaming Support

- Add SSE streaming endpoint for real-time token output
- Implement `POST /api/llm/chat/stream`
- Update frontend components for streaming UI

### Phase 3: Cost Tracking

- Add cost calculation per provider/model
- Store cost per message
- Add cost reporting endpoints
- Implement cost alerts/limits

### Phase 4: Model Fine-tuning

- Support for custom/fine-tuned models
- Model performance benchmarking
- A/B testing between models

### Phase 5: Advanced Features

- Function/tool calling support
- Multi-modal inputs (images)
- Conversation branching
- Response caching

---

## Troubleshooting

### Ollama Connection Failed

```
Error: Cannot connect to Ollama at http://localhost:11434. Is Ollama running?
```

**Solution:**
1. Verify Ollama is installed: `ollama --version`
2. Start Ollama: `ollama serve`
3. Check if model is downloaded: `ollama list`
4. Pull model if needed: `ollama pull llama3.2`

### Anthropic Authentication Failed

```
Error: Authentication failed - check API key
```

**Solution:**
1. Verify `ANTHROPIC_API_KEY` is set correctly
2. Check API key has not expired
3. Verify key has appropriate permissions

### Rate Limited

```
Error: Rate limit exceeded
```

**Solution:**
1. Implement request queuing
2. Add exponential backoff
3. Consider upgrading API tier

---

## Related Documentation

- [Embedding Integration](./embeddings.md)
- [Architecture Overview](./architecture.md)
- [API Reference](./api.md)
- [Security Guidelines](./security.md)
