"""
Shared test setup.

* ANALYTICS_DISABLE_DATA_VERSION stops the cache layer from querying MongoDB
  for its "has the data changed" fingerprint - the unit tests are DB-free.
* The autouse fixture empties the in-process caches around every test, so a
  cached result from one test (e.g. predict_price("Wheat") with fake data A)
  can never leak into the next (fake data B).
* Credentials / LLM keys from a developer's real .env must never leak into
  tests, so they are removed for each test.
"""
import os

os.environ.setdefault("ANALYTICS_DISABLE_DATA_VERSION", "1")

import pytest

from app.utils.ttl_cache import clear_cache

_SECRET_ENV_VARS = [
    "DATAGOVIN_API_KEY", "DATAGOVIN_RESOURCE_ID", "LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL",
    "LLM_BASE_URL", "JWT_SECRET", "ANALYTICS_INTERNAL_API_KEY", "CORS_ORIGINS",
]


@pytest.fixture(autouse=True)
def _isolated_environment(monkeypatch):
    for name in _SECRET_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    for name in ("APP_ENV", "ENVIRONMENT", "NODE_ENV", "RENDER"):
        monkeypatch.delenv(name, raising=False)
    # The decision summary now also consults imported real-market history and
    # data provenance; both read MongoDB, so default them to "nothing there".
    # Tests that exercise those paths re-patch them explicitly.
    from app.services import dashboard_summary
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda crop, state: None)
    monkeypatch.setattr(dashboard_summary, "_provenance", lambda: None)
    from app.services import market_recommendation
    monkeypatch.setattr(market_recommendation, "_imported_market_records", lambda crop: None)
    clear_cache()
    yield
    clear_cache()
