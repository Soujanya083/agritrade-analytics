"""
Model evaluation / backtesting.

Historically this module hid the last `test_days` observations,
fit one linear-regression line on everything before that, and
scored it once. That's a single lucky-or-unlucky split - it can't
tell you whether a model is actually reliable, and it gives no
sense of how a "model" compares to doing nothing clever at all.

This version uses walk-forward (rolling-origin) validation instead:
the training window slides forward through history, producing
several train/test folds, and each fold scores the candidates -
a Naive baseline, Linear Regression, and (for price) Prophet - so
average performance across folds can be compared honestly, and a
model is only worth using if it beats the Naive baseline.

When there isn't enough history for multiple folds, backtest_*
falls back to the old single-split behaviour so small datasets
still return a result instead of an error.
"""

import pandas as pd
import numpy as np

from app.services.price_prediction import _prepare_series
from app.services.demand_forecast import _prepare_demand_series


# ---------------------------------------------------------------------------
# Error metrics - small standalone functions so they're unit-testable
# without a database or Prophet.
# ---------------------------------------------------------------------------

def _mae(actual, predicted):
    actual = np.array(actual, dtype=float)
    predicted = np.array(predicted, dtype=float)
    return float(np.mean(np.abs(actual - predicted)))


def _rmse(actual, predicted):
    actual = np.array(actual, dtype=float)
    predicted = np.array(predicted, dtype=float)
    return float(np.sqrt(np.mean((actual - predicted) ** 2)))


def _mape(actual, predicted):
    actual = np.array(actual, dtype=float)
    predicted = np.array(predicted, dtype=float)
    non_zero = actual != 0
    if not np.any(non_zero):
        return 0.0
    return float(
        np.mean(
            np.abs((actual[non_zero] - predicted[non_zero]) / actual[non_zero])
        ) * 100
    )


def _smape(actual, predicted):
    """
    Symmetric MAPE. Plain MAPE blows up (or divides by zero) when actual
    values are near zero, which happens often with demand counts. sMAPE
    is bounded (0-200%) and stays stable in that case.
    """
    actual = np.array(actual, dtype=float)
    predicted = np.array(predicted, dtype=float)
    denom = np.abs(actual) + np.abs(predicted)
    non_zero = denom != 0
    if not np.any(non_zero):
        return 0.0
    return float(
        np.mean(
            2 * np.abs(actual[non_zero] - predicted[non_zero]) / denom[non_zero]
        ) * 100
    )


def _calculate_metrics(actual, predicted):
    return {
        "MAE": round(_mae(actual, predicted), 4),
        "RMSE": round(_rmse(actual, predicted), 4),
        "MAPE": round(_mape(actual, predicted), 2),
        "sMAPE": round(_smape(actual, predicted), 2),
    }


# ---------------------------------------------------------------------------
# Candidate models. Each takes the training window and a horizon and
# returns an array of predictions - same shape, so a fold can loop over
# them uniformly.
# ---------------------------------------------------------------------------

def _naive_forecast(train_y, horizon: int):
    """
    Baseline: tomorrow's value = today's value, repeated across the
    horizon. Any model that can't beat this on average isn't earning
    its extra complexity - this is the bar every other model has to
    clear.
    """
    last_value = float(train_y[-1])
    return np.full(horizon, last_value)


def _linear_forecast(train_y, horizon: int):
    x_train = np.arange(len(train_y))
    coefficients = np.polyfit(x_train, train_y, deg=1)
    trend = np.poly1d(coefficients)
    x_future = np.arange(len(train_y), len(train_y) + horizon)
    predictions = trend(x_future)
    return np.clip(predictions, 0, None)


def _prophet_forecast(train_ds, train_y, horizon: int):
    """
    Fits Prophet on a single fold's training window only. Returns None
    on any failure (too little data, Prophet not installed, etc.) so a
    fold can just skip Prophet rather than aborting the whole backtest.
    """
    try:
        from prophet import Prophet

        fold_df = pd.DataFrame({
            "ds": pd.Series(train_ds).reset_index(drop=True),
            "y": pd.Series(train_y).reset_index(drop=True),
        })

        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=False,
            yearly_seasonality=False,
        )
        model.fit(fold_df)

        future = model.make_future_dataframe(periods=horizon)
        forecast = model.predict(future)

        predictions = forecast["yhat"].tail(horizon).values
        return np.clip(predictions, 0, None)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Walk-forward (rolling-origin) validation
