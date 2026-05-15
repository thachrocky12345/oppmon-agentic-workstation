"""SSE envelope builder.

Produces dicts matching the legacy frontend's expectations:

    { "response": { type, state, response, nodes, adjacency_list (TREE),
                    adj (FLAT), inner_steps, references }, "current_node": ... }

See `mindsearch/app.py:139-150` for the original wiring this preserves.
"""

from __future__ import annotations

from typing import Any

from .graph import GraphState, WebSearchGraph


def planner_event(
    graph: WebSearchGraph,
    *,
    state: GraphState,
    response_text: str = "",
    inner_steps: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "response": {
            "type": "planner",
            "state": state.value,
            "response": response_text,
            "nodes": graph.nodes_dict(),
            "adjacency_list": graph.adjacency_tree(),
            "adj": graph.adjacency_flat(),
            "inner_steps": inner_steps or [],
            "references": dict(graph.references),
        },
        "current_node": None,
    }


def searcher_event(
    graph: WebSearchGraph,
    *,
    node_id: str,
    state: GraphState,
    response_text: str = "",
    content: str = "",
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "response": {
            "type": "searcher",
            "state": state.value,
            "response": response_text,
            "content": content,
            "detail": detail or {},
            "nodes": graph.nodes_dict(),
            "adjacency_list": graph.adjacency_tree(),
            "adj": graph.adjacency_flat(),
            "references": dict(graph.references),
        },
        "current_node": node_id,
    }


def end_event(graph: WebSearchGraph, *, response_text: str) -> dict[str, Any]:
    evt = planner_event(graph, state=GraphState.END, response_text=response_text)
    return evt


def warning_event(message: str) -> dict[str, Any]:
    return {
        "response": {
            "type": "planner",
            "state": GraphState.STREAM_ING.value,
            "warning": message,
        },
        "current_node": None,
    }


__all__ = ["end_event", "planner_event", "searcher_event", "warning_event"]
