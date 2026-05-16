/**
 * RAG Contextualizer Service
 *
 * Implements the Anthropic Contextual Retrieval pattern (Sept 2024):
 *   https://www.anthropic.com/news/contextual-retrieval
 *
 * Given a document's full text + its chunks, generates:
 *   1. A ~150-word document-level summary (stored once on rag_documents).
 *   2. A ~50-100 token chunk-specific situating prefix per chunk
 *      (stored on rag_chunks and PREPENDED to the chunk before embedding +
 *      BM25 indexing). The prefix is what makes "the discount only applies
 *      to enterprise customers" disambiguate from every other discount in
 *      the corpus.
 *
 * Two implementation paths:
 *
 *   - **Small doc** (≤ ~1024 tokens, estimated as `fullText.length / 4`):
 *     a single LLM call returns `{summary, prefixes: [...]}` as JSON. No
 *     prompt caching benefit at this size — the full document fits in one
 *     prompt easily.
 *
 *   - **Large doc** (> ~1024 tokens): one call for the summary, then N
 *     calls (one per chunk) for prefixes, each using `cache_control:
 *     {type: 'ephemeral'}` on the full-document system block. Anthropic's
 *     prompt cache saves ~90% on the repeated full-document tokens.
 *
 * Failure mode: **soft-fail**. Any LLM/network/JSON error is caught,
 * logged, and the function returns empty strings + `model='fallback'`.
 * Callers store NULL for both columns and the baseline retrieval path
 * continues to work. This is critical — the contextualizer must not
 * break ingest when Anthropic rate-limits us.
 */

import Anthropic from '@anthropic-ai/sdk';
import { pino } from 'pino';

const logger = pino({ name: 'rag-contextualizer' });

// ============================================================================
// Types
// ============================================================================

export interface ContextualizerInput {
  /** Full document text post-extraction. */
  fullText: string;
  /** Chunk strings in order. Indices align 1:1 with the returned prefixes. */
  chunks: string[];
  /** Override the default model. Defaults to env CONTEXTUALIZER_MODEL or Haiku. */
  model?: string;
}

export interface ContextualizerOutput {
  /** Document-level summary. Empty string on fallback. */
  summary: string;
  /** Per-chunk situating prefixes, 1:1 with `chunks`. Empty strings on fallback. */
  prefixes: string[];
  /** Resolved model id, or 'fallback' on error. Useful for cost dashboards + audit. */
  model: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default Haiku model — value is configurable via env to absorb model drift. */
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Below this estimated token count we use the single-call path. */
const SMALL_DOC_TOKEN_THRESHOLD = 1024;

/** Rough char→token estimate. Conservative; accurate enough for path selection. */
const CHARS_PER_TOKEN = 4;

const SUMMARY_PROMPT =
  'Summarize the document in 100-150 words. Cover the main topic, scope, and intended audience. Output only the summary text, no preamble or markdown.';

const CHUNK_PREFIX_PROMPT_TEMPLATE = (chunk: string) =>
  `Here is the chunk we want to situate within the whole document:\n<chunk>\n${chunk}\n</chunk>\nPlease give a short succinct context (1-3 sentences) to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`;

/** Combined single-call prompt for small docs. Asks for JSON. */
const SMALL_DOC_PROMPT_TEMPLATE = (fullText: string, chunks: string[]) => {
  const numberedChunks = chunks
    .map((c, i) => `<chunk index="${i}">\n${c}\n</chunk>`)
    .join('\n');
  return `You are helping prepare a document for retrieval-augmented search.

Document:
<document>
${fullText}
</document>

Chunks (in order):
${numberedChunks}

Produce a JSON object with this exact shape:
{
  "summary": "<100-150 word document summary>",
  "prefixes": ["<prefix for chunk 0>", "<prefix for chunk 1>", ...]
}

Each prefix must be 1-3 sentences situating that chunk in the document for search.
The "prefixes" array MUST have exactly ${chunks.length} entries in order.
Output ONLY the JSON object, no markdown fences, no preamble.`;
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate document summary + per-chunk prefixes.
 *
 * Never throws. On any error returns `{summary: '', prefixes: [empty * N], model: 'fallback'}`.
 */
export async function contextualize(
  input: ContextualizerInput,
): Promise<ContextualizerOutput> {
  const { fullText, chunks } = input;
  const model =
    input.model ?? process.env.CONTEXTUALIZER_MODEL ?? DEFAULT_MODEL;

  // Edge case: no chunks — nothing to do. Return early with a model id so
  // callers can still record what would have run.
  if (chunks.length === 0) {
    return { summary: '', prefixes: [], model };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn(
      'ANTHROPIC_API_KEY not set; contextualizer falling back to empty strings',
    );
    return fallback(chunks);
  }

  const client = new Anthropic({ apiKey, timeout: 60_000 });
  const estTokens = Math.ceil(fullText.length / CHARS_PER_TOKEN);

  try {
    if (estTokens <= SMALL_DOC_TOKEN_THRESHOLD) {
      return await contextualizeSmall(client, model, fullText, chunks);
    }
    return await contextualizeLarge(client, model, fullText, chunks);
  } catch (err) {
    logger.warn(
      { err, model, chunkCount: chunks.length, estTokens },
      'contextualizer LLM call failed; falling back to empty strings',
    );
    return fallback(chunks);
  }
}

// ============================================================================
// Small-doc path: one call returning JSON
// ============================================================================

async function contextualizeSmall(
  client: Anthropic,
  model: string,
  fullText: string,
  chunks: string[],
): Promise<ContextualizerOutput> {
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: SMALL_DOC_PROMPT_TEMPLATE(fullText, chunks),
      },
    ],
  });

  const text = extractText(response);
  const parsed = parseJson(text, chunks.length);

  if (!parsed) {
    logger.warn(
      { model, textPreview: text.slice(0, 120) },
      'small-doc contextualizer returned non-parseable JSON; falling back',
    );
    return fallback(chunks);
  }

  return { summary: parsed.summary, prefixes: parsed.prefixes, model };
}

