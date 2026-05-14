"""Centralized configuration for the reactive agent (v2).

All values default-load from environment variables. See `.env.example`.
"""

from __future__ import annotations

import os
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


Provider = Literal["anthropic", "openai", "fake"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- LLM provider selection ----
    llm_provider: Provider = "fake"

    # ---- Anthropic ----
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_max_tokens: int = 4096

    # ---- OpenAI ----
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_api_base: str = "https://api.openai.com/v1"
    openai_max_tokens: int = 4096

    # ---- Shared LLM tuning ----
    llm_temperature: float = 0.1
    llm_top_p: float = 0.9

    # ---- Web search ----
    # Provider: 'tavily' | 'google' | 'duckduckgo' | '' (auto: prefer tavily if
    # key set, else google if keys set, else ddg)
    web_search_provider: str = ""
    tavily_api_key: str = ""
    tavily_search_timeout: float = 8.0
    tavily_search_depth: str = "basic"  # 'basic' | 'advanced'
    google_search_api_key: str = ""
    google_search_engine_id: str = ""
    google_search_timeout: float = 5.0
    google_search_topk: int = 3

    # ---- Loop limits ----
    planner_max_iterations: int = 8
    searcher_max_iterations: int = 4
    tool_dispatch_max_parallel: int = 8
    tool_dispatch_timeout_s: float = 30.0

    # ---- RAG ----
    rag_score_threshold: float = 0.4
    rag_top_k: int = 5

    # ---- Server / debug ----
    mindsearch_debug: bool = False
    mindsearch_port: int = 8002

    def require_llm_credentials(self) -> None:
        """Raise if the configured provider is missing credentials."""
        if self.llm_provider == "anthropic" and not self.anthropic_api_key:
            raise RuntimeError(
                "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is unset. "
                "Add it to .env or set the env var."
            )
        if self.llm_provider == "openai" and not self.openai_api_key:
            raise RuntimeError(
                "LLM_PROVIDER=openai but OPENAI_API_KEY is unset. "
                "Add it to .env or set the env var."
            )


def _load_settings() -> Settings:
    """Module-level singleton. Tests override via Settings(...) directly."""
    return Settings()


settings = _load_settings()


__all__ = ["Settings", "settings", "Provider"]
