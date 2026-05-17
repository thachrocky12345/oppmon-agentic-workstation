# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""RAG-mode planner prompt — TAG-73 thin re-export layer.

Originally hosted the inline ``_RAG_PLANNER_SYSTEM_V1`` constant (TAG-61).
TAG-73 moved the body to the filesystem catalog at
``prompts/system/rag_planner.md`` and the refusal sentence to
``prompts/template/rag_refusal.md``. The two names below are kept as
module-level re-exports so existing call sites (``modes.py``,
``hybrid_mode.py``, tests, the TAG-61 integration script) keep working
without churn.

Both names resolve lazily through :func:`agent_v2.prompts.get_prompt`,
so the active body always matches what the on-disk catalog says.
"""
from __future__ import annotations

from ..prompts import get_prompt


# Verbatim refusal string from HARD RULE #3. Resolved at import time —
# the eval gate (corpus-004 class) asserts on exact-match.
REFUSAL_TEXT: str = get_prompt("template.rag_refusal")


def _rag_planner_system() -> str:
    """Return the RAG planner system prompt from the prompt catalog."""
    return get_prompt("system.rag_planner")


__all__ = ["REFUSAL_TEXT", "_rag_planner_system"]
