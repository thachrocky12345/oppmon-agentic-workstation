"""FastAPI integration for the v2 reactive agent.

Mounts `/solve_v2` on the same app that serves the legacy `/solve` endpoint.
The legacy endpoint stays untouched during the cutover so we can A/B test.
Once v2 is validated, swap the route name and delete the legacy code.

Usage from `mindsearch/app.py` (legacy entry point):

    from mindsearch.agent_v2.app import mount_v2
    mount_v2(app)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .config import Settings, settings as default_settings
from .guardrails import check_user_input
from .llm import create_llm_client
from .orchestrator.planner import PlannerAgent
from .prompts import warm_cache as warm_prompt_cache
from .rag import Retriever
from .rag.hybrid_search import NullCorpusSearch
from .rag.web_search_factory import build_web_search


log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TAG-65 — fail-fast container init.
#
# When the operator deploys with ``ENABLE_SOLVE_V3=true`` (the prod
# default), the authenticated ``POST /solve`` route depends on four
# secrets that *must* be present and non-empty:
#
#   * ``JWT_SECRET`` (parity with apps/api — verified by
#     ``scripts/check-jwt-parity.sh``).
#   * ``TAG_ENCRYPTION_MASTER_KEY`` (parity with apps/api — required to
#     decrypt model-registry rows written by Express).
#   * ``DATABASE_URL`` (asyncpg pool target).
#   * ``OPENAI_EMBED_API_KEY`` *or* ``OPENAI_API_KEY`` (embedding fallback
#     chain matches ``rag/embedding.py``).
#
# When any of those are missing, ``check_required_env`` raises
# ``SystemExit`` so the container CrashLoopBackOffs with a single clear
# line in ``docker service ps``. This is the contract the
# ``swarm-debug`` skill's ``solve-v3-check`` subroutine relies on.
#
# The flag-off path (``ENABLE_SOLVE_V3=false``) is treated as a
# rollback: only the legacy ``/solve_v2`` route is mounted, no secrets
# are required, and the function is a no-op.
# ---------------------------------------------------------------------------


# Keep the field list outside the function so tests can pin/inspect it.
SOLVE_V3_REQUIRED_ENV = (
    "JWT_SECRET",
    "TAG_ENCRYPTION_MASTER_KEY",
    "DATABASE_URL",
    # Special-cased below: OPENAI_EMBED_API_KEY can fall back to OPENAI_API_KEY.
    "OPENAI_EMBED_API_KEY",
)


def check_required_env(s: Settings | None = None) -> None:
    """Fail loudly if ``ENABLE_SOLVE_V3=true`` and any secret is empty.

    The check is deliberately a ``SystemExit`` (not a logger warning)
    because the failure mode in production is silent rejection of every
    request — a CrashLoopBackOff is strictly preferable to a service
    that accepts traffic but returns 401/500 on every call.

    Tests pass ``s=Settings(...)`` to exercise both branches without
    monkeypatching the module-level singleton.
    """
    cfg = s if s is not None else default_settings
    if not cfg.enable_solve_v3:
        return

    missing: list[str] = []
    if not cfg.jwt_secret:
        missing.append("JWT_SECRET")
    if not cfg.tag_encryption_master_key:
        missing.append("TAG_ENCRYPTION_MASTER_KEY")
    if not cfg.database_url:
        missing.append("DATABASE_URL")
    # The embedding factory accepts either; only fail when *both* are unset.
    if not cfg.openai_embed_api_key and not cfg.openai_api_key:
        missing.append("OPENAI_EMBED_API_KEY")

    if missing:
        raise SystemExit(
            "ENABLE_SOLVE_V3=true but required env vars are missing or empty: "
            f"{missing}. See .claude/skills/swarm-debug/SKILL.md#solve-v3-check."
        )


class SolveV2Request(BaseModel):
    """Request schema for /solve_v2. Ports Arkon `rag-chat.ts:32-42`."""

    inputs: str | list[dict[str, Any]]
    enable_tools: bool = False
    web_fallback: bool = False
    collection_ids: list[str] = Field(default_factory=list)


def mount_v2(app: FastAPI) -> None:
    """Add /solve_v2 to an existing FastAPI app.

    Also registers a shutdown handler that closes the asyncpg pool if it
    was lazily opened during the process lifetime. The pool is NOT eagerly
    opened — `/solve_v2` must still run when `DATABASE_URL` is empty.

    TAG-58: when ``ENABLE_SOLVE_V3=true`` we additionally mount the
    authenticated ``POST /solve`` router. The flag is read at mount
    time so tests can flip it via env or by monkeypatching
    ``settings.enable_solve_v3`` before constructing the app.
    """

    # TAG-65: fail-fast at mount time so a misconfigured prod deploy
    # CrashLoopBackOffs immediately rather than serving traffic that
    # 401s/500s. The check is a no-op when ENABLE_SOLVE_V3=false (the
    # rollback knob).
    check_required_env()

    # TAG-72: eagerly resolve every prompt-catalog slug so a malformed
    # .md / _schema.yaml drift crashes the container at boot with the
    # offending slug in the traceback. Runs unconditionally (the
    # ENABLE_SOLVE_V3 flag is about request-path auth, not prompts —
    # a broken /solve_v2 turn fails just as hard as a /solve turn).
    warm_prompt_cache()

    @app.on_event("shutdown")
    async def _close_db_pool() -> None:  # noqa: ANN202
        from .db.pool import close_pool

        await close_pool()

    if default_settings.enable_solve_v3:
        # Imported lazily so a mount with the flag off doesn't drag
        # the auth / resolver / orchestrator graph into import scope.
        from .api import solve_router

        app.include_router(solve_router)

    @app.post("/solve_v2")
    async def solve_v2(request: SolveV2Request):  # noqa: ANN201
        # Surface (don't block on) prompt-injection heuristics.
        user_text = (
            request.inputs
            if isinstance(request.inputs, str)
            else next(
                (
                    m.get("content", "")
                    for m in reversed(request.inputs)
                    if m.get("role") == "user"
                ),
                "",
            )
        )
        injection_warnings = check_user_input(user_text or "")
        for w in injection_warnings:
            log.info("guardrail: %s", w)

        llm = create_llm_client()
        retriever = Retriever(
            rag=NullCorpusSearch(),  # swap for real CorpusSearch when corpus exists
            web=build_web_search(),
            score_threshold=default_settings.rag_score_threshold,
            topk=default_settings.rag_top_k,
        )
        planner = PlannerAgent(llm=llm, retriever=retriever)

        async def event_stream():
            try:
                async for event in planner.run(
                    inputs=request.inputs,
                    enable_tools=request.enable_tools,
                    web_fallback=request.web_fallback,
                    collection_ids=request.collection_ids,
                ):
                    yield {"data": json.dumps(event, ensure_ascii=False)}
            except Exception as exc:  # noqa: BLE001 — surface to client
                log.exception("solve_v2 error")
                yield {
                    "data": json.dumps(
                        {
                            "error": {
                                "msg": "Internal error in solve_v2",
                                "details": str(exc),
                            }
                        },
                        ensure_ascii=False,
                    )
                }

        return EventSourceResponse(event_stream())


__all__ = [
    "SOLVE_V3_REQUIRED_ENV",
    "SolveV2Request",
    "check_required_env",
    "mount_v2",
]
