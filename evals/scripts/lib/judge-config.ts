// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Judge configuration.
 *
 * IMPORTANT: when you change `MODEL` or `PROMPT_VERSION` you should re-score
 * all prior runs to establish a new baseline — otherwise the trend report
 * conflates model drift with agent drift.
 */

export const JUDGE_MODEL = 'claude-sonnet-4-20250514';
export const JUDGE_PROMPT_VERSION = 'v1-2026-05-11';
export const JUDGE_TEMPERATURE = 0.0;
export const JUDGE_MAX_TOKENS = 2000;
