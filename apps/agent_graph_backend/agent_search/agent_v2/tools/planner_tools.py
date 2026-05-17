# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tools the PlannerAgent exposes to its LLM.

These mutate the shared `WebSearchGraph` in `ToolContext`. The handlers are
intentionally tiny — graph mutation lives in `orchestrator/graph.py`.

Required ToolContext keys:
- "graph": WebSearchGraph
- "search_node": async callable (node_id: str) -> dict (searcher result)
"""

from __future__ import annotations

from typing import Any

from ..prompts import get_prompt
from .registry import ToolContext, ToolRegistry


# ---- JSON-Schema parameter blocks ----
#
# TAG-73: tool/parameter description strings now live in the filesystem
# prompt catalog under ``prompts/tool/web_planner/...``. The schema
# dicts are built fresh on each ``register_planner_tools`` call so the
# loader's lru_cache absorbs the disk reads, and a hot-swap of any
# description does not require a module reload.


def _add_node_params() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": get_prompt(
                    "tool.web_planner.add_node.params.question"
                ),
            },
            "node_id": {
                "type": "string",
                "description": get_prompt(
                    "tool.web_planner.add_node.params.node_id"
                ),
            },
            "depends_on": {
                "type": "array",
                "items": {"type": "string"},
                "description": get_prompt(
                    "tool.web_planner.add_node.params.depends_on"
                ),
            },
        },
        "required": ["question"],
    }


_LINK_NODES_PARAMS = {
    "type": "object",
    "properties": {
        "parent": {"type": "string"},
        "child": {"type": "string"},
    },
    "required": ["parent", "child"],
}


def _search_node_params() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "node_id": {
                "type": "string",
                "description": get_prompt(
                    "tool.web_planner.search_node.params.node_id"
                ),
            },
        },
        "required": ["node_id"],
    }


_READ_NODE_ANSWER_PARAMS = {
    "type": "object",
    "properties": {"node_id": {"type": "string"}},
    "required": ["node_id"],
}


def _finalize_params() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "description": get_prompt(
                    "tool.web_planner.finalize.params.answer"
                ),
            },
            "citations": {
                "type": "array",
                "items": {"type": "string"},
                "description": get_prompt(
                    "tool.web_planner.finalize.params.citations"
                ),
            },
        },
        "required": ["answer"],
    }


# ---- handlers ----


async def _add_node(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    graph = ctx.require("graph")
    question = args["question"]
    node_id = args.get("node_id")
    depends_on = args.get("depends_on") or ["root"]
    node = graph.add_searcher_node(
        content=question, node_id=node_id, depends_on=depends_on
    )
    return {"node_id": node.name, "content": node.content}


async def _link_nodes(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    graph = ctx.require("graph")
    edge = graph.link(args["parent"], args["child"])
    return {"parent": args["parent"], "child": args["child"], "edge_id": edge.id}


async def _search_node(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    """Delegates to the orchestrator-supplied async searcher.

    The orchestrator wires this up so the planner can run multiple
    `search_node` calls in parallel via `dispatch_many`.
    """
    search_fn = ctx.require("search_node")
    node_id = args["node_id"]
    result = await search_fn(node_id)
    return result


async def _read_node_answer(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    graph = ctx.require("graph")
    node_id = args["node_id"]
    node = graph.nodes.get(node_id)
    if node is None:
        return {"error": f"Unknown node: {node_id!r}"}
    return {
        "node_id": node_id,
        "question": node.content,
        "answer": node.response or "(no answer yet)",
        "source": node.source,
        "citations": node.citations,
    }


async def _finalize(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    """Signal the planner is done. Records the answer on the response node."""
    graph = ctx.require("graph")
    answer = args["answer"]
    cited = args.get("citations") or []
    response_node = graph.add_response_node(content=answer)
    response_node.response = answer
    return {"finalized": True, "answer": answer, "citations": cited}


# ---- registration ----


def register_planner_tools(registry: ToolRegistry) -> None:
    registry.register(
        name="add_node",
        description=get_prompt("tool.web_planner.add_node.description"),
        parameters=_add_node_params(),
        handler=_add_node,
    )
    registry.register(
        name="link_nodes",
        description=get_prompt("tool.web_planner.link_nodes.description"),
        parameters=_LINK_NODES_PARAMS,
        handler=_link_nodes,
    )
    registry.register(
        name="search_node",
        description=get_prompt("tool.web_planner.search_node.description"),
        parameters=_search_node_params(),
        handler=_search_node,
    )
    registry.register(
        name="read_node_answer",
        description=get_prompt("tool.web_planner.read_node_answer.description"),
        parameters=_READ_NODE_ANSWER_PARAMS,
        handler=_read_node_answer,
    )
    registry.register(
        name="finalize",
        description=get_prompt("tool.web_planner.finalize.description"),
        parameters=_finalize_params(),
        handler=_finalize,
    )


__all__ = ["register_planner_tools"]
