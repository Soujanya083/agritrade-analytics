"""
Service-to-service / client authentication for the analytics API.

Architecture note
-----------------
The Node backend is the system's identity provider: it signs an HS256 JWT
({id, role}, 7 days) at login. The React app already sends that token to
the Node API, and it also calls this service directly
(REACT_APP_ANALYTICS_BASE_URL). Rather than invent a second credential
system, this service verifies the SAME token with the SAME shared secret
(JWT_SECRET). No new login flow, no new user store.

For trusted server-side callers that have no user (cron jobs, load tests,
a future Node->analytics call) an optional static key may be configured
in ANALYTICS_INTERNAL_API_KEY and sent as the X-Internal-Api-Key header.

The pure functions here (`decode_token`, `authenticate_headers`) have no
FastAPI dependency so they can be unit-tested directly.
"""
import hmac
from dataclasses import dataclass

import jwt  # PyJWT

from app import config

ALLOWED_ROLES = {"Farmer", "Buyer"}


class AuthError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class Principal:
    subject: str
    role: str
    kind: str  # "user" | "service"


def decode_token(token: str, secret: str) -> Principal:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],          # never trust the token's own "alg"
            options={"require": ["exp"]},  # tokens without an expiry are rejected
        )
    except jwt.ExpiredSignatureError:
        raise AuthError(401, "Token expired")
    except jwt.InvalidTokenError:
        raise AuthError(401, "Invalid token")

    subject = str(payload.get("id") or "")
    role = str(payload.get("role") or "")
    if not subject:
        raise AuthError(401, "Invalid token")
    if role not in ALLOWED_ROLES:
        raise AuthError(403, "Token role is not permitted to use analytics")
    return Principal(subject=subject, role=role, kind="user")


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def authenticate_headers(authorization: str | None, internal_key: str | None) -> Principal:
    """Resolve request headers to a Principal or raise AuthError."""
    configured_key = config.internal_api_key()
    if internal_key:
        if configured_key and hmac.compare_digest(internal_key.encode(), configured_key.encode()):
            return Principal(subject="internal-service", role="Service", kind="service")
        raise AuthError(401, "Invalid internal API key")

    token = _bearer(authorization)
    if not token:
        raise AuthError(401, "Authentication required")

    secret = config.jwt_secret()
    if secret is None:
        # Production without JWT_SECRET: fail closed rather than accept anything.
        raise AuthError(503, "Authentication is not configured on this service (JWT_SECRET missing)")
    return decode_token(token, secret)
