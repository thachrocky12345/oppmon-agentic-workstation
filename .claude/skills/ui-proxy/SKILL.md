---
name: ui-proxy
description: Generic Next.js API route proxy pattern for secure backend communication with authentication header injection
---

# UI Proxy Skill

## Overview
This skill documents the pattern for implementing server-side API proxies in Next.js applications. Use this when you need to:
- Hide backend API credentials from browser clients
- Add authentication headers to requests
- Handle CORS issues with external APIs
- Support multiple deployment environments (local, Docker, production)

## When to Use This Pattern

| Scenario | Use Proxy? | Why |
|----------|------------|-----|
| Backend requires auth | Yes | Keep credentials server-side |
| CORS issues with API | Yes | Server-to-server has no CORS |
| Multiple backend URLs | Yes | Environment-based resolution |
| Public API, no auth | Optional | Rewrites may suffice |
| Same-origin backend | No | Direct calls work fine |

## Core Pattern Structure

### Folder Structure for API Proxies
```
src/
├── app/
│   └── api/                    # All proxy routes
│       ├── [resource]/         # Group by resource
│       │   ├── route.ts        # GET/POST collection
│       │   └── [id]/
│       │       └── route.ts    # GET/PUT/DELETE single item
│       └── health/
│           └── route.ts        # Health check proxy
└── lib/
    └── api-config.ts           # Centralized API configuration
```

### Environment Variables Pattern
```bash
# Server-side only (no NEXT_PUBLIC_ prefix)
API_USERNAME=admin
API_PASSWORD=secret123
INTERNAL_API_URL=http://backend:8001  # Docker service name

# Client-side (with NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_API_URL=http://localhost:8001  # Fallback for local dev
```

## Implementation Templates

### Template 1: Basic GET Proxy
```typescript
// src/app/api/[resource]/route.ts
import { NextResponse } from 'next/server';

// Credentials from environment (server-side only)
const API_USERNAME = process.env.API_USERNAME || 'default';
const API_PASSWORD = process.env.API_PASSWORD || 'default';
const authHeader = 'Basic ' + Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

export async function GET() {
  try {
    // INTERNAL_API_URL for Docker, NEXT_PUBLIC_API_URL for local dev
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
    const backendUrl = `${apiUrl}/api/resource`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || 'Request failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    );
  }
}
```

### Template 2: POST Proxy with JSON Body
```typescript
// src/app/api/[resource]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_USERNAME = process.env.API_USERNAME || 'default';
const API_PASSWORD = process.env.API_PASSWORD || 'default';
const authHeader = 'Basic ' + Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
    const backendUrl = `${apiUrl}/api/resource`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || 'Request failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
```

### Template 3: Dynamic Route with Path Parameters
```typescript
// src/app/api/[resource]/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_USERNAME = process.env.API_USERNAME || 'default';
const API_PASSWORD = process.env.API_PASSWORD || 'default';
const authHeader = 'Basic ' + Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
    const backendUrl = `${apiUrl}/api/resource/${id}`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || 'Not found' },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
```

### Template 4: Real-Time Status (No Caching)
```typescript
// src/app/api/status/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering - critical for real-time data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const API_USERNAME = process.env.API_USERNAME || 'default';
const API_PASSWORD = process.env.API_PASSWORD || 'default';
const authHeader = 'Basic ' + Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
    const backendUrl = `${apiUrl}/api/status/${id}`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      cache: 'no-store',  // Disable fetch caching
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.message || 'Status not found' },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
```

### Template 5: File Upload Proxy (Multipart Form Data)
```typescript
// src/app/api/upload/[type]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_USERNAME = process.env.API_USERNAME || 'default';
const API_PASSWORD = process.env.API_PASSWORD || 'default';
const authHeader = 'Basic ' + Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

export async function POST(
  request: NextRequest,
  { params }: { params: { type: string } }
) {
  try {
    const { type } = params;

    // Preserve query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    // CRITICAL: Get Content-Type header (includes multipart boundary)
    const contentType = request.headers.get('content-type');

    // CRITICAL: Forward raw body to preserve multipart boundary
    const body = await request.arrayBuffer();

    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
    const backendUrl = `${apiUrl}/api/upload/${type}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType || 'multipart/form-data',
        'Authorization': authHeader,
      },
      body: body,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: errorData.message || 'Upload failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
```

### Template 6: JWT Bearer Token Auth
```typescript
// For APIs using JWT instead of Basic Auth
const getAuthHeader = () => {
  const token = process.env.API_JWT_TOKEN;
  if (token) {
    return `Bearer ${token}`;
  }
  // Fallback to Basic Auth
  const username = process.env.API_USERNAME || 'default';
  const password = process.env.API_PASSWORD || 'default';
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
};
```

## next.config.js Rewrites (Alternative)
For simple passthrough without auth header injection:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Simple passthrough (no auth needed)
      {
        source: '/api/public/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
      // S3 or external service proxy
      {
        source: '/api/s3',
        destination: 'https://your-bucket.s3.amazonaws.com/',
      },
    ];
  },
};

module.exports = nextConfig;
```

## Client-Side Usage
Frontend components should always call proxy routes, never backend directly:

```typescript
// CORRECT - calls proxy route
const response = await fetch('/api/vendor/categories');

// WRONG - calls backend directly (exposes URL, CORS issues)
const response = await fetch('http://backend:8001/api/vendor/categories');
```

## Centralized API Config (Optional)
For larger apps, centralize endpoint definitions:

```typescript
// src/lib/api-config.ts
export const API_CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001',

  endpoints: {
    categories: '/api/vendor/categories',
    upload: '/api/vendor/upload',
    status: '/api/vendor/status',
  },
} as const;
```

## Rules When Implementing Proxies

1. **Never expose credentials to browser** - Use server-side env vars (no `NEXT_PUBLIC_` prefix)
2. **Always use `INTERNAL_API_URL` pattern** - Supports Docker service names
3. **Handle errors gracefully** - Return proper status codes and messages
4. **Disable caching for real-time data** - Use `cache: 'no-store'` and `dynamic = 'force-dynamic'`
5. **Preserve multipart boundaries** - Use `request.arrayBuffer()` for file uploads
6. **Forward query parameters** - Don't lose them when proxying
7. **Log for debugging** - Include request context in logs
8. **Use consistent error format** - Same error shape across all routes

## Debugging Tips

### Add Logging
```typescript
console.log('[Proxy] Fetching from:', backendUrl);
console.log('[Proxy] Response status:', response.status);
```

### Check Environment Variables
```typescript
console.log('INTERNAL_API_URL:', process.env.INTERNAL_API_URL);
console.log('NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL);
```

### Test Proxy Routes
```bash
# From terminal
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/resource -H "Content-Type: application/json" -d '{"key":"value"}'
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| CORS errors | Proxy handles this - check route is being used |
| 401 Unauthorized | Check env vars for credentials |
| Connection refused | Check INTERNAL_API_URL / backend is running |
| Multipart upload fails | Use `arrayBuffer()` and preserve Content-Type |
| Stale data | Add `cache: 'no-store'` and `dynamic = 'force-dynamic'` |
| Docker can't reach backend | Use service name, not localhost |
