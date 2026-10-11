"""
Central place for environment-driven settings.

Everything is read at call time (not import time) on purpose: reading
os.environ when the module is first imported made behaviour depend on
import order, which is exactly what broke the market-recommendation
tests (they set credentials *after* importing the code under test).
"""
import os

# Same dev-only fallback the Node server uses (server/server.js), so a
# fresh local checkout works end to end with no .env. It is NEVER used
# when running in production - see jwt_secret().
DEV_FALLBACK_JWT_SECRET = "dev-only-secret-do-not-use-in-production"


def is_production() -> bool:
    """True on a deployed instance. Render sets RENDER=true on every service."""
    for name in ("APP_ENV", "ENVIRONMENT", "NODE_ENV"):
        if os.getenv(name, "").strip().lower() == "production":
            return True
    return bool(os.getenv("RENDER"))


def jwt_secret() -> str | None:
    """
    Secret used to verify the JWTs issued by the Node backend. It must be
    the SAME value as the Node server's JWT_SECRET.

    Returns None when running in production without it configured - the
    auth layer then refuses requests (503) instead of falling back to a
    publicly known secret.
    """
    secret = os.getenv("JWT_SECRET", "").strip()
    if secret:
        return secret
    return None if is_production() else DEV_FALLBACK_JWT_SECRET


def internal_api_key() -> str | None:
    """Optional shared key for trusted server-to-server callers (X-Internal-Api-Key)."""
    return os.getenv("ANALYTICS_INTERNAL_API_KEY", "").strip() or None


def cors_origins() -> list[str]:
    """
    Comma-separated allow-list in CORS_ORIGINS. Unset means "*" (fine for
    local dev; the API itself is protected by JWT, not by CORS).
    """
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return ["*"]
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


def mandi_credentials() -> tuple[str | None, str | None]:
    return os.getenv("DATAGOVIN_API_KEY") or None, os.getenv("DATAGOVIN_RESOURCE_ID") or None


def chatbot_rate_limit() -> tuple[int, int]:
    """(max LLM-backed messages, window seconds) per user."""
    try:
        return int(os.getenv("CHATBOT_LLM_MAX_PER_WINDOW", "20")), int(os.getenv("CHATBOT_LLM_WINDOW_SECONDS", "600"))
    except ValueError:
        return 20, 600
