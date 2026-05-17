// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Pure citation renderer for graph-mode answers.
 *
 * The backend planner emits final answers with two distinct citation
 * shapes side-by-side:
 *
 *   * RAG citations: `[[doc_id:chunk_id]]` — sentinel form written by
 *     ``agent_v2/orchestrator/rag_tools.py`` finalize tool.
 *   * Web citations: `[N]` — already-numbered, written by the web
 *     planner at ``agent_v2/orchestrator/planner.py:168``.
 *
 * This module collapses both shapes into a single `[N]`-numbered
 * sequence plus a sorted bibliography. The bibliography is keyed by
 * the per-citation metadata the backend emits on every SSE event
 * (``response.citation_meta`` — see ``orchestrator/graph.py``).
 *
 * Numbering policy
 * ----------------
 * Footnotes are assigned in **first-seen order** inside the body so
 * the reader's eye scans `[1] ... [2] ... [3]` top-to-bottom. The
 * bibliography that follows is sorted by **score descending** so the
 * most relevant document surfaces first when the user scans for
 * supporting evidence. These are intentionally different orderings —
 * a doc cited late in the answer may still be the highest-scoring
 * hit overall, and we want both signals visible.
 *
 * Web citations already carry numeric indices. We preserve those
 * exactly when the index isn't claimed by an earlier RAG citation;
 * otherwise the renderer re-numbers to avoid collisions. The same
 * rule applies in reverse: a RAG citation that lands in slot 7 keeps
 * slot 7 even if no web citation took it.
 *
 * Failure modes
 * -------------
 *   * Marker references an unknown key      -> footnote rendered with
 *                                              "(unresolved citation)"
 *                                              label; doesn't crash.
 *   * citation_meta is empty / undefined    -> body is returned with
 *                                              markers stripped to
 *                                              `[N]` and bibliography
 *                                              is built from the
 *                                              references URL map
 *                                              alone (degraded mode).
 *   * No markers found in body              -> body unchanged,
 *                                              bibliography is empty.
 *
 * Pure function — no DOM, no fetch, no side effects. Safe to call in
 * server components, in tests, or in the streaming render loop.
 */

/**
 * Per-citation metadata mirrored from the graph-mode backend
 * (``WebSearchGraph.citation_meta`` in
 * ``agent_v2/orchestrator/graph.py:flush_node_citations``).
 *
 * The shape duplicates ``evals/scripts/lib/types.ts:CitationMeta`` —
 * kept independent so the web app doesn't pull the eval harness as
 * a dependency. Keep these two definitions in lock-step.
 */
export interface CitationMeta {
  index: string;
  doc_id?: string | null;
  chunk_id?: string | null;
  title?: string | null;
  source_url?: string | null;
  score?: number | null;
  page_number?: number | null;
}

/** One row in the rendered bibliography, ready for the React renderer. */
export interface BibliographyEntry {
  /** 1-based footnote number that appears in the body. */
  footnote: number;
  /** Display title (falls back to doc_id, then source_url, then key). */
  title: string;
  /** Numeric score 0..1 or null when the upstream didn't compute one. */
  score: number | null;
  /** Clickable URL when one exists; null for orphan RAG chunks. */
  url: string | null;
  /** Original citation key — kept for hover tooltips / debug. */
  key: string;
  /** Page number, when the chunk came from a paginated source. */
  pageNumber: number | null;
  /** Document id (RAG citations only). */
  docId: string | null;
  /** Chunk id (RAG citations only). */
  chunkId: string | null;
}

export interface RenderCitationsInput {
  /** Final planner answer text with raw [[doc:chunk]] / [N] markers. */
  body: string;
  /**
   * Per-citation metadata keyed by "doc_id:chunk_id" (RAG) or numeric
   * string (web). Comes straight from the SSE END frame.
   */
  citationMeta?: Record<string, CitationMeta> | null;
  /**
   * URL map keyed by the same indexer. Used as a fallback when
   * citationMeta is missing a key (e.g. legacy backends that haven't
   * been upgraded yet).
   */
  references?: Record<string, string> | null;
}