# ---------------------------------------------------------------------------

def _walk_forward_fold_bounds(series_len: int, min_train_size: int, horizon: int, step: int):
    """
    Yields (train_end, test_end) index pairs. Each fold trains on
    everything up to train_end and tests on the next `horizon` points.
    """
    folds = []
    train_end = min_train_size
    while train_end + horizon <= series_len:
        folds.append((train_end, train_end + horizon))
        train_end += step
    return folds


def _average_metrics(fold_metric_list):
    valid = [m for m in fold_metric_list if m is not None]
    if not valid:
        return None
    return {
        key: round(float(np.mean([m[key] for m in valid])), 4)
        for key in ["MAE", "RMSE", "MAPE", "sMAPE"]
    }


def _run_walk_forward(series: pd.DataFrame, horizon: int):
    """
    Rolling-origin validation comparing Naive, Linear Regression, and
    Prophet across multiple folds. Returns None if there isn't enough
    history for at least one fold, so callers can fall back to a
    single split.
    """

    n = len(series)
    min_train_size = max(10, horizon * 2)
    step = max(1, horizon // 2)

    fold_bounds = _walk_forward_fold_bounds(n, min_train_size, horizon, step)

    if not fold_bounds:
        return None

    y = series["y"].astype(float).values
    ds = series["ds"]

    per_model_metrics = {"Naive": [], "Linear Regression": [], "Prophet": []}
    fold_details = []

    for fold_index, (train_end, test_end) in enumerate(fold_bounds, start=1):
        train_y = y[:train_end]
        train_ds = ds[:train_end]
        test_y = y[train_end:test_end]

        per_model_metrics["Naive"].append(
            _calculate_metrics(test_y, _naive_forecast(train_y, horizon))
        )
        per_model_metrics["Linear Regression"].append(
            _calculate_metrics(test_y, _linear_forecast(train_y, horizon))
        )

        prophet_pred = _prophet_forecast(train_ds, train_y, horizon)
        if prophet_pred is not None and len(prophet_pred) == horizon:
            per_model_metrics["Prophet"].append(_calculate_metrics(test_y, prophet_pred))
        else:
            per_model_metrics["Prophet"].append(None)

        fold_details.append({
            "fold": fold_index,
            "trainingPoints": int(train_end),
            "testStart": ds.iloc[train_end].strftime("%Y-%m-%d"),
            "testEnd": ds.iloc[test_end - 1].strftime("%Y-%m-%d"),
        })

    model_comparison = {
        name: _average_metrics(metrics) for name, metrics in per_model_metrics.items()
    }

    usable_models = {name: m for name, m in model_comparison.items() if m is not None}

    best_model = None
    beats_naive = None
    if usable_models:
        best_model = min(usable_models, key=lambda name: usable_models[name]["RMSE"])
        if best_model != "Naive" and usable_models.get("Naive"):
            beats_naive = usable_models[best_model]["RMSE"] < usable_models["Naive"]["RMSE"]

    return {
        "validationMethod": "walk-forward",
        "folds": len(fold_bounds),
        "horizon": horizon,
        "modelComparison": model_comparison,
        "bestModel": best_model,
        "bestModelBeatsNaiveBaseline": beats_naive,
        "foldDetails": fold_details,
    }


def _single_split_backtest(series: pd.DataFrame, test_days: int, crop_name: str, label: str):
    """
    Fallback for datasets too small for multiple walk-forward folds.
    Mirrors the old one-shot train/test split so small datasets still
    return a usable result instead of an error.
    """

    if len(series) <= test_days + 2:
        return {
            "error": (
                f"Not enough historical data for backtesting '{crop_name}'. "
                f"Need more than {test_days + 2} points."
            ),
            "historyPoints": len(series),
        }

    train = series.iloc[:-test_days].copy()
    test = series.iloc[-test_days:].copy()

    train_y = train["y"].astype(float).values
    test_y = test["y"].astype(float).values

    naive_pred = _naive_forecast(train_y, test_days)
    linear_pred = _linear_forecast(train_y, test_days)

    if label == "demand":
        naive_pred = np.clip(naive_pred, 0, None)

    results = []
    for date, actual, predicted in zip(test["ds"], test_y, linear_pred):
        results.append({
            "date": date.strftime("%Y-%m-%d"),
            "actual": round(float(actual), 2),
            "predicted": round(float(predicted), 2),
            "absoluteError": round(abs(float(actual) - float(predicted)), 2),
        })

    return {
        "cropName": crop_name,
        "validationMethod": "single-split",
        "note": (
            "Not enough history for walk-forward validation with multiple "
            "folds; used a single train/test split instead."
        ),
        "historyPoints": len(series),
        "trainingPoints": len(train),
        "testingPoints": len(test),
        "modelComparison": {
            "Naive": _calculate_metrics(test_y, naive_pred),
            "Linear Regression": _calculate_metrics(test_y, linear_pred),
        },
        "results": results,
    }


def backtest_price_model(crop_name: str, test_days: int = 7) -> dict:
    """
    Backtest crop price prediction using walk-forward validation,
    comparing Naive, Linear Regression, and Prophet.
    """

    series = _prepare_series(crop_name)

    if series.empty:
        return {"error": f"No price history found for crop '{crop_name}'"}

    walk_forward = _run_walk_forward(series, horizon=test_days)

    if walk_forward is None:
        return _single_split_backtest(series, test_days, crop_name, label="price")

    return {
        "cropName": crop_name,
        "historyPoints": len(series),
        **walk_forward,
    }


def backtest_demand_model(crop_name: str, test_days: int = 7) -> dict:
    """
    Backtest crop demand forecasting using walk-forward validation,
    comparing Naive and Linear Regression. (Demand series tend to be
    short and sparse, so Prophet is skipped here for this endpoint -
    it fell back to linear too often to be a meaningful comparison.)
    """

    series = _prepare_demand_series(crop_name)

    if series.empty:
        return {"error": f"No demand history found for crop '{crop_name}'"}

    n = len(series)
    horizon = test_days
    min_train_size = max(10, horizon * 2)
    step = max(1, horizon // 2)

    fold_bounds = _walk_forward_fold_bounds(n, min_train_size, horizon, step)

    if not fold_bounds:
        return _single_split_backtest(series, test_days, crop_name, label="demand")

    y = series["y"].astype(float).values
    ds = series["ds"]

    per_model_metrics = {"Naive": [], "Linear Regression": []}
    fold_details = []

    for fold_index, (train_end, test_end) in enumerate(fold_bounds, start=1):
        train_y = y[:train_end]
        test_y = y[train_end:test_end]

        naive_pred = np.clip(_naive_forecast(train_y, horizon), 0, None)
        linear_pred = np.clip(_linear_forecast(train_y, horizon), 0, None)

        per_model_metrics["Naive"].append(_calculate_metrics(test_y, naive_pred))
        per_model_metrics["Linear Regression"].append(_calculate_metrics(test_y, linear_pred))

        fold_details.append({
            "fold": fold_index,
            "trainingPoints": int(train_end),
            "testStart": ds.iloc[train_end].strftime("%Y-%m-%d"),
            "testEnd": ds.iloc[test_end - 1].strftime("%Y-%m-%d"),
        })

    model_comparison = {
        name: _average_metrics(metrics) for name, metrics in per_model_metrics.items()
    }

    best_model = None
    beats_naive = None
    if model_comparison.get("Naive") and model_comparison.get("Linear Regression"):
        best_model = min(
            model_comparison, key=lambda name: model_comparison[name]["RMSE"]
        )
        beats_naive = (
            best_model != "Naive"
            and model_comparison[best_model]["RMSE"] < model_comparison["Naive"]["RMSE"]
        )

    return {
        "cropName": crop_name,
        "historyPoints": len(series),
        "validationMethod": "walk-forward",
        "folds": len(fold_bounds),
        "horizon": horizon,
        "modelComparison": model_comparison,
        "bestModel": best_model,
        "bestModelBeatsNaiveBaseline": beats_naive,
        "foldDetails": fold_details,
    }