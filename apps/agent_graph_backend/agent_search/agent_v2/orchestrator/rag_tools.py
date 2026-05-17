# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-61 — Planner tools that hit :class:`CorpusSearch` instead of web search.

Same four-tool shape as the web planner in
:mod:`agent_v2.tools.planner_tools`:

  * ``add_node``           — append a sub-question node to the graph
  * ``search_corpus_node`` — retrieve chunks for that node (replaces ``search_node``)
  * ``read_node_answer``   — re-read a previously-searched node
  * ``finalize``           — emit the user-facing answer with citations

Two deliberate divergences from the web planner toolset:

  1. ``search_corpus_node`` takes BOTH ``node_id`` and ``question`` in the
     same call. The web ``search_node`` only takes ``node_id`` because the
     question is already attached when ``add_node`` runs. Here we keep
     ``question`` on the call so the LLM can sharpen the corpus query at
     retrieval time without rewriting the node — corpus questions are
     typically more terse than the user's original phrasing.

  2. Citation keys are ``doc_id:chunk_id`` strings, not numeric ``[[N]]``.
     The frontend's ``AgentGraphPanel`` resolves these to doc links via
     TAG-62's citation event stream.

Empty-retrieval contract: when ``corpus.search(...)`` returns ``[]`` the
tool emits ``{"status": "UNANSWERED", "chunks": []}``. HARD RULE #2 in
:func:`_rag_planner_system` tells the model how to handle that signal.

