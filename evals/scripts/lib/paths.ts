// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/** Filesystem layout helpers. All paths are absolute. */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const EVALS_ROOT = resolve(__dirname, '..', '..');
export const REPO_ROOT = resolve(EVALS_ROOT, '..');

export const PATHS = {
  questions: resolve(EVALS_ROOT, 'questions.json'),
  referencesDir: resolve(EVALS_ROOT, 'references'),
  runsDir: resolve(EVALS_ROOT, 'runs'),
  reportsDir: resolve(EVALS_ROOT, 'reports'),
  apiEnv: resolve(REPO_ROOT, 'apps', 'api', '.env'),
};

export function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function referenceFile(source: 'chatgpt' | 'claude', questionId: string): string {
  return resolve(PATHS.referencesDir, source, `${questionId}.md`);
}

export function runDir(runId: string): string {
  return resolve(PATHS.runsDir, runId);
}

export function listRuns(): string[] {
  if (!existsSync(PATHS.runsDir)) return [];
  return readdirSync(PATHS.runsDir)
    .filter((name) => {
      const full = resolve(PATHS.runsDir, name);
      return statSync(full).isDirectory();
    })
    .sort();
}

export function latestRunId(): string | null {
  const all = listRuns();
  return all.length ? all[all.length - 1] : null;
}
