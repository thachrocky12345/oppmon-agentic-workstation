"""Centralized configuration for the reactive agent (v2).

All values default-load from environment variables. See `.env.example`.
"""

from __future__ import annotations

import os
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


Provider = Literal["anthropic", "openai", "cerebras", "fake"]


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

    # ---- Cerebras (OpenAI-compatible API at api.cerebras.ai) ----
    # Reuses the openai SDK with a different base_url. Confirmed-working models:
    #   llama3.1-8b, gpt-oss-120b, qwen-3-235b-a22b-instruct-2507, zai-glm-4.7
    cerebras_api_key: str = ""
    cerebras_model: str = "llama3.1-8b"
    cerebras_api_base: str = "https://api.cerebras.ai/v1"
    cerebras_max_tokens: int = 4096

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

    # ---- Database (TAG-51) ----
    # postgres://user:pass@host:port/db — empty means "no DB attached".
    # /solve_v2 must still boot with database_url unset; only consumers
    # that actually need the pool call `require_db()`.
    database_url: str = ""
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10
    db_pool_timeout_s: float = 5.0

    # ---- Auth / JWT (TAG-52) ----
    # MUST equal apps/api's JWT_SECRET for cross-service login parity.
    # Empty default lets /solve_v2 boot in dev without auth wired; any call
    # to `verify_jwt()` with an unset secret raises RuntimeError loudly.
    jwt_secret: str = ""
    # Issuer string baked into apps/api/src/lib/jwt.ts. Don't change unless
    # the Express signer changes first.
    jwt_issuer: str = "oppmon"

    def require_db(self) -> None:
        """Raise if no DATABASE_URL is configured. Call from pool consumers."""
        if not self.database_url:
            raise RuntimeError(
                "DATABASE_URL not set. agent_search requires Postgres for "
                "JWT verify / model registry / corpus search. Add it to .env."
            )

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
        if self.llm_provider == "cerebras" and not self.cerebras_api_key:
            raise RuntimeError(
                "LLM_PROVIDER=cerebras but CEREBRAS_API_KEY is unset. "
                "Get a key at https://cloud.cerebras.ai and add it to .env."
            )


def _load_settings() -> Settings:
    """Module-level singleton. Tests override via Settings(...) directly."""
    return Settings()


settings = _load_settings()


__all__ = ["Settings", "settings", "Provider"]
