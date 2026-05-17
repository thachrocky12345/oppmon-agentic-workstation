// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Advanced RAG Tests
 *
 * Tests for REFRAG methodology: MMR, RRF, HyDE, and compression.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  cosineSimilarity,
  mmrSelect,
  reciprocalRankFusion,
  hydeExpand,
  chunkDocument,
  compressDocument,
  HybridRAG,
  estimateTokens,
  type CompressionConfig,
  type HyDEConfig,
} from './advanced-rag'
import type { ScoredDocument } from './memory-types'
import type { LLMClient } from './oracle-loop'

describe('MMR (Maximal Marginal Relevance)', () => {
  const createDoc = (
    id: string,
    score: number,
    embedding: number[]
  ): ScoredDocument => ({
    id,
    content: `Document ${id}`,
    score,
    relevance: score,
    embedding,
  })

  it('selects diverse documents', () => {
    // Create three docs: two similar, one different
    const docs: ScoredDocument[] = [
      createDoc('A', 0.9, [1, 0, 0]),
      createDoc('B', 0.85, [0.99, 0.1, 0]), // Very similar to A
      createDoc('C', 0.8, [0, 1, 0]), // Different direction
    ]

    const queryEmbedding = [1, 0.5, 0] // Favors both A and C

    const selected = mmrSelect(docs, queryEmbedding, 2, 0.5)

    // Should select A (most relevant) and C (most diverse)
    const ids = selected.map((d) => d.id)
    expect(ids).toContain('A')
    expect(ids).toContain('C')
    // B should be excluded as it's too similar to A
    expect(ids).not.toContain('B')
  })

  it('lambda=1 is pure relevance', () => {
    const docs: ScoredDocument[] = [
      createDoc('A', 0.9, [1, 0, 0]),
      createDoc('B', 0.85, [0.99, 0.1, 0]),
      createDoc('C', 0.7, [0, 1, 0]),
    ]

    const queryEmbedding = [1, 0, 0]

    // With lambda=1, pure relevance ordering
    const selected = mmrSelect(docs, queryEmbedding, 3, 1.0)

    // Order should be by relevance to query
    expect(selected[0].id).toBe('A')
    expect(selected[1].id).toBe('B')
  })

  it('lambda=0 is pure diversity', () => {
    const docs: ScoredDocument[] = [
      createDoc('A', 0.9, [1, 0, 0]),
      createDoc('B', 0.85, [0.99, 0.1, 0]),
      createDoc('C', 0.7, [0, 1, 0]),
      createDoc('D', 0.6, [0, 0, 1]),
    ]

    const queryEmbedding = [1, 0, 0]

    // With lambda=0, maximize diversity from already selected
    const selected = mmrSelect(docs, queryEmbedding, 3, 0.0)

    // Should pick the most different docs
    const ids = selected.map((d) => d.id)
    // First might be any, but subsequent should be diverse
    expect(new Set(ids).size).toBe(3) // All unique
  })

  it('handles empty candidates', () => {
    const selected = mmrSelect([], [1, 0, 0], 5, 0.5)
    expect(selected).toHaveLength(0)
  })

  it('handles fewer candidates than requested', () => {
    const docs: ScoredDocument[] = [
      createDoc('A', 0.9, [1, 0, 0]),
      createDoc('B', 0.8, [0, 1, 0]),
    ]

    const selected = mmrSelect(docs, [1, 0, 0], 5, 0.5)
    expect(selected).toHaveLength(2)
  })
})

describe('Reciprocal Rank Fusion', () => {
  it('combines BM25 and vector results', () => {
    const bm25: ScoredDocument[] = [
      { id: 'A', content: 'A', score: 0.9, relevance: 0.9 },
      { id: 'B', content: 'B', score: 0.8, relevance: 0.8 },
      { id: 'C', content: 'C', score: 0.7, relevance: 0.7 },
    ]

    const vector: ScoredDocument[] = [
      { id: 'B', content: 'B', score: 0.95, relevance: 0.95 },
      { id: 'A', content: 'A', score: 0.85, relevance: 0.85 },
      { id: 'D', content: 'D', score: 0.75, relevance: 0.75 },
    ]

    const fused = reciprocalRankFusion([bm25, vector], 4)

    // B should be ranked highest (rank 1 in vector, rank 2 in BM25)
    // A should be ranked second (rank 1 in BM25, rank 2 in vector)
    expect(fused[0].id).toBe('B')
    expect(fused[1].id).toBe('A')

    // All unique docs should be present
    const ids = fused.map((d) => d.id)
    expect(ids).toContain('C')
    expect(ids).toContain('D')
  })

  it('RRF scoring is correct', () => {
    const list1: ScoredDocument[] = [
      { id: 'A', content: 'A', score: 1, relevance: 1 }, // rank 0
    ]
    const list2: ScoredDocument[] = [
      { id: 'A', content: 'A', score: 1, relevance: 1 }, // rank 0
    ]

    const fused = reciprocalRankFusion([list1, list2], 1, 60)

    // RRF score for A: 1/(60+1) + 1/(60+1) = 2/61
    const expectedScore = 2 / 61
    expect(fused[0].score).toBeCloseTo(expectedScore, 5)
  })
})

