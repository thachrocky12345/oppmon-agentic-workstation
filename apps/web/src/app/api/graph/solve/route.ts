/**
 * Graph-agent SSE proxy
 *
 * Browser → `/api/graph/solve` (this route) → `${GRAPH_BACKEND_URL}/solve_v2`
 *
 * Why a proxy:
 *   - Same-origin from the browser, so no CORS dance.
 *   - Backend URL lives in server-only env and can change without a web rebuild.
 *   - Optional bearer token (`GRAPH_BACKEND_TOKEN`) is injected here, never
 *     exposed to the browser bundle.
 *   - Returns 503 with a clear message when no backend is configured — the UI
 *     can also hide the Graph toggle via NEXT_PUBLIC_GRAPH_ENABLED.
 *
 * Streaming: we pipe upstream's ReadableStream straight through. No decoding,
 * no buffering — SSE events reach the browser as fast as the backend emits.
 *
 * Aborts: when the browser disconnects, request.signal aborts and we propagate
 * to the upstream fetch so we don't keep a zombie connection open.
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

  // Validate body up front so we can return a structured 400 instead of a
  // 500 from an upstream parse error.
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
      // Propagate client disconnect upstream.
      signal: request.signal,
      // SSE: never use the fetch cache.
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

  // Pipe the upstream stream straight through. Next.js (Node runtime) supports
  // returning a ReadableStream as the Response body.
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
