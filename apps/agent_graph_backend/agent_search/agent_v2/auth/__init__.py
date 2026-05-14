"""Authentication for agent_search.

TAG-52 adds HS256 JWT verification mirroring apps/api (Express).
TAG-53 adds FastAPI ``get_current_user`` + ``require_role`` dependencies
on top of ``verify_jwt``.
"""

from .deps import get_current_user, require_role
from .jwt import AuthError, verify_jwt
from .types import JWTClaims

__all__ = [
    "AuthError",
    "JWTClaims",
    "get_current_user",
    "require_role",
    "verify_jwt",
]
