/**
 * Tests for the pure citation renderer.
 *
 * Covers:
 *   - First-seen-order footnote numbering
 *   - Bibliography sorted by score desc
 *   - Mixed [[doc:chunk]] (RAG) + [N] (web) markers
 *   - Web citation index preservation when free
 *   - Re-numbering on collision
 *   - Degraded modes: no citationMeta, no references, unknown keys
 *   - Empty body / no markers
 */

import { describe, it, expect } from 'vitest';

import { renderCitations, type CitationMeta } from './renderCitations';

const meta = (over: Partial<CitationMeta>): CitationMeta => ({
  index: over.index ?? 'x:y',
  ...over,
});

describe('renderCitations', () => {
  it('numbers RAG markers in first-seen order', () => {
    const body =
      'A [[d1:c1]] then B [[d2:c1]] then A again [[d1:c1]] and C [[d3:c1]].';
    const out = renderCitations({
      body,
      citationMeta: {
        'd1:c1': meta({ index: 'd1:c1', title: 'D1', score: 0.5 }),
        'd2:c1': meta({ index: 'd2:c1', title: 'D2', score: 0.9 }),
        'd3:c1': meta({ index: 'd3:c1', title: 'D3', score: 0.7 }),
      },
    });
    expect(out.body).toBe('A [1] then B [2] then A again [1] and C [3].');
    // Bibliography sorted by score desc.
    expect(out.bibliography.map((e) => e.title)).toEqual(['D2', 'D3', 'D1']);
    expect(out.bibliography.map((e) => e.footnote)).toEqual([2, 3, 1]);
  });

  it('preserves pre-numbered web citation indices when free', () => {
    const body = 'A [[d1:c1]] then B [3] then C [[d2:c1]].';
    const out = renderCitations({
      body,
      citationMeta: {
        'd1:c1': meta({ index: 'd1:c1', title: 'D1', score: 0.5 }),
        '3': meta({ index: '3', title: 'Web3', score: 0.6 }),
        'd2:c1': meta({ index: 'd2:c1', title: 'D2', score: 0.4 }),
      },
    });
    // First-seen-order would assign 1, 2, 3 — but the literal [3]
    // claims slot 3, so d1 gets 1, d2 gets 2 (next free), 3 stays 3.
    expect(out.body).toBe('A [1] then B [3] then C [2].');
  });

  it('re-numbers when a web index collides with first-seen sequencing', () => {
    // [1] is claimed by web; first-seen order would also assign 1 to
    // [[d1:c1]]. The web index wins, RAG re-numbers to the next free.
    const body = '[[d1:c1]] then [1] then [[d2:c1]].';
    const out = renderCitations({
      body,
      citationMeta: {
        'd1:c1': meta({ index: 'd1:c1', title: 'D1', score: 0.5 }),
        '1': meta({ index: '1', title: 'Web1', score: 0.9 }),
        'd2:c1': meta({ index: 'd2:c1', title: 'D2', score: 0.4 }),
      },
    });
    // 1 → Web1 (claims slot 1); d1 → 2 (next free); d2 → 3.
    expect(out.body).toBe('[2] then [1] then [3].');
    expect(
      out.bibliography.find((e) => e.title === 'Web1')?.footnote,
    ).toBe(1);
  });

  it('falls back to references URL map when citationMeta is empty', () => {
    const body = 'A [[d1:c1]].';
    const out = renderCitations({
      body,
      citationMeta: {},
      references: { 'd1:c1': 'https://example.com/doc/d1' },
    });
    expect(out.body).toBe('A [1].');
    expect(out.bibliography[0]?.url).toBe('https://example.com/doc/d1');
    // No title in meta, no title hint — derives from URL host+path.
    expect(out.bibliography[0]?.title).toBe('example.com/doc/d1');
  });

  it('marks unknown keys with a defensible label rather than crashing', () => {
    const body = 'orphan [[unknown:xyz]].';
    const out = renderCitations({ body, citationMeta: {}, references: {} });
    expect(out.body).toBe('orphan [1].');
    // Title falls back to the doc_id portion of the key when nothing
    // else is available.
    expect(out.bibliography[0]?.title).toBe('unknown');
    expect(out.bibliography[0]?.url).toBeNull();
  });

  it('returns body unchanged when there are no markers', () => {
    const out = renderCitations({ body: 'no citations here', citationMeta: {} });
    expect(out.body).toBe('no citations here');
    expect(out.bibliography).toEqual([]);
  });

  it('handles empty body', () => {
    const out = renderCitations({ body: '', citationMeta: {} });
    expect(out.body).toBe('');
    expect(out.bibliography).toEqual([]);
  });

  it('sorts bibliography stably: score desc, footnote asc, key asc', () => {
    // Two equal scores — break ties by footnote.
    const body = '[[a:1]] [[b:1]] [[c:1]]';
    const out = renderCitations({
      body,
      citationMeta: {
        'a:1': meta({ index: 'a:1', title: 'A', score: 0.5 }),
        'b:1': meta({ index: 'b:1', title: 'B', score: 0.5 }),
        'c:1': meta({ index: 'c:1', title: 'C', score: 0.9 }),
      },
    });
    expect(out.bibliography.map((e) => e.title)).toEqual(['C', 'A', 'B']);
  });

  it('exposes doc_id / chunk_id / page_number for the renderer', () => {
    const body = 'see [[d1:c7]].';
    const out = renderCitations({
      body,
      citationMeta: {
        'd1:c7': meta({
          index: 'd1:c7',
          title: 'Deploy Guide',
          doc_id: 'd1',
          chunk_id: 'c7',
          score: 0.8,
          page_number: 42,
          source_url: 'https://docs.example.com/deploy',
        }),
      },
    });
    const entry = out.bibliography[0]!;
    expect(entry.docId).toBe('d1');
    expect(entry.chunkId).toBe('c7');
    expect(entry.pageNumber).toBe(42);
    expect(entry.url).toBe('https://docs.example.com/deploy');
  });

  it('treats null score as least-relevant', () => {
    const body = '[[a:1]] [[b:1]]';
    const out = renderCitations({
      body,
      citationMeta: {
        'a:1': meta({ index: 'a:1', title: 'A', score: null }),
        'b:1': meta({ index: 'b:1', title: 'B', score: 0.1 }),
      },
    });
    // B has a real score, A has none — B comes first.
    expect(out.bibliography.map((e) => e.title)).toEqual(['B', 'A']);
  });
});
