# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Database access for agent_v2.

This subpackage exposes a process-lifetime asyncpg pool and thin
read-biased query helpers. See TAG-51 for the design rationale.

Public surface:
    get_pool, close_pool          — lifecycle
    pg_fetch_one, pg_fetch_all,
    pg_execute                    — query helpers (read-only by default)
    ModelRow                      — Pydantic row model (TAG-55)
    get_user_models,
    get_user_model                — read-only model registry (TAG-55)
"""

from __future__ import annotations

from .model_registry import get_user_model, get_user_models
from .models import ModelRow
from .pool import close_pool, get_pool
from .queries import pg_execute, pg_fetch_all, pg_fetch_one

__all__ = [
    "ModelRow",
    "close_pool",
    "get_pool",
    "get_user_model",
    "get_user_models",
    "pg_execute",
    "pg_fetch_all",
    "pg_fetch_one",
]
