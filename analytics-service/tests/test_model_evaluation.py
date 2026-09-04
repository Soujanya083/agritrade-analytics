"""
test_model_evaluation.py - unit tests for the error metrics and
walk-forward validation logic used in backtesting. Metrics and the
Naive/Linear forecasters are pure math, so they're tested directly
with known inputs/expected outputs - no database or Prophet needed.

Run with: pytest tests/test_model_evaluation.py -v
"""
import math
import numpy as np

from app.services.model_evaluation import (
    _mae,
    _rmse,
    _mape,
    _smape,
    _naive_forecast,
    _linear_forecast,
    _walk_forward_fold_bounds,
    _average_metrics,
)


# ---------------------------------------------------------------------------
# Error metrics
# ---------------------------------------------------------------------------

def test_mae_perfect_prediction_is_zero():
    actual = [10, 20, 30]
    predicted = [10, 20, 30]
    assert _mae(actual, predicted) == 0.0


def test_mae_known_value():
    actual = [10, 20, 30]
    predicted = [12, 18, 33]
    assert math.isclose(_mae(actual, predicted), 2.333, abs_tol=0.01)


def test_mae_ignores_direction_of_error():
    over = _mae([10], [15])
    under = _mae([10], [5])
    assert over == under == 5.0


def test_rmse_perfect_prediction_is_zero():
    actual = [5, 10, 15]
    predicted = [5, 10, 15]
    assert _rmse(actual, predicted) == 0.0


def test_rmse_penalizes_large_errors_more_than_mae():
    actual = [10, 10, 10, 10]
    predicted_small_errors = [11, 9, 11, 9]
    predicted_one_big_error = [10, 10, 10, 20]

    mae_small = _mae(actual, predicted_small_errors)
    rmse_small = _rmse(actual, predicted_small_errors)
    mae_big = _mae(actual, predicted_one_big_error)
    rmse_big = _rmse(actual, predicted_one_big_error)

    assert math.isclose(rmse_small, mae_small, abs_tol=0.1)
    assert rmse_big > mae_big


def test_mape_perfect_prediction_is_zero():
    assert _mape([10, 20], [10, 20]) == 0.0


def test_mape_handles_all_zero_actuals_without_crashing():
    # Would divide by zero with a naive implementation.
    assert _mape([0, 0], [5, 5]) == 0.0


def test_smape_perfect_prediction_is_zero():
    assert _smape([10, 20], [10, 20]) == 0.0


def test_smape_stays_bounded_near_zero_actuals():
    # This is exactly the case plain MAPE handles badly - sMAPE should
    # still return a finite, bounded value instead of exploding.
    result = _smape([0.01, 0.02], [5, 5])
    assert 0 <= result <= 200


# ---------------------------------------------------------------------------
# Candidate forecasters
# ---------------------------------------------------------------------------

def test_naive_forecast_repeats_last_value():
    train_y = np.array([10, 12, 14, 16])
    forecast = _naive_forecast(train_y, horizon=3)
    assert list(forecast) == [16, 16, 16]


def test_linear_forecast_continues_trend():
    # Perfect linear trend: y = 2x
    train_y = np.array([0, 2, 4, 6, 8])
    forecast = _linear_forecast(train_y, horizon=2)
    assert math.isclose(forecast[0], 10, abs_tol=0.5)
    assert math.isclose(forecast[1], 12, abs_tol=0.5)


def test_linear_forecast_never_negative():
    train_y = np.array([5, 3, 1])  # sharp downward trend
    forecast = _linear_forecast(train_y, horizon=5)
    assert all(value >= 0 for value in forecast)


# ---------------------------------------------------------------------------
# Walk-forward fold construction
# ---------------------------------------------------------------------------

def test_walk_forward_fold_bounds_produces_multiple_folds_with_enough_data():
    # 60 points, min_train_size 20, horizon 7, step 3
    folds = _walk_forward_fold_bounds(
        series_len=60, min_train_size=20, horizon=7, step=3
    )
    assert len(folds) > 1
    # Every fold's test window fits inside the series
    for train_end, test_end in folds:
        assert test_end <= 60
        assert test_end - train_end == 7


def test_walk_forward_fold_bounds_empty_when_too_little_data():
    folds = _walk_forward_fold_bounds(
        series_len=10, min_train_size=20, horizon=7, step=3
    )
    assert folds == []


def test_average_metrics_ignores_none_folds():
    fold_metrics = [
        {"MAE": 1.0, "RMSE": 1.0, "MAPE": 1.0, "sMAPE": 1.0},
        None,  # e.g. Prophet failed on this fold
        {"MAE": 3.0, "RMSE": 3.0, "MAPE": 3.0, "sMAPE": 3.0},
    ]
    averaged = _average_metrics(fold_metrics)
    assert averaged["MAE"] == 2.0


def test_average_metrics_returns_none_when_all_folds_failed():
    assert _average_metrics([None, None]) is None