describe('HyDE (Hypothetical Document Embedding)', () => {
  const mockLLM: LLMClient = {
    chat: vi.fn().mockImplementation(async function* () {
      yield { content: 'Response' }
    }),
    complete: vi.fn().mockImplementation(async (_, opts) => {
      const temp = opts?.temperature ?? 0.7
      return `Hypothetical answer at temp ${temp}`
    }),
  }

  it('generates hypotheticals when enabled', async () => {
    const config: HyDEConfig = {
      enabled: true,
      numHypotheticals: 2,
      temperatures: [0.7, 0.9],
    }

    const variants = await hydeExpand('What is TypeScript?', mockLLM, config)

    // Should have original query + 2 hypotheticals
    expect(variants).toHaveLength(3)
    expect(variants[0]).toBe('What is TypeScript?')
    expect(variants[1]).toContain('Hypothetical')
    expect(variants[2]).toContain('Hypothetical')
  })

  it('returns only query when disabled', async () => {
    const config: HyDEConfig = {
      enabled: false,
      numHypotheticals: 2,
      temperatures: [0.7, 0.9],
    }

    const variants = await hydeExpand('What is TypeScript?', mockLLM, config)

    expect(variants).toHaveLength(1)
    expect(variants[0]).toBe('What is TypeScript?')
    expect(mockLLM.complete).not.toHaveBeenCalled()
  })
})

describe('Document Compression', () => {
  const config: CompressionConfig = {
    maxChunkTokens: 100, // ~400 chars for testing
    overlapTokens: 20,
    summarizeThreshold: 500, // ~2000 chars
  }

  it('chunks at configured token limit', () => {
    const doc = 'word '.repeat(200) // ~200 words = ~50 tokens

    const chunks = chunkDocument(doc, config)

    // Each chunk should be at most maxChunkTokens words
    for (const chunk of chunks) {
      const wordCount = chunk.content.split(/\s+/).length
      expect(wordCount).toBeLessThanOrEqual(config.maxChunkTokens)
    }
  })

  it('maintains overlap between chunks', () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`)
    const doc = words.join(' ')

    const chunks = chunkDocument(doc, config)

    // Check that consecutive chunks overlap
    if (chunks.length > 1) {
      const chunk1Words = chunks[0].content.split(/\s+/)
      const chunk2Words = chunks[1].content.split(/\s+/)

      // Last N words of chunk1 should match first N words of chunk2
      const chunk1End = chunk1Words.slice(-config.overlapTokens)
      const chunk2Start = chunk2Words.slice(0, config.overlapTokens)

      // There should be some overlap
      const overlap = chunk1End.filter((w) => chunk2Start.includes(w))
      expect(overlap.length).toBeGreaterThan(0)
    }
  })

  it('summarizes long documents', async () => {
    const longDoc = 'word '.repeat(1000) // ~1000 words > summarizeThreshold

    const mockLLM: LLMClient = {
      chat: vi.fn().mockImplementation(async function* () {}),
      complete: vi.fn().mockResolvedValue('This is a summary of the document.'),
    }

    const compressed = await compressDocument(longDoc, config, mockLLM)

    // Should have summary as first item
    expect(compressed[0].type).toBe('summary')
    expect(compressed[0].content).toBe('This is a summary of the document.')

    // Should also have chunks
    const chunks = compressed.filter((d) => d.type === 'chunk')
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('does not summarize short documents', async () => {
    const shortDoc = 'word '.repeat(50) // ~50 words < summarizeThreshold

    const mockLLM: LLMClient = {
      chat: vi.fn().mockImplementation(async function* () {}),
      complete: vi.fn(),
    }

    const compressed = await compressDocument(shortDoc, config, mockLLM)

    // Should not call LLM for summary
    expect(mockLLM.complete).not.toHaveBeenCalled()

    // All should be chunks
    expect(compressed.every((d) => d.type === 'chunk')).toBe(true)
  })
})

describe('HybridRAG', () => {
  it('combines BM25 and vector with MMR', async () => {
    const bm25Search = vi.fn().mockResolvedValue([
      { id: 'A', content: 'A content', score: 0.9, relevance: 0.9 },
      { id: 'B', content: 'B content', score: 0.8, relevance: 0.8 },
    ])

    const vectorSearch = vi.fn().mockResolvedValue([
      { id: 'B', content: 'B content', score: 0.95, relevance: 0.95, embedding: [1, 0, 0] },
      { id: 'C', content: 'C content', score: 0.85, relevance: 0.85, embedding: [0, 1, 0] },
    ])

    const embeddingClient = {
      embed: vi.fn().mockResolvedValue([1, 0, 0]),
      embedBatch: vi.fn(),
    }

    const hybrid = new HybridRAG({
      bm25SearchFn: bm25Search,
      vectorSearchFn: vectorSearch,
      embeddingClient,
    })

    const results = await hybrid.retrieveHybrid('test query', 3)

    // Should call both retrieval methods
    expect(bm25Search).toHaveBeenCalled()
    expect(vectorSearch).toHaveBeenCalled()

    // Should return fused results
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(3)
  })
})

describe('Token Estimation', () => {
  it('estimates ~4 chars per token', () => {
    const text = 'abcd'.repeat(100) // 400 chars

    const tokens = estimateTokens(text)

    expect(tokens).toBe(100) // 400 / 4
  })
})

describe('Cosine Similarity', () => {
  it('returns 1 for identical vectors', () => {
    const sim = cosineSimilarity([1, 0, 0], [1, 0, 0])
    expect(sim).toBeCloseTo(1.0)
  })

  it('returns 0 for orthogonal vectors', () => {
    const sim = cosineSimilarity([1, 0, 0], [0, 1, 0])
    expect(sim).toBeCloseTo(0.0)
  })

  it('returns -1 for opposite vectors', () => {
    const sim = cosineSimilarity([1, 0, 0], [-1, 0, 0])
    expect(sim).toBeCloseTo(-1.0)
  })

  it('handles zero vectors', () => {
    const sim = cosineSimilarity([0, 0, 0], [1, 0, 0])
    expect(sim).toBe(0)
  })
})
