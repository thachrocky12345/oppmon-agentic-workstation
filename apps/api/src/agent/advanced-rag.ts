/**
 * Advanced RAG Enhancement
 *
 * Implements REFRAG methodology:
 * 1. COMPRESSION: Chunk + summarize documents
 * 2. SENSING: Diversity-aware retrieval (MMR)
 * 3. EXPANSION: Multi-perspective search (HyDE)
 */

import type { ScoredDocument, EmbeddingClient } from './memory-types'
import type { LLMClient } from './oracle-loop'

// ============================================================================
// Types
// ============================================================================

export interface CompressionConfig {
  maxChunkTokens: number // Default: 800
  overlapTokens: number // Default: 100
  summarizeThreshold: number // Docs > this get summarized
}

export interface CompressedDocument {
  content: string
  type: 'summary' | 'chunk'
  originalLength?: number
  chunkIndex?: number
}

export interface MMRConfig {
  lambda: number // 0-1: balance relevance vs diversity
  candidateMultiplier: number // Fetch N * k candidates for MMR selection
}

export interface HyDEConfig {
  enabled: boolean
  numHypotheticals: number // Number of hypothetical docs to generate
  temperatures: number[] // Different temps for diversity
}

export interface AdvancedRAGConfig {
  compression: CompressionConfig
  mmr: MMRConfig
  hyde: HyDEConfig
}

// ============================================================================
// MMR (Maximal Marginal Relevance)
// ============================================================================

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * MMR selection balances relevance and diversity
 *
 * Score = λ * sim(doc, query) - (1-λ) * max(sim(doc, selected))
 *
 * λ = 1.0: Pure relevance
 * λ = 0.0: Pure diversity
 * λ = 0.5: Balanced (recommended)
 */
export function mmrSelect(
  candidates: ScoredDocument[],
  queryEmbedding: number[],
  nResults: number,
  lambda: number = 0.5
): ScoredDocument[] {
  if (candidates.length === 0) return []
  if (candidates.length <= nResults) return candidates

  const selected: ScoredDocument[] = []
  const remaining = [...candidates]

  // Ensure all candidates have embeddings
  const withEmbeddings = remaining.filter((d) => d.embedding && d.embedding.length > 0)

  if (withEmbeddings.length === 0) {
    // Fallback: just return top by score
    return candidates.slice(0, nResults)
  }

  while (selected.length < nResults && withEmbeddings.length > 0) {
    let bestScore = -Infinity
    let bestIdx = 0

    for (let i = 0; i < withEmbeddings.length; i++) {
      const doc = withEmbeddings[i]
      const embedding = doc.embedding!

      // Relevance to query
      const queryRelevance = cosineSimilarity(embedding, queryEmbedding)

      // Max similarity to already selected
      let maxSelectedSim = 0
      if (selected.length > 0) {
        for (const s of selected) {
          if (s.embedding) {
            const sim = cosineSimilarity(embedding, s.embedding)
            maxSelectedSim = Math.max(maxSelectedSim, sim)
          }
        }
      }

      // MMR score
      const mmrScore = lambda * queryRelevance - (1 - lambda) * maxSelectedSim

      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }

    selected.push(withEmbeddings[bestIdx])
    withEmbeddings.splice(bestIdx, 1)
  }

  return selected
}

// ============================================================================
// Reciprocal Rank Fusion (RRF)
// ============================================================================

/**
 * Combine multiple ranked lists using Reciprocal Rank Fusion
 *
 * RRF_score = Σ 1 / (k + rank_i)
 * Where k is typically 60
 */
export function reciprocalRankFusion(
  lists: ScoredDocument[][],
  nResults: number,
  k: number = 60
): ScoredDocument[] {
  const scores = new Map<string, number>()
  const docs = new Map<string, ScoredDocument>()

  for (const list of lists) {
    list.forEach((doc, rank) => {
      const score = 1 / (k + rank + 1)
      scores.set(doc.id, (scores.get(doc.id) || 0) + score)
      docs.set(doc.id, doc)
    })
  }

  // Sort by combined score
  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, nResults)
    .map(([id, rrfScore]) => ({
      ...docs.get(id)!,
      score: rrfScore,
      relevance: rrfScore,
    }))

  return ranked
}

// ============================================================================
// HyDE (Hypothetical Document Embedding)
// ============================================================================

/**
 * Generate hypothetical documents that would answer the query
 * Then embed those for better semantic matching
 */
export async function hydeExpand(
  query: string,
  llm: LLMClient,
  config: HyDEConfig
): Promise<string[]> {
  if (!config.enabled) {
    return [query]
  }

  const prompt = `
Given the following question, write a short paragraph (2-3 sentences) that
directly answers it. Write as if you are an expert document containing the answer.

Question: ${query}

Answer paragraph:
`

  // Generate multiple hypothetical documents for diversity
  const hypotheticals = await Promise.all(
    config.temperatures.slice(0, config.numHypotheticals).map((temp) =>
      llm.complete(prompt, { temperature: temp })
    )
  )

  return [query, ...hypotheticals]
}

/**
 * Multi-vector search with query variants
 */
export async function multiVectorSearch(
  queries: string[],
  searchFn: (query: string) => Promise<ScoredDocument[]>,
  nResults: number
): Promise<ScoredDocument[]> {
  // Search with each query variant
  const allResults = await Promise.all(queries.map(searchFn))

  // Reciprocal Rank Fusion across all result sets
  return reciprocalRankFusion(allResults, nResults)
}

// ============================================================================
// Document Compression
// ============================================================================

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Chunk document with overlap for context continuity
 */
