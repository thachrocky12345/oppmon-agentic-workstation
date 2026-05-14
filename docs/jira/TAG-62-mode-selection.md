# TAG-62: Mode-Selection Logic in `/solve`

## Description

**Suggested Points:** 2
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Decide which orchestrator to run based on the four `(webFallback, collectionIds)`
quadrants. This is a tiny ticket but it owns the contract that affects every
downstream behavior — keep it explicit.

## Objective

```python
class SolveMode(StrEnum):
    WEB         = "web"          # web search only
    CORPUS      = "corpus"       # corpus only, no web
    HYBRID      = "hybrid"       # corpus first, web fallback
    INVALID     = "invalid"      # rejected at request validation

def select_mode(req: SolveRequest) -> SolveMode: ...
```

## Requirements

### Decision table

| `webFallback` | `collectionIds` | Mode | Notes |
|---|---|---|---|
| `true`  | `[]`        | `WEB`    | current `/solve_v2` behavior |
| `false` | `[…]`       | `CORPUS` | new behavior, TAG-61 |
| `true`  | `[…]`       | `HYBRID` | try corpus first, fall through to web if all sub-Qs UNANSWERED |
| `false` | `[]`        | rejected by `SolveRequest.model_validator` → never reaches `select_mode` |

`select_mode` itself never returns `INVALID` — that quadrant is blocked at the
schema layer (TAG-58). The enum value exists for completeness in tests.

### Implementation

`agent_v2/orchestrator/modes.py`:

```python
def select_mode(req: SolveRequest) -> SolveMode:
    has_corpus = bool(req.collection_ids)
    if has_corpus and not req.web_fallback:
        return SolveMode.CORPUS
    if has_corpus and req.web_fallback:
        return SolveMode.HYBRID
    if not has_corpus and req.web_fallback:
        return SolveMode.WEB
    return SolveMode.INVALID    # unreachable; defense-in-depth

async def run_solve(*, request, user, llm, req, mode):
    if mode is SolveMode.WEB:
        async for ev in run_web_solve(request=request, llm=llm, req=req):
            yield ev
    elif mode is SolveMode.CORPUS:
        corpus = _build_corpus_search()
        async for ev in run_corpus_solve(request=request, user=user, llm=llm,
                                         req=req, corpus=corpus):
            yield ev
    elif mode is SolveMode.HYBRID:
        corpus = _build_corpus_search()
        async for ev in run_hybrid_solve(request=request, user=user, llm=llm,
                                         req=req, corpus=corpus):
            yield ev
    else:
        raise RuntimeError("unreachable: invalid mode")
```

### Hybrid mode policy

`run_hybrid_solve` runs `run_corpus_solve` first. After the planner finalizes:

- If every sub-question is `OK` and the corpus answer is non-empty → emit as final.
- Otherwise, run `run_web_solve` for the unanswered sub-questions only,
  merging citations from both into the final answer.

Citation format in hybrid:

- Corpus: `[[doc_id:chunk_id]]`
- Web: `[<url>]` (existing web planner format — DO NOT change).

The web UI already renders both shapes; do not unify them.

## Implementation Notes

- `_build_corpus_search()` constructs `PgCorpusSearch(embed=create_embedding_provider())`.
  Singleton-per-process is OK (it holds no per-tenant state).
- `run_web_solve` is the EXTRACTED orchestrator from current `/solve_v2`. Refactor
  `mount_v2` to reuse it. The extraction is in-scope here; the goal is no copy-paste.
- This ticket does NOT introduce a feature flag for hybrid — it is on whenever
  both inputs are present.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/orchestrator/test_mode_select.py` | `(true, [])` → WEB | |
| `tests/orchestrator/test_mode_select.py` | `(false, [a])` → CORPUS | |
| `tests/orchestrator/test_mode_select.py` | `(true, [a])` → HYBRID | |
| `tests/orchestrator/test_mode_select.py` | `(false, [])` rejected upstream | request validator raises |
| `tests/orchestrator/test_hybrid.py` | all sub-Qs answered in corpus → no web call | mock asserts |
| `tests/orchestrator/test_hybrid.py` | one sub-Q UNANSWERED in corpus → web called | mock asserts |
| `tests/orchestrator/test_hybrid.py` | citations from both sources present | regex |

## Acceptance Criteria

- [ ] All seven tests pass.
- [ ] `run_web_solve` extracted; `/solve_v2` regression test still green.
- [ ] Hybrid never calls web when corpus fully answers.
- [ ] Citation formats unchanged from existing UI expectations.

## Dependencies

**Depends on:** TAG-58, TAG-59, TAG-61
**Blocks:** TAG-64

## Risk Factors

| Risk | Mitigation |
|---|---|
| Web orchestrator double-extracted with subtle drift | One extraction, both routes reuse. |
| Hybrid mode fans out to web even when corpus suffices | Test asserts on web-mock call count. |
| Citations clash between formats | Keep two formats; UI handles both. |
