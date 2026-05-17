// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Advanced RAG Service Tests
 *
 * Tests for:
 * - Query variant generation
 * - Query enhancement
 * - MMR diversity selection
 * - Result fusion
 * - Context formatting
 */

import { describe, it, expect } from 'vitest';
import {
  generateQueryVariants,
  enhanceQuery,
  mmrSelect,
  fuseSearchResults,
  formatChunksAsContext,
  formatWebResultsAsContext,
  buildContextBlock,
  RetrievedChunk,
  WebSearchResult,
} from './advanced-rag.js';

describe('Advanced RAG Service', () => {
  describe('generateQueryVariants', () => {
    it('returns original query as first variant', () => {
      const variants = generateQueryVariants('machine learning');
      expect(variants[0]).toBe('machine learning');
    });

    it('adds question format variant', () => {
      const variants = generateQueryVariants('machine learning');
      expect(variants).toContain('What is machine learning?');
    });

    it('preserves question mark for questions', () => {
      const variants = generateQueryVariants('what is machine learning?');
      expect(variants[0]).toBe('what is machine learning?');
      // Should not add another question mark
      expect(variants.some(v => v.endsWith('??'))).toBe(false);
    });

    it('adds definition format variant', () => {
      const variants = generateQueryVariants('how does neural network work');
      expect(variants.some(v => v.includes('Definition'))).toBe(true);
    });

    it('adds mechanism format variant', () => {
      const variants = generateQueryVariants('backpropagation');
      expect(variants.some(v => v.includes('How does'))).toBe(true);
    });

    it('limits to 4 variants', () => {
      const variants = generateQueryVariants('some complex query about multiple topics');
      expect(variants.length).toBeLessThanOrEqual(4);
    });

    it('handles empty query', () => {
      const variants = generateQueryVariants('');
      // Empty string still generates variants (definition, examples, etc.)
      expect(variants.length).toBeGreaterThanOrEqual(1);
      expect(variants[0]).toBe('');
    });
  });

  describe('enhanceQuery', () => {
    it('adds enhancement terms to query', () => {
      const enhanced = enhanceQuery('machine learning');
      expect(enhanced).toContain('machine learning');
      expect(enhanced.length).toBeGreaterThan('machine learning'.length);
    });

    it('includes contextual terms', () => {
      const enhanced = enhanceQuery('neural networks');
      expect(enhanced).toMatch(/explanation|details|information|context/);
    });
  });

  describe('mmrSelect', () => {
    const createChunk = (id: string, score: number, embedding: number[]): RetrievedChunk => ({
      chunkId: id,
      documentId: `doc-${id}`,
      documentTitle: `Document ${id}`,
      documentFilename: `doc-${id}.pdf`,
      chunkText: `Content of chunk ${id}`,
      chunkIndex: 0,
      score,
      collectionId: 'col-1',
      collectionName: 'Test Collection',
      pageNumber: 1,
      embedding,
    });

    it('returns empty array for empty candidates', () => {
      const result = mmrSelect([], [0.1, 0.2, 0.3], 5);
      expect(result).toEqual([]);
    });

    it('returns highest scoring item first', () => {
      const candidates = [
        createChunk('1', 0.7, [1, 0, 0]),
        createChunk('2', 0.9, [0, 1, 0]),
        createChunk('3', 0.5, [0, 0, 1]),
      ];

      const result = mmrSelect(candidates, [0.5, 0.5, 0], 3, 0.7);
      expect(result[0].chunkId).toBe('2');
    });

    it('balances relevance and diversity', () => {
      // Two very similar chunks, one different
      const candidates = [
        createChunk('1', 0.9, [1, 0, 0]),
        createChunk('2', 0.88, [0.99, 0.01, 0]), // Very similar to 1
        createChunk('3', 0.7, [0, 1, 0]),         // Different
      ];

      const result = mmrSelect(candidates, [0.7, 0.3, 0], 2, 0.7);
      // Should prefer diverse results
      expect(result.length).toBe(2);
      expect(result.map(r => r.chunkId)).toContain('1');
      // Either '2' or '3' should be selected, depending on MMR balance
    });

    it('respects requested result count', () => {
      const candidates = [
        createChunk('1', 0.9, [1, 0, 0]),
        createChunk('2', 0.8, [0, 1, 0]),
        createChunk('3', 0.7, [0, 0, 1]),
        createChunk('4', 0.6, [1, 1, 0]),
      ];

      const result = mmrSelect(candidates, [0.5, 0.5, 0], 2, 0.7);
      expect(result.length).toBe(2);
    });

    it('handles candidates without embeddings', () => {
      const candidates = [
        { ...createChunk('1', 0.9, [1, 0, 0]), embedding: undefined },
        createChunk('2', 0.8, [0, 1, 0]),
      ];

      const result = mmrSelect(candidates, [0.5, 0.5, 0], 2, 0.7);
      // Should still work, just skipping items without embeddings for diversity
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('fuseSearchResults', () => {
    const createResult = (
      id: string,
      score: number,
      variant: number
    ): RetrievedChunk & { queryVariant: number } => ({
      chunkId: id,
      documentId: `doc-${id}`,
      documentTitle: `Document ${id}`,
      documentFilename: `doc-${id}.pdf`,
      chunkText: `Content of chunk ${id}`,
      chunkIndex: 0,
      score,
      collectionId: 'col-1',
      collectionName: 'Test Collection',
      pageNumber: 1,
      queryVariant: variant,
    });

    it('returns empty array for empty input', () => {
      const result = fuseSearchResults([], 5);
      expect(result).toEqual([]);
    });

    it('deduplicates results by chunkId', () => {
      const results = [
        createResult('1', 0.9, 0),
        createResult('1', 0.85, 1), // Same chunk, different variant
        createResult('2', 0.8, 0),
      ];

      const fused = fuseSearchResults(results, 5);
      expect(fused.length).toBe(2);
    });

    it('gives bonus for appearing in multiple variants', () => {
      const results = [
        createResult('1', 0.9, 0),
        createResult('1', 0.85, 1), // Same chunk, different variant
        createResult('2', 0.91, 0),  // Higher single score but only one variant
      ];

      const fused = fuseSearchResults(results, 5);
      // Chunk '1' should get a variant bonus
      expect(fused.some(r => r.fusionInfo?.variantCount === 2)).toBe(true);
    });

    it('caps scores at 1.0', () => {
      const results = [
        createResult('1', 0.95, 0),
        createResult('1', 0.95, 1),
        createResult('1', 0.95, 2),
      ];

      const fused = fuseSearchResults(results, 5);
      expect(fused[0].score).toBeLessThanOrEqual(1.0);
    });

    it('sorts by fusion score', () => {
      const results = [
        createResult('1', 0.5, 0),
        createResult('2', 0.9, 0),
        createResult('3', 0.7, 0),
      ];

      const fused = fuseSearchResults(results, 5);
      expect(fused[0].chunkId).toBe('2');
    });

    it('limits results to requested count', () => {
      const results = [
        createResult('1', 0.9, 0),
        createResult('2', 0.8, 0),
        createResult('3', 0.7, 0),
        createResult('4', 0.6, 0),
      ];

      const fused = fuseSearchResults(results, 2);
      expect(fused.length).toBe(2);
    });
  });

  describe('formatChunksAsContext', () => {
    const createChunk = (id: string, score: number, pageNumber: number | null): RetrievedChunk => ({
      chunkId: id,
      documentId: `doc-${id}`,
      documentTitle: `Document ${id}`,
      documentFilename: `doc-${id}.pdf`,
      chunkText: `Content of chunk ${id}`,
      chunkIndex: 0,
      score,
      collectionId: 'col-1',
      collectionName: 'Test Collection',
      pageNumber,
    });

    it('returns empty string for empty chunks', () => {
      const result = formatChunksAsContext([]);
      expect(result).toBe('');
    });

    it('wraps content in context tags', () => {
      const chunks = [createChunk('1', 0.9, 1)];
      const result = formatChunksAsContext(chunks);
      expect(result).toContain('<context>');
      expect(result).toContain('</context>');
    });

    it('includes citation numbers', () => {
      const chunks = [
        createChunk('1', 0.9, 1),
        createChunk('2', 0.8, 2),
      ];
      const result = formatChunksAsContext(chunks);
      expect(result).toContain('[1]');
      expect(result).toContain('[2]');
    });

    it('includes document title', () => {
      const chunks = [createChunk('1', 0.9, 1)];
      const result = formatChunksAsContext(chunks);
      expect(result).toContain('Document 1');
    });

    it('includes page number when present', () => {
      const chunks = [createChunk('1', 0.9, 5)];
      const result = formatChunksAsContext(chunks);
      expect(result).toContain('(page 5)');
    });

    it('excludes page number when null', () => {
      const chunks = [createChunk('1', 0.9, null)];
      const result = formatChunksAsContext(chunks);
      expect(result).not.toContain('(page');
    });

    it('includes confidence level', () => {
      const chunks = [
        createChunk('1', 0.9, 1),  // high
        createChunk('2', 0.7, 2),  // medium
        createChunk('3', 0.4, 3),  // low
      ];
      const result = formatChunksAsContext(chunks);
      expect(result).toContain('high');
      expect(result).toContain('medium');
      expect(result).toContain('low');
    });
  });

  describe('formatWebResultsAsContext', () => {
    const createWebResult = (index: number): WebSearchResult => ({
      title: `Web Result ${index}`,
      url: `https://example.com/${index}`,
      snippet: `Snippet for result ${index}`,
      source: 'web',
    });

    it('returns empty string for empty results', () => {
      const result = formatWebResultsAsContext([]);
      expect(result).toBe('');
    });

    it('wraps content in web-context tags', () => {
      const results = [createWebResult(1)];
      const formatted = formatWebResultsAsContext(results);
      expect(formatted).toContain('<web-context>');
      expect(formatted).toContain('</web-context>');
    });

    it('includes title and URL', () => {
      const results = [createWebResult(1)];
      const formatted = formatWebResultsAsContext(results);
      expect(formatted).toContain('Web Result 1');
      expect(formatted).toContain('https://example.com/1');
    });

    it('includes snippet', () => {
      const results = [createWebResult(1)];
      const formatted = formatWebResultsAsContext(results);
      expect(formatted).toContain('Snippet for result 1');
    });
  });

  describe('buildContextBlock', () => {
    const createChunk = (id: string): RetrievedChunk => ({
      chunkId: id,
      documentId: `doc-${id}`,
      documentTitle: `Document ${id}`,
      documentFilename: `doc-${id}.pdf`,
      chunkText: `Content of chunk ${id}`,
      chunkIndex: 0,
      score: 0.9,
      collectionId: 'col-1',
      collectionName: 'Test Collection',
      pageNumber: 1,
    });

    const createWebResult = (): WebSearchResult => ({
      title: 'Web Result',
      url: 'https://example.com',
      snippet: 'Web snippet',
      source: 'web',
    });

    it('returns empty string when no context', () => {
      const result = buildContextBlock([], []);
      expect(result).toBe('');
    });

    it('wraps in memory-context tags', () => {
      const result = buildContextBlock([createChunk('1')]);
      expect(result).toContain('<memory-context>');
      expect(result).toContain('</memory-context>');
    });

    it('includes system note', () => {
      const result = buildContextBlock([createChunk('1')]);
      expect(result).toContain('recalled memory context');
      expect(result).toContain('NOT new user input');
    });

    it('includes both RAG and web context when provided', () => {
      const result = buildContextBlock([createChunk('1')], [createWebResult()]);
      expect(result).toContain('<context>');
      expect(result).toContain('<web-context>');
    });

    it('handles empty web results', () => {
      const result = buildContextBlock([createChunk('1')], []);
      expect(result).toContain('<context>');
      expect(result).not.toContain('<web-context>');
    });
  });
});