export function chunkDocument(
  document: string,
  config: CompressionConfig
): CompressedDocument[] {
  const chunks: CompressedDocument[] = []
  const words = document.split(/\s+/)

  let start = 0
  while (start < words.length) {
    const end = Math.min(start + config.maxChunkTokens, words.length)
    const chunk = words.slice(start, end).join(' ')

    chunks.push({
      content: chunk,
      type: 'chunk',
      chunkIndex: chunks.length,
    })

    // Overlap for context continuity
    start = end - config.overlapTokens
    if (start <= 0 && end < words.length) {
      start = end // Avoid infinite loop
    }
  }

  return chunks
}

/**
 * Compress document with optional LLM summarization
 */
export async function compressDocument(
  document: string,
  config: CompressionConfig,
  llm?: LLMClient
): Promise<CompressedDocument[]> {
  const tokens = estimateTokens(document)

  if (tokens > config.summarizeThreshold && llm) {
    // Generate summary for long documents
    const summary = await llm.complete(`
Summarize the following document in 2-3 paragraphs, preserving key facts:

${document}
`)

    // Return both summary and chunks
    return [
      { content: summary, type: 'summary', originalLength: tokens },
      ...chunkDocument(document, config),
    ]
  }

  return chunkDocument(document, config)
}

// ============================================================================
// Hybrid Retrieval (BM25 + Vector)
// ============================================================================

export interface HybridRetriever {
  retrieveBM25(query: string, k: number): Promise<ScoredDocument[]>
  retrieveVector(query: string, k: number): Promise<ScoredDocument[]>
  retrieveHybrid(query: string, k: number): Promise<ScoredDocument[]>
}

export class HybridRAG implements HybridRetriever {
  private bm25SearchFn: (query: string, k: number) => Promise<ScoredDocument[]>
  private vectorSearchFn: (query: string, k: number) => Promise<ScoredDocument[]>
  private embeddingClient: EmbeddingClient
  private mmrConfig: MMRConfig

  constructor(options: {
    bm25SearchFn: (query: string, k: number) => Promise<ScoredDocument[]>
    vectorSearchFn: (query: string, k: number) => Promise<ScoredDocument[]>
    embeddingClient: EmbeddingClient
    mmrConfig?: MMRConfig
  }) {
    this.bm25SearchFn = options.bm25SearchFn
    this.vectorSearchFn = options.vectorSearchFn
    this.embeddingClient = options.embeddingClient
    this.mmrConfig = options.mmrConfig ?? { lambda: 0.5, candidateMultiplier: 2 }
  }

  async retrieveBM25(query: string, k: number): Promise<ScoredDocument[]> {
    return this.bm25SearchFn(query, k)
  }

  async retrieveVector(query: string, k: number): Promise<ScoredDocument[]> {
    return this.vectorSearchFn(query, k)
  }

  async retrieveHybrid(query: string, k: number): Promise<ScoredDocument[]> {
    const multiplier = this.mmrConfig.candidateMultiplier

    // Get candidates from both retrieval methods
    const [bm25Results, vectorResults] = await Promise.all([
      this.bm25SearchFn(query, k * multiplier),
      this.vectorSearchFn(query, k * multiplier),
    ])

    // Reciprocal Rank Fusion
    const fused = reciprocalRankFusion([bm25Results, vectorResults], k * multiplier)

    // Apply MMR for diversity
    const queryEmbedding = await this.embeddingClient.embed(query)

    // Ensure all fused docs have embeddings
    const withEmbeddings = await Promise.all(
      fused.map(async (doc) => {
        if (doc.embedding) return doc
        const embedding = await this.embeddingClient.embed(doc.content)
        return { ...doc, embedding }
      })
    )

    return mmrSelect(withEmbeddings, queryEmbedding, k, this.mmrConfig.lambda)
  }
}

// ============================================================================
// REFRAG Pipeline
// ============================================================================

export interface REFRAGPipeline {
  // Ingestion
  ingestDocument(
    document: string,
    metadata?: Record<string, unknown>
  ): Promise<string[]>

  // Retrieval
  retrieve(query: string, k: number): Promise<ScoredDocument[]>
}

export function createREFRAGPipeline(options: {
  config: AdvancedRAGConfig
  llm: LLMClient
  embeddingClient: EmbeddingClient
  hybridRetriever: HybridRetriever
  storeDocFn: (doc: CompressedDocument, embedding: number[], metadata?: Record<string, unknown>) => Promise<string>
}): REFRAGPipeline {
  const { config, llm, embeddingClient, hybridRetriever, storeDocFn } = options

  return {
    async ingestDocument(document, metadata) {
      // Step 1: Compression
      const compressed = await compressDocument(document, config.compression, llm)

      // Store each chunk/summary
      const ids: string[] = []
      for (const doc of compressed) {
        const embedding = await embeddingClient.embed(doc.content)
        const id = await storeDocFn(doc, embedding, {
          ...metadata,
          type: doc.type,
          chunkIndex: doc.chunkIndex,
          originalLength: doc.originalLength,
        })
        ids.push(id)
      }

      return ids
    },

    async retrieve(query, k) {
      // Step 2: Expansion (HyDE)
      const queryVariants = await hydeExpand(query, llm, config.hyde)

      // Step 3: Multi-vector hybrid search
      const results = await multiVectorSearch(
        queryVariants,
        (q) => hybridRetriever.retrieveHybrid(q, k),
        k
      )

      return results
    },
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const defaultAdvancedRAGConfig: AdvancedRAGConfig = {
  compression: {
    maxChunkTokens: 800,
    overlapTokens: 100,
    summarizeThreshold: 4000, // ~16K characters
  },
  mmr: {
    lambda: 0.5, // Balanced relevance/diversity
    candidateMultiplier: 2,
  },
  hyde: {
    enabled: true,
    numHypotheticals: 2,
    temperatures: [0.7, 0.9],
  },
}
