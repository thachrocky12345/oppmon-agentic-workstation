// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * TAG-CR — Contextual-Retrieval A/B driver.
 *
 *   pnpm tsx evals/scripts/contextual-retrieval-eval.ts --label pilot-001
 *
 * For every grounded question in evals/corpus-questions.json the driver
 * runs TWO graph-mode requests against `${ARKON_GRAPH_URL}`:
 *
 *   Arm A (baseline):    collection_ids = [...c.map(c => c + '_baseline')]
 *                        useContextualRetrieval: false
 *   Arm B (contextual):  collection_ids = [...c.map(c => c + '_contextual')]
 *                        useContextualRetrieval: true
 *
 * It captures retrieved[] / cited[] from the SSE stream (see
 * `lib/arkon-client.ts`) and scores each arm against the question's
 * `expected_citations` via precision@k / recall@k / MRR / NDCG (see
 * `lib/retrieval-metrics.ts`).
 *
 * Output layout (under `evals/runs/contextual-AB-<label>/`):
 *
 *   manifest.json                — endpoints, flags, question ids, ISO timestamps
 *   baseline/<qid>.json          — per-question RunResult for arm A
 *   contextual/<qid>.json        — per-question RunResult for arm B
 *   per-question.json            — aligned per-question metrics for both arms
 *   delta.json                   — aggregated mean Δ + paired Wilcoxon p
 *
 * The driver does NOT block on OOD questions (category != "grounded") —
 * they have no expected_citations and are scored separately by the
 * existing judge.ts on refusal quality.
 *
 * Endpoint choice (in priority order):
 *   1. --graph-url CLI flag
 *   2. ARKON_GRAPH_URL env
 *   3. http://localhost:3001/api/graph/solve  (authenticated, TAG-50)
 *
 * Auth (in priority order):
 *   1. --auth-bearer CLI flag
 *   2. EVAL_AUTH_BEARER env
 *
 * The /solve endpoint requires a Bearer JWT. For dev runs, generate
 * one via `apps/api/scripts/dev-jwt.ts` or copy `auth_token` cookie
 * value from a logged-in browser session.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ask } from './lib/arkon-client.js';
import { loadEnv, envOr } from './lib/env.js';
import { PATHS, ensureDir, runDir } from './lib/paths.js';
import {
  pairedWilcoxonP,
  scoreRun,
  type RetrievalScore,
} from './lib/retrieval-metrics.js';
import type { RunResult } from './lib/types.js';

// ---------------------------------------------------------------------
// Corpus-question schema — distinct from evals/questions.json (which is
// the rubric-weighted long-form judge bank). The shape below mirrors
// the actual entries in evals/corpus-questions.json after TAG-CR
// expansion.
// ---------------------------------------------------------------------

interface CorpusQuestion {
  id: string;
  category: 'grounded' | 'ood';
  question: string;
  collection_ids: string[];
  expected_citations?: string[];
  expected_keypoints?: string[];
  expected_refusal?: boolean;
}

// The corpus-questions.json file is an array with an optional leading
// `$comment` object (header). Filter that out.
type CorpusFile = Array<CorpusQuestion | { $comment: unknown }>;

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

