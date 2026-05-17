# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-62 — ``select_mode`` quadrant tests.

The four (``web_fallback``, ``collection_ids``) quadrants map to
:class:`SolveMode` values. Three quadrants are valid; the fourth
(``False`` + ``[]``) is rejected by :class:`SolveRequest`'s validator
before it ever reaches :func:`select_mode`.

These tests are deliberately exhaustive on the contract — every
downstream branch in :func:`run_solve` depends on this 4-way table
behaving exactly as documented.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from agent_search.agent_v2.api.solve_request import ChatMessage, SolveRequest
from agent_search.agent_v2.orchestrator.modes import SolveMode, select_mode


def _make_req(
    *,
    web_fallback: bool,
    collection_ids: list[str],
) -> SolveRequest:
    return SolveRequest(
        messages=[ChatMessage(role="user", content="hello")],
        collection_ids=collection_ids,
        model="fake-model",
        provider="fake",
        enable_tools=True,
        web_fallback=web_fallback,
    )


def test_web_quadrant_returns_web_mode():
    """(web_fallback=True, collection_ids=[]) -> WEB.

    Matches the current ``/solve_v2`` behaviour — no corpus, fall back
    to the web planner exclusively.
    """
    req = _make_req(web_fallback=True, collection_ids=[])
    assert select_mode(req) is SolveMode.WEB


def test_corpus_quadrant_returns_corpus_mode():
    """(web_fallback=False, collection_ids=[a]) -> CORPUS.

    Pure corpus mode (TAG-61); the model never hits the public
    internet. This is the regulated-tenant use case.
    """
    req = _make_req(web_fallback=False, collection_ids=["col-1"])
    assert select_mode(req) is SolveMode.CORPUS


def test_hybrid_quadrant_returns_hybrid_mode():
    """(web_fallback=True, collection_ids=[a]) -> HYBRID.

    Try corpus first, fall through to web only when at least one
    sub-question is UNANSWERED (asserted in test_hybrid.py).
    """
    req = _make_req(web_fallback=True, collection_ids=["col-1"])
    assert select_mode(req) is SolveMode.HYBRID


def test_no_grounding_quadrant_rejected_at_validation():
    """(web_fallback=False, collection_ids=[]) is rejected upstream.

    Constructing a :class:`SolveRequest` with both grounding sources
    disabled raises :class:`ValidationError` from the model_validator.
    ``select_mode`` never sees this row — that's the *whole point* of
    the validator, hence we test it here rather than asserting that
    ``select_mode`` returns ``INVALID``.
    """
    with pytest.raises(ValidationError) as exc:
        _make_req(web_fallback=False, collection_ids=[])
    # The error message is a static literal so callers can't probe
    # internals via error text — assert on its presence.
    assert "webFallback=false requires at least one collectionId" in str(
        exc.value
    )


def test_solve_mode_enum_has_invalid_value_for_completeness():
    """:class:`SolveMode.INVALID` exists even though ``select_mode``
    never returns it in practice.

    The enum is a stable wire/log constant. Removing or renaming
    ``INVALID`` would break the defence-in-depth ``RuntimeError`` in
    :func:`run_solve` and any future telemetry that buckets bad rows.
    """
    assert SolveMode.INVALID.value == "invalid"
    # The other three values are stable too — guard the wire shape.
    assert SolveMode.WEB.value == "web"
    assert SolveMode.CORPUS.value == "corpus"
    assert SolveMode.HYBRID.value == "hybrid"
