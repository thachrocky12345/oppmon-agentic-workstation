// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Clients for the two Arkon chat backends:
 *   - simple mode: Arkon /api/rag/chat/stream
 *   - graph mode:  agent_graph_backend /solve (TAG-50/TAG-58, authenticated)
 *                  or /solve_v2 (legacy, unauthenticated) when
 *                  EVAL_USE_LEGACY_SOLVE_V2=true.
 *
 * Both speak SSE; this module hides the parsing differences and returns a
 * uniform { answer, citations, graph?, retrieved?, cited?, latency_ms,
 * raw_events_count }.
 *
 * TAG-CR — askGraph now also extracts `retrieved[]` and `cited[]` arrays
 * from the SSE stream's `response.references` dicts for the contextual
 * retrieval A/B evaluation. The `useContextualRetrieval` option is
 * forwarded to the backend as `use_contextual_retrieval` (snake_case
 * matches the FastAPI request schema in agent_v2/api/solve_request.py).
 */

import type { Mode, RunResult } from './types.js';

interface AskOptions {
  endpoint: string;
  question: string;
  enableTools: boolean;
  webFallback: boolean;
  collectionIds: string[];
  /** Cookie string for simple-mode / legacy /solve_v2. */
  authCookie?: string;
  /**
   * Bearer JWT for authenticated /solve. The web proxy will also accept
   * a cookie (auth_token), but the eval harness runs out of band and
   * passes the bearer explicitly.
   */
  authBearer?: string;
  /** Optional model override for simple mode. */
  model?: string;
  provider?: string;
  /**
   * TAG-CR — when true, the graph backend uses the contextual retrieval
   * display path (document summary + chunk-specific prefix exposed to
   * the planner). When false, the legacy minimal hit shape is used.
   * `undefined` defers to the backend's default (Settings.use_contextual_retrieval).
   */
  useContextualRetrieval?: boolean;
  /** Per-request hard timeout. */
  timeoutMs?: number;
}

/** Send a question to Arkon's simple chat endpoint and capture the full answer. */
export async function askSimple(opts: AskOptions): Promise<Omit<RunResult, 'question_id' | 'mode'>> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  let answer = '';
  const citations: NonNullable<RunResult['citations']> = [];
  let eventCount = 0;
  let error: string | undefined;

  try {
    const resp = await fetch(opts.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.authCookie ? { Cookie: opts.authCookie } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: opts.question }],
        collectionIds: opts.collectionIds.length > 0 ? opts.collectionIds : undefined,
        model: opts.model,
        provider: opts.provider || 'anthropic',
        enableTools: opts.enableTools,
        webFallback: opts.webFallback,
      }),
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      throw new Error(`simple: HTTP ${resp.status}`);
    }
    if (!resp.body) throw new Error('simple: no body');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        eventCount++;
        try {
          const chunk = JSON.parse(dataStr) as {
            type?: string;
            data?: unknown;
          };
          if (chunk.type === 'content') {
            const c = (chunk.data as { content?: string } | undefined)?.content;
            if (c) answer += c;
          } else if (chunk.type === 'citation') {
            citations.push(chunk.data as RunResult['citations'] extends infer R ? R extends Array<infer X> ? X : never : never);
          } else if (chunk.type === 'error') {
            error = (chunk.data as { message?: string } | undefined)?.message || 'unknown stream error';
          }
        } catch {
          // ignore unparseable lines
        }
      }
    }
  } catch (e) {
    error = (e as Error).message;
  } finally {
    if (timer) clearTimeout(timer);
  }

  return {
    latency_ms: Date.now() - t0,
    answer,
    citations,
    raw_events_count: eventCount,
    error,
  };
}

/**
 * Send a question to the graph agent (/solve or /solve_v2) and capture
 * the full result.
 *
 * Endpoint selection: `opts.endpoint` is the absolute URL the caller
 * computed; the harness picks `/solve` by default and falls back to
 * `/solve_v2` only when `EVAL_USE_LEGACY_SOLVE_V2=true`. This client
 * does NOT introspect the URL — it just sends the right auth header
 * (bearer for /solve, none for /solve_v2) based on whether `authBearer`
 * is set.
 *
 * TAG-CR — also captures `retrieved[]` (union of all citation keys seen
 * across the stream) and `cited[]` (citation keys present in the final
 * END-state references dict). Both are doc:chunk strings.
 */
