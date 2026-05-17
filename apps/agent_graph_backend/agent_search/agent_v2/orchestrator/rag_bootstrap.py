# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Pre-planner RAG context bootstrap.

Runs a single ``corpus.search`` against the user's question BEFORE the
planner loop starts, dedupes hits to one entry per document (keeping
the highest-scoring chunk's metadata), and renders a
``<document_context>`` block listing each document's title + summary.

The block is injected as a second system message so the planner has
topical priors when it decomposes the question into sub-questions.
The same memory carries the block through to ``finalize``, so the
planner can lean on those summaries when synthesizing the final
answer — no extra LLM call, no second injection.

Failure modes:

  * ``rag_bootstrap_enabled=False``        -> returns ``None``, caller skips.
  * Empty corpus.search                    -> returns ``None``, caller skips.
  * Search raises (network / DB blip)      -> bootstrap is best-effort;
                                              caller catches and proceeds
                                              with no context block.
  * Hits have no ``document_summary``      -> emit the title alone, with
                                              a placeholder summary line.
                                              Better than dropping the
                                              doc entirely; the planner
                                              still knows the doc exists.

Tenant safety: this module is a thin wrapper around
:meth:`CorpusSearch.search`, which enforces ``rag_chunks.tenant_id`` +
``rag_documents.tenant_id`` at the SQL layer. The caller passes the
JWT-resolved ``tenant_id`` through; no widening is possible here.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..rag.corpus_search import CorpusHit, CorpusSearch


@dataclass(frozen=True)
class BootstrapDoc:
    """One deduped document entry surfaced to the planner."""

    doc_id: str
    title: str | None
    summary: str | None
    score: float


@dataclass(frozen=True)
class BootstrapResult:
    """What the bootstrap produced. Empty when the corpus had no hits."""

    docs: tuple[BootstrapDoc, ...]
    raw_hits: tuple[CorpusHit, ...]

    @property
    def is_empty(self) -> bool:
        return len(self.docs) == 0


def _dedupe_hits(hits: list[CorpusHit]) -> list[BootstrapDoc]:
    """Collapse hits to one entry per ``doc_id``, keeping max score.

    The ``document_summary`` is identical across chunks of the same
    document (it's a column on ``rag_documents``), so picking the
    highest-scoring chunk's row gives us both the doc's relevance to
    the question AND a non-null summary if any chunk had one.
    """
    by_doc: dict[str, BootstrapDoc] = {}
    for h in hits:
        prev = by_doc.get(h.doc_id)
        if prev is None or h.score > prev.score:
            by_doc[h.doc_id] = BootstrapDoc(
                doc_id=h.doc_id,
                title=h.title,
                summary=h.document_summary,
                score=h.score,
            )
    # Stable sort by score desc — the planner sees the most-relevant
    # doc first, which matters when its context window is tight.
    return sorted(by_doc.values(), key=lambda d: d.score, reverse=True)


def render_context_block(result: BootstrapResult) -> str:
    """Render the deduped docs as a ``<document_context>`` system block.

    Format is deliberate: it tells the planner what the docs cover
    AND that the summaries are NOT a citation source — only
    ``search_corpus_node`` results carry citation-grade text. This
    blocks the planner from citing summary content directly (which
    would be ungrounded by chunk-level evidence).
    """
    if result.is_empty:
        return ""
    lines: list[str] = [
        "<document_context>",
        "The following documents in the user's collections may be "
        "relevant to the question. Use these summaries to plan your "
        "sub-questions and as background when synthesizing the final "
        "answer. Do NOT cite from this section directly — only cite "
        "chunks retrieved via search_corpus_node.",
        "",
    ]
    for doc in result.docs:
        title = doc.title or doc.doc_id
        summary = doc.summary or "(no summary available)"
        lines.append(f"[{doc.doc_id}] {title}")
        lines.append(f"Summary: {summary}")
        lines.append("")
    lines.append("</document_context>")
    return "\n".join(lines)


async def bootstrap_document_context(
    *,
    corpus: CorpusSearch,
    user_question: str,
    tenant_id: str,
    collection_ids: list[str],
    top_k: int,
) -> BootstrapResult | None:
    """Run the pre-planner RAG search and return deduped docs.

    Returns ``None`` when the corpus search throws or returns no hits;
    the caller should treat ``None`` and an empty :class:`BootstrapResult`
    identically — no context block to inject.
    """
    try:
        hits = await corpus.search(
            user_question,
            tenant_id=tenant_id,
            collection_ids=collection_ids,
            top_k=top_k,
        )
    except Exception:
        # Best-effort: a bootstrap failure must never sink the user's
        # request. The planner can still run unprimed.
        return None
    if not hits:
        return None
    return BootstrapResult(
        docs=tuple(_dedupe_hits(hits)),
        raw_hits=tuple(hits),
    )


__all__ = [
    "BootstrapDoc",
    "BootstrapResult",
    "bootstrap_document_context",
    "render_context_block",
]
