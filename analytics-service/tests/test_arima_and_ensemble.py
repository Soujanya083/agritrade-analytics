"""
test_arima_and_ensemble.py - closes the two outstanding unit-test items:
  UT-14: ARIMA returns None gracefully on a too-short series
  UT-15: Ensemble only fires with >=2 valid model outputs

_combine_ensemble() (model_evaluation.py) is a pure function - no DB,
no statsmodels needed - so those tests run anywhere. _arima_forecast()
needs the real `statsmodels` package to exercise its success path; if
it isn't installed, every call returns None regardless of series
length (caught by its own except Exception), so
test_arima_returns_none_for_too_short_series will pass either way but
only *proves* the length-check branch when statsmodels is actually
installed (it is, in requirements.txt).
"""
import numpy as np
import app.services.model_evaluation as model_evaluation


# ---------------------------------------------------------------------------
# UT-15: Ensemble combination
# ---------------------------------------------------------------------------

def test_ensemble_returns_none_with_zero_valid_predictions():
    result = model_evaluation._combine_ensemble(None, None, None, None)
    assert result is None


def test_ensemble_returns_none_with_only_one_valid_prediction():
    pred = np.array([10.0, 11.0, 12.0])
    result = model_evaluation._combine_ensemble(pred, None, None, None)
    assert result is None


def test_ensemble_averages_exactly_two_valid_predictions():
    pred_a = np.array([10.0, 20.0, 30.0])
    pred_b = np.array([20.0, 30.0, 40.0])
    result = model_evaluation._combine_ensemble(pred_a, pred_b, None, None)
    np.testing.assert_allclose(result, [15.0, 25.0, 35.0])


def test_ensemble_averages_all_four_valid_predictions():
    preds = [
        np.array([10.0, 10.0]),
        np.array([20.0, 20.0]),
        np.array([30.0, 30.0]),
        np.array([40.0, 40.0]),
    ]
    result = model_evaluation._combine_ensemble(*preds)
    np.testing.assert_allclose(result, [25.0, 25.0])


def test_ensemble_ignores_none_entries_mixed_with_valid_ones():
    pred_a = np.array([100.0])
    pred_b = np.array([200.0])
    result = model_evaluation._combine_ensemble(None, pred_a, None, pred_b)
    np.testing.assert_allclose(result, [150.0])


def test_ensemble_never_uses_a_single_model_alone():
    # Regression guard for the exact bug this test set exists to catch:
    # averaging "one model with itself" (or just passing one model
    # through unchanged) is not an ensemble.
    pred = np.array([42.0, 42.0])
    result = model_evaluation._combine_ensemble(pred, None, None, None)
    assert result is None


# ---------------------------------------------------------------------------
# UT-14: ARIMA graceful failure
# ---------------------------------------------------------------------------

def test_arima_returns_none_for_too_short_series():
    too_short = np.array([1.0, 2.0, 3.0, 4.0, 5.0])  # < 10 points
    result = model_evaluation._arima_forecast(too_short, horizon=3)
    assert result is None


def test_arima_returns_none_rather_than_raising_on_bad_input():
    # Degenerate input (all identical values, can trip up ARIMA fitting)
    # should still fail gracefully, not throw, so a fold can just skip
    # ARIMA rather than aborting the whole backtest.
    constant_series = np.array([5.0] * 20)
    try:
        result = model_evaluation._arima_forecast(constant_series, horizon=3)
        assert result is None or len(result) == 3
    except Exception as e:
        raise AssertionError(f"_arima_forecast raised instead of returning None: {e}")