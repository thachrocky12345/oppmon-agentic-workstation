/**
 * Shared types for the eval harness.
 *
 * Kept in one file so `run.ts`, `judge.ts`, `report.ts` all agree on the
 * shape of what lives in `evals/runs/<id>/*.json`.
 */

export type Mode = 'simple' | 'graph';

export interface Question {
  id: string;
  title: string;
  category: string;
  question: string;
  rubric_weights: Record<RubricAxis, number>;
  expected_keypoints: string[];
  favors?: string[];
}

export interface QuestionFile {
  version: number;
  questions: Question[];
}

export const CORE_AXES = [
  'factuality',
  'completeness',
  'citations',
  'structure',
  'depth',
  'reasoning',
] as const;

export const GRAPH_BONUS_AXES = ['decomposition', 'source_diversity'] as const;

export type CoreAxis = (typeof CORE_AXES)[number];
export type GraphAxis = (typeof GRAPH_BONUS_AXES)[number];
export type RubricAxis = CoreAxis | GraphAxis;

/**
 * Per-citation metadata mirrored from the graph-mode backend
 * (`WebSearchGraph.citation_meta` in
 * `agent_v2/orchestrator/graph.py:flush_node_citations`).
 *
 * Keys are stringly-typed because web citations carry integer indices
 * while RAG citations carry "doc_id:chunk_id" strings — both coexist.
 */
export interface CitationMeta {
  index: string;
  doc_id?: string | null;
  chunk_id?: string | null;
  title?: string | null;
  source_url?: string | null;
  score?: number | null;
  page_number?: number | null;
}

/** One question×mode result from a single eval run. */
export interface RunResult {
  question_id: string;
  mode: Mode;
  /** Wall-clock latency (ms) for the whole request. */
  latency_ms: number;
  /** Final answer text. */
  answer: string;
  /** Per-mode raw extras. */
  citations?: Array<{
    index: number;
    source?: string;
    url?: string;
    title?: string;
  }>;
  /** Graph-mode only: snapshot of final graph state. */
  graph?: {
    nodes: Record<string, unknown>;
    adj: Record<string, unknown>;
    references: Record<string, string>;
    /**
     * Rich per-citation metadata keyed by "doc_id:chunk_id" (or numeric
     * index for web citations). Populated by `flush_node_citations()`
     * on the backend; consumed by the frontend bibliography renderer
     * and by the eval scoring layer when it wants per-citation scores
     * (e.g. for NDCG@k computation).
     *
     * Each value carries: index, doc_id?, chunk_id?, title?,
     * source_url?, score?, page_number?.
     */
    citation_meta?: Record<string, CitationMeta>;
  };
  /**
   * TAG-CR — retrieval-quality fields for the contextual-retrieval A/B
   * eval. Both arrays hold normalized citation keys ("doc_id:chunk_id"),
   * stripped of the [[...]] sentinel.
   *
   *   - retrieved[]: union of every chunk id surfaced by ANY searcher
   *                  event during the run (the retriever's recall set).
   *   - cited[]:     chunk ids that the planner's final synthesis
   *                  references (what the answer actually drew on).
   *
   * These are computed in `arkon-client.ts:askGraph` from the SSE stream's
   * `response.references` dict; the dict keys are already in
   * `doc:chunk` form per the rag-mode citation contract in
   * `agent_v2/orchestrator/rag_tools.py`.
   */
  retrieved?: string[];
  cited?: string[];
  /** Raw SSE events for debugging — capped to avoid GB-scale files. */
  raw_events_count: number;
  /** True if the run threw before completion. */
  error?: string;
}

export interface RunManifest {
  /** Stable id for this run (timestamp or user-provided label). */
  run_id: string;
  /** ISO 8601 timestamp when the run started. */
  started_at: string;
  /** ISO 8601 timestamp when the run finished (all questions done). */
  finished_at: string;
  /** Endpoints hit. */
  endpoints: {
    simple: string;
    graph: string;
  };
  /** Which modes were exercised. */
  modes: Mode[];
  /** Which question ids were exercised. */
  question_ids: string[];
  /** Flags passed to /api/rag/chat (simple) and /solve_v2 (graph). */
  flags: {
    enable_tools: boolean;
    web_fallback: boolean;
    collection_ids: string[];
  };
  /** Arkon model (best-effort — populated from /api/models if available). */
  arkon_model_hint?: string;
  /** Free-form notes (e.g. "after switching to Sonnet 4.6"). */
  notes?: string;
}

/** One per-axis score with a brief rationale. */
export interface AxisScore {
  /** 0–5 inclusive. Half-points allowed. */
  score: number;
  /** One-sentence rationale referencing the candidate text. */
  rationale: string;
}

export interface JudgedAnswer {
  question_id: string;
  mode: Mode;
  /** Raw axis scores. */
  axes: Partial<Record<RubricAxis, AxisScore>>;
  /** Sum of axis scores × per-question weights (from `questions.json`). */
  weighted_total: number;
  /** Sum of raw axis scores (no weights). */
  raw_total: number;
  /** Things the candidate did notably better than the references. */
  notable_wins: string[];
  /** Things the candidate did notably worse than the references. */
  notable_losses: string[];
  /** How the judge perceived candidate ranking against references. */
  rank_vs_refs?: {
    /** Sorted ['C','A','B'] best-to-worst. C = Arkon candidate. */
    order: string[];
    /** Judge's reasoning for the ordering. */
    reasoning: string;
  };
  /** Raw JSON from the judge in case we want to re-process. */
  raw_judge_output: unknown;
}

export interface ScoreFile {
  run_id: string;
  judged_at: string;
  judge_model: string;
  judge_prompt_version: string;
  /** Per question × mode score. */
  results: JudgedAnswer[];
}
