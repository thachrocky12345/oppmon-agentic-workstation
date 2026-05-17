// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Hybrid Search Library
 *
 * Combines BM25 (lexical) + Vector (semantic) search using RRF fusion
 */

// Export all types
export * from './types.js';

// Export configuration
export * from './config.js';

// Export individual modules
export { bm25Search, bm25SearchSingle, bm25SearchWithExpansion, hasSearchVector, updateSearchVector } from './bm25.js';
export { vectorSearch, vectorSearchWithEmbedding, getEmbeddingCount } from './vector.js';
export { reciprocalRankFusion, rrfTwoLists, weightedRRF, computeJaccardOverlap, getAgreedItems, getDisagreedItems } from './rrf.js';
export { expandQuery, getCanonical, getSynonyms, SKILL_TAXONOMY, MCP_TAXONOMY, TOOL_TAXONOMY } from './taxonomy.js';
export { computeConfidence, explainConfidence, getConfidenceLevel } from './confidence.js';
