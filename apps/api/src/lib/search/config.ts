/**
 * Hybrid Search Configuration
 *
 * Scoring weight presets and configuration
 */

import { ConfidenceWeights } from './types.js';

// ============================================================================
// Default Weights
// ============================================================================

export const DEFAULT_WEIGHTS: ConfidenceWeights = {
  intentClarity: 0.15,
  filterCompleteness: 0.15,
  constraintMatch: 0.15,
  topScore: 0.20,
  margin: 0.10,
  overlap: 0.15,
  dataCoverage: 0.10,
};

// ============================================================================
// Weight Presets
// ============================================================================

export const CONFIDENCE_PRESETS: Record<string, ConfidenceWeights> = {
  /**
   * Default balanced configuration
   */
  default: {
    intentClarity: 0.15,
    filterCompleteness: 0.15,
    constraintMatch: 0.15,
    topScore: 0.20,
    margin: 0.10,
    overlap: 0.15,
    dataCoverage: 0.10,
  },

  /**
   * Prioritize keyword/exact matches
   * Use when: Technical searches with exact names/identifiers
   */
  keyword_focused: {
    intentClarity: 0.10,
    filterCompleteness: 0.15,
    constraintMatch: 0.20,
    topScore: 0.25,
    margin: 0.15,
    overlap: 0.05,
    dataCoverage: 0.10,
  },

  /**
   * Prioritize semantic/conceptual matches
   * Use when: Natural language queries, conceptual similarity
   */
  semantic_focused: {
    intentClarity: 0.15,
    filterCompleteness: 0.10,
    constraintMatch: 0.15,
    topScore: 0.20,
    margin: 0.05,
    overlap: 0.25,
    dataCoverage: 0.10,
  },

  /**
   * Prioritize agreement between BM25 and vector
   * Use when: You want high confidence that results are correct
   */
  agreement_focused: {
    intentClarity: 0.10,
    filterCompleteness: 0.10,
    constraintMatch: 0.15,
    topScore: 0.15,
    margin: 0.10,
    overlap: 0.30,
    dataCoverage: 0.10,
  },

  /**
   * Conservative (high confidence bar)
   * Use when: You only want to show results you're sure about
   */
  conservative: {
    intentClarity: 0.20,
    filterCompleteness: 0.20,
    constraintMatch: 0.15,
    topScore: 0.15,
    margin: 0.10,
    overlap: 0.10,
    dataCoverage: 0.10,
  },

  /**
   * Quality focused
   * Use when: You care most about the top result being good
   */
  quality_focused: {
    intentClarity: 0.10,
    filterCompleteness: 0.10,
    constraintMatch: 0.20,
    topScore: 0.30,
    margin: 0.15,
    overlap: 0.05,
    dataCoverage: 0.10,
  },
};

// ============================================================================
// RRF Configuration
// ============================================================================

/** RRF constant - dampens contribution of high ranks */
export const RRF_K = 60;

// ============================================================================
// BM25 Configuration
// ============================================================================

/** Normalization option for ts_rank_cd (32 = divide by itself + 1) */
export const BM25_NORMALIZATION = 32;

/** Minimum BM25 score to include in results */
export const BM25_MIN_SCORE = 0.001;

// ============================================================================
// Confidence Thresholds
// ============================================================================

export const CONFIDENCE_THRESHOLDS = {
  /** Return results directly */
  high: 0.80,
  /** Return results + suggest refinement */
  medium: 0.55,
  /** Ask clarification first */
  low: 0.55,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get weights for a preset, merging with any custom overrides
 */
export function getWeights(
  preset: string = 'default',
  overrides?: Partial<ConfidenceWeights>
): ConfidenceWeights {
  const baseWeights = CONFIDENCE_PRESETS[preset] || DEFAULT_WEIGHTS;

  if (!overrides) {
    return baseWeights;
  }

  return {
    ...baseWeights,
    ...overrides,
  };
}

/**
 * Decide what action to take based on confidence
 */
export function decideAction(
  confidence: number
): 'return_results' | 'return_with_refinement' | 'ask_clarification' {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) {
    return 'return_results';
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) {
    return 'return_with_refinement';
  }
  return 'ask_clarification';
}

/**
 * Get clarification question based on weakest signal
 */
export function getClarificationQuestion(weakestSignal: string): string {
  const questions: Record<string, string> = {
    intentClarity: 'Could you be more specific about what you\'re looking for?',
    filterCompleteness: 'Would you like to filter by type (skill, MCP server, tool)?',
    constraintMatch: 'None of the results seem to match well. Can you rephrase?',
    topScore: 'The results aren\'t very strong matches. Can you provide more details?',
    margin: 'Multiple results match equally. Which aspect is most important?',
    overlap: 'Keyword and semantic search disagree. Are you looking for exact terms or concepts?',
    dataCoverage: 'We don\'t have much data for this query. Try a broader search?',
  };

  return questions[weakestSignal] || 'Can you provide more details?';
}
