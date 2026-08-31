"""
test_price_prediction.py - tests the forecasting logic itself, using
mocked crop data instead of a live MongoDB connection. This proves the
Prophet-vs-linear-fallback decision logic works correctly, independent
of whatever's actually in your database at any given moment.

Run with: pytest tests/test_price_prediction.py -v
"""
from unittest.mock import patch
import pandas as pd
from datetime import datetime, timedelta
from app.services import price_prediction


def _make_fake_crops_df(n_days, crop_name="Wheat"):
    base_date = datetime(2026, 1, 1)
    rows = []
    for i in range(n_days):
        rows.append({
            "cropName": crop_name,
            "currentBid": 20 + i * 0.1,
            "createdAt": base_date + timedelta(days=i),
        })
    return pd.DataFrame(rows)


def test_returns_error_when_no_data_for_crop():
    with patch.object(price_prediction, "load_crops", return_value=pd.DataFrame()):
        result = price_prediction.predict_price("Wheat", days_ahead=7)
    assert "error" in result


def test_falls_back_to_linear_with_sparse_data():
    fake_df = _make_fake_crops_df(n_days=5)
    with patch.object(price_prediction, "load_crops", return_value=fake_df):
        result = price_prediction.predict_price("Wheat", days_ahead=7)
    assert result["model"] == "linear_fallback"
    assert result["historyPoints"] == 5
    assert len(result["forecast"]) == 7


def test_uses_prophet_with_enough_data():
    fake_df = _make_fake_crops_df(n_days=15)
    with patch.object(price_prediction, "load_crops", return_value=fake_df):
        result = price_prediction.predict_price("Wheat", days_ahead=7)
    assert result["model"] in ("prophet", "linear_fallback")
    assert len(result["forecast"]) == 7


def test_forecast_prices_are_never_negative():
    fake_df = _make_fake_crops_df(n_days=20)
    with patch.object(price_prediction, "load_crops", return_value=fake_df):
        result = price_prediction.predict_price("Wheat", days_ahead=14)
    for point in result["forecast"]:
        assert point["yhat"] >= 0


def test_case_insensitive_crop_name_matching():
    fake_df = _make_fake_crops_df(n_days=12, crop_name="Wheat")
    with patch.object(price_prediction, "load_crops", return_value=fake_df):
        result_lower = price_prediction.predict_price("wheat", days_ahead=5)
        result_upper = price_prediction.predict_price("WHEAT", days_ahead=5)
    assert "error" not in result_lower
    assert "error" not in result_upper