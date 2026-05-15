"""``POST /solve`` — authenticated, tenant-scoped SSE endpoint.

This module is intentionally thin: it composes building blocks from
TAG-52/53 (auth), TAG-57 (resolver), TAG-56 (LLMSpec), and TAG-61/62
(orchestrator) without owning business logic itself.

Composition order (matches the dependency lattice):

  1. ``get_current_user``    →  JWTClaims              (TAG-53)
  2. ``resolve_llm_spec``    →  LLMSpec                (TAG-57)
  3. ``build_client``        →  LLMClient              (TAG-56)
  4. ``select_mode``         →  "graph" | "simple"     (TAG-62 stub)
  5. ``run_solve``           →  AsyncIterator[dict]    (TAG-61 stub)
  6. ``EventSourceResponse`` →  SSE wire bytes         (sse-starlette)

Failure modes the route surfaces directly (everything else propagates
as the underlying dep's HTTPException):

  * Body > ``MAX_BODY_BYTES``  → 413 ``"request body too large"``.
    A naive client appending an unbounded chat history is the
    common case; TAG-63 trims history but we cap here too as a
    defence in depth.
  * Schema validation       → 422 (FastAPI default; pydantic message).
  * Auth                    → 401 (from ``get_current_user``).
  * Model not yours         → 403 (from ``resolve_llm_spec``).
  * Vault / spec construction → 500 (from ``resolve_llm_spec``).

SSE event names mirror ``/solve_v2`` exactly so the web app's
``AgentGraphPanel`` parser is a no-op port. Per TAG-58 spec the legacy
``/solve_v2`` route MUST NOT be touched — verified by the regression
test in the same suite.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sse_starlette.sse import EventSourceResponse

from ..auth.deps import get_current_user
from ..auth.resolve import resolve_llm_spec
from ..auth.types import JWTClaims
from ..llm.spec import build_client
from ..orchestrator.modes import run_solve, select_mode
from .solve_request import SolveRequest

log = logging.getLogger(__name__)

router = APIRouter()

# 64 KiB. The ticket calls out body-size cap explicitly:
# "messages[] can balloon, so cap early." 64 KiB is generous for ~30
# Anthropic-sized turns and comfortably under any reverse-proxy limit.
MAX_BODY_BYTES = 64 * 1024


def _check_body_size(request: Request) -> None:
    """Reject bodies > MAX_BODY_BYTES using ``Content-Length`` header.

    Chunked / unknown-length bodies pass through here (no header) and
    are caught by the framework's own buffer ceiling. The point of
    this check is to fail-fast on the common "client serialised a 5 MB
    history" case before we allocate a parser.
    """
    raw = request.headers.get("content-length")
    if raw is None:
        return
    try:
        size = int(raw)
    except ValueError:
        # Malformed header — let FastAPI/Starlette handle it normally.
        return
    if size > MAX_BODY_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "request body too large",
        )


@router.post("/solve")
async def solve(
    req: SolveRequest,
    request: Request,
    user: JWTClaims = Depends(get_current_user),
) -> EventSourceResponse:
    """Stream an authenticated SSE answer for ``req.messages``.

    Order is load-bearing — auth runs first (cheap 401 before any DB
    or LLM work), then registry+vault (one DB query + one decrypt),
    then mode selection (synchronous), then the orchestrator stream.
    """
    _check_body_size(request)

    spec = await resolve_llm_spec(user, model=req.model, provider=req.provider)
    llm = build_client(spec)
    mode = select_mode(req)

    async def event_stream() -> AsyncIterator[dict[str, str]]:
        # Mirror /solve_v2's error-surface shape: a terminal frame
        # carrying {"error": {"msg": ..., "details": ...}} rather than
        # a hard close. Same shape as /solve_v2 so the web parser is
        # already covering this branch.
        try:
            async for event in run_solve(
                request=request,
                user=user,
                llm=llm,
                req=req,
                mode=mode,
            ):
                yield {"data": json.dumps(event, ensure_ascii=False)}
        except Exception as exc:  # noqa: BLE001 — surface to client
            log.exception("solve error")
            yield {
                "data": json.dumps(
                    {
                        "error": {
                            "msg": "Internal error in solve",
                            "details": str(exc),
                        }
                    },
                    ensure_ascii=False,
                )
            }

    return EventSourceResponse(event_stream())


__all__ = ["MAX_BODY_BYTES", "router", "solve"]
