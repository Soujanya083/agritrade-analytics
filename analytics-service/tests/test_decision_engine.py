"""
test_decision_engine.py - unit tests for the sell-now-vs-wait decision
rule and the no-lookahead forecasting/actual-price helpers. Pure
pandas/math logic, tested with small in-memory data - no database
needed.

Run with: pytest tests/test_decision_engine.py -v
"""
import pandas as pd
from datetime import datetime, timedelta

from app.services.decision_engine import (
    _forecast_price_as_of,
    _actual_price_after,
    _recommend_sell_or_wait,
    WAIT_THRESHOLD_PERCENT,
)


def _make_series(prices, start=datetime(2026, 1, 1)):
    return pd.DataFrame({
        "ds": [start + timedelta(days=i) for i in range(len(prices))],
        "y": prices,
    })


def test_forecast_uses_only_data_up_to_as_of_date():
    # Flat at 100 up to day 9, then a huge spike afterwards.
    # If lookahead leaked in, the forecast would be pulled toward the
    # spike; it must not be.
    prices = [100] * 10 + [10000] * 5
    series = _make_series(prices)
    as_of_date = series["ds"].iloc[9]

    forecast = _forecast_price_as_of(series, as_of_date, horizon_days=3)
    assert forecast < 500  # nowhere near the future spike


def test_forecast_none_with_too_little_history():
    series = _make_series([100, 101])
    forecast = _forecast_price_as_of(series, series["ds"].iloc[-1], horizon_days=3)
    assert forecast is None


def test_actual_price_after_finds_real_future_value():
    prices = list(range(100, 120))  # 100..119
    series = _make_series(prices)
    as_of_date = series["ds"].iloc[0]

    actual = _actual_price_after(series, as_of_date, horizon_days=5)
    # Day 5 (0-indexed) has price 105; window averages nearby days too
    assert actual is not None
    assert 100 <= actual <= 112


def test_actual_price_after_none_when_out_of_range():
    series = _make_series([100, 101, 102])
    as_of_date = series["ds"].iloc[0]
    actual = _actual_price_after(series, as_of_date, horizon_days=30)
    assert actual is None


def test_recommend_wait_when_forecast_clears_threshold():
    current_price = 100
    forecasted_price = current_price * (1 + (WAIT_THRESHOLD_PERCENT + 5) / 100)
    recommendation, reason = _recommend_sell_or_wait(current_price, forecasted_price)
    assert recommendation == "Wait"


def test_recommend_sell_now_when_forecast_below_threshold():
    current_price = 100
    forecasted_price = current_price * 1.01  # +1%, below the threshold
    recommendation, reason = _recommend_sell_or_wait(current_price, forecasted_price)
    assert recommendation == "Sell Now"


def test_recommend_sell_now_when_no_forecast_available():
    recommendation, reason = _recommend_sell_or_wait(100, None)
    assert recommendation == "Sell Now"