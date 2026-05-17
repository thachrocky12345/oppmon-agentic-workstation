/**
 * Tests for the retrieval-metrics library.
 *
 * Uses Node's built-in test runner (``node --test``, available since
 * Node 20) plus ``tsx`` to load the TS module — keeps the evals package
 * dependency-free of Jest/Vitest.
 *
 * Run with:
 *   pnpm --filter @oppmon/evals exec node --import tsx --test scripts/lib/retrieval-metrics.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  precisionAtK,
  recallAtK,
  mrr,
  ndcgAtK,
  scoreRun,
  parseCitationKey,
  pairedWilcoxonP,
} from './retrieval-metrics.js';

describe('parseCitationKey', () => {
  it('strips [[ ]] markers and lowercases', () => {
    assert.equal(parseCitationKey('[[Doc_Alpha:Chk_Alpha_1]]'), 'doc_alpha:chk_alpha_1');
  });
  it('is idempotent on bare ids', () => {
    assert.equal(parseCitationKey('doc:chunk'), 'doc:chunk');
    assert.equal(parseCitationKey('  doc:chunk  '), 'doc:chunk');
  });
  it('handles half-bracketed input gracefully', () => {
    assert.equal(parseCitationKey('[[doc:chunk'), 'doc:chunk');
    assert.equal(parseCitationKey('doc:chunk]]'), 'doc:chunk');
  });
});

describe('precisionAtK', () => {
  it('canonical case: retrieved=[a,b,c,d,e], relevant=[b,d], k=5 → 0.4', () => {
    assert.equal(precisionAtK(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], 5), 0.4);
  });
  it('handles citation-marker form', () => {
    assert.equal(
      precisionAtK(['[[a]]', '[[b]]', '[[c]]'], ['[[b]]'], 3),
      1 / 3,
    );
  });
  it('k=0 returns 0', () => {
    assert.equal(precisionAtK(['a', 'b'], ['a'], 0), 0);
  });
  it('all relevant in top-k → 1.0', () => {
    assert.equal(precisionAtK(['a', 'b'], ['a', 'b'], 2), 1);
  });
});

describe('recallAtK', () => {
  it('canonical case: retrieved=[a,b,c,d,e], relevant=[b,d], k=5 → 1.0', () => {
    assert.equal(recallAtK(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], 5), 1);
  });
  it('partial recall', () => {
    assert.equal(recallAtK(['a', 'b'], ['a', 'c'], 2), 0.5);
  });
  it('k cuts off relevant', () => {
    assert.equal(recallAtK(['x', 'y', 'a'], ['a'], 2), 0);
    assert.equal(recallAtK(['x', 'y', 'a'], ['a'], 3), 1);
  });
  it('empty relevant returns 0', () => {
    assert.equal(recallAtK(['a'], [], 5), 0);
  });
});

describe('mrr', () => {
  it('retrieved=[a,b,c,d,e], relevant=[b,d] → 1/2', () => {
    assert.equal(mrr(['a', 'b', 'c', 'd', 'e'], ['b', 'd']), 0.5);
  });
  it('first hit at rank 1 → 1.0', () => {
    assert.equal(mrr(['a'], ['a']), 1);
  });
  it('no hit → 0', () => {
    assert.equal(mrr(['x', 'y'], ['a']), 0);
  });
  it('looks beyond k (no k argument)', () => {
    assert.equal(mrr(['x', 'y', 'a'], ['a']), 1 / 3);
  });
});

describe('ndcgAtK', () => {
  it('perfect ranking → 1.0', () => {
    // relevant=[a,b], retrieved=[a,b,c,d,e], k=5
    // DCG = 1/log2(2) + 1/log2(3) = 1 + 0.6309
    // IDCG = same → ndcg = 1
    assert.equal(ndcgAtK(['a', 'b', 'c', 'd', 'e'], ['a', 'b'], 5), 1);
  });
  it('canonical case: retrieved=[a,b,c,d,e], relevant=[b,d], k=5', () => {
    // DCG = 1/log2(3) + 1/log2(5) = 0.6309 + 0.4307 = 1.0616
    // IDCG = 1/log2(2) + 1/log2(3) = 1 + 0.6309 = 1.6309
    // ndcg = 0.651
    const result = ndcgAtK(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], 5);
    assert.ok(Math.abs(result - 0.6509) < 0.001, `expected ~0.6509, got ${result}`);
  });
  it('no relevant in top-k → 0', () => {
    assert.equal(ndcgAtK(['x', 'y', 'z'], ['a'], 3), 0);
  });
  it('empty relevant → 0', () => {
    assert.equal(ndcgAtK(['a'], [], 5), 0);
  });
});

describe('scoreRun', () => {
  it('returns all four metrics in one struct', () => {
    const score = scoreRun(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], 5);
    assert.equal(score.precision, 0.4);
    assert.equal(score.recall, 1);
    assert.equal(score.mrr, 0.5);
    assert.ok(Math.abs(score.ndcg - 0.6509) < 0.001);
  });
  it('defaults k to 5', () => {
    const s1 = scoreRun(['a', 'b', 'c'], ['a']);
    const s2 = scoreRun(['a', 'b', 'c'], ['a'], 5);
    assert.deepEqual(s1, s2);
  });
});

describe('pairedWilcoxonP', () => {
  it('returns NaN for n<10', () => {
    assert.ok(Number.isNaN(pairedWilcoxonP([1, 2, 3], [2, 3, 4])));
  });
  it('throws on length mismatch', () => {
    assert.throws(() => pairedWilcoxonP([1, 2], [1]));
  });
  it('large consistent improvement → small p', () => {
    // 12 paired observations, every after > before by 0.1.
    const before = Array(12).fill(0.5);
    const after = before.map((b) => b + 0.1);
    const p = pairedWilcoxonP(before, after);
    assert.ok(p < 0.01, `expected p<0.01, got ${p}`);
  });
  it('no change (all zero diffs) → NaN (no usable pairs)', () => {
    // All diffs are zero → dropped → n=0 → NaN per the contract.
    const before = Array(12).fill(0.5);
    const after = Array(12).fill(0.5);
    assert.ok(Number.isNaN(pairedWilcoxonP(before, after)));
  });
  it('symmetric noise → p near 1.0', () => {
    // 12 pairs: 6 up by 0.1, 6 down by 0.1 → W+ should be near n(n+1)/4.
    const before = Array(12).fill(0.5);
    const after = [
      0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4,
    ];
    const p = pairedWilcoxonP(before, after);
    assert.ok(p > 0.5, `expected p>0.5 for symmetric noise, got ${p}`);
  });
});
