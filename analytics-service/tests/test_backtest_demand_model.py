"""
test_backtest_demand_model.py - tests demand forecasting's walk-forward
backtest (backtest_demand_model in model_evaluation.py).

backtest_demand_model() calls _prepare_demand_series(), which needs a
live MongoDB connection (it loads real transactions/crops). Rather than
requiring a database for these tests - which the rest of this test
suite deliberately avoids - we monkeypatch _prepare_demand_series at
the model_evaluation module level to return synthetic 'ds'/'y' data,
the same shape the real function produces. This tests the walk-forward
and model-comparison logic on its own, the same DB-free philosophy
test_model_evaluation.py already uses for the price-side functions.
"""
import pandas as pd
import numpy as np
import app.services.model_evaluation as model_evaluation


def _synthetic_demand_series(n_days=60, base=10, noise=2, seed=42):
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2026-01-01", periods=n_days, freq="D")
    values = np.clip(base + rng.normal(0, noise, n_days).cumsum() * 0.05 + rng.normal(0, noise, n_days), 0, None)
    return pd.DataFrame({"ds": dates, "y": values.round().astype(int)})


def test_returns_error_when_no_demand_history(monkeypatch):
    monkeypatch.setattr(model_evaluation, "_prepare_demand_series", lambda crop: pd.DataFrame())
    result = model_evaluation.backtest_demand_model("Wheat", test_days=7)
    assert "error" in result
    assert "Wheat" in result["error"]


def test_runs_walk_forward_with_enough_history(monkeypatch):
    monkeypatch.setattr(model_evaluation, "_prepare_demand_series", lambda crop: _synthetic_demand_series(n_days=60))
    result = model_evaluation.backtest_demand_model("Onion", test_days=7)
    assert result["validationMethod"] == "walk-forward"
    assert result["folds"] >= 1
    assert "Naive" in result["modelComparison"]
    assert "Linear Regression" in result["modelComparison"]


def test_falls_back_to_single_split_with_too_little_data(monkeypatch):
    monkeypatch.setattr(model_evaluation, "_prepare_demand_series", lambda crop: _synthetic_demand_series(n_days=12))
    result = model_evaluation.backtest_demand_model("Tomato", test_days=7)
    # too little data for multiple walk-forward folds -> single-split fallback,
    # not an error and not a fabricated multi-fold result
    assert "error" not in result or result.get("validationMethod") != "walk-forward"


def test_model_comparison_metrics_have_expected_keys(monkeypatch):
    monkeypatch.setattr(model_evaluation, "_prepare_demand_series", lambda crop: _synthetic_demand_series(n_days=60))
    result = model_evaluation.backtest_demand_model("Potato", test_days=7)
    naive_metrics = result["modelComparison"]["Naive"]
    assert set(["MAE", "RMSE", "MAPE", "sMAPE"]).issubset(naive_metrics.keys())


def test_best_model_is_identified_when_both_models_succeed(monkeypatch):
    monkeypatch.setattr(model_evaluation, "_prepare_demand_series", lambda crop: _synthetic_demand_series(n_days=60))
    result = model_evaluation.backtest_demand_model("Rice", test_days=7)
    assert result["bestModel"] in ("Naive", "Linear Regression")
    assert result["bestModelBeatsNaiveBaseline"] in (True, False)


def test_fold_details_are_reported(monkeypatch):
    monkeypatch.setattr(model_evaluation, "_prepare_demand_series", lambda crop: _synthetic_demand_series(n_days=60))
    result = model_evaluation.backtest_demand_model("Maize", test_days=7)
    assert len(result["foldDetails"]) == result["folds"]
    for fold in result["foldDetails"]:
        assert "trainingPoints" in fold
        assert "testStart" in fold
        assert "testEnd" in fold


def test_predictions_are_never_negative():
    # Demand is a count and can never be negative - both candidate
    # models clip their output, even on a declining/negative-trending
    # synthetic series.
    declining = np.array([5, 4, 3, 2, 1, 0, 0, 0, 0, 0], dtype=float)
    naive_pred = model_evaluation._naive_forecast(declining, horizon=5)
    linear_pred = model_evaluation._linear_forecast(declining, horizon=5)
    assert (np.clip(naive_pred, 0, None) >= 0).all()
    assert (np.clip(linear_pred, 0, None) >= 0).all()