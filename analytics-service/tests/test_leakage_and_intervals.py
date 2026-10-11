"""No look-ahead in the marketplace price series; honest intervals in the fallback models."""
import numpy as np
import pandas as pd
import pytest
from unittest.mock import patch

from app.services import demand_forecast, price_prediction
from app.utils.intervals import ols_prediction_interval


def listings(base_prices, bids=None, start="2026-01-01"):
    n = len(base_prices)
    return pd.DataFrame({
        "cropName": ["Wheat"] * n,
        "basePrice": base_prices,
        "currentBid": bids if bids is not None else base_prices,
        "createdAt": pd.date_range(start, periods=n, freq="D"),
    })


def series_for(df):
    with patch.object(price_prediction, "load_crops", return_value=df):
        return price_prediction._prepare_series("Wheat")


# ----------------------------------------------------------------- look-ahead
def test_series_uses_the_asking_price_not_the_later_highest_bid():
    df = listings([20.0, 21.0, 22.0], bids=[30.0, 35.0, 40.0])
    assert list(series_for(df)["y"]) == [20.0, 21.0, 22.0]


def test_later_bidding_cannot_change_the_series():
    """THE leakage property: bids placed after a listing existed must not alter what the model sees."""
    before = series_for(listings([20.0, 21.0, 22.0, 23.0], bids=[20.0, 21.0, 22.0, 23.0]))
    after_bidding = series_for(listings([20.0, 21.0, 22.0, 23.0], bids=[90.0, 95.0, 99.0, 120.0]))
    pd.testing.assert_frame_equal(before, after_bidding)


def test_falls_back_to_current_bid_only_when_there_are_no_asking_prices():
    df = pd.DataFrame({"cropName": ["Wheat"] * 3, "currentBid": [10.0, 11.0, 12.0],
                       "createdAt": pd.date_range("2026-01-01", periods=3)})
    assert list(series_for(df)["y"]) == [10.0, 11.0, 12.0]
    assert price_prediction.price_basis(df) == price_prediction.PRICE_BASIS_FALLBACK


def test_zero_or_missing_asking_prices_trigger_the_fallback():
    df = listings([0, 0, 0], bids=[10.0, 11.0, 12.0])
    assert price_prediction._price_column(df) == "currentBid"


def test_the_forecast_states_which_price_it_is_based_on():
    df = listings(list(np.linspace(20, 25, 8)))
    with patch.object(price_prediction, "load_crops", return_value=df):
        result = price_prediction.predict_price("Wheat", 3)
    assert "no look-ahead" in result["priceBasis"]


# ----------------------------------------------------------------- intervals
def test_ols_interval_contains_the_point_and_widens_with_the_horizon():
    y = 10 + 0.5 * np.arange(30) + np.random.default_rng(0).normal(0, 1, 30)
    point, lo, hi = ols_prediction_interval(y, np.arange(30, 40))
    assert np.all(lo < point) and np.all(point < hi)
    widths = hi - lo
    assert widths[-1] > widths[0]


def test_ols_interval_has_roughly_the_stated_coverage():
    """Simulate many linear series; the 90% interval should contain the next value ~90% of the time."""
    rng = np.random.default_rng(1)
    hits = 0
    trials = 1500
    for _ in range(trials):
        y = 5 + 0.2 * np.arange(25) + rng.normal(0, 1.5, 25)
        truth = 5 + 0.2 * 25 + rng.normal(0, 1.5)
        _, lo, hi = ols_prediction_interval(y, np.array([25]))
        hits += lo[0] <= truth <= hi[0]
    assert 0.86 <= hits / trials <= 0.94


def test_two_points_give_no_false_certainty():
    point, lo, hi = ols_prediction_interval(np.array([10.0, 12.0]), np.array([2, 3]))
    assert np.all(np.isnan(lo)) and np.all(np.isnan(hi))


def test_price_fallback_no_longer_returns_a_zero_width_band():
    df = listings([20.0, 22.0, 21.0, 23.5, 24.0, 23.0])
    with patch.object(price_prediction, "load_crops", return_value=df):
        forecast = price_prediction.predict_price("Wheat", 5)["forecast"]
    assert all(row["yhat_lower"] < row["yhat"] < row["yhat_upper"] for row in forecast)
    assert (forecast[-1]["yhat_upper"] - forecast[-1]["yhat_lower"]) > (forecast[0]["yhat_upper"] - forecast[0]["yhat_lower"])


def test_demand_fallback_no_longer_returns_a_zero_width_band():
    series = pd.DataFrame({"ds": pd.date_range("2026-01-01", periods=8), "y": [2, 3, 1, 4, 3, 5, 4, 6]})
    result = demand_forecast._linear_demand_fallback(series, 4, "Wheat")
    assert all(row["yhat_upper"] > row["yhat_lower"] for row in result["forecast"] if row["yhat"] > 0.5)


def test_interval_bounds_are_never_negative():
    series = pd.DataFrame({"ds": pd.date_range("2026-01-01", periods=8), "y": [0, 0, 1, 0, 0, 1, 0, 0]})
    result = demand_forecast._linear_demand_fallback(series, 4, "Wheat")
    assert all(row["yhat_lower"] >= 0 for row in result["forecast"])
