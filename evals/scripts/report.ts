// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Aggregate eval scores into a trend report.
 *
 *   pnpm eval:report                       # default: evals/reports/latest.md
 *   pnpm eval:report -- --out my-report.md
 *
 * Reads every evals/runs/<id>/scores.json that exists and emits a markdown
 * table with:
 *   • Per-run weighted totals (rows = questions, cols = runs)
 *   • Per-axis trend (latest vs previous run, with Δ)
 *   • Regression flags (Δ < -1.0 weighted)
 *   • Top wins / top losses (highest / lowest deltas)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listRuns, PATHS, ensureDir, runDir } from './lib/paths.js';
import type {
  JudgedAnswer,
  Mode,
  QuestionFile,
  RubricAxis,
  RunManifest,
  ScoreFile,
} from './lib/types.js';
import { CORE_AXES, GRAPH_BONUS_AXES } from './lib/types.js';

interface CliArgs {
  outPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { outPath: resolve(PATHS.reportsDir, 'latest.md') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out.outPath = resolve(process.cwd(), argv[++i]);
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(`Usage: pnpm eval:report [--out PATH]`);
      process.exit(0);
    }
  }
  return out;
}

interface RunBundle {
  runId: string;
  manifest: RunManifest;
  scoreFile: ScoreFile | null;
}

function loadBundle(runId: string): RunBundle | null {
  const dir = runDir(runId);
  const manifestPath = resolve(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as RunManifest;
  const scorePath = resolve(dir, 'scores.json');
  const scoreFile = existsSync(scorePath)
    ? (JSON.parse(readFileSync(scorePath, 'utf-8')) as ScoreFile)
    : null;
  return { runId, manifest, scoreFile };
}

function key(qid: string, mode: Mode): string {
  return `${qid}|${mode}`;
}

function fmtScore(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(1);
}

function fmtDelta(n: number): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  const emoji = n > 0.5 ? '🟢' : n < -0.5 ? '🔴' : '⚪';
  return `${emoji} ${sign}${n.toFixed(1)}`;
}

function buildMatrix(bundles: RunBundle[]) {
  // For every (questionId, mode) record weighted_total per run.
  const matrix = new Map<string, Map<string, JudgedAnswer>>();
  for (const b of bundles) {
    if (!b.scoreFile) continue;
    for (const r of b.scoreFile.results) {
      const k = key(r.question_id, r.mode);
      if (!matrix.has(k)) matrix.set(k, new Map());
      matrix.get(k)!.set(b.runId, r);
    }
  }
  return matrix;
}

