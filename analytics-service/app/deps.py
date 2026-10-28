"""FastAPI dependencies shared by routers."""
import math

from fastapi import Depends, Header, Request

from app import config
from app.auth import Principal, authenticate_headers
from app.http_errors import ApiError
from app.utils.rate_limit import SlidingWindowLimiter

_limiter = SlidingWindowLimiter(config.rate_limit_per_minute(), 60.0)


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


def rate_limit(principal: Principal = Depends(require_principal)) -> None:
    """429 when one signed-in user sends too many requests in a minute. The trusted internal service key is exempt."""
    if principal.kind == "service":
        return
    allowed, retry_after = _limiter.check(f"{principal.kind}:{principal.subject}")
    if not allowed:
        raise ApiError(429, "Too many requests. Please slow down and try again shortly.",
                       headers={"Retry-After": str(max(1, math.ceil(retry_after)))})
