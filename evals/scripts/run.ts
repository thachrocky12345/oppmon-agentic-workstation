/**
 * Eval runner.
 *
 *   pnpm eval:run                       # all questions × both modes
 *   pnpm eval:run -- --mode graph       # only graph mode
 *   pnpm eval:run -- --questions Q01 Q04
 *   pnpm eval:run -- --label tune-v2    # label this run for the report
 *   pnpm eval:run -- --auth $COOKIE     # bearer cookie for Arkon simple mode
 *
 * Output: evals/runs/<label_or_timestamp>/{manifest.json, <id>-<mode>.json,...}
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ask } from './lib/arkon-client.js';
import { loadEnv, envOr } from './lib/env.js';
import { PATHS, ensureDir, runDir } from './lib/paths.js';
import type { Mode, QuestionFile, RunManifest, RunResult } from './lib/types.js';

interface CliArgs {
  modes: Mode[];
  questionIds: string[] | null; // null = all
  label: string;
  auth: string;
  webFallback: boolean;
  enableTools: boolean;
  collectionIds: string[];
  simpleUrl: string;
  graphUrl: string;
  timeoutMs: number;
  notes: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    modes: ['simple', 'graph'],
    questionIds: null,
    label: '',
    auth: '',
    webFallback: true,
    enableTools: false,
    collectionIds: [],
    simpleUrl: envOr('ARKON_SIMPLE_URL', 'http://localhost:3001/api/rag/chat/stream'),
    graphUrl: envOr('ARKON_GRAPH_URL', 'http://192.168.1.195:8002/solve_v2'),
    timeoutMs: parseInt(envOr('EVAL_TIMEOUT_MS', '180000'), 10),
    notes: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--mode': {
        const v = argv[++i] as Mode;
        if (v !== 'simple' && v !== 'graph') {
          throw new Error(`--mode must be 'simple' or 'graph' (got ${v})`);
        }
        out.modes = [v];
        break;
      }
      case '--questions': {
        const ids: string[] = [];
        while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          ids.push(argv[++i]);
        }
        out.questionIds = ids;
        break;
      }
      case '--label':
        out.label = argv[++i];
        break;
      case '--auth':
        out.auth = argv[++i];
        break;
      case '--no-web':
        out.webFallback = false;
        break;
      case '--tools':
        out.enableTools = true;
        break;
      case '--collections': {
        while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          out.collectionIds.push(argv[++i]);
        }
        break;
      }
      case '--simple-url':
        out.simpleUrl = argv[++i];
        break;
      case '--graph-url':
        out.graphUrl = argv[++i];
        break;
      case '--timeout':
        out.timeoutMs = parseInt(argv[++i], 10);
        break;
      case '--notes':
        out.notes = argv[++i];
        break;
      case '-h':
      case '--help':
        console.log(`Usage: pnpm eval:run [options]
  --mode simple|graph     limit to one mode (default: both)
  --questions Q01 Q04     limit to specific question ids (default: all)
  --label NAME            run dir name (default: ISO timestamp)
  --auth COOKIE           cookie header for Arkon simple mode auth
  --no-web                disable web_fallback flag
  --tools                 enable agent tool-calling
  --collections ID1 ID2   RAG collection ids
  --simple-url URL        override simple endpoint
  --graph-url URL         override graph endpoint
  --timeout MS            per-request timeout (default 180000)
  --notes "text"          free-form notes embedded in manifest
`);
        process.exit(0);
    }
  }
  return out;
}

function isoNowDirSafe(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const questionsRaw = JSON.parse(readFileSync(PATHS.questions, 'utf-8')) as QuestionFile;
  const questions = args.questionIds
    ? questionsRaw.questions.filter((q) => args.questionIds!.includes(q.id))
    : questionsRaw.questions;
  if (!questions.length) {
    console.error('No questions matched the filter.');
    process.exit(1);
  }

  const runId = args.label || isoNowDirSafe();
  const dir = runDir(runId);
  ensureDir(dir);

  const manifest: RunManifest = {
    run_id: runId,
    started_at: new Date().toISOString(),
    finished_at: '',
    endpoints: { simple: args.simpleUrl, graph: args.graphUrl },
    modes: args.modes,
    question_ids: questions.map((q) => q.id),
    flags: {
      enable_tools: args.enableTools,
      web_fallback: args.webFallback,
      collection_ids: args.collectionIds,
    },
    notes: args.notes || undefined,
  };

  console.log(`\n→ run_id: ${runId}`);
  console.log(`  modes:     ${args.modes.join(', ')}`);
  console.log(`  questions: ${questions.length}`);
  console.log(`  output:    ${dir}\n`);

  let okCount = 0;
  let errCount = 0;
  for (const q of questions) {
    for (const mode of args.modes) {
      process.stdout.write(`  [${q.id} / ${mode}] ... `);
      const t0 = Date.now();
      try {
        const endpoint = mode === 'simple' ? args.simpleUrl : args.graphUrl;
        const result = await ask(mode, {
          endpoint,
          question: q.question,
          enableTools: args.enableTools,
          webFallback: args.webFallback,
          collectionIds: args.collectionIds,
          authCookie: args.auth || undefined,
          timeoutMs: args.timeoutMs,
        });
        const full: RunResult = { question_id: q.id, mode, ...result };
        writeFileSync(
          resolve(dir, `${q.id}-${mode}.json`),
          JSON.stringify(full, null, 2),
        );
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        if (full.error) {
          errCount++;
          console.log(`✗ error after ${elapsed}s: ${full.error}`);
        } else {
          okCount++;
          console.log(`✓ ${full.answer.length} chars, ${full.raw_events_count} events, ${elapsed}s`);
        }
      } catch (e) {
        errCount++;
        const msg = (e as Error).message;
        console.log(`✗ exception: ${msg}`);
        writeFileSync(
          resolve(dir, `${q.id}-${mode}.json`),
          JSON.stringify(
            {
              question_id: q.id,
              mode,
              latency_ms: Date.now() - t0,
              answer: '',
              raw_events_count: 0,
              error: msg,
            } satisfies RunResult,
            null,
            2,
          ),
        );
      }
    }
  }

  manifest.finished_at = new Date().toISOString();
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ✓ ${okCount} / ✗ ${errCount}`);
  console.log(`Manifest: ${resolve(dir, 'manifest.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
