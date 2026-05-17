// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * RAG Contextualizer Tests
 *
 * Covers:
 *  - small-doc single-call path returns parsed JSON
 *  - large-doc path makes 1 summary call + N prefix calls, each with
 *    cache_control on the system block
 *  - LLM throws → returns empty strings + model='fallback'
 *  - CONTEXTUALIZER_MODEL env overrides default
 *  - empty chunks array → returns {summary:'', prefixes:[], model}
 *  - malformed JSON in small-doc path → falls back cleanly
 *  - missing ANTHROPIC_API_KEY → falls back without throwing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- mock the SDK at module level ---------------------------------------
// Anthropic is a default export (`import Anthropic from '@anthropic-ai/sdk'`),
// so we have to mock the default. The shape `new Anthropic({apiKey,timeout})
// .messages.create(...)` is what the service uses.

const messagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  const AnthropicMock = vi.fn().mockImplementation(() => ({
    messages: { create: messagesCreate },
  }));
  return { default: AnthropicMock };
});

// Import AFTER the mock so the service picks up the mocked SDK.
import { contextualize } from './rag-contextualizer.js';

// ---- helpers ------------------------------------------------------------

/** Builds a fake Anthropic.Message response with a single text block. */
const textResponse = (text: string) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text }],
  model: 'claude-haiku-test',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 0, output_tokens: 0 },
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  messagesCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = 'sk-test-fake-not-real';
  delete process.env.CONTEXTUALIZER_MODEL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---- tests --------------------------------------------------------------

describe('rag-contextualizer', () => {
  describe('small-doc path', () => {
    it('parses JSON response and returns summary + prefixes', async () => {
      messagesCreate.mockResolvedValueOnce(
        textResponse(
          JSON.stringify({
            summary: 'A short doc about pricing.',
            prefixes: ['Chunk 0 about plans.', 'Chunk 1 about discounts.'],
          }),
        ),
      );

      const out = await contextualize({
        fullText: 'short doc',
        chunks: ['c0', 'c1'],
      });

      expect(out.summary).toBe('A short doc about pricing.');
      expect(out.prefixes).toEqual([
        'Chunk 0 about plans.',
        'Chunk 1 about discounts.',
      ]);
      expect(out.model).toBe('claude-haiku-4-5-20251001');
      expect(messagesCreate).toHaveBeenCalledTimes(1);
    });

    it('strips ```json fences if model wraps the response', async () => {
      messagesCreate.mockResolvedValueOnce(
        textResponse(
          '```json\n' +
            JSON.stringify({ summary: 's', prefixes: ['p'] }) +
            '\n```',
        ),
      );

      const out = await contextualize({ fullText: 'x', chunks: ['only'] });
      expect(out.summary).toBe('s');
      expect(out.prefixes).toEqual(['p']);
      expect(out.model).not.toBe('fallback');
    });

    it('falls back when prefixes array length mismatches chunk count', async () => {
      messagesCreate.mockResolvedValueOnce(
        textResponse(JSON.stringify({ summary: 's', prefixes: ['only-one'] })),
      );

      const out = await contextualize({
        fullText: 'x',
        chunks: ['c0', 'c1', 'c2'],
      });

      expect(out.summary).toBe('');
      expect(out.prefixes).toEqual(['', '', '']);
      expect(out.model).toBe('fallback');
    });

    it('falls back when response is non-JSON garbage', async () => {
      messagesCreate.mockResolvedValueOnce(
        textResponse('I cannot help with that.'),
      );

      const out = await contextualize({ fullText: 'x', chunks: ['c0'] });
      expect(out.model).toBe('fallback');
      expect(out.summary).toBe('');
      expect(out.prefixes).toEqual(['']);
    });
  });

  describe('large-doc path', () => {
    it('makes 1 summary call + N prefix calls with cache_control', async () => {
      // Build a fullText big enough to cross the 1024-token threshold
      // (>4096 chars).
      const bigText = 'x'.repeat(5000);
      const chunks = ['a', 'b', 'c'];

      messagesCreate
        .mockResolvedValueOnce(textResponse('Document summary here.')) // summary
        .mockResolvedValueOnce(textResponse('Context for a.')) // prefix 0
        .mockResolvedValueOnce(textResponse('Context for b.')) // prefix 1
        .mockResolvedValueOnce(textResponse('Context for c.')); // prefix 2

      const out = await contextualize({ fullText: bigText, chunks });

      expect(out.summary).toBe('Document summary here.');
      expect(out.prefixes).toEqual([
        'Context for a.',
        'Context for b.',
        'Context for c.',
      ]);
      expect(messagesCreate).toHaveBeenCalledTimes(4);

      // Every large-doc call must use the cached system block.
      for (const call of messagesCreate.mock.calls) {
        const args = call[0] as { system: Array<{ cache_control?: unknown }> };
        expect(Array.isArray(args.system)).toBe(true);
        expect(args.system[0].cache_control).toEqual({ type: 'ephemeral' });
      }
    });
  });

  describe('error handling', () => {
    it('returns fallback when LLM throws', async () => {
      messagesCreate.mockRejectedValueOnce(new Error('rate limit'));

      const out = await contextualize({ fullText: 'x', chunks: ['c0', 'c1'] });
      expect(out.summary).toBe('');
      expect(out.prefixes).toEqual(['', '']);
      expect(out.model).toBe('fallback');
    });

    it('falls back without calling SDK when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const out = await contextualize({ fullText: 'x', chunks: ['c0'] });
      expect(out.model).toBe('fallback');
      expect(messagesCreate).not.toHaveBeenCalled();
    });
  });

  describe('config', () => {
    it('honors CONTEXTUALIZER_MODEL env override', async () => {
      process.env.CONTEXTUALIZER_MODEL = 'claude-haiku-override-test';
      messagesCreate.mockResolvedValueOnce(
        textResponse(JSON.stringify({ summary: 's', prefixes: ['p'] })),
      );

      const out = await contextualize({ fullText: 'x', chunks: ['c0'] });
      expect(out.model).toBe('claude-haiku-override-test');

      const callArgs = messagesCreate.mock.calls[0][0] as { model: string };
      expect(callArgs.model).toBe('claude-haiku-override-test');
    });

    it('honors per-call model override', async () => {
      messagesCreate.mockResolvedValueOnce(
        textResponse(JSON.stringify({ summary: 's', prefixes: ['p'] })),
      );

      const out = await contextualize({
        fullText: 'x',
        chunks: ['c0'],
        model: 'claude-call-override',
      });
      expect(out.model).toBe('claude-call-override');
    });
  });

  describe('edge cases', () => {
    it('returns early when chunks is empty', async () => {
      const out = await contextualize({ fullText: 'x', chunks: [] });
      expect(out).toEqual({
        summary: '',
        prefixes: [],
        model: 'claude-haiku-4-5-20251001',
      });
      expect(messagesCreate).not.toHaveBeenCalled();
    });
  });
});
