"""
AgriTrade Analytics - Python analytics/ML microservice.
Runs alongside the Node/Express server, reading from the same MongoDB.
The React dashboard calls this service directly, authenticating with the
SAME JWT the Node server issues (see app/auth.py).

Run locally:
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Interactive API docs: http://localhost:8000/docs
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.http_errors import ApiError, register_exception_handlers
from app.routes.analytics import router as analytics_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agritrade.analytics")

app = FastAPI(title="AgriTrade Analytics Service", version="0.2.0")

_origins = config.cors_origins()
if _origins == ["*"] and config.is_production():
    logger.warning(
        "CORS_ORIGINS is not set: allowing all origins. Endpoints are still JWT-protected, "
        "but set CORS_ORIGINS to your frontend URL(s) in production."
    )
if config.is_production() and config.jwt_secret() is None:
    logger.error("JWT_SECRET is not set: every analytics request will be rejected with 503.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Api-Key"],
)

register_exception_handlers(app)
app.include_router(analytics_router)


@app.get("/")
def root():
    return {"status": "AgriTrade Analytics Service is online"}


@app.get("/api/health")
def health():
    """Liveness: the process is up. Public, reveals nothing."""
    return {"status": "ok"}


@app.get("/api/ready")
def ready():
    """Readiness: the database answers. 503 if not."""
    from app.db import client

    try:
        client.admin.command("ping")
    except Exception:
        raise ApiError(503, "Database is not reachable")
    return {"status": "ready"}
