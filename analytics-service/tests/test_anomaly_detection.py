"""
test_anomaly_detection.py - unit tests for the Z-score and IQR
statistical anomaly detectors, and the multi-method confidence
labeling. Pure pandas/statistics logic, tested with small in-memory
Series - no database or Isolation Forest fit needed.

Run with: pytest tests/test_anomaly_detection.py -v
"""
import pandas as pd

from app.services.anomaly_detection import (
    _zscore_anomalies,
    _iqr_anomalies,
    _confidence_label,
    _find_bid_column,
)


def test_zscore_flags_clear_outlier():
    # 19 normal values plus 1 extreme outlier. With too few points, a
    # single huge outlier inflates the mean/std enough to mask its own
    # z-score (a known z-score limitation) - this sample size is large
    # enough that it doesn't.
    values = pd.Series([100] * 19 + [5000])
    flags = _zscore_anomalies(values, threshold=3.0)
    assert flags.iloc[-1] == True
    assert not flags.iloc[:-1].any()


def test_zscore_no_flags_for_uniform_data():
    values = pd.Series([100, 100, 100, 100])
    flags = _zscore_anomalies(values)
    assert not flags.any()


def test_iqr_flags_clear_outlier():
    values = pd.Series([10, 12, 11, 13, 10, 500])
    flags = _iqr_anomalies(values)
    assert flags.iloc[-1] == True
    assert not flags.iloc[:-1].any()


def test_iqr_no_flags_for_zero_iqr():
    # All values identical -> IQR is 0 -> should not crash or flag everything
    values = pd.Series([50, 50, 50, 50])
    flags = _iqr_anomalies(values)
    assert not flags.any()


def test_confidence_label_thresholds():
    assert _confidence_label(3) == "high"
    assert _confidence_label(2) == "medium"
    assert _confidence_label(1) == "low"
    assert _confidence_label(0) == "none"


def test_find_bid_column_prefers_first_match():
    df = pd.DataFrame({"amount": [1, 2], "price": [3, 4]})
    assert _find_bid_column(df) == "amount"


def test_find_bid_column_returns_none_when_missing():
    df = pd.DataFrame({"somethingElse": [1, 2]})
    assert _find_bid_column(df) is None