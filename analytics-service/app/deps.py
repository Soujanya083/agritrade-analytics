"""FastAPI dependencies shared by routers."""
from fastapi import Header, Request

from app.auth import Principal, authenticate_headers


def require_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    x_internal_api_key: str | None = Header(default=None),
) -> Principal:
    """Reject the request (401/403/503) unless it carries a valid user JWT
    or the internal service key. See app/auth.py."""
    principal = authenticate_headers(authorization, x_internal_api_key)
    request.state.principal = principal
    return principal
