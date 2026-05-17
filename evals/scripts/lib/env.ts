// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Env loading.
 *
 * Defaults to reading `apps/api/.env` (where ANTHROPIC_API_KEY lives in this
 * repo) so the eval scripts don't need a duplicate keyring. Override via
 * dotenv-style env or by exporting the variables in your shell.
 */

import { config as dotenvConfig } from 'dotenv';
import { PATHS } from './paths.js';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  // Load /apps/api/.env first (shared keys) then any .env in evals/.
  dotenvConfig({ path: PATHS.apiEnv });
  dotenvConfig({ path: `${PATHS.apiEnv}.local`, override: false });
  loaded = true;
}

export function requireEnv(name: string): string {
  loadEnv();
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Add it to apps/api/.env or export it.`,
    );
  }
  return v;
}

export function envOr(name: string, fallback: string): string {
  loadEnv();
  return process.env[name] || fallback;
}