Tenant isolation: every call passes ``tenant_id`` (captured by closure at
registration time) into :meth:`CorpusSearch.search`. The CorpusSearch
implementation enforces SQL-level filters on both ``rag_chunks.tenant_id``
and ``rag_documents.tenant_id`` (TAG-59), so even a misbehaving planner
that tries to widen the scope cannot escape its tenant.
"""

from __future__ import annotations

from typing import Any

from ..rag.corpus_search import CorpusSearch
from ..tools.registry import ToolContext, ToolRegistry


# ---- JSON-Schema parameter blocks ----

_ADD_NODE_PARAMS = {
    "type": "object",
    "properties": {
        "question": {
            "type": "string",
            "description": (
                "The sub-question this node should answer from the corpus."
            ),
        },
        "node_id": {
            "type": "string",
            "description": (
                "Optional explicit id like 'n1', 'policy-scope'. Auto-assigned "
                "when omitted."
            ),
        },
        "depends_on": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Parent node ids this depends on. Defaults to ['root'].",
        },
    },
    "required": ["question"],
}

_SEARCH_CORPUS_NODE_PARAMS = {
    "type": "object",
    "properties": {
        "node_id": {
            "type": "string",
            "description": "Id of a previously-added sub-question node.",
        },
        "question": {
            "type": "string",
            "description": (
                "Query string to run against the corpus. Usually the same as "
                "the node's question, but the model may sharpen it (e.g. add "
                "domain terms) for better retrieval."
            ),
        },
    },
    "required": ["node_id", "question"],
}

_READ_NODE_ANSWER_PARAMS = {
    "type": "object",
    "properties": {
        "node_id": {"type": "string"},
    },
    "required": ["node_id"],
}

_FINALIZE_PARAMS = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
            "description": (
                "The final answer to the user's question. Every factual claim "
                "MUST be followed by `[[doc_id:chunk_id]]` citation(s). If no "
                "chunk supports the answer, emit the refusal sentence "
                "verbatim instead."
            ),
        },
        "citations": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Optional explicit citation list (`doc_id:chunk_id` strings). "
                "Redundant if the `answer` already carries `[[...]]` markers."
            ),
        },
    },
    "required": ["answer"],
}


def register_rag_planner_tools(
    registry: ToolRegistry,
    *,
    corpus: CorpusSearch,
    tenant_id: str,
    collection_ids: list[str],
    top_k: int = 8,
) -> None:
    """Register the four RAG-mode planner tools on ``registry``.

    Same registration pattern as
    :func:`agent_v2.tools.planner_tools.register_planner_tools` so the
    planner's reactive loop can drive either tool set without branching.

    Tenant scope is captured by closure: ``tenant_id`` and
    ``collection_ids`` are baked into every ``search_corpus_node`` call.
    This is intentional — we never want the planner to learn the
    tenant_id wire format.
    """

    async def _add_node(
        args: dict[str, Any], ctx: ToolContext
    ) -> dict[str, Any]:
        graph = ctx.require("graph")
        question = args["question"]
        nid = args.get("node_id")
        depends_on = args.get("depends_on") or ["root"]
        node = graph.add_searcher_node(
            content=question, node_id=nid, depends_on=depends_on
        )
        return {"node_id": node.name, "content": node.content}

    async def _search_corpus_node(
        args: dict[str, Any], ctx: ToolContext
    ) -> dict[str, Any]:
        graph = ctx.require("graph")
        node_id = args["node_id"]
        question = args["question"]

        # CorpusSearch enforces tenant_id at the SQL layer (TAG-59).
        # Defence-in-depth: we also re-check the closure-captured value
        # here so a misregistered tool can't slip through.
        if not tenant_id:
            raise RuntimeError(
                "search_corpus_node: tenant_id missing — broken registration"
            )

        hits = await corpus.search(
            question,
            tenant_id=tenant_id,
            collection_ids=collection_ids,
            top_k=top_k,
        )

        node = graph.nodes.get(node_id)
        if node is None:
            # Planner referenced a node it never added. Surface as tool
            # error so the loop catches it and the model can retry.
            raise KeyError(
                f"search_corpus_node called with unknown node_id {node_id!r}. "
                f"Known nodes: {sorted(graph.nodes.keys())}"
            )

        if not hits:
            # UNANSWERED contract. HARD RULE #2 in the system prompt tells
            # the model how to handle this signal.
            graph.write_searcher_result(
                node_id,
                response="(no chunks retrieved)",
                detail={"status": "UNANSWERED", "chunks_returned": 0},
                source="rag",
                citations=[],
            )
            return {
                "node_id": node_id,
                "status": "UNANSWERED",
                "chunks": [],
            }

        chunks_out = [
            {
                "id": f"{h.doc_id}:{h.chunk_id}",
                "text": h.text,
                "score": h.score,
                "title": h.title,
            }
            for h in hits
        ]
        # Write citations into the graph node so the SSE searcher_event
        # downstream can surface them to the frontend.
        citations = [
            {
                "index": f"{h.doc_id}:{h.chunk_id}",
                "doc_id": h.doc_id,
                "chunk_id": h.chunk_id,
                "title": h.title,
                "source_url": h.source_url,
            }
            for h in hits
        ]
        graph.write_searcher_result(
            node_id,
            # Representative answer text is the top hit — the planner will
            # synthesize the real per-sub-question answer at finalize time.
            response=hits[0].text,
            detail={"status": "OK", "chunks_returned": len(hits)},
            source="rag",
            citations=citations,
        )
        return {
            "node_id": node_id,
            "status": "OK",
            "chunks": chunks_out,
        }

    async def _read_node_answer(
        args: dict[str, Any], ctx: ToolContext
    ) -> dict[str, Any]:
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

    async def _finalize(
        args: dict[str, Any], ctx: ToolContext
    ) -> dict[str, Any]:
        graph = ctx.require("graph")
        answer = args["answer"]
        cited = args.get("citations") or []
        response_node = graph.add_response_node(content=answer)
        response_node.response = answer
        return {"finalized": True, "answer": answer, "citations": cited}

    registry.register(
        name="add_node",
        description=(
            "Add a sub-question node to the search graph. Decompose the user's "
            "question into atomic sub-questions, each one corpus-searchable."
        ),
        parameters=_ADD_NODE_PARAMS,
        handler=_add_node,
    )
    registry.register(
        name="search_corpus_node",
        description=(
            "Search the user's document collections for chunks matching the "
            "sub-question. Returns `status=OK` with cited chunks (ids of the "
            "form `doc_id:chunk_id`), or `status=UNANSWERED` if retrieval is "
            "empty (mark that sub-question UNANSWERED per HARD RULE #2). "
            "Safe to call in parallel for independent nodes."
        ),
        parameters=_SEARCH_CORPUS_NODE_PARAMS,
        handler=_search_corpus_node,
    )
    registry.register(
        name="read_node_answer",
        description=(
            "Read the answer + citations from a node that has already been "
            "searched. Use to revisit a chunk's text when synthesizing."
        ),
        parameters=_READ_NODE_ANSWER_PARAMS,
        handler=_read_node_answer,
    )
    registry.register(
        name="finalize",
        description=(
            "Emit the final answer. Every factual claim MUST carry "
            "`[[doc_id:chunk_id]]` citation markers. If no retrieved chunk "
            "supports the user's question, emit the refusal sentence "
            "verbatim: \"I don't have information about that in the provided "
            "collections.\""
        ),
        parameters=_FINALIZE_PARAMS,
        handler=_finalize,
    )


__all__ = ["register_rag_planner_tools"]
