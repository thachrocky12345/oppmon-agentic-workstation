"""Tools the SearcherAgent exposes to its LLM (only when `enable_tools=true`).

In default mode, the searcher just runs `advanced_retrieve` once and hands
the context to the LLM without exposing callable tools. When the user opts
into `enable_tools=true`, the LLM also gets these.

Required ToolContext keys:
- "retriever": Retriever
- "web_fallback": bool
- "collection_ids": list[str]
"""

from __future__ import annotations

from typing import Any

from .registry import ToolContext, ToolRegistry


_WEB_SEARCH_PARAMS = {
    "type": "object",
    "properties": {
        "query": {"type": "string"},
        "topk": {"type": "integer", "default": 3},
    },
    "required": ["query"],
}

_ADVANCED_RETRIEVE_PARAMS = {
    "type": "object",
    "properties": {
        "query": {"type": "string"},
    },
    "required": ["query"],
}

_ANSWER_PARAMS = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "citations": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["answer"],
}


async def _web_search(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    retriever = ctx.require("retriever")
    if retriever._web is None:  # noqa: SLF001 — intentional internal peek
        return {"hits": [], "note": "web search not configured"}
    hits = await retriever._web.search(  # noqa: SLF001
        args["query"], topk=int(args.get("topk", 3))
    )
    return {"hits": [h.model_dump() for h in hits]}


async def _advanced_retrieve(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    retriever = ctx.require("retriever")
    result = await retriever.advanced_retrieve(
        args["query"],
        web_fallback=ctx.get("web_fallback", False),
        collection_ids=ctx.get("collection_ids"),
    )
    return {
        "source": result.source,
        "hits": [h.model_dump() for h in result.hits],
        "context": result.context_block(),
    }


async def _answer(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    return {"answer": args["answer"], "citations": args.get("citations") or []}


def register_searcher_tools(registry: ToolRegistry) -> None:
    registry.register(
        name="web_search",
        description=(
            "Search the public web for the given query. Returns top results with "
            "url, title, and snippet."
        ),
        parameters=_WEB_SEARCH_PARAMS,
        handler=_web_search,
    )
    registry.register(
        name="advanced_retrieve",
        description=(
            "Retrieve grounded context for a query. Tries the configured knowledge "
            "corpus first; if no good results AND web_fallback is enabled, also "
            "queries the web. Returns hits tagged with source ('rag' | 'web')."
        ),
        parameters=_ADVANCED_RETRIEVE_PARAMS,
        handler=_advanced_retrieve,
    )
    registry.register(
        name="answer",
        description=(
            "Emit the final answer for this sub-question. Call exactly once when "
            "you have enough grounding. Use [[N]] markers to cite hits from "
            "advanced_retrieve or web_search."
        ),
        parameters=_ANSWER_PARAMS,
        handler=_answer,
    )


__all__ = ["register_searcher_tools"]
