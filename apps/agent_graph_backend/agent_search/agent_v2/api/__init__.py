"""HTTP route layer for agent_search.

TAG-58 adds the authenticated ``POST /solve`` endpoint. The legacy
``/solve_v2`` route stays defined in ``agent_v2.app`` to keep its
back-compat surface frozen.
"""

from .solve import router as solve_router
from .solve_request import ChatMessage, SolveRequest

__all__ = ["ChatMessage", "SolveRequest", "solve_router"]
