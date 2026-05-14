# TAG-61: RAG-Mode Planner System Prompt + Tool Set

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Run the existing `PlannerAgent` in a corpus-grounded configuration: a new
system prompt with hard hallucination guards, and a tool set that calls
`CorpusSearch` instead of `WebSearch`.

## Objective

Add a parallel orchestrator config — same planner→searcher DAG, same SSE
events, same loop limits — but:

- **System prompt** instructs the model to ground every claim in retrieved
  chunks and refuse if retrieval returns empty.
- **Tools** (`add_node`, `search_corpus_node`, `read_node_answer`, `finalize`)
  call `CorpusSearch.search()` instead of web search.
- **Citations** are emitted in `[[doc_id:chunk_id]]` form, which the web app's
  `AgentGraphPanel` can later resolve to a doc link.

## Forward reference — TAG-70 prompt storage

This ticket lands BEFORE [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
externalizes prompts to Notion. To make TAG-70 a swap rather than a refactor,
ship the prompt body behind a `get_prompt()` indirection on day one:

```python
# Day-one (this ticket): hardcoded constant accessed through an indirection
def _rag_planner_system() -> str:
    return _RAG_PLANNER_SYSTEM_V1     # the constant below

# After TAG-72:
from ..prompts import get_prompt
def _rag_planner_system() -> str:
    return get_prompt("system.rag_planner")
```

All consumers call `_rag_planner_system()` (or pass it as an argument), not
the constant directly. TAG-73 replaces the body of the function and removes
the constant. No call sites change.

Slug reserved in TAG-71 manifest: **`system.rag_planner`**.

## Requirements

### System prompt

`agent_v2/orchestrator/rag_planner_prompt.py`:

```python
# Day-one body. Will be moved to prompts/system/rag_planner.md by TAG-73.
_RAG_PLANNER_SYSTEM_V1 = """\
You are a research planner that answers ONLY from the provided document
collections. You have access to a corpus search tool that returns ranked text
chunks with stable IDs of the form `doc_id:chunk_id`.

HARD RULES — these are non-negotiable:

1. Every factual claim in your final answer MUST be followed by one or more
   citations in the form `[[doc_id:chunk_id]]`. If you cannot cite, do not say it.
2. If a sub-question's corpus search returns zero chunks, mark that sub-question
   as UNANSWERED and proceed. Do not invent.
3. If the user's question cannot be answered from any retrieved chunk, respond:
   "I don't have information about that in the provided collections."
   No further elaboration.
4. Do NOT use prior knowledge to fill gaps. Treat the corpus as your only source.
5. Quote chunk text verbatim when the user asks for definitions, regulations,
   numbers, or exact wording.
6. When two chunks disagree, surface the disagreement and cite both —
   do not silently pick one.

Plan as a DAG: decompose the user's question into sub-questions, search the
corpus for each, then synthesize. Use the tools provided. Finalize with
`finalize` when every sub-question has either an answer or an UNANSWERED mark.
"""

def _rag_planner_system() -> str:
    """Single indirection so TAG-73 can swap the source from constant → loader
    without touching call sites."""
    return _RAG_PLANNER_SYSTEM_V1
```

### Tool set

`agent_v2/orchestrator/rag_tools.py`:

```python
def build_rag_planner_tools(corpus: CorpusSearch, *, tenant_id: str, collection_ids: list[str]) -> list[ToolDef]:
    async def add_node(args): ...                # same as web planner
    async def search_corpus_node(args):
        node_id = args["node_id"]
        question = args["question"]
        hits = await corpus.search(
            question, tenant_id=tenant_id, collection_ids=collection_ids, top_k=8,
        )
        if not hits:
            return {"node_id": node_id, "status": "UNANSWERED", "chunks": []}
        return {
            "node_id": node_id,
            "status": "OK",
            "chunks": [
                {"id": f"{h.doc_id}:{h.chunk_id}", "text": h.text, "score": h.score}
                for h in hits
            ],
        }
    async def read_node_answer(args): ...        # same as web planner
    async def finalize(args): ...                # same shape as web planner
    return [
        ToolDef(name="add_node",            ..., handler=add_node),
        ToolDef(name="search_corpus_node",  ..., handler=search_corpus_node),
        ToolDef(name="read_node_answer",    ..., handler=read_node_answer),
        ToolDef(name="finalize",            ..., handler=finalize),
    ]
```

### Orchestrator entry

`agent_v2/orchestrator/modes.py`:

```python
async def run_corpus_solve(*, request, user, llm, req, corpus) -> AsyncIterator[SSEEvent]:
    tools = build_rag_planner_tools(
        corpus, tenant_id=user.tenant_id, collection_ids=req.collection_ids,
    )
    planner = PlannerAgent(
        llm=llm,
        tools=tools,
        system_prompt=RAG_PLANNER_SYSTEM,
        max_iterations=settings.planner_max_iterations,
    )
    async for event in planner.run(question=req.messages[-1].content,
                                   history=req.messages[:-1]):
        yield event
```

### Eval suite

Add five evals in `evals/questions.json` (or wherever the harness lives):

| ID | Question | Corpus state | Expected behavior |
|---|---|---|---|
| corpus-001 | "Summarize policy X" | policy X chunks exist | answer with `[[doc:chunk]]` citations |
| corpus-002 | "What does the regulation say about Y?" | regulation Y exists | exact quote w/ citation |
| corpus-003 | "Compare X and Y" | both exist | both cited |
| corpus-004 | "What is the moon made of?" | corpus has no astronomy docs | refusal string verbatim |
| corpus-005 | "When did X happen?" | corpus mentions X but not date | UNANSWERED for date sub-Q |

LLM-judge gate: refusal rate ≥ 0.9 on corpus-004 class queries.

## Implementation Notes

- The planner already handles tool roundtrips (the Cerebras work in TAG-49
  validated this). We are NOT changing the orchestrator code; we are providing
  a different tool registry and prompt.
- Keep `max_iterations` modest (default 6) — corpus questions tend to converge
  faster than web ones.
- `read_node_answer` and `finalize` deliberately share shape with the web
  planner so the web UI's event-render code does not branch.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/orchestrator/test_rag_mode.py` | empty corpus → refusal string | exact match |
| `tests/orchestrator/test_rag_mode.py` | seeded corpus → citations present | regex `\[\[\w+:\w+\]\]` |
| `tests/orchestrator/test_rag_mode.py` | mixed corpus (some sub-Qs UNANSWERED) | UNANSWERED marker present |
| `tests/orchestrator/test_rag_mode.py` | tool list excludes web search | `assert no "search_web" tool` |
| `evals/rag-corpus.eval.json` (new file) | five entries, refusal rate ≥ 0.9 on `corpus-004` | judge pass |

## Acceptance Criteria

- [ ] System prompt enforces refusal on empty retrieval (eval-tested).
- [ ] Final answers carry `[[doc_id:chunk_id]]` citations.
- [ ] Web planner unaffected (regression test in TAG-64).
- [ ] All four unit tests + eval gate pass.

## Dependencies

**Depends on:** TAG-59
**Blocks:** TAG-62, TAG-64

## Risk Factors

| Risk | Mitigation |
|---|---|
| Model ignores citation rule | Two reinforcements: system prompt + final-answer regex check that fails the SSE stream with `error` event if no citation found. |
| Refusal on edge-case false negatives | Eval-tuned; if refusal rate < 0.85 on a known-answer set, ticket reopens. |
| Prompt drift between languages | Keep prompt English-only for now; multilingual is a future ticket. |
