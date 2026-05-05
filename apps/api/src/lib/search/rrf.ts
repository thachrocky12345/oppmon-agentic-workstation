/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Merge multiple ranked lists without needing to calibrate scores.
 * RRF_score(d) = Σ 1/(k + rank(d, list)) for each list
 *
 * Reference: Cormack et al., SIGIR 2009
 */

import { RankedItem, RRFResult } from './types.js';
import { RRF_K } from './config.js';

// ============================================================================
// Main RRF Functions
// ============================================================================

/**
 * Merge multiple ranked lists using Reciprocal Rank Fusion
 *
 * @param lists - Object mapping list names to ranked results
 * @param k - RRF constant (default: 60)
 * @param topN - Maximum results to return
 */
export function reciprocalRankFusion(
  lists: Record<string, RankedItem[]>,
  k: number = RRF_K,
  topN: number = 100
): RRFResult[] {
  const scores = new Map<string, { score: number; ranks: Record<string, number> }>();

  for (const [listName, items] of Object.entries(lists)) {
    for (let rank = 0; rank < items.length; rank++) {
      const { id } = items[rank];
      const contribution = 1 / (k + rank + 1); // rank is 0-based, formula uses 1-based

      const existing = scores.get(id) || { score: 0, ranks: {} };
      existing.score += contribution;
      existing.ranks[listName] = rank + 1; // Store 1-based rank
      scores.set(id, existing);
    }
  }

  return Array.from(scores.entries())
    .map(([id, { score, ranks }]) => ({
      id,
      rrfScore: score,
      ranks,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topN);
}

/**
 * Simple RRF for two lists (BM25 + vector)
 * More efficient than the generic version when only using two lists
 */
export function rrfTwoLists(
  bm25Results: RankedItem[],
  vectorResults: RankedItem[],
  k: number = RRF_K
): Array<{ id: string; rrfScore: number; bm25Rank?: number; vectorRank?: number }> {
  const scores = new Map<string, { score: number; bm25Rank?: number; vectorRank?: number }>();

  // Process BM25 results
  for (let rank = 0; rank < bm25Results.length; rank++) {
    const { id } = bm25Results[rank];
    const existing = scores.get(id) || { score: 0 };
    existing.score += 1 / (k + rank + 1);
    existing.bm25Rank = rank + 1;
    scores.set(id, existing);
  }

  // Process vector results
  for (let rank = 0; rank < vectorResults.length; rank++) {
    const { id } = vectorResults[rank];
    const existing = scores.get(id) || { score: 0 };
    existing.score += 1 / (k + rank + 1);
    existing.vectorRank = rank + 1;
    scores.set(id, existing);
  }

  return Array.from(scores.entries())
    .map(([id, { score, bm25Rank, vectorRank }]) => ({
      id,
      rrfScore: score,
      bm25Rank,
      vectorRank,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * Weighted RRF - assign different weights to different retrievers
 */
export function weightedRRF(
  lists: Array<{ name: string; items: RankedItem[]; weight: number }>,
  k: number = RRF_K,
  topN: number = 100
): RRFResult[] {
  const scores = new Map<string, { score: number; ranks: Record<string, number> }>();

  for (const { name, items, weight } of lists) {
    for (let rank = 0; rank < items.length; rank++) {
      const { id } = items[rank];
      const contribution = weight * (1 / (k + rank + 1));

      const existing = scores.get(id) || { score: 0, ranks: {} };
      existing.score += contribution;
      existing.ranks[name] = rank + 1;
      scores.set(id, existing);
    }
  }

  return Array.from(scores.entries())
    .map(([id, { score, ranks }]) => ({
      id,
      rrfScore: score,
      ranks,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topN);
}

// ============================================================================
// Analysis Helpers
// ============================================================================

/**
 * Compute Jaccard overlap between two result sets
 */
export function computeJaccardOverlap(setA: string[], setB: string[]): number {
  const a = new Set(setA);
  const b = new Set(setB);

  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Get items that appear in both lists (agreement)
 */
export function getAgreedItems(
  listA: RankedItem[],
  listB: RankedItem[],
  topK: number = 10
): string[] {
  const setA = new Set(listA.slice(0, topK).map(item => item.id));
  const setB = new Set(listB.slice(0, topK).map(item => item.id));

  return [...setA].filter(id => setB.has(id));
}

/**
 * Get items unique to each list
 */
export function getDisagreedItems(
  listA: RankedItem[],
  listB: RankedItem[],
  topK: number = 10
): { onlyInA: string[]; onlyInB: string[] } {
  const setA = new Set(listA.slice(0, topK).map(item => item.id));
  const setB = new Set(listB.slice(0, topK).map(item => item.id));

  return {
    onlyInA: [...setA].filter(id => !setB.has(id)),
    onlyInB: [...setB].filter(id => !setA.has(id)),
  };
}
