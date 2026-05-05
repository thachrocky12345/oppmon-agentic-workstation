# Confidence Scoring

## Overview

Confidence scoring answers: "How trustworthy are these search results?"

A high-confidence score means:
- Query was clear and specific
- Multiple retrieval methods agree
- Results strongly match the query
- We have good data coverage

A low-confidence score suggests:
- Query was vague or ambiguous
- BM25 and vector disagree
- Top results are weak matches
- We lack data for this query type

## The 7 Signals

| Signal | Weight | Description |
|--------|--------|-------------|
| `intentClarity` | 0.15 | Was the query intent clear? |
| `filterCompleteness` | 0.15 | How specific were the filters? |
| `constraintMatch` | 0.15 | Do results match query constraints? |
| `topScore` | 0.20 | Quality of the best result |
| `margin` | 0.10 | Gap between #1 and #2 |
| `overlap` | 0.15 | BM25 ∩ vector agreement |
| `dataCoverage` | 0.10 | Do we have data for this query? |

## Implementation

```typescript
// apps/api/src/lib/search/confidence.ts

export interface ConfidenceWeights {
  intentClarity: number;
  filterCompleteness: number;
  constraintMatch: number;
  topScore: number;
  margin: number;
  overlap: number;
  dataCoverage: number;
}

export const DEFAULT_WEIGHTS: ConfidenceWeights = {
  intentClarity: 0.15,
  filterCompleteness: 0.15,
  constraintMatch: 0.15,
  topScore: 0.20,
  margin: 0.10,
  overlap: 0.15,
  dataCoverage: 0.10,
};

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
  // Heuristics:
  // - Short queries (1-2 words) are often ambiguous
  // - Question words suggest info-seeking, not search
  // - Commands ("find", "show", "get") are clear
  const intentClarity = computeIntentClarity(query);

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 2: Filter Completeness
  // ═══════════════════════════════════════════════════════════════════════════
  // How many searchable dimensions were specified?
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
  // Quality of the best result (already 0-1 from RRF)
  const topScore = results.length > 0 ? Math.min(results[0].score * 30, 1) : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal 5: Margin
  // ═══════════════════════════════════════════════════════════════════════════
  // Gap between #1 and #2 (high margin = clear winner)
  let margin = 0;
  if (results.length >= 2) {
    margin = Math.min((results[0].score - results[1].score) * 50, 1);
  } else if (results.length === 1) {
    // Single result: use its constraint quality as proxy
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

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

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
  let total = 3; // 3 possible filter dimensions

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
```

## Weight Presets

```typescript
// apps/api/src/lib/search/config.ts

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
   * Prioritize agreement between retrievers
   * Use when: You want BM25 and vector to agree strongly
   */
  agreement_focused: {
    intentClarity: 0.10,
    filterCompleteness: 0.10,
    constraintMatch: 0.15,
    topScore: 0.15,
    margin: 0.10,
    overlap: 0.30, // Boosted
    dataCoverage: 0.10,
  },

  /**
   * Prioritize result quality
   * Use when: You care most about the top result being good
   */
  quality_focused: {
    intentClarity: 0.10,
    filterCompleteness: 0.10,
    constraintMatch: 0.20, // Boosted
    topScore: 0.30, // Boosted
    margin: 0.15, // Boosted
    overlap: 0.05,
    dataCoverage: 0.10,
  },

  /**
   * Conservative (high confidence bar)
   * Use when: You only want to show results you're sure about
   */
  conservative: {
    intentClarity: 0.20, // Boosted
    filterCompleteness: 0.20, // Boosted
    constraintMatch: 0.15,
    topScore: 0.15,
    margin: 0.10,
    overlap: 0.10,
    dataCoverage: 0.10,
  },
};
```

## Using Confidence for Actions

