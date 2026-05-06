# Error Flow

**Last Updated:** 2026-05-05 (synced)

## Overview

This diagram shows how errors propagate through the Arkon system, where they're caught, how they're logged, and how they're returned to clients. Error handling is implemented in `apps/api/src/middleware/error-handler.ts`.

## Error Propagation

```mermaid
flowchart TD
    subgraph Sources["Error Sources"]
        Val["Validation<br/>Error (Zod)"]
        Auth["Auth<br/>Error (JWT)"]
        RBAC["RBAC<br/>Error"]
        DB["Database<br/>Error (Prisma)"]
        LLM["LLM Provider<br/>Error"]
        Ext["External<br/>Service Error"]
        Unexpected["Unexpected<br/>Error"]
    end

    subgraph Handling["Error Handling"]
        Catch["Try/Catch<br/>in Service"]
        MW["Error<br/>Middleware"]
    end

    subgraph Logging["Logging"]
        Pino["Pino Logger"]
        Morgan["Morgan<br/>(HTTP logs)"]
    end

    subgraph Response["Client Response"]
        Res["Standardized<br/>Error Response"]
    end

    Val --> MW
    Auth --> MW
    RBAC --> MW
    DB --> Catch
    LLM --> Catch
    Ext --> Catch
    Unexpected --> Catch
    Catch --> MW
    MW --> Pino
    MW --> Morgan
    MW --> Res
```

## Error Handling Sequence

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant R as Route Handler
    participant S as Service
    participant P as Prisma/Provider
    participant E as Error Middleware
    participant L as Pino Logger

    C->>R: Request

    alt Validation Error
        R->>R: Zod validation fails
        R->>E: throw ZodError
    else Auth Error
        R->>R: JWT verify fails
        R->>E: throw AuthError
    else RBAC Error
        R->>R: Permission check fails
        R->>E: throw ForbiddenError
    else Service Error
        R->>S: Call service method
        S->>P: Database/LLM query
        P-->>S: Error (constraint, timeout, rate limit)
        S->>E: throw ServiceError
    else Unexpected Error
        R->>S: Call service method
        S->>S: Unexpected exception
        S->>E: throw Error
    end

    E->>L: Log error
    Note over E,L: Level based on error type

    E->>E: Format response
    E-->>C: Error response
    Note over E,C: Appropriate status code
```

## Error Types

| Error Type | Status Code | Logged Level | Example |
|------------|-------------|--------------|---------|
| ZodError (Validation) | 400 | warn | Invalid email format |
| AuthenticationError | 401 | warn | Invalid/expired token |
| ForbiddenError | 403 | warn | Insufficient role |
| NotFoundError | 404 | info | Agent not found |
| ConflictError | 409 | warn | Email already exists |
| RateLimitError | 429 | warn | Too many requests |
| PrismaClientKnownRequestError | 400/500 | error | Constraint violation |
| PrismaClientUnknownRequestError | 500 | error | Connection timeout |
| LLMProviderError | 502/503 | error | Anthropic rate limit |
| ExternalServiceError | 502 | error | GitHub OAuth failed |
| UnexpectedError | 500 | error | Unhandled exception |

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      }
    ],
    "requestId": "cuid_abc123"
  },
  "meta": {
    "timestamp": "2026-05-05T12:00:00Z"
  }
}
```

## Error Middleware Implementation

```mermaid
flowchart TD
    A[Error Thrown] --> B{Error Type?}

    B -->|ZodError| C[400 + Field Errors]
    B -->|JWT/AuthError| D[401]
    B -->|ForbiddenError| E[403]
    B -->|NotFoundError| F[404]
    B -->|PrismaError| G{Prisma Code?}
    B -->|LLMError| H[502/503]
    B -->|Unknown| I[500 + Generic Message]

    G -->|P2002| J[409 Conflict]
    G -->|P2025| K[404 Not Found]
    G -->|Other| L[500 Database Error]

    C --> M[Log at warn level]
    D --> M
    E --> M
    F --> N[Log at info level]
    J --> M
    K --> N
    L --> O[Log at error level]
    H --> O
    I --> O

    M --> P[Send Response]
    N --> P
    O --> P

    O --> Q[Alert if critical]
```

## Prisma Error Handling

| Prisma Code | Meaning | HTTP Status |
|-------------|---------|-------------|
| P2002 | Unique constraint violation | 409 Conflict |
| P2025 | Record not found | 404 Not Found |
| P2003 | Foreign key constraint violation | 400 Bad Request |
| P2014 | Required relation violation | 400 Bad Request |
| Connection errors | DB unreachable | 503 Service Unavailable |

## LLM Provider Error Handling

```mermaid
flowchart TD
    A[LLM Request] --> B{Provider}

    B -->|Anthropic| C[Anthropic SDK]
    B -->|Cerebras| D[OpenAI-compatible]
    B -->|Ollama| E[Local HTTP]

    C --> F{Error Type?}
    D --> F
    E --> F

    F -->|Rate Limit| G[429 → 503 to client]
    F -->|Auth Error| H[401 → 500 to client]
    F -->|Model Not Found| I[404 → 400 to client]
    F -->|Timeout| J[408 → 504 to client]
    F -->|Server Error| K[5xx → 502 to client]
```

## Logging Configuration

### Log Levels

| Level | When Used |
|-------|-----------|
| `fatal` | App crash, unrecoverable state |
| `error` | Database errors, LLM failures, external services |
| `warn` | Validation errors, auth failures, rate limits |
| `info` | 404s, successful operations |
| `debug` | Request details (dev only, via LOG_LEVEL env) |
| `trace` | Detailed debugging (dev only) |

### Log Format (Pino)

```json
{
  "level": "error",
  "time": 1714838400000,
  "pid": 1234,
  "hostname": "arkon-api",
  "reqId": "cuid_abc123",
  "err": {
    "type": "PrismaClientKnownRequestError",
    "code": "P2002",
    "message": "Unique constraint failed on the fields: (`email`)",
    "stack": "..."
  },
  "req": {
    "method": "POST",
    "url": "/api/auth/register",
    "userAgent": "..."
  },
  "tenantId": "tenant_xyz"
}
```

## Error Recovery Strategies

```mermaid
flowchart LR
    subgraph Transient["Transient Errors"]
        DB["DB Timeout"] --> Retry["Retry<br/>(exponential backoff)"]
        LLM["LLM Rate Limit"] --> Retry
        Ext["External API"] --> Retry
    end

    subgraph Permanent["Permanent Errors"]
        Val["Validation"] --> Reject["Reject Request"]
        Auth["Auth"] --> Reject
        RBAC["Forbidden"] --> Reject
    end

    subgraph Circuit["Circuit Breaker (planned)"]
        Fail["Repeated<br/>Failures"] --> Open["Open Circuit"]
        Open --> Fallback["Fallback<br/>Response"]
    end
```

## Future Improvements

- [ ] Implement circuit breaker for LLM providers
- [ ] Add retry logic with exponential backoff for transient errors
- [ ] Set up error alerting integration (Sentry, PagerDuty)
- [ ] Add distributed tracing (OpenTelemetry)
- [ ] Implement structured error codes registry
- [ ] Add error rate monitoring and dashboards
