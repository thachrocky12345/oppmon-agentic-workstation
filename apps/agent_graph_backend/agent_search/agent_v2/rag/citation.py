# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Citation & search-hit types.

Mirrors Arkon `apps/api/src/services/rag-chat.ts:41-50` so the React frontend
can render rag vs web hits with different icons identically.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


Source = Literal["rag", "web", "both", "none"]


class SearchHit(BaseModel):
    """One raw result from any retrieval source."""

    source: Literal["rag", "web"]
    title: str = ""
    snippet: str = ""
    url: str | None = None  # for web hits and external RAG docs
    document_id: str | None = None  # for internal RAG chunks
    chunk_text: str | None = None
    score: float = 0.0
    # Contextual Retrieval (TAG-CR): populated for RAG hits when the
    # contextualizer ran at ingest. None on web hits and on RAG hits whose
    # documents predate the contextualizer rollout.
    document_summary: str | None = None
    context_prefix: str | None = None
    section_path: str | None = None
    page_number: int | None = None


class Citation(BaseModel):
    """A numbered citation surfaced in the final answer."""

    index: int  # 1-based number used as [[N]] in the answer text
    source: Literal["rag", "web"]
    title: str = ""
    url: str | None = None
    document_id: str | None = None
    snippet: str = ""
    score: float = 0.0


__all__ = ["Citation", "SearchHit", "Source"]
