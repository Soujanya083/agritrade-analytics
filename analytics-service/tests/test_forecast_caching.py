"""Forecasts are fit once per crop; shorter horizons are slices of it."""
import pandas as pd

from app.services import demand_forecast, price_prediction


def short_series(n=6):
    # < 10 points -> deterministic linear fallback (no Prophet needed)
    return pd.DataFrame({"ds": pd.date_range("2026-01-01", periods=n), "y": [10 + i for i in range(n)]})


def test_price_model_is_fit_once_for_several_horizons(monkeypatch):
    calls = {"n": 0}

    def fake_series(crop_name):
        calls["n"] += 1
        return short_series()

    monkeypatch.setattr(price_prediction, "_prepare_series", fake_series)

    one = price_prediction.predict_price("Wheat", days_ahead=1)
    seven = price_prediction.predict_price("Wheat", days_ahead=7)
    fourteen = price_prediction.predict_price("Wheat", days_ahead=14)

    assert calls["n"] == 1  # the dashboard asks for 1, 7 and 14 days of the same crop
    assert len(one["forecast"]) == 1
    assert len(seven["forecast"]) == 7
    assert len(fourteen["forecast"]) == 14
    assert one["forecastDays"] == 1 and seven["forecastDays"] == 7


def test_shorter_forecast_is_a_prefix_of_the_longer_one(monkeypatch):
    monkeypatch.setattr(price_prediction, "_prepare_series", lambda crop: short_series())
    seven = price_prediction.predict_price("Wheat", days_ahead=7)["forecast"]
    fourteen = price_prediction.predict_price("Wheat", days_ahead=14)["forecast"]
    assert fourteen[:7] == seven


def test_price_horizon_validation_still_enforced(monkeypatch):
    monkeypatch.setattr(price_prediction, "_prepare_series", lambda crop: short_series())
    assert "error" in price_prediction.predict_price("Wheat", days_ahead=0)
    assert "error" in price_prediction.predict_price("Wheat", days_ahead=price_prediction.MAX_FORECAST_DAYS + 1)


def test_price_errors_are_not_cached(monkeypatch):
    calls = {"n": 0}

    def empty(crop):
        calls["n"] += 1
        return pd.DataFrame(columns=["ds", "y"])

    monkeypatch.setattr(price_prediction, "_prepare_series", empty)
    assert "error" in price_prediction.predict_price("Ghost", 7)
    assert "error" in price_prediction.predict_price("Ghost", 7)
    assert calls["n"] == 2


def test_demand_model_is_fit_once_for_several_horizons(monkeypatch):
    calls = {"n": 0}

    def fake_series(crop_name):
        calls["n"] += 1
        return short_series(8)

    monkeypatch.setattr(demand_forecast, "_prepare_demand_series", fake_series)
    a = demand_forecast.predict_demand("Onion", days_ahead=3)
    b = demand_forecast.predict_demand("Onion", days_ahead=10)
    assert calls["n"] == 1
    assert len(a["forecast"]) == 3 and len(b["forecast"]) == 10
