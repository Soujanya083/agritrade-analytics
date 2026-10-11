"""
HTTP-level tests of the analytics API: authentication, status codes, input
validation, privacy and error handling. Services are stubbed, so no
database, Prophet or network is needed.
"""
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.routes import analytics as routes
from app.services.market import real_market
from app.services import (
    anomaly_detection,
    catalog,
    chatbot,
    dashboard_summary,
    demand_forecast,
    price_prediction,
    trends,
)

client = TestClient(app, raise_server_exceptions=False)


def token(sub="farmer-1", role="Farmer", expires_in=3600, secret=None):
    return jwt.encode(
        {"id": sub, "role": role, "exp": int(time.time()) + expires_in},
        secret or config.DEV_FALLBACK_JWT_SECRET,
        algorithm="HS256",
    )


def auth(**kw):
    return {"Authorization": f"Bearer {token(**kw)}"}


FORECAST = {
    "cropName": "Wheat", "model": "Prophet", "historyPoints": 30, "forecastDays": 3,
    "forecast": [{"ds": "2026-10-03", "yhat": 20.0, "yhat_lower": 18.0, "yhat_upper": 22.0}] * 3,
}


@pytest.fixture(autouse=True)
def _known_crops(monkeypatch):
    monkeypatch.setattr(catalog, "resolve_crop_name",
                        lambda name: {"wheat": "Wheat", "onion": "Onion"}.get((name or "").strip().lower()))


# ------------------------------------------------------------ authentication
PROTECTED_GET_PATHS = [
    "/api/analytics/crops",
    "/api/analytics/price-prediction?cropName=Wheat",
    "/api/analytics/demand-forecast?cropName=Wheat",
    "/api/analytics/recommend-crops",
    "/api/analytics/best-selling-crops",
    "/api/analytics/farmer-revenue",
    "/api/analytics/buyer-patterns",
    "/api/analytics/buyer-segments",
    "/api/analytics/bid-anomalies",
    "/api/analytics/decision-summary?cropName=Wheat",
    "/api/analytics/market-recommendation?cropName=Wheat",
    "/api/analytics/mandi-prices?commodity=Wheat",
    "/api/analytics/dashboard-summary",
    "/api/analytics/data-quality",
    "/api/analytics/chatbot/status",
    "/api/analytics/data-provenance",
    "/api/analytics/bid-anomalies/benchmark",
    "/api/analytics/real-market/commodities",
    "/api/analytics/real-market/overview?commodity=Onion",
    "/api/analytics/real-market/forecast?commodity=Onion",
]


@pytest.mark.parametrize("path", PROTECTED_GET_PATHS)
def test_every_analytics_route_rejects_anonymous_requests(path):
    response = client.get(path)
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_chatbot_post_requires_authentication():
    assert client.post("/api/analytics/chatbot", json={"message": "hi"}).status_code == 401


def test_health_and_root_stay_public():
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/").status_code == 200


def test_expired_and_forged_tokens_are_rejected():
    assert client.get("/api/analytics/crops", headers=auth(expires_in=-5)).status_code == 401
    assert client.get("/api/analytics/crops", headers=auth(secret="not-the-secret")).status_code == 401


def test_unknown_role_is_forbidden():
    assert client.get("/api/analytics/crops", headers=auth(role="Admin")).status_code == 403


def test_internal_service_key_is_accepted(monkeypatch):
    monkeypatch.setenv("ANALYTICS_INTERNAL_API_KEY", "svc-key")
    monkeypatch.setattr(catalog, "list_crops", lambda: [])
    monkeypatch.setattr(catalog, "list_locations", lambda: [])
    assert client.get("/api/analytics/crops", headers={"X-Internal-Api-Key": "svc-key"}).status_code == 200
    assert client.get("/api/analytics/crops", headers={"X-Internal-Api-Key": "bad"}).status_code == 401


