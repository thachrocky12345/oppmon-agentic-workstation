/**
 * Clients for the two Arkon chat backends:
 *   - simple mode: Arkon /api/rag/chat/stream
 *   - graph mode:  KnowledgeSearchBackend /solve_v2 (mounted on :8002)
 *
 * Both speak SSE; this module hides the parsing differences and returns a
 * uniform { answer, citations, graph?, latency_ms, raw_events_count }.
 */

import type { Mode, RunResult } from './types.js';

interface AskOptions {
  endpoint: string;
  question: string;
  enableTools: boolean;
  webFallback: boolean;
  collectionIds: string[];
  authCookie?: string;
  /** Optional model override for simple mode. */
  model?: string;
  provider?: string;
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

/** Send a question to the graph agent (/solve_v2) and capture the full result. */
export async function askGraph(opts: AskOptions): Promise<Omit<RunResult, 'question_id' | 'mode'>> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  let answer = '';
  const referencesAcc: Record<string, string> = {};
  let lastGraphState: RunResult['graph'] | undefined;
  let eventCount = 0;
  let error: string | undefined;

  try {
    const resp = await fetch(opts.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: opts.question,
        enable_tools: opts.enableTools,
        web_fallback: opts.webFallback,
        collection_ids: opts.collectionIds,
      }),
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
          if (r.references) Object.assign(referencesAcc, r.references);
          if (r.nodes && r.adj) {
            lastGraphState = {
              nodes: r.nodes,
              adj: r.adj,
              references: { ...referencesAcc },
            };
          }
          if (r.state === 'END' && r.response) {
            answer = r.response;
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

  return {
    latency_ms: Date.now() - t0,
    answer,
    citations: Object.entries(referencesAcc).map(([idx, url]) => ({
      index: Number(idx),
      source: 'web', // graph mode's RAG is empty until a corpus is wired
      url,
    })),
    graph: lastGraphState,
    raw_events_count: eventCount,
    error,
  };
}

export async function ask(mode: Mode, opts: AskOptions) {
  return mode === 'simple' ? askSimple(opts) : askGraph(opts);
}
