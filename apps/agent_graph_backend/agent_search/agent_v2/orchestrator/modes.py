"""Mode selection + run entry for ``POST /solve`` (TAG-58 seam only).

TAG-58 owns the route wiring. The two functions below are the
contract the route consumes — concrete implementations land in
TAG-61 (``run_solve`` orchestrator) and TAG-62 (``select_mode``
classifier). Until those tickets land the stubs here:

  * ``select_mode(req)`` returns ``"graph"`` whenever tools are
    enabled, ``"simple"`` otherwise. This is the minimal heuristic
    that satisfies TAG-58's tests; TAG-62 replaces it with the real
    intent-classifier and may add more modes.

  * ``run_solve(...)`` is an async generator yielding the same SSE
    event dicts as ``/solve_v2`` (``step`` / ``node_added`` /
    ``node_answer`` / ``final`` / ``error``). The stub emits a
    single ``step`` with ``mode`` and a terminal ``final`` carrying
    a placeholder answer — enough to verify the streaming wire
    end-to-end (status + ``text/event-stream`` header + at least
    one frame) without coupling TAG-58's tests to the planner
    internals.

Both signatures are stable: TAG-61/62 swap the bodies, not the
shape. Anything else would force a route-level change and break
TAG-58's "thin wiring" promise.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from fastapi import Request

    from ..api.solve_request import SolveRequest
    from ..auth.types import JWTClaims
    from ..llm.base import LLMClient


Mode = Literal["graph", "simple"]


def select_mode(req: SolveRequest) -> Mode:
    """Pick orchestrator mode from the request shape.

    TAG-62 will replace this with an intent classifier. The stub
    here uses ``enable_tools`` as a proxy: if the client opts into
    tools, we plan a graph; otherwise we run a single-shot reply.
    """
    return "graph" if req.enable_tools else "simple"


async def run_solve(
    *,
    request: Request,
    user: JWTClaims,
    llm: LLMClient,
    req: SolveRequest,
    mode: Mode,
) -> AsyncIterator[dict[str, Any]]:
    """Async-generate SSE event dicts for the response.

    Stub yields two frames mirroring ``/solve_v2``'s event names so
    the existing ``AgentGraphPanel`` parser keeps working:

        {"event": "step",  "data": {...}}
        {"event": "final", "data": {...}}

    TAG-61 replaces the body with the real planner→searcher DAG. The
    ``request`` arg is forwarded so the orchestrator can check
    ``await request.is_disconnected()`` between iterations.
    """
    # Touch unused-arg names so ruff / pyright don't flag them; TAG-61
    # consumes every one of them. Doing it as an assertion-free assert
    # keeps the stub functional.
    _ = (request, user, llm, mode)

    yield {
        "event": "step",
        "data": {
            "mode": mode,
            "model": req.model,
            "provider": req.provider,
            "stub": True,
        },
    }
    yield {
        "event": "final",
        "data": {
            "answer": "(stub) TAG-58 wiring only; TAG-61 fills the body.",
            "citations": [],
            "stub": True,
        },
    }


__all__ = ["Mode", "run_solve", "select_mode"]
