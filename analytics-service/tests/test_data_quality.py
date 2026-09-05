"""
test_data_quality.py - unit tests for invalid-value detection and
completeness scoring. Pure pandas logic, tested with small in-memory
DataFrames - no database needed.

Run with: pytest tests/test_data_quality.py -v
"""
import pandas as pd
from datetime import datetime, timedelta, timezone

from app.services.data_quality import _detect_invalid_values, _profile_dataframe


def test_detects_negative_price_in_crops():
    df = pd.DataFrame({
        "basePrice": [10, -5, 20],
        "currentBid": [12, 8, 22],
        "quantityKg": [1, 2, 3],
        "createdAt": [datetime.now(timezone.utc)] * 3,
        "harvestedDate": [datetime.now(timezone.utc)] * 3,
    })
    issues = _detect_invalid_values(df, "crops")
    assert issues.get("basePrice_negative") == 1


def test_detects_future_dated_record():
    future = datetime.now(timezone.utc) + timedelta(days=30)
    df = pd.DataFrame({
        "basePrice": [10, 20],
        "currentBid": [12, 22],
        "quantityKg": [1, 2],
        "createdAt": [datetime.now(timezone.utc), future],
        "harvestedDate": [datetime.now(timezone.utc)] * 2,
    })
    issues = _detect_invalid_values(df, "crops")
    assert issues.get("createdAt_future_date") == 1


def test_no_issues_flagged_for_clean_data():
    df = pd.DataFrame({
        "basePrice": [10, 20],
        "currentBid": [12, 22],
        "quantityKg": [1, 2],
        "createdAt": [datetime.now(timezone.utc)] * 2,
        "harvestedDate": [datetime.now(timezone.utc)] * 2,
    })
    issues = _detect_invalid_values(df, "crops")
    assert issues == {}


def test_profile_dataframe_completeness_percentage():
    df = pd.DataFrame({
        "a": [1, 2, None, 4],
        "b": [1, 2, 3, 4],
    })
    profile = _profile_dataframe(df, "crops")
    # 1 missing cell out of 8 total cells -> 87.5% complete
    assert profile["completenessPercentage"] == 87.5


def test_profile_dataframe_empty_dataset():
    profile = _profile_dataframe(pd.DataFrame(), "crops")
    assert profile["status"] == "empty"
    assert profile["completenessPercentage"] == 0.0