// ============================================================================
// Large-doc path: 1 summary call + N prefix calls with prompt caching
// ============================================================================

async function contextualizeLarge(
  client: Anthropic,
  model: string,
  fullText: string,
  chunks: string[],
): Promise<ContextualizerOutput> {
  // Shared cached system block — the same full-document context is
  // sent on every call, so Anthropic's ephemeral cache deduplicates it.
  // Cache hits are billed at ~10% of input cost.
  const cachedSystem: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: `You are a document summarization and contextualization assistant.\n\nFull document:\n<document>\n${fullText}\n</document>`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  // 1. Summary
  const summaryResp = await client.messages.create({
    model,
    max_tokens: 512,
    system: cachedSystem,
    messages: [{ role: 'user', content: SUMMARY_PROMPT }],
  });
  const summary = extractText(summaryResp).trim();

  // 2. Per-chunk prefixes (sequential to keep the cache hot — parallel
  //    requests can race the cache miss path and pay full cost on the
  //    first few. Sequential is slower but ~90% cheaper.).
  const prefixes: string[] = [];
  for (const chunk of chunks) {
    const prefixResp = await client.messages.create({
      model,
      max_tokens: 256,
      system: cachedSystem,
      messages: [{ role: 'user', content: CHUNK_PREFIX_PROMPT_TEMPLATE(chunk) }],
    });
    prefixes.push(extractText(prefixResp).trim());
  }

  return { summary, prefixes, model };
}

// ============================================================================
// Helpers
// ============================================================================

function fallback(chunks: string[]): ContextualizerOutput {
  return {
    summary: '',
    prefixes: chunks.map(() => ''),
    model: 'fallback',
  };
}

function extractText(response: Anthropic.Message): string {
  const parts: string[] = [];
  for (const block of response.content) {
    if (block.type === 'text') {
      parts.push(block.text);
    }
  }
  return parts.join('');
}

/**
 * Tolerant JSON parser for the small-doc path. Accepts either bare JSON or
 * a JSON object wrapped in ```json ... ``` fences. Returns null on any
 * structural problem so the caller can fall back cleanly.
 */
function parseJson(
  text: string,
  expectedPrefixCount: number,
): { summary: string; prefixes: string[] } | null {
  let candidate = text.trim();

  // Strip markdown code fences if Claude added them despite the prompt.
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    candidate = fenceMatch[1].trim();
  }

  // Find the first '{' — Claude sometimes prefaces with a sentence even when
  // told not to. Be permissive on the way in, strict on validation.
  const braceIdx = candidate.indexOf('{');
  if (braceIdx > 0) {
    candidate = candidate.slice(braceIdx);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (typeof obj !== 'object' || obj === null) return null;
  const rec = obj as Record<string, unknown>;
  const summary = rec.summary;
  const prefixes = rec.prefixes;

  if (typeof summary !== 'string') return null;
  if (!Array.isArray(prefixes)) return null;
  if (prefixes.length !== expectedPrefixCount) return null;
  if (!prefixes.every((p): p is string => typeof p === 'string')) return null;

  return { summary, prefixes };
}
