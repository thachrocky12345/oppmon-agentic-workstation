// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * LLM-as-judge prompt builder.
 *
 * Returns a SYSTEM prompt and a USER prompt for the Anthropic Messages API.
 * The user prompt shuffles references and candidate into A/B/C slots to
 * reduce position bias, and records the mapping so we can de-anonymize the
 * judge's output.
 */

import type { Question, Mode, RubricAxis } from './types.js';
import { CORE_AXES, GRAPH_BONUS_AXES } from './types.js';

export interface JudgeInputs {
  question: Question;
  mode: Mode;
  chatgptRef: string;
  claudeRef: string;
  arkonCandidate: string;
}

export interface AnonymizedPrompt {
  system: string;
  user: string;
  /** Map of slot ('A' | 'B' | 'C') -> author ('chatgpt' | 'claude' | 'arkon'). */
  slotMap: Record<'A' | 'B' | 'C', 'chatgpt' | 'claude' | 'arkon'>;
}

const AXIS_DESCRIPTIONS: Record<RubricAxis, string> = {
  factuality: 'Claims are correct; no fabricated facts, names, dates, or quotes.',
  completeness: 'Addresses every explicit part of the question, including sub-bullets.',
  citations:
    'URLs resolve to a real page; attribution is clear; citation markers match listed sources.',
  structure: 'Logical organization; easy to scan; appropriate use of lists or headings.',
  depth: 'Goes beyond the surface; surfaces concrete tradeoffs, edge cases, or numbers.',
  reasoning:
    'Causes, comparisons, and consequences are made explicit; the *why* is articulated.',
  decomposition:
    'Sub-questions chosen by the agent are sensible, non-redundant, and cover the question.',
  source_diversity:
    'Uses RAG / web / both appropriately; not over-reliant on one source type.',
};

const SYSTEM_PROMPT = `You are an expert evaluator of LLM agent responses. You will compare three answers (A, B, C) to a single question and produce structured numeric scores for one of them — the **candidate**.

You will not be told which letter is the candidate; treat all three as equally weighted reference material for triangulation, then score the one the user asks you to score using the rubric.

Output strict JSON conforming to the schema in the user message. Do not include any prose outside the JSON.`;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildPrompt(inputs: JudgeInputs): AnonymizedPrompt {
  const { question, mode, chatgptRef, claudeRef, arkonCandidate } = inputs;
  const authors: Array<{ key: 'chatgpt' | 'claude' | 'arkon'; text: string }> = [
    { key: 'chatgpt', text: chatgptRef },
    { key: 'claude', text: claudeRef },
    { key: 'arkon', text: arkonCandidate },
  ];
  const shuffled = shuffle(authors);
  const slotMap: AnonymizedPrompt['slotMap'] = { A: shuffled[0].key, B: shuffled[1].key, C: shuffled[2].key };
  const candidateSlot = (Object.entries(slotMap) as Array<['A' | 'B' | 'C', typeof shuffled[number]['key']]>)
    .find(([_, who]) => who === 'arkon')![0];

  const axes = mode === 'graph' ? [...CORE_AXES, ...GRAPH_BONUS_AXES] : [...CORE_AXES];
  const axisList = axes.map((a) => `  - "${a}": ${AXIS_DESCRIPTIONS[a]}`).join('\n');
  const scoreSchema = axes
    .map((a) => `      "${a}": { "score": <0-5, halves allowed>, "rationale": "<one sentence>" }`)
    .join(',\n');

  const keypoints = question.expected_keypoints.length
    ? `\nExpected key points (use only as a sanity check, not as a checklist):\n${question.expected_keypoints
        .map((k) => `  • ${k}`)
        .join('\n')}\n`
    : '';

  const user = `# Question

${question.question}
${keypoints}

# Three answers (presented in shuffled order)

## Answer A
${shuffled[0].text.trim() || '(empty)'}

## Answer B
${shuffled[1].text.trim() || '(empty)'}

## Answer C
${shuffled[2].text.trim() || '(empty)'}

# Your task

Score **Answer ${candidateSlot}** on the rubric below. Use Answers ${['A', 'B', 'C'].filter((x) => x !== candidateSlot).join(' and ')} only as reference points to triangulate factual claims and gauge what a strong answer for this question looks like.

## Rubric

Score each axis on a 0–5 scale (halves allowed):

${axisList}

## Required output (strict JSON)

{
  "axes": {
${scoreSchema}
  },
  "notable_wins":   [ "<short string>", ... ],   /* things Answer ${candidateSlot} did better than the others */
  "notable_losses": [ "<short string>", ... ],   /* things Answer ${candidateSlot} did worse than the others */
  "rank_vs_refs": {
    "order": ["A","B","C"],                       /* best-to-worst by overall quality, your call */
    "reasoning": "<one paragraph>"
  }
}

Output the JSON only — no markdown fences, no prose before or after.`;

  return { system: SYSTEM_PROMPT, user, slotMap };
}
