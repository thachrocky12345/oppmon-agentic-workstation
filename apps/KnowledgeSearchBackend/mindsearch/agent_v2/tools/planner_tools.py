"""Tools the PlannerAgent exposes to its LLM.

These mutate the shared `WebSearchGraph` in `ToolContext`. The handlers are
intentionally tiny — graph mutation lives in `orchestrator/graph.py`.

Required ToolContext keys:
- "graph": WebSearchGraph
- "search_node": async callable (node_id: str) -> dict (searcher result)
"""

from __future__ import annotations

from typing import Any

from .registry import ToolContext, ToolRegistry


# ---- JSON-Schema parameter blocks ----

_ADD_NODE_PARAMS = {
    "type": "object",
    "properties": {
        "question": {
            "type": "string",
            "description": "The sub-question this node should answer.",
        },
        "node_id": {
            "type": "string",
            "description": (
                "Optional explicit id like 'n1', 'pricing'. If omitted, "
                "an auto id is assigned."
            ),
        },
        "depends_on": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Parent node ids this depends on. Defaults to ['root']."
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

_SEARCH_NODE_PARAMS = {
    "type": "object",
    "properties": {
        "node_id": {
            "type": "string",
            "description": "Id of a previously added searcher node.",
        },
    },
    "required": ["node_id"],
}

_READ_NODE_ANSWER_PARAMS = {
    "type": "object",
    "properties": {"node_id": {"type": "string"}},
    "required": ["node_id"],
}

_FINALIZE_PARAMS = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
            "description": (
                "The final answer to the user's original question. "
                "Use [[N]] inline citations referencing prior searcher results."
            ),
        },
        "citations": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Citation numbers to surface (as strings). Optional if [[N]] "
                "markers already cover the answer."
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
        description=(
            "Add a new searcher sub-question node to the search graph. "
            "Use this to decompose the user's question into atomic searchable parts. "
            "Returns the node_id you can use with search_node."
        ),
        parameters=_ADD_NODE_PARAMS,
        handler=_add_node,
    )
    registry.register(
        name="link_nodes",
        description=(
            "Create a dependency edge from parent → child. Use only when an "
            "existing node should depend on another existing node."
        ),
        parameters=_LINK_NODES_PARAMS,
        handler=_link_nodes,
    )
    registry.register(
        name="search_node",
        description=(
            "Execute the searcher for an existing node. Runs retrieval (RAG and/or "
            "web depending on request) and produces an answer. Safe to call in "
            "parallel for independent nodes."
        ),
        parameters=_SEARCH_NODE_PARAMS,
        handler=_search_node,
    )
    registry.register(
        name="read_node_answer",
        description=(
            "Read the answer + citations for a node that has already been searched."
        ),
        parameters=_READ_NODE_ANSWER_PARAMS,
        handler=_read_node_answer,
    )
    registry.register(
        name="finalize",
        description=(
            "Emit the final answer to the user's original question. Call this "
            "exactly once when you have enough information. Use [[N]] markers "
            "in the answer to cite searcher results."
        ),
        parameters=_FINALIZE_PARAMS,
        handler=_finalize,
    )


__all__ = ["register_planner_tools"]
