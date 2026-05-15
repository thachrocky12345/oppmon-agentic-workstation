/**
 * Graph-agent SSE proxy — legacy /solve_v2 path.
 *
 * Browser → `/api/graph/solve_v2` (this route) → `${GRAPH_BACKEND_URL}/solve_v2`
 *
 * This proxy was originally at `/api/graph/solve`. TAG-65 promoted the
 * authenticated `/solve` endpoint (TAG-50 epic) to the primary path; this
 * file preserves access to the unauthenticated `/solve_v2` route for
 * legacy clients (graph-mode chat panel that doesn't yet pass a JWT) and
 * for parity-shape checks in tests.
 *
 * No auth forwarding: `/solve_v2` itself is unauthenticated by design
 * (the FastAPI service trusts the proxy boundary). For the authenticated
 * flow with citations + tenant isolation, use `/api/graph/solve` instead.
 *
 * Streaming, abort handling, and error envelopes are identical to the
 * authenticated proxy at `apps/web/src/app/api/graph/solve/route.ts`.
 */

import type { NextRequest } from 'next/server';

// SSE must never be cached and must render on every request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GRAPH_BACKEND_URL = process.env.GRAPH_BACKEND_URL || '';
const GRAPH_BACKEND_TOKEN = process.env.GRAPH_BACKEND_TOKEN || '';

export async function POST(request: NextRequest) {
  if (!GRAPH_BACKEND_URL) {
    return jsonError(
      503,
      'graph_backend_not_configured',
      'GRAPH_BACKEND_URL is not set. The KnowledgeSearchBackend service must be deployed and reachable. See docs/solve-v2.md.',
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_body', 'Request body must be valid JSON.');
  }

  const upstreamUrl = `${GRAPH_BACKEND_URL.replace(/\/$/, '')}/solve_v2`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(GRAPH_BACKEND_TOKEN ? { Authorization: `Bearer ${GRAPH_BACKEND_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
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