function deltaAxes(prev: JudgedAnswer, cur: JudgedAnswer): Partial<Record<RubricAxis, number>> {
  const axes = cur.mode === 'graph' ? [...CORE_AXES, ...GRAPH_BONUS_AXES] : [...CORE_AXES];
  const out: Partial<Record<RubricAxis, number>> = {};
  for (const a of axes) {
    const p = prev.axes[a as RubricAxis]?.score;
    const c = cur.axes[a as RubricAxis]?.score;
    if (typeof p === 'number' && typeof c === 'number') out[a as RubricAxis] = c - p;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allRuns = listRuns();
  if (!allRuns.length) {
    console.error('No runs found in evals/runs.');
    process.exit(1);
  }
  const bundles = allRuns.map((id) => loadBundle(id)).filter((b): b is RunBundle => b !== null);

  const judged = bundles.filter((b) => b.scoreFile);
  if (!judged.length) {
    console.error('No judged runs found. Run `pnpm eval:judge` first.');
    process.exit(1);
  }

  const questions = JSON.parse(readFileSync(PATHS.questions, 'utf-8')) as QuestionFile;
  const titleById = new Map(questions.questions.map((q) => [q.id, q.title]));

  const matrix = buildMatrix(bundles);
  const sortedKeys = [...matrix.keys()].sort();

  const lines: string[] = [];
  lines.push(`# Arkon eval trend report`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // ----- Run overview -----
  lines.push('## Runs');
  lines.push('');
  lines.push('| Run | Started | Modes | Questions | Judged | Judge model | Notes |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const b of bundles) {
    lines.push(
      `| \`${b.runId}\` | ${b.manifest.started_at.slice(0, 19).replace('T', ' ')} | ${b.manifest.modes.join(',')} | ${b.manifest.question_ids.length} | ${b.scoreFile ? '✓' : '—'} | ${b.scoreFile?.judge_model || '—'} | ${b.manifest.notes || ''} |`,
    );
  }
  lines.push('');

  // ----- Weighted total matrix -----
  lines.push('## Weighted totals per question × run');
  lines.push('');
  const judgedRunIds = judged.map((b) => b.runId);
  const header = ['Question', 'Mode', ...judgedRunIds.map((r) => `\`${r}\``)];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`|${header.map(() => '---').join('|')}|`);
  for (const k of sortedKeys) {
    const [qid, mode] = k.split('|');
    const row: string[] = [
      `${qid} _${titleById.get(qid) || ''}_`,
      mode,
    ];
    const perRun = matrix.get(k)!;
    for (const rid of judgedRunIds) {
      row.push(fmtScore(perRun.get(rid)?.weighted_total));
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');

  // ----- Delta: latest vs previous -----
  if (judgedRunIds.length >= 2) {
    const cur = judgedRunIds[judgedRunIds.length - 1];
    const prev = judgedRunIds[judgedRunIds.length - 2];
    lines.push(`## Δ ${cur} vs ${prev} (weighted total)`);
    lines.push('');
    lines.push('| Question | Mode | Prev | Cur | Δ |');
    lines.push('|---|---|---|---|---|');
    const regressions: Array<{ qid: string; mode: Mode; delta: number }> = [];
    const wins: Array<{ qid: string; mode: Mode; delta: number }> = [];
    for (const k of sortedKeys) {
      const [qid, mode] = k.split('|');
      const perRun = matrix.get(k)!;
      const p = perRun.get(prev)?.weighted_total;
      const c = perRun.get(cur)?.weighted_total;
      if (typeof p !== 'number' || typeof c !== 'number') continue;
      const d = c - p;
      lines.push(`| ${qid} | ${mode} | ${p.toFixed(1)} | ${c.toFixed(1)} | ${fmtDelta(d)} |`);
      if (d <= -1.0) regressions.push({ qid, mode: mode as Mode, delta: d });
      if (d >= 1.0) wins.push({ qid, mode: mode as Mode, delta: d });
    }
    lines.push('');

    if (regressions.length) {
      lines.push('### 🔴 Suspected regressions (Δ ≤ -1.0)');
      lines.push('');
      for (const r of regressions) {
        lines.push(`- **${r.qid} / ${r.mode}**: Δ ${r.delta.toFixed(1)}`);
      }
      lines.push('');
    }
    if (wins.length) {
      lines.push('### 🟢 Notable wins (Δ ≥ +1.0)');
      lines.push('');
      for (const w of wins) {
        lines.push(`- **${w.qid} / ${w.mode}**: Δ +${w.delta.toFixed(1)}`);
      }
      lines.push('');
    }

    // Per-axis breakdown for the latest run (averaged over all questions)
    lines.push(`## Per-axis averages — latest run (${cur})`);
    lines.push('');
    const allAxes = [...CORE_AXES, ...GRAPH_BONUS_AXES];
    const sums: Partial<Record<RubricAxis, { sum: number; n: number }>> = {};
    for (const k of sortedKeys) {
      const r = matrix.get(k)!.get(cur);
      if (!r) continue;
      for (const a of allAxes) {
        const s = r.axes[a as RubricAxis]?.score;
        if (typeof s !== 'number') continue;
        const bucket = (sums[a as RubricAxis] ||= { sum: 0, n: 0 });
        bucket.sum += s;
        bucket.n += 1;
      }
    }
    lines.push('| Axis | Avg score (0–5) | Sample size |');
    lines.push('|---|---|---|');
    for (const a of allAxes) {
      const b = sums[a as RubricAxis];
      if (!b || b.n === 0) continue;
      lines.push(`| ${a} | ${(b.sum / b.n).toFixed(2)} | ${b.n} |`);
    }
    lines.push('');
  }

  // ----- Per-question notable wins/losses from latest -----
  const latest = judged[judged.length - 1];
  if (latest.scoreFile) {
    lines.push(`## Notable wins / losses from \`${latest.runId}\``);
    lines.push('');
    for (const r of latest.scoreFile.results) {
      if (!r.notable_wins.length && !r.notable_losses.length) continue;
      lines.push(`### ${r.question_id} / ${r.mode}`);
      if (r.notable_wins.length) {
        lines.push('');
        lines.push('**Wins**');
        for (const w of r.notable_wins) lines.push(`- ${w}`);
      }
      if (r.notable_losses.length) {
        lines.push('');
        lines.push('**Losses**');
        for (const l of r.notable_losses) lines.push(`- ${l}`);
      }
      lines.push('');
    }
  }

  ensureDir(PATHS.reportsDir);
  writeFileSync(args.outPath, lines.join('\n'));
  console.log(`Wrote ${args.outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
