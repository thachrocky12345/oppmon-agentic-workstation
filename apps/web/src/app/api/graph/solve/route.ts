/**
 * Authenticated graph-agent SSE proxy (TAG-65 / TAG-50 epic).
 *
 * Browser → `/api/graph/solve` (this route) → `${GRAPH_BACKEND_URL}/solve`
 *
 * Why a separate proxy from `/api/graph/solve_v2`:
 *   - `/solve_v2` on the backend is unauthenticated and stateless — the
 *     FastAPI service trusts the proxy boundary.
 *   - `/solve` on the backend (TAG-58) is authenticated, multi-tenant,
 *     and writes audit rows. Every request MUST carry an
 *     `Authorization: Bearer <jwt>` header that the backend verifies
 *     against the same `JWT_SECRET` as `apps/api`.
 *
 * Auth forwarding strategy:
 *   1. Prefer an `Authorization: Bearer <token>` header that the caller
 *      passed in explicitly. This matches the contract apps/api uses.
 *   2. Fall back to the `auth_token` cookie (same cookie the Next.js
 *      `middleware.ts` verifies for `/admin`). The cookie was set by the
 *      API at login and contains a fully signed JWT.
 *   3. If neither is present, return 401 immediately — no point in a
 *      round-trip that the backend will reject.
 *
 * Never read or log the token contents. Forward and forget.
 *
 * Streaming, abort handling, and error envelopes mirror
 * `apps/web/src/app/api/graph/solve_v2/route.ts` so the wire shape is
 * uniform across the two paths.
 */

import type { NextRequest } from 'next/server';

// SSE must never be cached and must render on every request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GRAPH_BACKEND_URL = process.env.GRAPH_BACKEND_URL || '';

export async function POST(request: NextRequest) {
  if (!GRAPH_BACKEND_URL) {
    return jsonError(
      503,
      'graph_backend_not_configured',
      'GRAPH_BACKEND_URL is not set. The KnowledgeSearchBackend service must be deployed and reachable. See docs/solve-v2.md.',
    );
  }

  // Pull a bearer token from the request — header wins, cookie falls
  // through. The cookie value IS the JWT (set by apps/api at login).
  const authHeader = request.headers.get('authorization');
  const cookieToken = request.cookies.get('auth_token')?.value;
  const bearer = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader
    : cookieToken
      ? `Bearer ${cookieToken}`
      : '';

  if (!bearer) {
    return jsonError(
      401,
      'unauthenticated',
      'Missing Authorization header and auth_token cookie. Log in first.',
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_body', 'Request body must be valid JSON.');
  }

  const upstreamUrl = `${GRAPH_BACKEND_URL.replace(/\/$/, '')}/solve`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: bearer,
      },
      body: JSON.stringify(body),
      // Propagate client disconnect upstream so the backend can stop
      // the planner loop early instead of paying for an orphaned LLM
      // call.
      signal: request.signal,
      cache: 'no-store',
    });
  } catch (err) {
    return jsonError(
      502,
      'graph_backend_unreachable',
      `Could not reach graph backend at ${upstreamUrl}: ${(err as Error).message}`,
    );
  }

  // 401/403 from the backend means the JWT failed verify (drift in
  // JWT_SECRET, expired token, tenant mismatch on the requested
  // resource). Forward the status verbatim so the UI can prompt for a
  // re-login on 401 or show a "not your tenant" message on 403.
  if (upstream.status === 401 || upstream.status === 403) {
    const text = await upstream.text().catch(() => '');
    return new Response(text || JSON.stringify({ error: { code: 'auth_error' } }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok || !upstream.body) {
    return jsonError(
      upstream.status || 502,
      'graph_backend_error',
      `Graph backend returned ${upstream.status} ${upstream.statusText}`,
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable buffering at any intermediary (nginx, etc).
      'X-Accel-Buffering': 'no',
    },
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
