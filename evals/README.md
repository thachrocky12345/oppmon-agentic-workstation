# Arkon Evals

Regression-test the agentic chat workflow against reference answers from ChatGPT and Claude. Score with an LLM judge. Track score deltas as you tune models and prompts.

---

## TL;DR

```bash
# 1. Once: paste reference answers from ChatGPT and Claude.
#    For each Q01–Q10, fill in:
#      evals/references/chatgpt/Q01.md
#      evals/references/claude/Q01.md

# 2. Run Arkon against all 10 questions (both modes).
pnpm eval:run

# 3. Score with the LLM judge.
pnpm eval:judge

# 4. See the trend across runs.
pnpm eval:report
```

---

## Directory layout

```
evals/
├── README.md              ← this file
├── questions.json         ← the 10 questions + per-question rubric weights
├── references/            ← reference answers you capture manually
│   ├── chatgpt/Q01.md     ← paste ChatGPT's answer here
│   ├── chatgpt/Q02.md
│   ├── ...
│   ├── claude/Q01.md      ← paste Claude's answer here
│   ├── claude/Q02.md
│   └── ...
├── runs/                  ← captured Arkon outputs (one dir per run)
│   └── 2026-05-11T20-30/
│       ├── manifest.json          ← run metadata (date, mode, target URL, model used)
│       ├── Q01-simple.json        ← Arkon /api/rag/chat/stream output
│       ├── Q01-graph.json         ← Arkon graph-mode (/solve_v2) output
│       ├── Q02-simple.json
│       └── scores.json            ← written by `eval:judge`
├── reports/               ← aggregated cross-run trend reports
│   └── latest.md
├── scripts/               ← TypeScript runners
│   ├── run.ts
│   ├── judge.ts
│   ├── report.ts
│   └── lib/               ← shared helpers
└── package.json
```

---

## Workflow in detail

### Phase 1 — capture references (once per question set change)

For each question in `evals/questions.json`:

1. Open ChatGPT (chatgpt.com), paste the full question, save the response to `evals/references/chatgpt/<id>.md`.
2. Open Claude (claude.ai), paste the same question, save the response to `evals/references/claude/<id>.md`.

Keep them verbatim — including any inline citations the chatbots produce. The judge needs to see the same surface area you'd be comparing against by eye.

If a question becomes stale or irrelevant, edit `questions.json` and re-capture references.

### Phase 2 — run the agent

```bash
pnpm eval:run                     # run all 10 questions, both modes
pnpm eval:run --questions Q01 Q04 # only specific questions
pnpm eval:run --mode graph        # only graph mode
pnpm eval:run --label tune-v2     # tag this run (default = ISO timestamp)
```

Each run writes a new directory under `evals/runs/<timestamp_or_label>/` containing:
- One `<id>-<mode>.json` per question/mode with the full transcript, latency, citations.
- A `manifest.json` capturing what URL was hit, what model was used, what flags were on.

The run is idempotent — re-running with the same label overwrites that label's directory.

### Phase 3 — judge the run

```bash
pnpm eval:judge                   # score the most recent run
pnpm eval:judge --run tune-v2     # score a specific labelled run
pnpm eval:judge --judge claude-opus-4-7   # override the judge model
```

For every question × mode, the judge sees:
- The question
- The expected key points (from `questions.json`)
- The two reference answers (ChatGPT, Claude) — **labelled A and B in a randomized order** to keep it semi-blind
- The Arkon candidate answer — **labelled C**

…and returns structured JSON scores (0–5 per axis) plus per-axis rationale and notable wins/losses.

Output: `evals/runs/<id>/scores.json`.

### Phase 4 — read the trend

```bash
pnpm eval:report
```

Generates `evals/reports/latest.md` with:
- Per-axis score table across all runs (rows = runs, columns = axes).
- Per-question deltas vs the previous run (green = improvement, red = regression).
- Best and worst questions by current absolute score.
- Suspected regressions: questions whose score dropped >1 point between runs.

---

## Rubric

Each answer is scored on six **0–5** axes:

| Axis | What it measures |
|---|---|
| **Factual accuracy** | Claims are correct, no hallucinated facts |
| **Completeness** | Covers all parts of the question |
| **Citation quality** | URLs resolve, attribution is clear and real |
| **Structure / clarity** | Logical, scannable, well-formatted |
| **Depth / insight** | Goes beyond surface, names tradeoffs |
| **Reasoning** | Cause-and-effect, comparisons explicit |

Graph-mode answers get two extra axes:

| Axis | What it measures |
|---|---|
| **Decomposition** | Sub-questions are sensible and non-redundant |
| **Source diversity** | RAG / web / both are used appropriately |

Per-question weights live in `questions.json` under `rubric_weights` — they don't affect raw axis scores but they do affect the weighted "total" the report sorts by.

---

## Anti-drift practices for the judge

LLM-as-judge drift is real. We mitigate it three ways:

1. **Pin the judge model** in `evals/scripts/lib/judge-config.ts`. The default is `claude-sonnet-4-6`. When you upgrade, do it deliberately and re-score the previous 3 runs to establish the new baseline.
2. **Randomize reference labels** (A/B/C). Position bias is one of the strongest judge biases — randomization neutralizes it.
3. **Save the exact judge prompt + version** in every `scores.json`. If you ever change the prompt, you'll see it in the diff.

---

## Cost notes

- The judge call is the expensive part — one LLM call per scored question. With 10 questions × 2 modes = 20 calls per `eval:judge` run. Using Claude Sonnet 4.6 at ~$3/MTok input + ~$15/MTok output, expect well under $1 per full judge run.
- Run cost depends on which Arkon path you exercise. Graph mode calls the planner + 2–4 sub-searchers per question, so it's 3–5x more expensive than simple mode per question.
