// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * LLM-as-judge scorer.
 *
 *   pnpm eval:judge                            # judge the most recent run
 *   pnpm eval:judge -- --run tune-v2           # judge a specific labelled run
 *   pnpm eval:judge -- --questions Q01 Q04     # subset
 *   pnpm eval:judge -- --judge claude-opus-4-7 # override judge model
 *
 * Writes evals/runs/<id>/scores.json.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from './lib/judge-prompt.js';
import {
  JUDGE_MAX_TOKENS,
  JUDGE_MODEL,
  JUDGE_PROMPT_VERSION,
  JUDGE_TEMPERATURE,
} from './lib/judge-config.js';
import { loadEnv, requireEnv } from './lib/env.js';
import { latestRunId, PATHS, referenceFile, runDir } from './lib/paths.js';
import type {
  AxisScore,
  JudgedAnswer,
  Mode,
  QuestionFile,
  RubricAxis,
  RunManifest,
  RunResult,
  ScoreFile,
} from './lib/types.js';
import { CORE_AXES, GRAPH_BONUS_AXES } from './lib/types.js';

interface CliArgs {
  runId: string | null; // null = latest
  questionIds: string[] | null;
  modelOverride: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { runId: null, questionIds: null, modelOverride: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--run':
        out.runId = argv[++i];
        break;
      case '--questions': {
        const ids: string[] = [];
        while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          ids.push(argv[++i]);
        }
        out.questionIds = ids;
        break;
      }
      case '--judge':
        out.modelOverride = argv[++i];
        break;
      case '-h':
      case '--help':
        console.log(`Usage: pnpm eval:judge [options]
  --run NAME              run id to judge (default: latest)
  --questions Q01 Q04     subset of questions
  --judge MODEL           override judge model
`);
        process.exit(0);
    }
  }
  return out;
}

function loadJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function loadReference(source: 'chatgpt' | 'claude', questionId: string): string {
  const file = referenceFile(source, questionId);
  if (!existsSync(file)) {
    return `(no reference saved — ${source}/${questionId}.md does not exist)`;
  }
  return readFileSync(file, 'utf-8').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function safeJsonParse(s: string): unknown | null {
  // Strip code fences if the judge ignored instructions and added them.
  const cleaned = s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last-ditch attempt: extract the first {...} block.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface RawJudgeOutput {
  axes?: Record<string, { score?: number; rationale?: string }>;
  notable_wins?: string[];
  notable_losses?: string[];
  rank_vs_refs?: { order?: string[]; reasoning?: string };
}

function buildJudgedAnswer(
  questionId: string,
  mode: Mode,
  raw: RawJudgeOutput,
  weights: Record<RubricAxis, number>,
): JudgedAnswer {
  const axes: Partial<Record<RubricAxis, AxisScore>> = {};
  const allowed = mode === 'graph' ? [...CORE_AXES, ...GRAPH_BONUS_AXES] : [...CORE_AXES];
  let rawTotal = 0;
  let weightedTotal = 0;
  for (const key of allowed) {
    const r = raw.axes?.[key];
    if (!r || typeof r.score !== 'number') continue;
    const clamped = Math.max(0, Math.min(5, r.score));
    axes[key as RubricAxis] = { score: clamped, rationale: r.rationale || '' };
    rawTotal += clamped;
    weightedTotal += clamped * (weights[key as RubricAxis] ?? 1);
  }
  return {
    question_id: questionId,
    mode,
    axes,
    raw_total: rawTotal,
    weighted_total: weightedTotal,
    notable_wins: raw.notable_wins || [],
    notable_losses: raw.notable_losses || [],
    rank_vs_refs: raw.rank_vs_refs && raw.rank_vs_refs.order
      ? { order: raw.rank_vs_refs.order, reasoning: raw.rank_vs_refs.reasoning || '' }
      : undefined,
    raw_judge_output: raw,
  };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const apiKey = requireEnv('ANTHROPIC_API_KEY');

  const runId = args.runId || latestRunId();
  if (!runId) {
    console.error('No runs found. Run `pnpm eval:run` first.');
    process.exit(1);
  }
  const dir = runDir(runId);
  if (!existsSync(dir)) {
    console.error(`Run not found: ${dir}`);
    process.exit(1);
  }
  const manifestPath = resolve(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`Manifest missing: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = loadJSON<RunManifest>(manifestPath);
  const questions = loadJSON<QuestionFile>(PATHS.questions).questions;

  const targetQuestionIds = args.questionIds
    ? manifest.question_ids.filter((id) => args.questionIds!.includes(id))
    : manifest.question_ids;

  const judgeModel = args.modelOverride || JUDGE_MODEL;
  const client = new Anthropic({ apiKey });

  console.log(`\n→ judging run: ${runId}`);
  console.log(`  judge:     ${judgeModel}`);
  console.log(`  prompt:    ${JUDGE_PROMPT_VERSION}`);
  console.log(`  questions: ${targetQuestionIds.length}`);
  console.log(`  modes:     ${manifest.modes.join(', ')}\n`);

  const results: JudgedAnswer[] = [];

  for (const qid of targetQuestionIds) {
    const q = questions.find((x) => x.id === qid);
    if (!q) {
      console.log(`  [${qid}] ⚠ question not in questions.json — skipping`);
      continue;
    }
    const chatgptRef = loadReference('chatgpt', qid);
    const claudeRef = loadReference('claude', qid);

    for (const mode of manifest.modes) {
      const candPath = resolve(dir, `${qid}-${mode}.json`);
      if (!existsSync(candPath)) {
        console.log(`  [${qid}/${mode}] ✗ run output missing — skipping`);
        continue;
      }
      const cand = loadJSON<RunResult>(candPath);
      if (cand.error) {
        console.log(`  [${qid}/${mode}] ✗ candidate had run error: ${cand.error}`);
        continue;
      }
      if (!cand.answer.trim()) {
        console.log(`  [${qid}/${mode}] ✗ candidate answer empty — skipping`);
        continue;
      }
      process.stdout.write(`  [${qid}/${mode}] judging... `);
      const { system, user, slotMap } = buildPrompt({
        question: q,
        mode,
        chatgptRef,
        claudeRef,
        arkonCandidate: cand.answer,
      });
      try {
        const resp = await client.messages.create({
          model: judgeModel,
          max_tokens: JUDGE_MAX_TOKENS,
          temperature: JUDGE_TEMPERATURE,
          system,
          messages: [{ role: 'user', content: user }],
        });
        const text = resp.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text)
          .join('');
        const parsed = safeJsonParse(text) as RawJudgeOutput | null;
        if (!parsed) {
          console.log(`✗ judge returned unparseable output`);
          continue;
        }
        // Optionally rewrite rank_vs_refs.order from slot letters back to author keys.
        if (parsed.rank_vs_refs?.order) {
          parsed.rank_vs_refs.order = parsed.rank_vs_refs.order.map((slot) => {
            const key = slotMap[slot as 'A' | 'B' | 'C'];
            return key || slot;
          });
        }
        const judged = buildJudgedAnswer(
          qid,
          mode,
          parsed,
          q.rubric_weights as Record<RubricAxis, number>,
        );
        results.push(judged);
        console.log(
          `✓ total ${judged.weighted_total.toFixed(1)} (raw ${judged.raw_total.toFixed(1)})`,
        );
      } catch (e) {
        console.log(`✗ judge call failed: ${(e as Error).message}`);
      }
    }
  }

  const scoreFile: ScoreFile = {
    run_id: runId,
    judged_at: new Date().toISOString(),
    judge_model: judgeModel,
    judge_prompt_version: JUDGE_PROMPT_VERSION,
    results,
  };
  const outPath = resolve(dir, 'scores.json');
  writeFileSync(outPath, JSON.stringify(scoreFile, null, 2));
  console.log(`\nWrote ${results.length} scored results → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
