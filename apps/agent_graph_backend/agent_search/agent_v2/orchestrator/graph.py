"""WebSearchGraph state.

The planner mutates this through tool calls (`add_node`, `link_nodes`, …).
The orchestrator emits SSE events derived from these mutations so the
existing React frontend keeps rendering nodes/edges as it does today.

SSE envelope (preserved for frontend compat — see `mindsearch/app.py:139-150`):

    { "response": { ...agent_return fields..., "adj": flat_adjacency },
      "current_node": node_id_or_null }

`agent_return` mimics the legacy `AgentReturn` dataclass:
    type, state, response, nodes, adjacency_list (TREE form), inner_steps,
    references.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class NodeType(str, Enum):
    ROOT = "root"
    SEARCHER = "searcher"
    END = "end"


class NodeState(int, Enum):
    """Legacy state convention used by the React UI:
    1 = in progress, 2 = not started, 3 = complete.
    """

    NOT_STARTED = 2
    IN_PROGRESS = 1
    COMPLETE = 3


class GraphState(str, Enum):
    """Mirrors `AgentStatusCode` from lagent.schema for backward-compat."""

    STREAM_ING = "STREAM_ING"
    PLUGIN_START = "PLUGIN_START"
    PLUGIN_RETURN = "PLUGIN_RETURN"
    ANSWER_ING = "ANSWER_ING"
    END = "END"


@dataclass
class Edge:
    name: str  # child node name
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    state: int = NodeState.NOT_STARTED.value


@dataclass
class Node:
    name: str
    content: str = ""
    type: str = NodeType.SEARCHER.value
    response: str | None = None
    detail: dict[str, Any] | None = None  # populated by searcher results
    source: str | None = None  # 'rag' | 'web' | 'both' | 'none'
    citations: list[dict[str, Any]] = field(default_factory=list)


class WebSearchGraph:
    """In-memory mutable graph state.

    Identifier-stable: `root` is always present; `response` is added on
    finalize. New searcher nodes get auto-assigned ids `n1, n2, ...` unless
    the planner picks an explicit id.
    """

    ROOT = "root"
    RESPONSE = "response"

    def __init__(self) -> None:
        self.nodes: dict[str, Node] = {}
        self.adjacency: dict[str, list[Edge]] = {}
        self.references: dict[str, str] = {}  # citation index -> url
        # citation_meta mirrors `references` keys but carries the full
        # per-citation payload the frontend bibliography needs
        # (title, score, page_number, doc_id, chunk_id, source_url).
        # Populated by ``flush_node_citations`` at SSE-emit time.
        self.citation_meta: dict[str, dict[str, Any]] = {}
        self._auto_idx = 0
        self._citation_ptr = 1  # next 1-based citation number

    # ---- mutation ----

    def add_root(self, content: str) -> Node:
        node = Node(name=self.ROOT, content=content, type=NodeType.ROOT.value)
        self.nodes[self.ROOT] = node
        self.adjacency.setdefault(self.ROOT, [])
        return node

    def next_node_id(self, hint: str | None = None) -> str:
        if hint and hint not in self.nodes:
            return hint
        # Fall back to auto-numbered ids.
        while True:
            self._auto_idx += 1
            candidate = f"n{self._auto_idx}"
            if candidate not in self.nodes:
                return candidate

    def add_searcher_node(
        self,
        *,
        content: str,
        node_id: str | None = None,
        depends_on: list[str] | None = None,
    ) -> Node:
        nid = self.next_node_id(node_id)
        node = Node(name=nid, content=content, type=NodeType.SEARCHER.value)
        self.nodes[nid] = node
        self.adjacency.setdefault(nid, [])
        for parent in depends_on or [self.ROOT]:
            if parent in self.nodes:
                self.link(parent, nid)
        return node

    def link(self, parent: str, child: str) -> Edge:
        if parent not in self.nodes:
            raise KeyError(f"Unknown parent node: {parent!r}")
        if child not in self.nodes:
            raise KeyError(f"Unknown child node: {child!r}")
        edge = Edge(name=child, state=NodeState.NOT_STARTED.value)
        self.adjacency.setdefault(parent, []).append(edge)
        return edge

    def set_node_state(self, node_id: str, state: NodeState) -> None:
        """Update the `state` field on every edge pointing TO `node_id`."""
        for edges in self.adjacency.values():
            for e in edges:
                if e.name == node_id:
                    e.state = state.value

    def write_searcher_result(
        self,
        node_id: str,
        *,
        response: str,
        detail: dict[str, Any] | None = None,
        source: str | None = None,
        citations: list[dict[str, Any]] | None = None,
    ) -> None:
        if node_id not in self.nodes:
            raise KeyError(f"Unknown node: {node_id!r}")
        node = self.nodes[node_id]
        node.response = response
        node.detail = detail
        node.source = source
        node.citations = citations or []
        self.set_node_state(node_id, NodeState.COMPLETE)

    def add_response_node(self, *, content: str = "") -> Node:
        node = Node(name=self.RESPONSE, content=content, type=NodeType.END.value)
        self.nodes[self.RESPONSE] = node
        self.adjacency.setdefault(self.RESPONSE, [])
        return node

    def register_citations(self, citations: list[dict[str, Any]]) -> int:
        """Add citations to `references`, returning the next ptr.

        Accepts either ``url`` (web citations) or ``source_url`` (RAG
        citations) as the URL key. Both shapes coexist in the wild —
        the web planner writes ``url`` (planner.py:168), rag_tools
        writes ``source_url`` (rag_tools.py:241). Be permissive on
        input so the corpus path doesn't silently drop citations.
        """
        for c in citations:
            url = c.get("url") or c.get("source_url")
            if not url:
                continue
            idx = c.get("index") or self._citation_ptr
            self.references[str(idx)] = url
            self._citation_ptr = max(
                self._citation_ptr,
                # ``index`` may be a doc:chunk string (RAG) or an int
                # (web) — only bump ptr when it's int-coercible.
                (int(idx) + 1) if str(idx).isdigit() else self._citation_ptr,
            )
        return self._citation_ptr

    def flush_node_citations(self) -> None:
        """Aggregate every node's citations into ``references`` and
        ``citation_meta``.

        Idempotent — safe to call repeatedly (e.g. on every SSE event).
        When the same citation key surfaces from multiple searcher nodes,
        keep the higher-scoring entry's metadata. This matters for the
        bibliography sort: a chunk that ranked #1 for one sub-question
        shouldn't be displaced by the same chunk ranking #4 for a
        different sub-question.

        The URL map (``references``) is populated for back-compat with
        the existing frontend; the full per-citation payload is
        populated into ``citation_meta`` for the new bibliography
        renderer (TAG-CR follow-up).
        """
        for node in self.nodes.values():
            for c in node.citations or []:
                idx = c.get("index")
                if idx is None:
                    continue
                key = str(idx)
                url = c.get("url") or c.get("source_url")
                if url:
                    # Last-write wins on URL is fine — same key implies
                    # same chunk implies same URL by construction.
                    self.references[key] = url
                prev = self.citation_meta.get(key)
                prev_score = (prev or {}).get("score")
                new_score = c.get("score")
                # Keep the higher-scoring metadata. Treat None as -inf
                # so a real score always wins over an absent one.
                prev_cmp = float("-inf") if prev_score is None else float(prev_score)
                new_cmp = float("-inf") if new_score is None else float(new_score)
                if prev is None or new_cmp > prev_cmp:
                    self.citation_meta[key] = {
                        "index": key,
                        "doc_id": c.get("doc_id"),
                        "chunk_id": c.get("chunk_id"),
                        "title": c.get("title"),
                        "source_url": url,
                        "score": new_score,
                        "page_number": c.get("page_number"),
                    }

    # ---- export ----

    def adjacency_flat(self) -> dict[str, list[dict[str, Any]]]:
        """Original adjacency dict shape that the legacy frontend uses as `adj`."""
        return {
            parent: [
                {"id": e.id, "name": e.name, "state": e.state} for e in edges
            ]
            for parent, edges in self.adjacency.items()
        }

    def adjacency_tree(self, root: str = "root") -> list[dict[str, Any]]:
        """Tree-shaped adjacency that legacy `app.py:86-98` produces."""
        flat = self.adjacency_flat()

        def build(name: str) -> dict[str, Any]:
            n = {"name": name, "children": []}
            for child in flat.get(name, []):
                child_node = build(child["name"])
                child_node["state"] = child["state"]
                child_node["id"] = child["id"]
                n["children"].append(child_node)
            return n

        return build(root)["children"]

    def nodes_dict(self) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        for name, n in self.nodes.items():
            d: dict[str, Any] = {"content": n.content, "type": n.type}
            if n.response is not None:
                d["response"] = n.response
            if n.detail is not None:
                d["detail"] = n.detail
            if n.source is not None:
                d["source"] = n.source
            if n.citations:
                d["citations"] = n.citations
            out[name] = d
        return out


__all__ = [
    "Edge",
    "GraphState",
    "Node",
    "NodeState",
    "NodeType",
    "WebSearchGraph",
]
