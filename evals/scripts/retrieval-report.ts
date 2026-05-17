/**
 * TAG-CR — Retrieval-quality report generator.
 *
 *   pnpm tsx evals/scripts/retrieval-report.ts --run contextual-AB-pilot-001
 *   pnpm tsx evals/scripts/retrieval-report.ts --run contextual-AB-pilot-001 --out report.md
 *
 * Reads `evals/runs/<run-id>/{per-question.json, delta.json, manifest.json}`
 * (produced by `contextual-retrieval-eval.ts`) and emits a Markdown
 * report covering:
 *
 *   - Header     — n, k, ISO timestamps, endpoint, paired-Wilcoxon
 *                  significance summary at α=0.05.
 *   - Per-question table — qid | baseline P@k | contextual P@k | Δ | ...
 *                          for both retrieved-set and cited-set views.
 *   - Aggregate footer — mean Δ per metric, wins (Δ ≥ 0.1), regressions
 *                        (Δ ≤ -0.1), and the headline "ship / don't ship /
 *                        inconclusive" recommendation.
 *
 * The aggregate footer is purely advisory — the final ship/no-ship call
 * lives in docs/jira/TAG-CR/contextual-retrieval-eval.md.
 *
 * Default output: `evals/reports/contextual-retrieval-<run-id>.md`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, ensureDir, runDir } from './lib/paths.js';
import type { RetrievalScore } from './lib/retrieval-metrics.js';

interface ArmResult {
  qid: string;
  scoreRetrieved: RetrievalScore;
  scoreCited: RetrievalScore;
  retrieved: string[];
  cited: string[];
  error?: string;
}

interface PerQuestion {
  qid: string;
  expected: string[];
  baseline: ArmResult;
  contextual: ArmResult;
}

interface DeltaArm {
  precision: number;
  recall: number;
  mrr: number;
  ndcg: number;
}
interface DeltaSection {
  baseline: DeltaArm;
  contextual: DeltaArm;
  wilcoxon_p: DeltaArm;
}
interface DeltaFile {
  n: number;
  k: number;
  retrieved: DeltaSection;
  cited: DeltaSection;
}

interface ManifestFile {
  run_id: string;
  started_at: string;
  finished_at: string;
  endpoint: string;
  k: number;
  flags: {
    enable_tools: boolean;
    web_fallback: boolean;
    use_contextual_retrieval_per_arm: { baseline: boolean; contextual: boolean };
  };
  question_ids: string[];
  notes?: string;
}

interface CliArgs {
  runId: string;
  outPath: string;
  winThreshold: number;
  regressionThreshold: number;
}

function parseArgs(argv: string[]): CliArgs {
  let runId = '';
  let outPath = '';
  let winThreshold = 0.1;
  let regressionThreshold = -0.1;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--run':
        runId = argv[++i];
        break;
      case '--out':
        outPath = argv[++i];
        break;
      case '--win-threshold':
        winThreshold = parseFloat(argv[++i]);
        break;
      case '--regression-threshold':
        regressionThreshold = parseFloat(argv[++i]);
        break;
      case '-h':
      case '--help':
        console.log(`Usage: pnpm tsx evals/scripts/retrieval-report.ts --run <run-id> [options]
  --run NAME                    run directory under evals/runs/ (e.g. contextual-AB-pilot-001)
  --out PATH                    output markdown path (default evals/reports/contextual-retrieval-<run-id>.md)
  --win-threshold N             |Δ| ≥ N counts as a win (default 0.1)
  --regression-threshold N      Δ ≤ N counts as a regression (default -0.1)
`);
        process.exit(0);
    }
  }
  if (!runId) {
    console.error('× --run is required');
    process.exit(1);
  }
  return { runId, outPath, winThreshold, regressionThreshold };
}

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

function fmtDelta(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return 'n/a';
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

function fmtP(p: number): string {
  if (!Number.isFinite(p)) return 'n<10';
  if (p < 0.001) return '<0.001';
  return p.toFixed(3);
}

function classifyDecision(
  delta: DeltaFile,
  args: CliArgs,
): { verdict: 'ship' | 'do-not-ship' | 'inconclusive'; reasoning: string } {
  const r = delta.retrieved;
  const dP = r.contextual.precision - r.baseline.precision;
  const dM = r.contextual.mrr - r.baseline.mrr;
  const pP = r.wilcoxon_p.precision;
  const pM = r.wilcoxon_p.mrr;
  const significant = (p: number) => Number.isFinite(p) && p < 0.05;

  if (dP <= args.regressionThreshold || dM <= args.regressionThreshold) {
    return {
      verdict: 'do-not-ship',
      reasoning:
        `Contextual arm regressed against baseline by more than ` +
        `${Math.abs(args.regressionThreshold)} on at least one headline metric ` +
        `(ΔP@${delta.k}=${fmtDelta(dP)}, ΔMRR=${fmtDelta(dM)}).`,
    };
  }

  if (dP >= args.winThreshold && significant(pP)) {
    return {
      verdict: 'ship',
      reasoning:
        `Contextual arm wins on precision@${delta.k} by ${fmtDelta(dP)} ` +
        `(paired Wilcoxon p=${fmtP(pP)}) over n=${delta.n} questions.`,
    };
  }
  if (dM >= args.winThreshold && significant(pM)) {
    return {
      verdict: 'ship',
      reasoning:
        `Contextual arm wins on MRR by ${fmtDelta(dM)} ` +
        `(paired Wilcoxon p=${fmtP(pM)}) over n=${delta.n} questions.`,
    };
  }

  return {
    verdict: 'inconclusive',
    reasoning:
      `No metric crossed the ship threshold of ${args.winThreshold} with ` +
      `p<0.05. ΔP@${delta.k}=${fmtDelta(dP)} (p=${fmtP(pP)}), ` +
      `ΔMRR=${fmtDelta(dM)} (p=${fmtP(pM)}). ` +
      (delta.n < 10
        ? `n=${delta.n} is below the n≥10 threshold for the normal ` +
          `approximation; expand the corpus question set before deciding.`
        : `Consider larger n, reranker integration (Anthropic's full ` +
          `-67% retrieval-failure reduction), or different chunk size.`),
  };
}

function renderPerQuestionTable(rows: PerQuestion[], k: number, which: 'retrieved' | 'cited'): string {
  const headers = [
    'qid',
    `baseline P@${k}`,
    `contextual P@${k}`,
    'ΔP',
    'baseline MRR',
    'contextual MRR',
    'ΔMRR',
    `baseline R@${k}`,
    `contextual R@${k}`,
    'ΔR',
    `baseline NDCG@${k}`,
    `contextual NDCG@${k}`,
    'ΔNDCG',
  ];
  const lines: string[] = [];
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('|' + headers.map(() => '---').join('|') + '|');
  for (const row of rows) {
    const b = which === 'retrieved' ? row.baseline.scoreRetrieved : row.baseline.scoreCited;
    const c = which === 'retrieved' ? row.contextual.scoreRetrieved : row.contextual.scoreCited;
    lines.push(
      '| ' +
        [
          '`' + row.qid + '`',
          fmt(b.precision, 2),
          fmt(c.precision, 2),
          fmtDelta(c.precision - b.precision, 2),
          fmt(b.mrr, 2),
          fmt(c.mrr, 2),
          fmtDelta(c.mrr - b.mrr, 2),
          fmt(b.recall, 2),
          fmt(c.recall, 2),
          fmtDelta(c.recall - b.recall, 2),
          fmt(b.ndcg, 2),
          fmt(c.ndcg, 2),
          fmtDelta(c.ndcg - b.ndcg, 2),
        ].join(' | ') +
        ' |',
    );
  }
  return lines.join('\n');
}

function renderAggregateTable(section: DeltaSection, k: number): string {
  const lines: string[] = [];
  lines.push(`| metric | baseline | contextual | Δ | paired Wilcoxon p |`);
  lines.push(`|---|---|---|---|---|`);
  const metrics: Array<keyof DeltaArm> = ['precision', 'recall', 'mrr', 'ndcg'];
  const labels: Record<keyof DeltaArm, string> = {
    precision: `precision@${k}`,
    recall: `recall@${k}`,
    mrr: 'MRR',
    ndcg: `NDCG@${k}`,
  };
  for (const m of metrics) {
    const b = section.baseline[m];
    const c = section.contextual[m];
    const p = section.wilcoxon_p[m];
    lines.push(`| ${labels[m]} | ${fmt(b)} | ${fmt(c)} | ${fmtDelta(c - b)} | ${fmtP(p)} |`);
  }
  return lines.join('\n');
}

function countWinsRegressions(
  rows: PerQuestion[],
  which: 'retrieved' | 'cited',
  args: CliArgs,
): { wins: string[]; regressions: string[]; ties: number } {
  const wins: string[] = [];
  const regressions: string[] = [];
  let ties = 0;
  for (const r of rows) {
    const b = which === 'retrieved' ? r.baseline.scoreRetrieved : r.baseline.scoreCited;
    const c = which === 'retrieved' ? r.contextual.scoreRetrieved : r.contextual.scoreCited;
    // Headline metric: precision@k. Tied if |Δ| < win threshold.
    const dP = c.precision - b.precision;
    if (dP >= args.winThreshold) wins.push(r.qid);
    else if (dP <= args.regressionThreshold) regressions.push(r.qid);
    else ties++;
  }
  return { wins, regressions, ties };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dir = runDir(args.runId);
  if (!existsSync(dir)) {
    console.error(`× run directory not found: ${dir}`);
    process.exit(1);
  }

  const manifestPath = resolve(dir, 'manifest.json');
  const perQuestionPath = resolve(dir, 'per-question.json');
  const deltaPath = resolve(dir, 'delta.json');
  for (const p of [manifestPath, perQuestionPath, deltaPath]) {
    if (!existsSync(p)) {
      console.error(`× missing required artifact: ${p}`);
      process.exit(1);
    }
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ManifestFile;
  const perQuestion = JSON.parse(readFileSync(perQuestionPath, 'utf-8')) as PerQuestion[];
  const delta = JSON.parse(readFileSync(deltaPath, 'utf-8')) as DeltaFile;

  const decision = classifyDecision(delta, args);
  const retrievedWLR = countWinsRegressions(perQuestion, 'retrieved', args);
  const citedWLR = countWinsRegressions(perQuestion, 'cited', args);

  const sigP = Number.isFinite(delta.retrieved.wilcoxon_p.precision) &&
    delta.retrieved.wilcoxon_p.precision < 0.05;
  const sigM = Number.isFinite(delta.retrieved.wilcoxon_p.mrr) &&
    delta.retrieved.wilcoxon_p.mrr < 0.05;
  const significanceLine =
    delta.n < 10
      ? `**Significance:** n=${delta.n} is below the n≥10 threshold for the ` +
        `normal-approximation Wilcoxon test; p-values report \`n<10\` and ` +
        `should not be used for ship/no-ship.`
      : `**Significance @ α=0.05 (paired Wilcoxon, retrieved set):** ` +
        `precision@${delta.k} ${sigP ? 'significant' : 'not significant'} ` +
        `(p=${fmtP(delta.retrieved.wilcoxon_p.precision)}); ` +
        `MRR ${sigM ? 'significant' : 'not significant'} ` +
        `(p=${fmtP(delta.retrieved.wilcoxon_p.mrr)}).`;

  const md = [
    `# Contextual Retrieval A/B — \`${manifest.run_id}\``,
    '',
    `*Generated ${new Date().toISOString()}*`,
    '',
    '## Run metadata',
    '',
    `- **Started:** ${manifest.started_at}`,
    `- **Finished:** ${manifest.finished_at}`,
    `- **Endpoint:** \`${manifest.endpoint}\``,
    `- **Sample size (n):** ${delta.n} grounded questions`,
    `- **k:** ${delta.k}`,
    `- **Flags:** enable_tools=${manifest.flags.enable_tools}, web_fallback=${manifest.flags.web_fallback}`,
    `- **Arms:** baseline (\`use_contextual_retrieval=false\`) vs contextual (\`use_contextual_retrieval=true\`)`,
    ...(manifest.notes ? [`- **Notes:** ${manifest.notes}`] : []),
    '',
    significanceLine,
    '',
    '## Headline decision',
    '',
    `**${decision.verdict.toUpperCase()}** — ${decision.reasoning}`,
    '',
    '> The final ship/no-ship decision lives in ',
    '> [`docs/jira/TAG-CR/contextual-retrieval-eval.md`](../../docs/jira/TAG-CR/contextual-retrieval-eval.md).',
    '> This file is the data input that decision is based on.',
    '',
    '## Aggregate metrics — retrieved set (recall layer)',
    '',
    'These metrics score every chunk that any searcher node ever pulled.',
    'They measure raw retriever quality independent of how the planner',
    'chose to cite.',
    '',
    renderAggregateTable(delta.retrieved, delta.k),
    '',
    `**Per-question wins (ΔP@${delta.k} ≥ ${args.winThreshold}):** ${retrievedWLR.wins.length} / ${delta.n}` +
      (retrievedWLR.wins.length ? ` — ${retrievedWLR.wins.map((q) => '`' + q + '`').join(', ')}` : ''),
    `**Per-question regressions (ΔP@${delta.k} ≤ ${args.regressionThreshold}):** ${retrievedWLR.regressions.length} / ${delta.n}` +
      (retrievedWLR.regressions.length ? ` — ${retrievedWLR.regressions.map((q) => '`' + q + '`').join(', ')}` : ''),
    `**Ties:** ${retrievedWLR.ties} / ${delta.n}`,
    '',
    '## Aggregate metrics — cited set (precision-of-final-answer layer)',
    '',
    'These metrics score only the chunks the planner actually cited in',
    'the END-state response. They are the closest proxy for what a user',
    'sees as "where did the answer come from".',
    '',
    renderAggregateTable(delta.cited, delta.k),
    '',
    `**Per-question wins:** ${citedWLR.wins.length} / ${delta.n}` +
      (citedWLR.wins.length ? ` — ${citedWLR.wins.map((q) => '`' + q + '`').join(', ')}` : ''),
    `**Per-question regressions:** ${citedWLR.regressions.length} / ${delta.n}` +
      (citedWLR.regressions.length ? ` — ${citedWLR.regressions.map((q) => '`' + q + '`').join(', ')}` : ''),
    `**Ties:** ${citedWLR.ties} / ${delta.n}`,
    '',
    '## Per-question detail — retrieved set',
    '',
    renderPerQuestionTable(perQuestion, delta.k, 'retrieved'),
    '',
    '## Per-question detail — cited set',
    '',
    renderPerQuestionTable(perQuestion, delta.k, 'cited'),
    '',
    '## Methodology',
    '',
    '- **Metric definitions:** see `evals/scripts/lib/retrieval-metrics.ts`.',
    '  Precision@k counts retrieved hits in top-k that are relevant; recall@k',
    "  counts relevant items recovered in top-k; MRR is the mean of 1/rank",
    '  of the first relevant hit (uncapped); NDCG@k uses binary relevance',
    '  with log2(rank+1) discount.',
    '- **Significance test:** paired Wilcoxon signed-rank with normal',
    '  approximation. p-values for n<10 are reported as `n<10` and ',
    '  should not be used for ship/no-ship — that threshold matches the',
    '  plan-locked `n≥25 grounded` minimum.',
    '- **Citation key normalization:** `[[doc:chunk]]` and `doc:chunk` are',
    '  treated identically (case-insensitive, sentinel stripped).',
    '- **Win/regression threshold:** Δ ≥ ' +
      args.winThreshold +
      ' (win), Δ ≤ ' +
      args.regressionThreshold +
      ' (regression) on precision@k.',
    '',
    '*— end of report —*',
    '',
  ].join('\n');

  const outPath =
    args.outPath || resolve(PATHS.reportsDir, `contextual-retrieval-${manifest.run_id}.md`);
  ensureDir(resolve(outPath, '..'));
  writeFileSync(outPath, md);

  console.log(`\n→ report written: ${outPath}`);
  console.log(`  verdict:   ${decision.verdict.toUpperCase()}`);
  console.log(`  reasoning: ${decision.reasoning}`);
}

main();
