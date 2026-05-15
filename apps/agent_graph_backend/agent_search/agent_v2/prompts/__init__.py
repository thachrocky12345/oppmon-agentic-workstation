"""Public surface for the prompt loader (TAG-72).

Callers should import :func:`get_prompt` (and friends) from this module
rather than reaching into :mod:`agent_v2.prompts.loader` directly — the
re-exports here are the stable contract; the loader implementation can
move/rename internals without breaking call sites.

Typical use (TAG-73 onwards)::

    from agent_v2.prompts import get_prompt
    body = get_prompt("system.web_planner")
"""

from .loader import (
    Prompt,
    PromptInactive,
    PromptNotFound,
    PromptSchemaError,
    get_prompt,
    get_prompt_meta,
    render_prompt,
    warm_cache,
)

__all__ = [
    "Prompt",
    "PromptInactive",
    "PromptNotFound",
    "PromptSchemaError",
    "get_prompt",
    "get_prompt_meta",
    "render_prompt",
    "warm_cache",
]
