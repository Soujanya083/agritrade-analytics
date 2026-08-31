"""
test_model_evaluation.py - unit tests for the MAE/RMSE error metrics
used in your backtesting. These are pure math functions, so they're
tested directly with known inputs/expected outputs - no database or
Prophet model needed.

Run with: pytest tests/test_model_evaluation.py -v
"""
import math
from app.services.model_evaluation import _mae, _rmse


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