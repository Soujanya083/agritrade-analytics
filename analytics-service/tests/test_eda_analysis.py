"""
test_eda_analysis.py - unit tests for the seasonal pattern and
correlation analysis added to the EDA report. Pure pandas logic,
tested with small in-memory DataFrames - no database needed.

Run with: pytest tests/test_eda_analysis.py -v
"""
import pandas as pd
from datetime import datetime, timedelta

from app.services.eda_analysis import _seasonal_price_pattern, _correlation_analysis


def test_seasonal_pattern_empty_when_columns_missing():
    df = pd.DataFrame({"cropName": ["Wheat"]})
    assert _seasonal_price_pattern(df) == {}


def test_seasonal_pattern_groups_by_day_and_month():
    base = datetime(2026, 1, 5)  # a Monday
    df = pd.DataFrame({
        "currentBid": [10, 20, 30],
        "createdAt": [base, base + timedelta(days=7), base + timedelta(days=14)],
    })
    result = _seasonal_price_pattern(df)
    assert "averagePriceByDayOfWeek" in result
    assert "averagePriceByMonth" in result
    # All three dates are Mondays in January
    assert result["averagePriceByDayOfWeek"]["Monday"] == 20.0
    assert result["averagePriceByMonth"]["January"] == 20.0


def test_correlation_analysis_empty_with_single_numeric_column():
    df = pd.DataFrame({"basePrice": [10, 20, 30]})
    assert _correlation_analysis(df) == {}


def test_correlation_analysis_detects_perfect_positive_correlation():
    df = pd.DataFrame({
        "basePrice": [10, 20, 30, 40],
        "currentBid": [12, 22, 32, 42],  # perfectly correlated, offset by 2
    })
    result = _correlation_analysis(df)
    pairs = {(p["fieldA"], p["fieldB"]): p["correlation"] for p in result["pairwiseCorrelations"]}
    assert pairs[("basePrice", "currentBid")] == 1.0