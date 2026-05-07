# Authentication Flow

**Last Updated:** 2026-05-07 (init sync)

## Overview

This diagram shows the authentication flows for the Arkon platform, including email/password registration, login, OAuth (GitHub), and protected route access using JWT tokens. Authentication logic is in `apps/api/src/routes/auth.ts` and `apps/api/src/routes/oauth.ts`.

## Registration Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as Auth Route
    participant V as Zod Validator
    participant P as Prisma
    participant D as Database

    C->>A: POST /api/auth/register
    Note over C,A: {email, password, name}

    A->>V: Validate Input
    V-->>A: Valid

    A->>P: prisma.user.findUnique({email})
    P->>D: SELECT
    D-->>P: null (not found)

    A->>A: Hash password<br/>(bcryptjs, 12 rounds)

    A->>P: prisma.user.create()
    P->>D: INSERT user
    D-->>P: User created

    A->>A: Generate JWT<br/>(lib/jwt.ts)

    A-->>C: 201 Created
    Note over C,A: Set-Cookie: token=...<br/>HttpOnly, Secure, SameSite=Lax
```

## Login Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as Auth Route
    participant P as Prisma
    participant D as Database

    C->>A: POST /api/auth/login
    Note over C,A: {email, password}

    A->>P: prisma.user.findUnique({email})
    P->>D: SELECT
    D-->>P: User record

    alt User not found
        P-->>A: null
        A-->>C: 401 Unauthorized
    end

    A->>A: bcrypt.compare(password, hash)

    alt Password mismatch
        A-->>C: 401 Unauthorized
    end

    A->>A: Generate JWT
    Note over A: Payload: {userId, tenantId, role}
    Note over A: Expires: 7d (configurable)

    A-->>C: 200 OK
    Note over C,A: Set-Cookie: token=...<br/>HttpOnly, Secure, SameSite=Lax
```

## GitHub OAuth Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as OAuth Route
    participant G as GitHub
    participant P as Prisma
    participant D as Database

    C->>A: GET /api/auth/github
    A->>A: Generate state token
    A->>A: Create Arctic GitHub client
    A-->>C: 302 Redirect to GitHub

    C->>G: Authorize App
    G->>G: User grants permission
    G-->>C: 302 Redirect to callback

    C->>A: GET /api/auth/github/callback?code=...&state=...
    A->>A: Validate state
    A->>G: Exchange code for tokens
    G-->>A: {access_token, refresh_token}

    A->>G: GET /user (with access_token)
    G-->>A: GitHub user profile

    A->>P: prisma.oauthAccount.findUnique()
    P->>D: SELECT
    D-->>P: Account or null

    alt New OAuth User
        A->>P: prisma.user.create() + oauthAccount.create()
        P->>D: INSERT
        D-->>P: Created
    else Existing OAuth User
        A->>P: Update tokens if needed
    end

    A->>A: Generate JWT
    A-->>C: 302 Redirect to frontend
    Note over C,A: Set-Cookie: token=...
```

## Protected Route Access

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant M as Auth Middleware
    participant RBAC as RBAC Middleware
    participant R as Route Handler
    participant S as Service

    C->>M: GET /api/agents
    Note over C,M: Cookie: token=<jwt>

    M->>M: Extract token from cookie

    alt No token
        M-->>C: 401 No token provided
    end

    M->>M: jwt.verify(token, secret)
    Note over M: Using lib/jwt.ts

    alt Invalid/Expired token
        M-->>C: 401 Invalid token
    end

    M->>M: Attach user to req.user
    Note over M: {userId, tenantId, role}

    M->>RBAC: Check permissions

    alt Insufficient role
        RBAC-->>C: 403 Forbidden
    end

    RBAC->>R: next()
    R->>S: Get agents for tenant
    S-->>R: Agents list
    R-->>C: 200 OK
```

## Token Structure

### JWT Payload (JWTClaims from @arkon/shared)
```typescript
interface JWTClaims {
  userId: string;
  tenantId: string;
  email: string;
  role: 'TENANT_ADMIN' | 'TEAM_ADMIN' | 'MEMBER';
  iat: number;  // Issued at
  exp: number;  // Expiration
}
```

### Token Settings
| Setting | Value |
|---------|-------|
| Algorithm | HS256 |
| Expiration | 7 days (configurable via JWT_EXPIRES_IN) |
| Secret | `JWT_SECRET` env var |
| Storage | HttpOnly cookie |
| SameSite | Lax |
| Secure | true (in production) |

## Password Security

```mermaid
flowchart LR
    A[Plain Password] --> B[bcrypt.hash]
    B --> C[Salt Rounds: 12]
    C --> D[Hashed Password]
    D --> E[Store in DB]

    F[Login Password] --> G[bcrypt.compare]
    D --> G
    G --> H{Match?}
    H -->|Yes| I[Generate Token]
    H -->|No| J[401 Error]
```

## Logout Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Auth Route

    C->>A: POST /api/auth/logout
    A->>A: Clear cookie
    A-->>C: 200 OK
    Note over C,A: Set-Cookie: token=;<br/>Max-Age=0; Path=/
```

## Multi-Tenancy Context

After authentication, every request carries tenant context:

```mermaid
flowchart TD
    A[JWT Decoded] --> B{User Role}
    B -->|TENANT_ADMIN| C[Full tenant access]
    B -->|TEAM_ADMIN| D[Team-scoped access]
    B -->|MEMBER| E[Read-only access]

    C --> F[Query with tenantId filter]
    D --> F
    E --> F
    F --> G[Prisma Query]
```

## Session Management

| Feature | Status |
|---------|--------|
| Stateless JWT | Implemented |
| HttpOnly cookies | Implemented |
| OAuth (GitHub) | Implemented (via Arctic) |
| OAuth (Google) | Schema ready, not implemented |
| Refresh tokens | Schema ready, not implemented |
| Multi-device sessions | Schema ready (UserSession model) |
| Token blacklist | Not implemented |
