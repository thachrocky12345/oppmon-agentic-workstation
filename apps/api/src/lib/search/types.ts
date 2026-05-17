// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Hybrid Search Types
 *
 * Type definitions for hybrid search (BM25 + vector + RRF)
 */

// ============================================================================
// Search Options & Results
// ============================================================================

export type SearchStrategy = 'vector' | 'bm25' | 'hybrid';

export interface HybridSearchOptions {
  /** Search query string */
  query: string;
  /** Source types to search: 'skill', 'mcp_server', 'agent', 'workflow' */
  sourceTypes: string[];
  /** Maximum results to return */
  topK?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Search strategy */
  strategy?: SearchStrategy;
  /** Scoring configuration preset */
  scoringPreset?: 'default' | 'keyword_focused' | 'semantic_focused' | 'agreement_focused';
  /** Custom scoring weights */
  scoringWeights?: Partial<ConfidenceWeights>;
}

export interface SearchResult {
  /** Unique identifier */
  id: string;
  /** Source type */
  sourceType: string;
  /** Original source record ID */
  sourceId: string;
  /** Text content */
  content: string;
  /** Individual scores from each retriever */
  scores: {
    bm25: number;
    vector: number;
    rrf: number;
    final: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface HybridSearchResponse {
  /** Ranked search results */
  results: SearchResult[];
  /** Confidence scoring breakdown */
  confidence: ConfidenceBreakdown;
  /** Debug information */
  debug: {
    bm25Count: number;
    vectorCount: number;
    mergedCount: number;
    queryExpansion: string[];
    strategy: SearchStrategy;
    timings: {
      bm25Ms: number;
      vectorMs: number;
      fusionMs: number;
      totalMs: number;
    };
  };
}

// ============================================================================
// BM25 Types
// ============================================================================

export interface BM25Result {
  id: string;
  sourceType: string;
  sourceId?: string;
  score: number;
}

export interface BM25SearchOptions {
  tenantId: string;
  query: string;
  sourceTypes: string[];
  topK?: number;
  minScore?: number;
}

// ============================================================================
// Vector Search Types
// ============================================================================

export interface VectorResult {
  id: string;
  sourceType: string;
  sourceId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  tenantId: string;
  query: string;
  sourceTypes?: string[];
  sourceIds?: string[];
  topK?: number;
  threshold?: number;
}

// ============================================================================
// RRF Types
// ============================================================================

export interface RankedItem {
  id: string;
  score: number;
}

export interface RRFResult {
  id: string;
  rrfScore: number;
  ranks: Record<string, number>;
}

// ============================================================================
// Confidence Scoring Types
// ============================================================================

export interface ConfidenceWeights {
  intentClarity: number;
  filterCompleteness: number;
  constraintMatch: number;
  topScore: number;
  margin: number;
  overlap: number;
  dataCoverage: number;
}

export interface ConfidenceBreakdown {
  intentClarity: number;
  filterCompleteness: number;
  constraintMatch: number;
  topScore: number;
  margin: number;
  overlap: number;
  dataCoverage: number;
  value: number;
  weakestSignal: string;
}

export interface ConfidenceInput {
  /** Original query */
  query: string;
  /** Extracted filters from query */
  filters: {
    sourceType?: string;
    scope?: string;
    tags?: string[];
  };
  /** BM25 result IDs (ordered by rank) */
  bm25Ids: string[];
  /** Vector result IDs (ordered by rank) */
  vectorIds: string[];
  /** Final merged results */
  results: Array<{
    id: string;
    score: number;
  }>;
  /** Total items in database for this query type */
  totalItems: number;
}