def test_production_without_jwt_secret_fails_closed(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    response = client.get("/api/analytics/crops", headers=auth())
    assert response.status_code == 503


# ---------------------------------------------------------------- status codes
def test_success_returns_200_with_data(monkeypatch):
    monkeypatch.setattr(price_prediction, "predict_price", lambda crop, d=14: dict(FORECAST))
    response = client.get("/api/analytics/price-prediction?cropName=wheat&daysAhead=3", headers=auth())
    assert response.status_code == 200
    assert response.json()["cropName"] == "Wheat"


def test_unknown_crop_is_404_not_200(monkeypatch):
    response = client.get("/api/analytics/price-prediction?cropName=Unicorn", headers=auth())
    assert response.status_code == 404
    assert "Unknown crop" in response.json()["detail"]


def test_service_level_no_data_error_becomes_404(monkeypatch):
    monkeypatch.setattr(demand_forecast, "predict_demand",
                        lambda crop, d=14: {"error": "No transaction history found for crop 'Wheat'"})
    response = client.get("/api/analytics/demand-forecast?cropName=Wheat", headers=auth())
    assert response.status_code == 404


def test_not_enough_data_is_422(monkeypatch):
    monkeypatch.setattr(anomaly_detection, "detect_bid_anomalies",
                        lambda c=0.05: {"error": "Not enough bidding data for anomaly detection.", "recordsAvailable": 3})
    response = client.get("/api/analytics/bid-anomalies", headers=auth())
    assert response.status_code == 422
    assert response.json()["context"] == {"recordsAvailable": 3}


def test_error_body_has_detail_error_and_status(monkeypatch):
    response = client.get("/api/analytics/price-prediction?cropName=Unicorn", headers=auth())
    body = response.json()
    assert body["detail"] == body["error"]
    assert body["status"] == 404


def test_missing_mandi_credentials_is_503(monkeypatch):
    from app.services import mandi_comparison
    monkeypatch.setattr(mandi_comparison, "fetch_mandi_prices",
                        lambda c, s=None, limit=25: {"error": "Mandi API credentials not configured."})
    assert client.get("/api/analytics/mandi-prices?commodity=Wheat", headers=auth()).status_code == 503


# ------------------------------------------------------------------ validation
@pytest.mark.parametrize("query", [
    "cropName=Wheat&daysAhead=0",
    "cropName=Wheat&daysAhead=91",
    "cropName=Wheat&daysAhead=abc",
    "cropName=",
])
def test_invalid_price_prediction_parameters_are_422(query):
    assert client.get(f"/api/analytics/price-prediction?{query}", headers=auth()).status_code == 422


@pytest.mark.parametrize("path", [
    "/api/analytics/best-selling-crops?topN=0",
    "/api/analytics/best-selling-crops?topN=1000",
    "/api/analytics/recommend-crops?topN=-1",
    "/api/analytics/buyer-segments?nClusters=1",
    "/api/analytics/buyer-segments?nClusters=50",
    "/api/analytics/backtest/price?cropName=Wheat&testDays=0",
    "/api/analytics/market-recommendation?cropName=Wheat&quantityKg=-5",
    "/api/analytics/decision-summary?cropName=Wheat&quantityKg=0",
    "/api/analytics/bid-anomalies?contamination=0.9",
])
def test_out_of_range_parameters_are_rejected_with_422(path):
    assert client.get(path, headers=auth()).status_code == 422


def test_chatbot_message_is_validated():
    assert client.post("/api/analytics/chatbot", json={"message": ""}, headers=auth()).status_code == 422
    too_long = {"message": "x" * (chatbot.MAX_MESSAGE_CHARS + 1)}
    assert client.post("/api/analytics/chatbot", json=too_long, headers=auth()).status_code == 422


# ---------------------------------------------------------------------- privacy
def test_farmer_revenue_does_not_expose_other_users_ids(monkeypatch):
    monkeypatch.setattr(trends, "farmer_revenue", lambda: [
        {"farmerId": "farmer-1", "totalPayout": 100.0, "completedDeals": 2},
        {"farmerId": "farmer-2-secret-id", "totalPayout": 50.0, "completedDeals": 1},
    ])
    body = client.get("/api/analytics/farmer-revenue", headers=auth(sub="farmer-1")).json()["data"]
    assert "farmer-2-secret-id" not in str(body)
    assert [row["isYou"] for row in body] == [True, False]


def test_bid_anomalies_hide_user_identities(monkeypatch):
    monkeypatch.setattr(anomaly_detection, "detect_bid_anomalies", lambda c=0.05: {
        "anomalies": [], "patternAnomalies": {"selfDealing": [{"bidId": "b1", "userId": "someone-private"}]}})
    response = client.get("/api/analytics/bid-anomalies", headers=auth())
    assert "someone-private" not in response.text


# ---------------------------------------------------------------------- chatbot
def test_chatbot_answers_and_labels_the_source(monkeypatch):
    monkeypatch.setattr(chatbot, "handle_message",
                        lambda message, user_key="x": {"reply": "ok", "intent": "help", "source": "fallback", "entities": {}})
    response = client.post("/api/analytics/chatbot", json={"message": "hello"}, headers=auth())
    assert response.status_code == 200
    assert response.json()["source"] == "fallback"


def test_chatbot_rate_limit_is_429_with_retry_after(monkeypatch):
    def limited(message, user_key="x"):
        raise chatbot.RateLimited(42)

    monkeypatch.setattr(chatbot, "handle_message", limited)
    response = client.post("/api/analytics/chatbot", json={"message": "how to compost"}, headers=auth())
    assert response.status_code == 429
    assert response.headers["retry-after"] == "42"


def test_chatbot_status_reports_llm_honestly():
    body = client.get("/api/analytics/chatbot/status", headers=auth()).json()
    assert body["llm"]["configured"] is False
    assert body["projectDataAnswers"] is True


# ----------------------------------------------------------------- misc routes
def test_dashboard_summary_is_not_null(monkeypatch):
    monkeypatch.setattr(dashboard_summary, "get_dashboard_summary", lambda: {"totalCrops": 3})
    response = client.get("/api/analytics/dashboard-summary", headers=auth())
    assert response.status_code == 200 and response.json() == {"totalCrops": 3}


def test_crops_endpoint_feeds_the_dropdown(monkeypatch):
    monkeypatch.setattr(catalog, "list_crops", lambda: [{"cropName": "Orange", "category": "Fruits", "listings": 4}])
    monkeypatch.setattr(catalog, "list_locations", lambda: ["Pune"])
    body = client.get("/api/analytics/crops", headers=auth()).json()
    assert body["data"][0]["cropName"] == "Orange"
    assert body["locations"] == ["Pune"]


# --------------------------------------------------------------- failure modes
def test_unexpected_exception_is_500_without_leaking_details(monkeypatch):
    def boom():
        raise RuntimeError("secret internal detail /etc/passwd")

    monkeypatch.setattr(trends, "region_wise_demand", boom)
    response = client.get("/api/analytics/region-demand", headers=auth())
    assert response.status_code == 500
    assert "secret internal detail" not in response.text
    assert response.json()["detail"] == "Internal server error"


def test_database_outage_is_503(monkeypatch):
    class ServerSelectionTimeoutError(Exception):
        pass

    def down():
        raise ServerSelectionTimeoutError("mongo unreachable at mongodb+srv://user:pw@cluster")

    monkeypatch.setattr(trends, "region_wise_demand", down)
    response = client.get("/api/analytics/region-demand", headers=auth())
    assert response.status_code == 503
    assert "mongodb" not in response.text


# ------------------------------------------------------------- real market data
def test_real_market_forecast_with_no_imported_history_is_404_with_instructions(monkeypatch):
    monkeypatch.setattr(real_market, "forecast_real_market",
                        lambda c, s=None, m=None, h=14: {"error": real_market.NO_HISTORY.format(what=c)})
    response = client.get("/api/analytics/real-market/forecast?commodity=Onion", headers=auth())
    assert response.status_code == 404
    assert "REAL_DATA.md" in response.json()["detail"]


def test_real_market_forecast_with_too_little_history_is_422(monkeypatch):
    monkeypatch.setattr(real_market, "forecast_real_market",
                        lambda c, s=None, m=None, h=14: {"error": "Not enough price history: need at least 120 days, found 50.", "minimumDays": 120})
    response = client.get("/api/analytics/real-market/forecast?commodity=Onion", headers=auth())
    assert response.status_code == 422
    assert response.json()["context"]["minimumDays"] == 120


@pytest.mark.parametrize("query", ["commodity=Onion&horizon=0", "commodity=Onion&horizon=31", "commodity="])
def test_real_market_forecast_validates_parameters(query):
    assert client.get(f"/api/analytics/real-market/forecast?{query}", headers=auth()).status_code == 422


def test_real_market_forecast_success_passes_the_lab_result_through(monkeypatch):
    payload = {"commodity": "Onion", "champion": {"model": "naive", "beatsNaive": False}, "forecast": []}
    monkeypatch.setattr(real_market, "forecast_real_market", lambda c, s=None, m=None, h=14: payload)
    response = client.get("/api/analytics/real-market/forecast?commodity=Onion&state=Maharashtra&horizon=7", headers=auth())
    assert response.status_code == 200 and response.json()["champion"]["beatsNaive"] is False


def test_real_market_commodities_is_empty_before_any_import(monkeypatch):
    monkeypatch.setattr(real_market, "real_market_commodities", lambda: [])
    assert client.get("/api/analytics/real-market/commodities", headers=auth()).json() == {"data": []}