interface CliArgs {
  label: string;
  k: number;
  questionsPath: string;
  graphUrl: string;
  authBearer: string;
  timeoutMs: number;
  webFallback: boolean;
  enableTools: boolean;
  onlyIds: string[] | null;
  notes: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    label: '',
    k: parseInt(envOr('EVAL_K', '5'), 10),
    questionsPath: resolve(PATHS.referencesDir, '..', 'corpus-questions.json'),
    graphUrl: envOr('ARKON_GRAPH_URL', 'http://localhost:3001/api/graph/solve'),
    authBearer: envOr('EVAL_AUTH_BEARER', ''),
    timeoutMs: parseInt(envOr('EVAL_TIMEOUT_MS', '180000'), 10),
    webFallback: false, // RAG-only by default — A/B is about corpus retrieval
    enableTools: true,
    onlyIds: null,
    notes: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--label':
        out.label = argv[++i];
        break;
      case '--k':
        out.k = parseInt(argv[++i], 10);
        break;
      case '--questions':
        out.questionsPath = resolve(argv[++i]);
        break;
      case '--graph-url':
        out.graphUrl = argv[++i];
        break;
      case '--auth-bearer':
        out.authBearer = argv[++i];
        break;
      case '--timeout':
        out.timeoutMs = parseInt(argv[++i], 10);
        break;
      case '--with-web':
        out.webFallback = true;
        break;
      case '--no-tools':
        out.enableTools = false;
        break;
      case '--only': {
        const ids: string[] = [];
        while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          ids.push(argv[++i]);
        }
        out.onlyIds = ids;
        break;
      }
      case '--notes':
        out.notes = argv[++i];
        break;
      case '-h':
      case '--help':
        console.log(`Usage: pnpm tsx evals/scripts/contextual-retrieval-eval.ts [options]
  --label NAME            run dir suffix (default: ISO timestamp)
  --k N                   precision@k / recall@k / NDCG@k (default 5)
  --questions PATH        corpus-questions.json (default: evals/corpus-questions.json)
  --graph-url URL         override /solve URL
  --auth-bearer TOKEN     Bearer JWT for /solve (or EVAL_AUTH_BEARER env)
  --timeout MS            per-request timeout (default 180000)
  --with-web              enable web_fallback (default off; this is a RAG A/B)
  --no-tools              disable agent tool-calling (default on)
  --only Q1 Q2            limit to specific question ids
  --notes "text"          embedded in manifest
`);
        process.exit(0);
    }
  }
  return out;
}

function isoNowDirSafe(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
}

function isQuestion(x: unknown): x is CorpusQuestion {
  return (
    typeof x === 'object' &&
    x !== null &&
    'id' in x &&
    'category' in x &&
    'question' in x
  );
}

/**
 * Map a question's template collection ids ([\"col_eval\"]) to the
 * arm-specific suffixed ids ([\"col_eval_baseline\"] /
 * [\"col_eval_contextual\"]).
 *
 * Legacy TAG-64 entries (col_alpha / col_beta) are already
 * arm-specific in the sense that they exist in the seed_two_tenants.sql
 * fixture only — they don't have _baseline/_contextual siblings. We
 * skip them in the A/B run by filtering at the question-set level
 * (see main()), so this helper never sees them.
 */
function armCollections(templateIds: string[], arm: 'baseline' | 'contextual'): string[] {
  return templateIds.map((c) => `${c}_${arm}`);
}

async function runArm(
  q: CorpusQuestion,
  arm: 'baseline' | 'contextual',
  args: CliArgs,
): Promise<{ result: Omit<RunResult, 'question_id' | 'mode'>; collections: string[] }> {
  const collections = armCollections(q.collection_ids, arm);
  const result = await ask('graph', {
    endpoint: args.graphUrl,
    question: q.question,
    enableTools: args.enableTools,
    webFallback: args.webFallback,
    collectionIds: collections,
    authBearer: args.authBearer || undefined,
    useContextualRetrieval: arm === 'contextual',
    timeoutMs: args.timeoutMs,
  });
  return { result, collections };
}

function emptyScore(): RetrievalScore {
  return { precision: 0, recall: 0, mrr: 0, ndcg: 0 };
}

function meanField(rows: ArmResult[], pick: (s: RetrievalScore) => number, which: 'retrieved' | 'cited'): number {
  if (!rows.length) return 0;
  const sum = rows.reduce(
    (acc, r) => acc + pick(which === 'retrieved' ? r.scoreRetrieved : r.scoreCited),
    0,
  );
  return sum / rows.length;
}

