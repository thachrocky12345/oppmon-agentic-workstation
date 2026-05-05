# Reciprocal Rank Fusion (RRF)

## Overview

Reciprocal Rank Fusion is a method to combine multiple ranked lists without needing to calibrate scores across different retrieval systems. It was introduced by Cormack et al. at SIGIR 2009.

The key insight: **ranks are comparable even when scores aren't**.

## Algorithm

For each document `d`, compute:

```
RRF_score(d) = Σ 1/(k + rank(d, list))
               for each ranked list
```

Where:
- `k` is a constant (typically 60) that dampens the contribution of high ranks
- `rank(d, list)` is the 1-based position of document `d` in the list

### Why k = 60?

The constant `k=60` is empirically chosen to:
- Prevent top-1 results from dominating (without `k`, rank 1 would contribute 1.0)
- Allow mid-ranked documents that appear in multiple lists to compete
- Remain stable across different list lengths

## TypeScript Implementation

```typescript
// apps/api/src/lib/search/rrf.ts

export interface RankedItem {
  id: string;
  score: number;
}

export interface RRFResult {
  id: string;
  rrfScore: number;
  ranks: Record<string, number>; // list name → rank
}

/**
 * Merge multiple ranked lists using Reciprocal Rank Fusion
 *
 * @param lists - Object mapping list names to ranked results
 * @param k - RRF constant (default: 60)
 * @param topN - Maximum results to return
 */
export function reciprocalRankFusion(
  lists: Record<string, RankedItem[]>,
  k: number = 60,
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
 */
export function rrfTwoLists(
  bm25Results: RankedItem[],
  vectorResults: RankedItem[],
  k: number = 60
): Array<{ id: string; rrfScore: number }> {
  const scores = new Map<string, number>();

  // Process BM25 results
  for (let rank = 0; rank < bm25Results.length; rank++) {
    const { id } = bm25Results[rank];
    scores.set(id, (scores.get(id) || 0) + 1 / (k + rank + 1));
  }

  // Process vector results
  for (let rank = 0; rank < vectorResults.length; rank++) {
    const { id } = vectorResults[rank];
    scores.set(id, (scores.get(id) || 0) + 1 / (k + rank + 1));
  }

  return Array.from(scores.entries())
    .map(([id, rrfScore]) => ({ id, rrfScore }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}
```

## Visual Example

Given two ranked lists for query "git commit":

```
BM25 Results:           Vector Results:
1. skill_git_commit     1. skill_version_control
2. skill_git_push       2. skill_git_commit
3. skill_git_branch     3. skill_source_control
4. skill_version_ctrl   4. skill_git_push
5. skill_code_review    5. skill_collaboration
```

RRF Scores (k=60):
```
skill_git_commit:
  BM25 rank 1:   1/(60+1) = 0.0164
  Vector rank 2: 1/(60+2) = 0.0161
  Total: 0.0325 ← HIGHEST (in both lists)

skill_git_push:
  BM25 rank 2:   1/(60+2) = 0.0161
  Vector rank 4: 1/(60+4) = 0.0156
  Total: 0.0317

skill_version_control:
  Vector rank 1: 1/(60+1) = 0.0164
  Total: 0.0164 (only in vector)

skill_git_branch:
  BM25 rank 3:   1/(60+3) = 0.0159
  Total: 0.0159 (only in BM25)
```

Final Ranking:
1. skill_git_commit (0.0325) ← Boosted because in BOTH lists
2. skill_git_push (0.0317)
3. skill_version_control (0.0164)
4. skill_git_branch (0.0159)
5. skill_source_control (0.0158)

## RRF Properties

### Advantages

1. **No score calibration needed**: BM25 scores (0-10+) and cosine similarity (0-1) don't need normalization
2. **Handles missing documents**: If a doc isn't in a list, it just doesn't get that list's contribution
3. **Rewards agreement**: Documents in multiple lists rank higher
4. **Stable**: Small score differences don't cause rank volatility

### Limitations

1. **Ignores score magnitude**: A document with BM25 score 10.0 vs 0.1 are treated equally if same rank
2. **Sensitive to list length**: Including more candidates from one retriever biases toward it
3. **k selection**: Different k values suit different use cases

## Tuning k

| k Value | Effect |
|---------|--------|
| 1-10 | Top ranks dominate heavily |
| 60 | Standard, balanced (recommended) |
| 100+ | More equal contribution across ranks |

```typescript
// Experiment with different k values
const results60 = reciprocalRankFusion(lists, 60);
const results20 = reciprocalRankFusion(lists, 20);
const results100 = reciprocalRankFusion(lists, 100);
```

## Advanced: Weighted RRF

Assign different weights to different retrievers:

```typescript
export function weightedRRF(
  lists: Array<{ name: string; items: RankedItem[]; weight: number }>,
  k: number = 60
): RRFResult[] {
  const scores = new Map<string, number>();

  for (const { items, weight } of lists) {
    for (let rank = 0; rank < items.length; rank++) {
      const { id } = items[rank];
      const contribution = weight * (1 / (k + rank + 1));
      scores.set(id, (scores.get(id) || 0) + contribution);
    }
  }

  return Array.from(scores.entries())
    .map(([id, rrfScore]) => ({ id, rrfScore }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}

// Usage: weight BM25 higher for technical queries
const results = weightedRRF([
  { name: 'bm25', items: bm25Results, weight: 1.5 },
  { name: 'vector', items: vectorResults, weight: 1.0 },
]);
```

## Testing RRF

```typescript
import { describe, it, expect } from 'vitest';
import { rrfTwoLists, reciprocalRankFusion } from './rrf.js';

describe('RRF', () => {
  it('ranks documents in both lists higher', () => {
    const bm25 = [
      { id: 'A', score: 1.0 },
      { id: 'B', score: 0.8 },
    ];
    const vector = [
      { id: 'A', score: 0.95 },
      { id: 'C', score: 0.9 },
    ];

    const results = rrfTwoLists(bm25, vector);

    // A is in both lists, should be first
    expect(results[0].id).toBe('A');
    // A's score should be higher than B or C alone
    expect(results[0].rrfScore).toBeGreaterThan(results[1].rrfScore);
  });

  it('handles empty lists', () => {
    const results = rrfTwoLists([], [{ id: 'A', score: 1.0 }]);

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('A');
  });

  it('handles disjoint lists', () => {
    const bm25 = [{ id: 'A', score: 1.0 }];
    const vector = [{ id: 'B', score: 1.0 }];

    const results = rrfTwoLists(bm25, vector);

    // Both should have same RRF score (both rank 1 in their list)
    expect(results[0].rrfScore).toBeCloseTo(results[1].rrfScore, 5);
  });
});
```

## References

- [Cormack et al., 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) - Original RRF paper
- [Elasticsearch RRF](https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html) - Elastic's implementation
- [Pinecone Hybrid Search](https://www.pinecone.io/learn/hybrid-search-intro/) - Modern hybrid search patterns
