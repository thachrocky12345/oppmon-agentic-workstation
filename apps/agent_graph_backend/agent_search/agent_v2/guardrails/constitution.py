# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Lightweight guardrail checks.

Subset of Arkon `packages/guardrails/src/constitution.ts`:
- input guard: surface prompt-injection patterns BEFORE handing to the LLM.
- output guard: refuse to ship answers that look hallucinated (URLs that
  weren't in any searcher result).

Hard refusals raise `GuardrailViolation`. Soft warnings are returned as
strings the caller can include in the SSE stream.
"""

from __future__ import annotations

import re


class GuardrailViolation(Exception):
    """Raised when a request must be hard-rejected."""


# Heuristics for obvious prompt injection in user input.
# Conservative — we want to catch the egregious cases, not be a WAF.
_INJECTION_PATTERNS = [
    re.compile(r"(?i)ignore (?:all |any )?previous instructions"),
    re.compile(r"(?i)disregard the (?:system|previous) prompt"),
    re.compile(r"(?i)you are now (?:dan|developer mode|jailbroken)"),
    re.compile(r"<\|im_start\|>|<\|im_end\|>"),
]


def check_user_input(text: str) -> list[str]:
    """Return a list of soft warnings; raise on hard violations.

    For now everything is a warning — we don't want to break legitimate
    queries that mention 'previous instructions' in context. Promote to
    hard refusal if abuse becomes a real problem.
    """
    warnings: list[str] = []
    for pat in _INJECTION_PATTERNS:
        if pat.search(text):
            warnings.append(
                f"Possible prompt-injection pattern detected: {pat.pattern!r}"
            )
    return warnings


_URL_RE = re.compile(r"https?://[^\s)\]]+")


def check_final_answer(*, answer: str, known_urls: set[str]) -> list[str]:
    """Flag URLs in the answer that didn't appear in any searcher result.

    Returns soft warnings only — the orchestrator can attach them to the
    final SSE event for transparency. We don't strip the URLs automatically.
    """
    warnings: list[str] = []
    answer_urls = set(_URL_RE.findall(answer or ""))
    fabricated = answer_urls - known_urls
    for url in fabricated:
        warnings.append(f"Fabricated URL flagged (not in any source): {url}")
    return warnings


__all__ = ["GuardrailViolation", "check_user_input", "check_final_answer"]