function wilcoxonField(
  before: ArmResult[],
  after: ArmResult[],
  pick: (s: RetrievalScore) => number,
  which: 'retrieved' | 'cited',
): number {
  const b = before.map((r) => pick(which === 'retrieved' ? r.scoreRetrieved : r.scoreCited));
  const a = after.map((r) => pick(which === 'retrieved' ? r.scoreRetrieved : r.scoreCited));
  return pairedWilcoxonP(b, a);
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  if (!args.authBearer) {
    console.error(
      '× missing auth — set --auth-bearer or EVAL_AUTH_BEARER. /solve requires a Bearer JWT.',
    );
    process.exit(1);
  }

  // Read + filter to grounded entries with expected_citations and a
  // template collection id that has _baseline/_contextual siblings.
  // (The legacy col_alpha/col_beta entries are EXCLUDED — they belong
  // to the two-tenant smoke fixture, not the contextual A/B.)
  const raw = JSON.parse(readFileSync(args.questionsPath, 'utf-8')) as CorpusFile;
  let questions: CorpusQuestion[] = raw.filter(isQuestion);
  questions = questions.filter(
    (q) =>
      q.category === 'grounded' &&
      Array.isArray(q.expected_citations) &&
      q.expected_citations.length > 0 &&
      // Skip legacy fixture rows (they don't have _baseline/_contextual siblings).
      !q.collection_ids.some((c) => c === 'col_alpha' || c === 'col_beta'),
  );
  if (args.onlyIds) {
    questions = questions.filter((q) => args.onlyIds!.includes(q.id));
  }
  if (!questions.length) {
    console.error('No grounded questions matched the filter.');
    process.exit(1);
  }

  const runId = `contextual-AB-${args.label || isoNowDirSafe()}`;
  const dir = runDir(runId);
  ensureDir(dir);
  ensureDir(resolve(dir, 'baseline'));
  ensureDir(resolve(dir, 'contextual'));

  console.log(`\n→ run_id: ${runId}`);
  console.log(`  questions:   ${questions.length} (grounded)`);
  console.log(`  endpoint:    ${args.graphUrl}`);
  console.log(`  k:           ${args.k}`);
  console.log(`  output:      ${dir}\n`);

  const baselineRows: ArmResult[] = [];
  const contextualRows: ArmResult[] = [];
  const perQuestion: PerQuestion[] = [];

  for (const q of questions) {
    const expected = q.expected_citations || [];
    process.stdout.write(`  [${q.id}] `);

    // Arm A — baseline
    let baselineRow: ArmResult;
    try {
      const { result, collections } = await runArm(q, 'baseline', args);
      const retrieved = result.retrieved || [];
      const cited = result.cited || [];
      baselineRow = {
        qid: q.id,
        scoreRetrieved: scoreRun(retrieved, expected, args.k),
        scoreCited: scoreRun(cited, expected, args.k),
        retrieved,
        cited,
        error: result.error,
      };
      const fullResult: RunResult = { question_id: q.id, mode: 'graph', ...result };
      writeFileSync(
        resolve(dir, 'baseline', `${q.id}.json`),
        JSON.stringify({ ...fullResult, arm: 'baseline', collections, expected }, null, 2),
      );
    } catch (e) {
      baselineRow = {
        qid: q.id,
        scoreRetrieved: emptyScore(),
        scoreCited: emptyScore(),
        retrieved: [],
        cited: [],
        error: (e as Error).message,
      };
    }
    baselineRows.push(baselineRow);

    // Arm B — contextual
    let contextualRow: ArmResult;
    try {
      const { result, collections } = await runArm(q, 'contextual', args);
      const retrieved = result.retrieved || [];
      const cited = result.cited || [];
      contextualRow = {
        qid: q.id,
        scoreRetrieved: scoreRun(retrieved, expected, args.k),
        scoreCited: scoreRun(cited, expected, args.k),
        retrieved,
        cited,
        error: result.error,
      };
      const fullResult: RunResult = { question_id: q.id, mode: 'graph', ...result };
      writeFileSync(
        resolve(dir, 'contextual', `${q.id}.json`),
        JSON.stringify({ ...fullResult, arm: 'contextual', collections, expected }, null, 2),
      );
    } catch (e) {
      contextualRow = {
        qid: q.id,
        scoreRetrieved: emptyScore(),
        scoreCited: emptyScore(),
        retrieved: [],
        cited: [],
        error: (e as Error).message,
      };
    }
    contextualRows.push(contextualRow);

    perQuestion.push({ qid: q.id, expected, baseline: baselineRow, contextual: contextualRow });

    const dP = (contextualRow.scoreRetrieved.precision - baselineRow.scoreRetrieved.precision).toFixed(2);
    const dR = (contextualRow.scoreRetrieved.recall - baselineRow.scoreRetrieved.recall).toFixed(2);
    const dM = (contextualRow.scoreRetrieved.mrr - baselineRow.scoreRetrieved.mrr).toFixed(2);
    const errStr = baselineRow.error || contextualRow.error ? ' (errors!)' : '';
    console.log(`ΔP=${dP}  ΔR=${dR}  ΔMRR=${dM}${errStr}`);
  }

  // ---------------------------------------------------------------
  // Aggregated metrics + significance
  // ---------------------------------------------------------------

  const agg = {
    n: perQuestion.length,
    k: args.k,
    retrieved: {
      baseline: {
        precision: meanField(baselineRows, (s) => s.precision, 'retrieved'),
        recall: meanField(baselineRows, (s) => s.recall, 'retrieved'),
        mrr: meanField(baselineRows, (s) => s.mrr, 'retrieved'),
        ndcg: meanField(baselineRows, (s) => s.ndcg, 'retrieved'),
      },
      contextual: {
        precision: meanField(contextualRows, (s) => s.precision, 'retrieved'),
        recall: meanField(contextualRows, (s) => s.recall, 'retrieved'),
        mrr: meanField(contextualRows, (s) => s.mrr, 'retrieved'),
        ndcg: meanField(contextualRows, (s) => s.ndcg, 'retrieved'),
      },
      wilcoxon_p: {
        precision: wilcoxonField(baselineRows, contextualRows, (s) => s.precision, 'retrieved'),
        recall: wilcoxonField(baselineRows, contextualRows, (s) => s.recall, 'retrieved'),
        mrr: wilcoxonField(baselineRows, contextualRows, (s) => s.mrr, 'retrieved'),
        ndcg: wilcoxonField(baselineRows, contextualRows, (s) => s.ndcg, 'retrieved'),
      },
    },
    cited: {
      baseline: {
        precision: meanField(baselineRows, (s) => s.precision, 'cited'),
        recall: meanField(baselineRows, (s) => s.recall, 'cited'),
        mrr: meanField(baselineRows, (s) => s.mrr, 'cited'),
        ndcg: meanField(baselineRows, (s) => s.ndcg, 'cited'),
      },
      contextual: {
        precision: meanField(contextualRows, (s) => s.precision, 'cited'),
        recall: meanField(contextualRows, (s) => s.recall, 'cited'),
        mrr: meanField(contextualRows, (s) => s.mrr, 'cited'),
        ndcg: meanField(contextualRows, (s) => s.ndcg, 'cited'),
      },
      wilcoxon_p: {
        precision: wilcoxonField(baselineRows, contextualRows, (s) => s.precision, 'cited'),
        recall: wilcoxonField(baselineRows, contextualRows, (s) => s.recall, 'cited'),
        mrr: wilcoxonField(baselineRows, contextualRows, (s) => s.mrr, 'cited'),
        ndcg: wilcoxonField(baselineRows, contextualRows, (s) => s.ndcg, 'cited'),
      },
    },
  };

  writeFileSync(resolve(dir, 'per-question.json'), JSON.stringify(perQuestion, null, 2));
  writeFileSync(resolve(dir, 'delta.json'), JSON.stringify(agg, null, 2));
  writeFileSync(
    resolve(dir, 'manifest.json'),
    JSON.stringify(
      {
        run_id: runId,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        endpoint: args.graphUrl,
        k: args.k,
        flags: {
          enable_tools: args.enableTools,
          web_fallback: args.webFallback,
          use_contextual_retrieval_per_arm: { baseline: false, contextual: true },
        },
        question_ids: questions.map((q) => q.id),
        notes: args.notes || undefined,
      },
      null,
      2,
    ),
  );

  // Console summary
  console.log('\nMean retrieved-set metrics (n=' + agg.n + ', k=' + agg.k + '):');
  console.log('              precision   recall    mrr      ndcg');
  for (const arm of ['baseline', 'contextual'] as const) {
    const m = agg.retrieved[arm];
    console.log(
      `  ${arm.padEnd(11)} ${m.precision.toFixed(3)}      ${m.recall.toFixed(3)}    ${m.mrr.toFixed(3)}    ${m.ndcg.toFixed(3)}`,
    );
  }
  console.log('  wilcoxon p  ' +
    Object.values(agg.retrieved.wilcoxon_p)
      .map((p) => (Number.isFinite(p) ? p.toFixed(3) : 'n<10'))
      .map((s) => s.padStart(7))
      .join('  '));
  console.log(`\nManifest: ${resolve(dir, 'manifest.json')}`);
  console.log(`Delta:    ${resolve(dir, 'delta.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
