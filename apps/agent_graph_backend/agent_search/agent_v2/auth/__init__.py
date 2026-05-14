"""Authentication for agent_search.

TAG-52 adds HS256 JWT verification mirroring apps/api (Express).
TAG-53 will add a FastAPI `get_current_user` dependency on top of `verify_jwt`.
"""

from .jwt import AuthError, verify_jwt
from .types import JWTClaims

__all__ = ["AuthError", "JWTClaims", "verify_jwt"]
