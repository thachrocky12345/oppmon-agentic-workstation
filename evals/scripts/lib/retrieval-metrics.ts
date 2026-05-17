/**
 * Information-retrieval metrics for the TAG-CR contextual-retrieval A/B
 * eval (Phase 4 of the plan).
 *
 * All four functions take:
 *   - ``retrieved``: ordered list of returned doc/chunk ids (rank 1 first)
 *   - ``relevant``:  ground-truth list of ids that SHOULD have been retrieved
 *
 * Ids are opaque strings. Citation markers like ``[[doc:chunk]]`` are
 * normalized to ``doc:chunk`` via :func:`parseCitationKey` before being
 * compared, so callers can pass either shape and the metric still works.
 *
 * The shape matches what ``evals/corpus-questions.json`` already stores
 * in each grounded entry's ``expected_citations`` array. The matching
 * convention is exact-string equality after stripping the ``[[ ]]`` and
 * lowercasing — chunks are NOT considered partial matches.
 *
 * Why pure functions: the A/B driver calls these for every question on
 * both arms, plus the per-question Wilcoxon test in the report consumes
 * the raw arrays. No I/O here keeps the math testable and the failure
 * modes obvious.
 */

/** One full set of retrieval-quality scores for a single run. */
export interface RetrievalScore {
  /** Fraction of the top-k retrieved that are relevant. */
  precision: number;
  /** Fraction of the relevant set that appears in the top-k retrieved. */
  recall: number;
  /** Reciprocal rank of the first relevant hit (0 if none in retrieved). */
  mrr: number;
  /** Normalized Discounted Cumulative Gain at k. */
  ndcg: number;
}

/** Strip ``[[ ]]`` markers and lowercase. Idempotent on bare ids. */
export function parseCitationKey(raw: string): string {
  const inner = raw.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
  return inner.toLowerCase();
}

function normalize(items: readonly string[]): string[] {
  return items.map(parseCitationKey);
}

function take<T>(xs: readonly T[], k: number): T[] {
  if (k <= 0) return [];
  return xs.slice(0, k);
}

/** |retrieved[0..k] ∩ relevant| / k. Returns 0 when ``k`` is 0. */
export function precisionAtK(
  retrieved: readonly string[],
  relevant: readonly string[],
  k: number,
): number {
  if (k <= 0) return 0;
  const top = new Set(take(normalize(retrieved), k));
  const gold = new Set(normalize(relevant));
  let hits = 0;
  for (const id of top) if (gold.has(id)) hits++;
  return hits / k;
}

/** |retrieved[0..k] ∩ relevant| / |relevant|. Returns 0 when relevant is empty. */
export function recallAtK(
  retrieved: readonly string[],
  relevant: readonly string[],
  k: number,
): number {
  const gold = normalize(relevant);
  if (gold.length === 0) return 0;
  const top = new Set(take(normalize(retrieved), k));
  let hits = 0;
  for (const id of gold) if (top.has(id)) hits++;
  return hits / gold.length;
}

/**
 * Reciprocal rank of the first relevant hit. 0 if no relevant id appears
 * anywhere in ``retrieved`` (not just top-k — MRR ignores k by convention).
 */
export function mrr(
  retrieved: readonly string[],
  relevant: readonly string[],
): number {
  const gold = new Set(normalize(relevant));
  const ranked = normalize(retrieved);
  for (let i = 0; i < ranked.length; i++) {
    if (gold.has(ranked[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Binary-relevance NDCG@k. gain=1 for relevant, 0 otherwise; discount =
 * log2(rank+1). IDCG is computed assuming all relevant items are at
 * the top — i.e. perfect ranking yields ndcg=1.0 even when |relevant| < k.
 */
export function ndcgAtK(
  retrieved: readonly string[],
  relevant: readonly string[],
  k: number,
): number {
  if (k <= 0) return 0;
  const gold = new Set(normalize(relevant));
  if (gold.size === 0) return 0;
  const top = take(normalize(retrieved), k);
  let dcg = 0;
  for (let i = 0; i < top.length; i++) {
    if (gold.has(top[i])) dcg += 1 / Math.log2(i + 2);
  }
  // IDCG: place min(k, |gold|) relevant items at the front.
  const idealHits = Math.min(k, gold.size);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

/** Compute all four metrics in one pass. */
export function scoreRun(
  retrieved: readonly string[],
  relevant: readonly string[],
  k = 5,
): RetrievalScore {
  return {
    precision: precisionAtK(retrieved, relevant, k),
    recall: recallAtK(retrieved, relevant, k),
    mrr: mrr(retrieved, relevant),
    ndcg: ndcgAtK(retrieved, relevant, k),
  };
}

/**
 * Paired Wilcoxon signed-rank test (two-sided), normal approximation for
 * n >= 10. Returns the approximate p-value; callers test against the
 * usual alpha=0.05 ship gate.
 *
 * Ties are dropped per the standard rule. For n < 10 the normal-
 * approximation overstates significance, so the function returns NaN —
 * callers must report "n<10, p-value unreliable" instead of a number.
 *
 * Reference: Hollander & Wolfe, Nonparametric Statistical Methods (2nd
 * ed.), §3.1.
 */
export function pairedWilcoxonP(
  before: readonly number[],
  after: readonly number[],
): number {
  if (before.length !== after.length) {
    throw new Error('pairedWilcoxonP: input arrays must be the same length');
  }
  // Differences, drop zeros (tied pairs).
  const diffs: number[] = [];
  for (let i = 0; i < before.length; i++) {
    const d = after[i] - before[i];
    if (d !== 0) diffs.push(d);
  }
  const n = diffs.length;
  if (n < 10) return Number.NaN;

  // Rank absolute differences, average ties.
  const indexed = diffs.map((d, i) => ({ abs: Math.abs(d), sign: Math.sign(d), i }));
  indexed.sort((a, b) => a.abs - b.abs);
  const ranks = new Array(n).fill(0);
  let j = 0;
  while (j < n) {
    let k = j;
    while (k + 1 < n && indexed[k + 1].abs === indexed[j].abs) k++;
    const avgRank = (j + k) / 2 + 1; // 1-based, averaged
    for (let m = j; m <= k; m++) ranks[indexed[m].i] = avgRank;
    j = k + 1;
  }

  // W+ = sum of ranks where diff > 0.
  let wPlus = 0;
  for (let i = 0; i < n; i++) if (diffs[i] > 0) wPlus += ranks[i];

  // Normal approximation: mean = n(n+1)/4, var = n(n+1)(2n+1)/24.
  const mean = (n * (n + 1)) / 4;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24;
  if (variance === 0) return 1; // all diffs equal magnitude; degenerate
  const z = (wPlus - mean) / Math.sqrt(variance);
  // Two-sided p-value from standard normal.
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/** Standard normal CDF via Abramowitz & Stegun 26.2.17 approximation. */
function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * ax);
  const d = 0.3989422804014327 * Math.exp(-(ax * ax) / 2);
  const p =
    d *
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 0.5 + sign * (0.5 - p);
}