```typescript
/**
 * Decide what action to take based on confidence
 */
export function decideAction(
  confidence: ConfidenceBreakdown,
  results: SearchResult[]
): {
  action: 'return_results' | 'return_with_refinement' | 'ask_clarification';
  results: SearchResult[];
  clarificationQuestion?: string;
} {
  const { value, weakestSignal } = confidence;

  // High confidence: return results directly
  if (value >= 0.80) {
    return {
      action: 'return_results',
      results,
    };
  }

  // Medium confidence: return partial results + ask for refinement
  if (value >= 0.55) {
    return {
      action: 'return_with_refinement',
      results: results.slice(0, 5), // Only top 5
      clarificationQuestion: getClarificationQuestion(weakestSignal),
    };
  }

  // Low confidence: ask clarification first
  return {
    action: 'ask_clarification',
    results: [],
    clarificationQuestion: getClarificationQuestion(weakestSignal),
  };
}

function getClarificationQuestion(weakestSignal: string): string {
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
```

## Debugging Confidence

```typescript
/**
 * Generate human-readable confidence explanation
 */
export function explainConfidence(breakdown: ConfidenceBreakdown): string {
  const lines: string[] = [];

  lines.push(`Overall confidence: ${(breakdown.value * 100).toFixed(0)}%`);
  lines.push('');
  lines.push('Signal breakdown:');

  const signals = [
    { name: 'Intent clarity', value: breakdown.intentClarity },
    { name: 'Filter completeness', value: breakdown.filterCompleteness },
    { name: 'Constraint match', value: breakdown.constraintMatch },
    { name: 'Top result quality', value: breakdown.topScore },
    { name: 'Result margin', value: breakdown.margin },
    { name: 'BM25/Vector overlap', value: breakdown.overlap },
    { name: 'Data coverage', value: breakdown.dataCoverage },
  ];

  for (const signal of signals) {
    const bar = '█'.repeat(Math.round(signal.value * 10));
    const spaces = '░'.repeat(10 - Math.round(signal.value * 10));
    const isWeakest = signal.name.toLowerCase().includes(
      breakdown.weakestSignal.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
    );
    const marker = isWeakest ? ' ← weakest' : '';
    lines.push(`  ${signal.name}: ${bar}${spaces} ${(signal.value * 100).toFixed(0)}%${marker}`);
  }

  return lines.join('\n');
}

// Example output:
// Overall confidence: 72%
//
// Signal breakdown:
//   Intent clarity: ████████░░ 80%
//   Filter completeness: ███░░░░░░░ 33% ← weakest
//   Constraint match: ███████░░░ 70%
//   Top result quality: ████████░░ 85%
//   Result margin: █████░░░░░ 50%
//   BM25/Vector overlap: ████████░░ 80%
//   Data coverage: ██████████ 100%
```

## Testing Confidence

```typescript
import { describe, it, expect } from 'vitest';
import { computeConfidence } from './confidence.js';

describe('confidence scoring', () => {
  it('returns high confidence when signals are strong', () => {
    const result = computeConfidence({
      query: 'find git commit skill',
      filters: { sourceType: 'skill' },
      bm25Ids: ['a', 'b', 'c', 'd', 'e'],
      vectorIds: ['a', 'b', 'c', 'd', 'f'], // 80% overlap
      results: [
        { id: 'a', score: 0.9 },
        { id: 'b', score: 0.5 },
      ],
      totalItems: 100,
    });

    expect(result.value).toBeGreaterThan(0.7);
  });

  it('returns low confidence when no results', () => {
    const result = computeConfidence({
      query: 'xyz',
      filters: {},
      bm25Ids: [],
      vectorIds: [],
      results: [],
      totalItems: 100,
    });

    expect(result.value).toBeLessThan(0.5);
  });

  it('identifies weakest signal', () => {
    const result = computeConfidence({
      query: 'x', // Very short = low intent clarity
      filters: { sourceType: 'skill' },
      bm25Ids: ['a', 'b', 'c'],
      vectorIds: ['a', 'b', 'c'],
      results: [
        { id: 'a', score: 0.9 },
        { id: 'b', score: 0.8 },
      ],
      totalItems: 100,
    });

    expect(result.weakestSignal).toBe('intentClarity');
  });
});
```
