"""FastAPI-facing half of errors.py: raising and rendering HTTP errors."""
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.auth import AuthError
from app.errors import classify_error, is_error_result

logger = logging.getLogger("agritrade.analytics")

# Internal schema detail that should not be echoed to API clients.
_HIDDEN_CONTEXT_KEYS = {"error", "availableColumns"}


class ApiError(HTTPException):
    """HTTPException that can carry small, safe diagnostic context."""

    def __init__(self, status_code: int, detail: str, context: dict | None = None, headers: dict | None = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.context = context or None


def ok_or_http_error(result, *, status_override: int | None = None):
    """
    Return `result` unchanged, unless it is a service error dict - then
    raise the matching ApiError (e.g. 404 / 422 / 503).
    """
    if not is_error_result(result):
        return result
    status = status_override or classify_error(result["error"])
    context = {k: v for k, v in result.items() if k not in _HIDDEN_CONTEXT_KEYS}
    raise ApiError(status, result["error"], context)


def error_body(detail, status: int, context=None) -> dict:
    # `error` is kept alongside FastAPI's standard `detail` so any older
    # client that still reads `.error` keeps working.
    body = {"detail": detail, "error": detail, "status": status}
    if context:
        body["context"] = context
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exc(request: Request, exc: HTTPException):
        return JSONResponse(
            error_body(exc.detail, exc.status_code, getattr(exc, "context", None)),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(AuthError)
    async def auth_exc(request: Request, exc: AuthError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return JSONResponse(error_body(exc.detail, exc.status_code), status_code=exc.status_code, headers=headers)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        # Database being down is an availability problem, not a bug.
        if type(exc).__name__ in {"ServerSelectionTimeoutError", "AutoReconnect", "NetworkTimeout", "ConnectionFailure"}:
            logger.error("Database unavailable: %s", exc)
            return JSONResponse(error_body("Database is temporarily unavailable", 503), status_code=503)
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(error_body("Internal server error", 500), status_code=500)