export async function askGraph(opts: AskOptions): Promise<Omit<RunResult, 'question_id' | 'mode'>> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  let answer = '';
  const referencesAcc: Record<string, string> = {};
  // citation_meta accumulator: keyed by "doc:chunk" (RAG) or numeric
  // string (web). Last-write wins matches the backend's
  // ``flush_node_citations`` behavior, which already prefers the
  // higher-scoring metadata before emitting the event.
  const citationMetaAcc: Record<string, import('./types').CitationMeta> = {};
  const retrievedSet = new Set<string>();
  let lastEndReferences: Record<string, string> | undefined;
  let lastGraphState: RunResult['graph'] | undefined;
  let eventCount = 0;
  let error: string | undefined;

  // Build request body. The graph backend accepts the optional
  // `use_contextual_retrieval` field — omit it entirely (rather than
  // sending `null`) so the backend's Settings default wins when the
  // caller didn't opt in either way.
  const body: Record<string, unknown> = {
    inputs: opts.question,
    enable_tools: opts.enableTools,
    web_fallback: opts.webFallback,
    collection_ids: opts.collectionIds,
  };
  if (opts.useContextualRetrieval !== undefined) {
    body.use_contextual_retrieval = opts.useContextualRetrieval;
  }

  // Headers: /solve requires Authorization, /solve_v2 accepts no auth.
  // Cookie is preserved for the legacy path (some deployments gate it).
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.authBearer) {
    headers.Authorization = opts.authBearer.toLowerCase().startsWith('bearer ')
      ? opts.authBearer
      : `Bearer ${opts.authBearer}`;
  }
  if (opts.authCookie) {
    headers.Cookie = opts.authCookie;
  }

  try {
    const resp = await fetch(opts.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`graph: HTTP ${resp.status}`);
    if (!resp.body) throw new Error('graph: no body');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr) continue;
        eventCount++;
        try {
          const evt = JSON.parse(dataStr) as {
            response?: {
              type?: string;
              state?: string;
              response?: string;
              nodes?: Record<string, unknown>;
              adj?: Record<string, unknown>;
              references?: Record<string, string>;
              citation_meta?: Record<string, import('./types').CitationMeta>;
            };
            current_node?: string | null;
            error?: { msg?: string; details?: string };
          };
          if (evt.error) {
            error = `${evt.error.msg || 'graph error'}${evt.error.details ? `: ${evt.error.details}` : ''}`;
            continue;
          }
          const r = evt.response;
          if (!r) continue;
          if (r.references) {
            Object.assign(referencesAcc, r.references);
            // Every key that ever appeared in references is a hit the
            // retriever surfaced for at least one sub-question — this
            // is the recall set for retrieval-quality metrics.
            for (const k of Object.keys(r.references)) retrievedSet.add(k);
          }
          if (r.citation_meta) {
            Object.assign(citationMetaAcc, r.citation_meta);
          }
          if (r.nodes && r.adj) {
            lastGraphState = {
              nodes: r.nodes,
              adj: r.adj,
              references: { ...referencesAcc },
              citation_meta: { ...citationMetaAcc },
            };
          }
          if (r.state === 'END' && r.response) {
            answer = r.response;
            // The END event carries the planner's final references —
            // these are what the synthesized answer drew on (precision
            // numerator for the cited-vs-relevant comparison).
            if (r.references) lastEndReferences = { ...r.references };
          } else if (r.type === 'planner' && r.response) {
            // capture the planner's running synthesis text — END will overwrite later
            answer = r.response;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    error = (e as Error).message;
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Citation indices in /solve are already `doc_id:chunk_id` strings
  // for RAG hits (rag_tools.py:236) and integer-like strings for web
  // hits. The retrieval-metrics module is responsible for normalization,
  // but we strip the [[ ]] sentinel here just in case the source ever
  // changes shape.
  const stripSentinel = (s: string) => s.replace(/^\[\[/, '').replace(/\]\]$/, '');

  const retrieved = Array.from(retrievedSet, stripSentinel);
  const cited = lastEndReferences
    ? Object.keys(lastEndReferences).map(stripSentinel)
    : // Fall back to the full accumulated set when the backend didn't
      // send an END event (timeout / error) so downstream metrics still
      // have something to score.
      retrieved.slice();

  return {
    latency_ms: Date.now() - t0,
    answer,
    citations: Object.entries(referencesAcc).map(([idx, url]) => ({
      // `index` is a number in the existing simple-mode shape, but for
      // graph mode the key is already `doc:chunk`. Keep the numeric
      // field as the array position so downstream consumers don't crash
      // on `Number("doc_eng:chk_eng_1")` → NaN.
      index: Number.isFinite(Number(idx)) ? Number(idx) : 0,
      source: idx.includes(':') ? 'rag' : 'web',
      url,
    })),
    graph: lastGraphState,
    retrieved,
    cited,
    raw_events_count: eventCount,
    error,
  };
}

export async function ask(mode: Mode, opts: AskOptions) {
  return mode === 'simple' ? askSimple(opts) : askGraph(opts);
}