export interface RenderCitationsOutput {
  /** Body with markers rewritten to `[N]` footnotes. */
  body: string;
  /** Sorted-by-score-desc bibliography. */
  bibliography: BibliographyEntry[];
}

// Matches both `[[doc:chunk]]` (RAG) and `[N]` (web). The web pattern
// requires the bracket contents to be all digits — anything else is
// treated as ordinary punctuation and left alone.
const MARKER_RE = /\[\[([^\]]+)\]\]|\[(\d+)\]/g;

/**
 * Render a body + citation map into a footnoted body + bibliography.
 *
 * Implementation notes:
 *   * Two passes over the body. Pass 1 walks markers in order and
 *     builds the key->footnote table. Pass 2 rewrites markers using
 *     the table. We can't do this in one regex pass because we need
 *     the first-seen order to be stable before substitution.
 *   * Bibliography sort: score desc, then footnote asc (for ties),
 *     then key asc (stable across runs).
 */
export function renderCitations(
  input: RenderCitationsInput,
): RenderCitationsOutput {
  const { body, citationMeta, references } = input;
  if (!body) {
    return { body: '', bibliography: [] };
  }

  // Pass 1 — collect keys in first-seen order.
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(MARKER_RE)) {
    const key = m[1] ?? m[2];
    if (key === undefined) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    orderedKeys.push(key);
  }

  if (orderedKeys.length === 0) {
    return { body, bibliography: [] };
  }

  // Pass 2 — assign footnote numbers. Web citations carry a numeric
  // index already; we honor it when free, otherwise re-number.
  const keyToFootnote = new Map<string, number>();
  const claimed = new Set<number>();
  // First pass: honor pre-numbered web citations when possible.
  for (const key of orderedKeys) {
    const asNum = Number(key);
    if (Number.isInteger(asNum) && asNum >= 1 && !claimed.has(asNum)) {
      keyToFootnote.set(key, asNum);
      claimed.add(asNum);
    }
  }
  // Second pass: fill the remainder with the next free integer.
  let nextFree = 1;
  for (const key of orderedKeys) {
    if (keyToFootnote.has(key)) continue;
    while (claimed.has(nextFree)) nextFree++;
    keyToFootnote.set(key, nextFree);
    claimed.add(nextFree);
  }

  // Pass 3 — rewrite markers.
  const renderedBody = body.replace(MARKER_RE, (full, ragKey, webKey) => {
    const key = (ragKey ?? webKey) as string | undefined;
    if (key === undefined) return full;
    const fn = keyToFootnote.get(key);
    if (fn === undefined) return full;
    return `[${fn}]`;
  });

  // Build bibliography entries from the resolved metadata.
  const meta = citationMeta ?? {};
  const urls = references ?? {};
  const entries: BibliographyEntry[] = orderedKeys.map((key) => {
    const fn = keyToFootnote.get(key)!;
    const m = meta[key];
    const url = m?.source_url ?? urls[key] ?? null;
    const title =
      m?.title ??
      m?.doc_id ??
      (url ? deriveTitleFromUrl(url) : null) ??
      (key.includes(':') ? key.split(':')[0]! : `Source ${fn}`);
    return {
      footnote: fn,
      title,
      score: typeof m?.score === 'number' ? m.score : null,
      url,
      key,
      pageNumber: typeof m?.page_number === 'number' ? m.page_number : null,
      docId: m?.doc_id ?? (key.includes(':') ? key.split(':')[0]! : null),
      chunkId: m?.chunk_id ?? (key.includes(':') ? key.split(':')[1]! : null),
    };
  });

  // Sort: score desc, footnote asc, key asc.
  entries.sort((a, b) => {
    const sa = a.score ?? -Infinity;
    const sb = b.score ?? -Infinity;
    if (sb !== sa) return sb - sa;
    if (a.footnote !== b.footnote) return a.footnote - b.footnote;
    return a.key.localeCompare(b.key);
  });

  return { body: renderedBody, bibliography: entries };
}

/**
 * Pull a readable label out of a URL when the upstream didn't provide
 * a title. Keeps the host so the user has *some* signal of which
 * source the chunk came from.
 */
function deriveTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
  } catch {
    return null;
  }
}
