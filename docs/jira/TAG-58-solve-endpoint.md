# TAG-58: `POST /solve` Route + Request Schema

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Wire the new authenticated endpoint. This ticket is intentionally THIN — it
composes the building blocks from TAG-51..57 and TAG-59..63 without owning any
business logic itself.

## Objective

`POST /solve` returns an SSE stream identical in event-format to `/solve_v2`,
but authenticated and tenant-scoped.

## Requirements

### Request schema

`agent_v2/api/solve_request.py`:

```python
from pydantic import BaseModel, Field, model_validator
from typing import Literal

class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class SolveRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    collection_ids: list[str] = Field(default_factory=list, alias="collectionIds")
    model: str
    provider: str
    enable_tools: bool = Field(default=True, alias="enableTools")
    web_fallback: bool = Field(default=True, alias="webFallback")

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _at_least_one_grounding_source(self):
        if not self.web_fallback and not self.collection_ids:
            raise ValueError("webFallback=false requires at least one collectionId")
        last = self.messages[-1]
        if last.role != "user":
            raise ValueError("last message must be a user message")
        return self
```

### Route

`agent_v2/api/solve.py`:

```python
from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse
from ..auth.deps import get_current_user
from ..auth.types import JWTClaims
from ..auth.resolve import resolve_llm_spec
from ..llm.spec import build_client
from ..orchestrator.modes import select_mode, run_solve
from .solve_request import SolveRequest

router = APIRouter()

@router.post("/solve")
async def solve(
    req: SolveRequest,
    request: Request,
    user: JWTClaims = Depends(get_current_user),
):
    spec = await resolve_llm_spec(user, model=req.model, provider=req.provider)
    llm  = build_client(spec)
    mode = select_mode(req)            # TAG-62
    return EventSourceResponse(
        run_solve(                     # TAG-61/TAG-62 orchestrator entry
            request=request,
            user=user,
            llm=llm,
            req=req,
            mode=mode,
        ),
        media_type="text/event-stream",
    )
```

### Mounting

`agent_v2/app.py` adds:

```python
from .api.solve import router as solve_router
def mount_v2(app):
    ...                       # existing /solve_v2 wiring
    app.include_router(solve_router)
```

`/solve_v2` MUST NOT be touched.

### SSE event shape parity

Reuse the same event names as `/solve_v2`: `step`, `node_added`, `node_answer`,
`final`, `error`. The web app's `AgentGraphPanel` already parses these.

## Implementation Notes

- This ticket does NOT implement `run_solve` or `select_mode`. It calls into
  TAG-61/TAG-62 deliverables. Stubs are fine for the PR; concrete bodies land
  in those tickets.
- Feature flag `ENABLE_SOLVE_V3=true` is consulted in `mount_v2` — if false,
  `solve_router` is not mounted, so a rollback is a one-env-flip.
- Request body limit 64 KiB (FastAPI default + explicit `max_content_size` via
  middleware) — `messages[]` can balloon, so cap early.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/api/test_solve_route.py` | no auth | 401 |
| `tests/api/test_solve_route.py` | invalid JWT | 401 |
| `tests/api/test_solve_route.py` | model not owned | 403 |
| `tests/api/test_solve_route.py` | `webFallback=false, collectionIds=[]` | 422 |
| `tests/api/test_solve_route.py` | last message role != user | 422 |
| `tests/api/test_solve_route.py` | happy path returns SSE 200 with text/event-stream | header check |
| `tests/api/test_solve_route.py` | `/solve_v2` still works | regression |
| `tests/api/test_solve_route.py` | flag off → 404 on /solve | feature flag check |

## Acceptance Criteria

- [ ] All eight tests pass.
- [ ] `/solve_v2` behavior unchanged (regression in same suite).
- [ ] No body field accepts plaintext API keys.
- [ ] Feature flag gates the mount.

## Dependencies

**Depends on:** TAG-53, TAG-57, TAG-62 (mode selection signature)
**Blocks:** TAG-64

## Risk Factors

| Risk | Mitigation |
|---|---|
| Large `messages[]` DoS | Body size cap + TAG-63 trims history. |
| SSE event shape drift breaks web UI | Reuse same event names; integration test in TAG-64 captures actual frames. |
| Feature flag forgotten in prod | Default true after first stable release; documented in TAG-65. |
