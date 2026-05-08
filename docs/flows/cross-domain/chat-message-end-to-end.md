# Chat Message — End-to-End Flow

**Last updated:** 2026-05-10

Traces the lifecycle of a single user chat message from the web UI down through every table the request touches, including the new outbox + audit_log_v2 paths.

## Plain English

1. The web UI POSTs a chat message to `/api/llm/chat`.
2. The API authenticates the user, attaches `tenantId`, and opens a `withTenant()` transaction.
3. The session row goes into `llm_sessions` (or is updated if existing).
4. The user message is appended to `llm_messages`.
5. The provider call goes out via the LLM client and the response is streamed back; the assistant message is appended to `llm_messages`.
6. Token usage is recorded in `usage_events`. A summary `events` row is written for analytics.
7. An `audit_log_v2` event records the action (`actor_type=user, action=CREATE, target_type=llm_message`).
8. If the call invoked an MCP server, the proxy hop is logged in `mcp_proxy_logs`.
9. An outbox event `chat.message_completed` is enqueued in `event_outbox` so downstream workers (analytics ingest, webhook delivery) can react asynchronously.
10. All of the above lands in the same transaction. The continuous aggregate `daily_stats_cagg` picks up the events row within ~30 minutes.

## Sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as User (web)
    participant API as apps/api
    participant DB as Postgres (RLS)
    participant LLM as LLM provider
    participant MCP as MCP server
    participant W as outbox-publisher

    U->>API: POST /api/llm/chat { sessionId, content }
    API->>API: requestAuth + tenantContext + idempotency
    API->>DB: BEGIN; SET LOCAL ROLE oppmon_app;<br/>set_config('app.current_tenant', tenantId, true)

    alt session exists
        API->>DB: UPDATE llm_sessions SET updated_at=NOW()
    else new session
        API->>DB: INSERT INTO llm_sessions
    end

    API->>DB: INSERT INTO llm_messages (role='user')
    API->>LLM: POST /chat/completions
    LLM-->>API: streamed response

    opt tool_call invoked
        API->>MCP: JSON-RPC tools/call
        MCP-->>API: result
        API->>DB: INSERT INTO mcp_proxy_logs<br/>INSERT INTO tool_calls
    end

    API->>DB: INSERT INTO llm_messages (role='assistant', tokens)
    API->>DB: INSERT INTO usage_events
    API->>DB: INSERT INTO events (event_type='response')
    API->>DB: INSERT INTO audit_log_v2<br/>(actor=user, action=CREATE, target=llm_message)
    API->>DB: INSERT INTO event_outbox<br/>(event_type='chat.message_completed')
    API->>DB: COMMIT
    API-->>U: { messageId, content, usage }

    Note over W: tick (every 2s)
    W->>DB: SELECT ... FROM event_outbox<br/>WHERE published_at IS NULL<br/>FOR UPDATE SKIP LOCKED
    W->>W: handler('chat.message_completed')
    W->>DB: UPDATE event_outbox SET published_at=NOW()
```

## Tables touched (in order)

| Step | Table | Operation | Notes |
|---|---|---|---|
| 3 | `llm_sessions` | UPDATE/INSERT | Per-tenant; RLS enforced. |
| 4 | `llm_messages` | INSERT | **Hypertable** since 2026-05-10. |
| 6 | `tool_calls` | INSERT (optional) | **Hypertable** since 2026-05-10. |
| 6 | `mcp_proxy_logs` | INSERT (optional) | **Hypertable** since 2026-05-10. |
| 6 | `llm_messages` | INSERT | Assistant response. |
| 6 | `usage_events` | INSERT | Cost tracking. |
| 6 | `events` | INSERT | **Hypertable** since 2026-05-10. Feeds `daily_stats_cagg`. |
| 7 | `audit_log_v2` | INSERT | Append-only; immutability triggers block UPDATE/DELETE. |
| 9 | `event_outbox` | INSERT | Drained asynchronously by `outbox-publisher`. |

## Why all of this is in one transaction

Because the consolidation lands `audit_log_v2` and `event_outbox` writes in the same `withTenant()` block, you cannot get a chat message that's recorded but not audited, or a chat completion that emits a downstream event but lost the message. Either everything commits or nothing does.
