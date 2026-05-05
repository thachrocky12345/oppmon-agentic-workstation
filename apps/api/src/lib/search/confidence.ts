/**
 * Confidence Scoring
 *
 * 7-signal confidence scoring for search results.
 * Answers: "How trustworthy are these search results?"
 */

import {
  ConfidenceWeights,
  ConfidenceBreakdown,
  ConfidenceInput,
} from './types.js';
import { DEFAULT_WEIGHTS } from './config.js';

// ============================================================================
// Main Confidence Computation
// ============================================================================

/**
 * Compute confidence breakdown for search results
 */
export function computeConfidence(
  input: ConfidenceInput,
  weights: ConfidenceWeights = DEFAULT_WEIGHTS
): ConfidenceBreakdown {
  const {
    query,
    filters,
    bm25Ids,
    vectorIds,
    results,
    totalItems,
  } = input;

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 1: Intent Clarity
  // ═══════════════════════════════════════════════════════════════════════════
  const intentClarity = computeIntentClarity(query);

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 2: Filter Completeness
  // ═══════════════════════════════════════════════════════════════════════════
  const filterCompleteness = computeFilterCompleteness(filters);

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 3: Constraint Match
  // ═══════════════════════════════════════════════════════════════════════════
  // Average score of top-5 results
  const constraintMatch = results.length > 0
    ? results.slice(0, 5).reduce((sum, r) => sum + r.score, 0) / Math.min(results.length, 5)
    : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 4: Top Score
  // ═══════════════════════════════════════════════════════════════════════════
  // Quality of the best result (scale RRF score to 0-1)
  // RRF scores are typically small (0.01-0.03 for top results)
  const topScore = results.length > 0 ? Math.min(results[0].score * 30, 1) : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 5: Margin
  // ═══════════════════════════════════════════════════════════════════════════
  // Gap between #1 and #2 (high margin = clear winner)
  let margin = 0;
  if (results.length >= 2) {
    margin = Math.min((results[0].score - results[1].score) * 50, 1);
  } else if (results.length === 1) {
    // Single result: use its quality as proxy
    margin = constraintMatch;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 6: Overlap (Jaccard)
  // ═══════════════════════════════════════════════════════════════════════════
  // Agreement between BM25 and vector top-10
  const overlap = computeJaccardOverlap(
    bm25Ids.slice(0, 10),
    vectorIds.slice(0, 10)
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 7: Data Coverage
  // ═══════════════════════════════════════════════════════════════════════════
  // Do we have enough items to answer this query?
  const dataCoverage = computeDataCoverage(results.length, totalItems);

  // ═══════════════════════════════════════════════════════════════════════════
  // Compute Weighted Sum
  // ═══════════════════════════════════════════════════════════════════════════
  const breakdown = {
    intentClarity,
    filterCompleteness,
    constraintMatch,
    topScore,
    margin,
    overlap,
    dataCoverage,
  };

  const value = Math.min(
    weights.intentClarity * intentClarity +
    weights.filterCompleteness * filterCompleteness +
    weights.constraintMatch * constraintMatch +
    weights.topScore * topScore +
    weights.margin * margin +
    weights.overlap * overlap +
    weights.dataCoverage * dataCoverage,
    1.0
  );

  // Find weakest signal
  const weakestSignal = Object.entries(breakdown)
    .sort((a, b) => a[1] - b[1])[0][0];

  return {
    ...breakdown,
    value: Math.round(value * 1000) / 1000,
    weakestSignal,
  };
}

// ============================================================================
// Signal Computation Helpers
// ============================================================================

function computeIntentClarity(query: string): number {
  const words = query.trim().split(/\s+/);

  // Very short queries are ambiguous
  if (words.length === 1) return 0.4;
  if (words.length === 2) return 0.6;

  // Question words suggest info-seeking (less clear for search)
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
  if (questionWords.some(q => words[0].toLowerCase() === q)) {
    return 0.5;
  }

  // Command words are clear
  const commandWords = ['find', 'search', 'show', 'get', 'list', 'lookup'];
  if (commandWords.some(c => words[0].toLowerCase() === c)) {
    return 0.9;
  }

  // Default: moderate clarity
  return 0.7;
}

function computeFilterCompleteness(filters: {
  sourceType?: string;
  scope?: string;
  tags?: string[];
}): number {
  let score = 0;
  const total = 3; // 3 possible filter dimensions

  if (filters.sourceType) score += 1;
  if (filters.scope) score += 1;
  if (filters.tags && filters.tags.length > 0) score += 1;

  return score / total;
}

function computeJaccardOverlap(setA: string[], setB: string[]): number {
  const a = new Set(setA);
  const b = new Set(setB);

  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;

  return union > 0 ? intersection / union : 0;
}

function computeDataCoverage(resultCount: number, totalItems: number): number {
  // No results at all
  if (resultCount === 0) return 0;

  // Few results but some
  if (resultCount <= 2) return 0.5;

  // Good number of results
  if (resultCount <= 5) return 0.75;

  // Many results
  if (resultCount >= 10) return 1.0;

  // Linear scale between 5 and 10
  return 0.75 + (resultCount - 5) * 0.05;
}

// ============================================================================
// Debugging & Explanation
// ============================================================================

/**
 * Generate human-readable confidence explanation
 */
export function explainConfidence(breakdown: ConfidenceBreakdown): string {
  const lines: string[] = [];

  lines.push(`Overall confidence: ${(breakdown.value * 100).toFixed(0)}%`);
  lines.push('');
  lines.push('Signal breakdown:');

  const signals = [
    { name: 'Intent clarity', value: breakdown.intentClarity, key: 'intentClarity' },
    { name: 'Filter completeness', value: breakdown.filterCompleteness, key: 'filterCompleteness' },
    { name: 'Constraint match', value: breakdown.constraintMatch, key: 'constraintMatch' },
    { name: 'Top result quality', value: breakdown.topScore, key: 'topScore' },
    { name: 'Result margin', value: breakdown.margin, key: 'margin' },
    { name: 'BM25/Vector overlap', value: breakdown.overlap, key: 'overlap' },
    { name: 'Data coverage', value: breakdown.dataCoverage, key: 'dataCoverage' },
  ];

  for (const signal of signals) {
    const bar = '█'.repeat(Math.round(signal.value * 10));
    const spaces = '░'.repeat(10 - Math.round(signal.value * 10));
    const isWeakest = signal.key === breakdown.weakestSignal;
    const marker = isWeakest ? ' ← weakest' : '';
    lines.push(`  ${signal.name}: ${bar}${spaces} ${(signal.value * 100).toFixed(0)}%${marker}`);
  }

  return lines.join('\n');
}

/**
 * Get a simple description of confidence level
 */
export function getConfidenceLevel(value: number): 'high' | 'medium' | 'low' {
  if (value >= 0.80) return 'high';
  if (value >= 0.55) return 'medium';
  return 'low';
}
