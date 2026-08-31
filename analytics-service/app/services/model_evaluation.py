"""
Model evaluation / backtesting — proves your forecasts are actually
accurate instead of just producing numbers nobody has verified.

Approach: simple holdout backtest.
  1. Take the full price (or demand) history for a crop.
  2. Hold out the LAST `test_days` points as "ground truth".
  3. Re-fit the model using only the data BEFORE the holdout.
  4. Forecast forward exactly `test_days` steps.
  5. Compare forecast vs. the real held-out values using MAE and RMSE.

This is the standard way to validate a time-series model, and it's
exactly the kind of number your 5 base papers report for their own
models — so this endpoint gives you a direct, defensible comparison
point for your literature survey table.
"""
import numpy as np
import pandas as pd
from app.services.price_prediction import _prepare_series as _prepare_price_series
from app.services.demand_forecast import _prepare_demand_series


def _mae(actual, predicted):
    return float(np.mean(np.abs(np.array(actual) - np.array(predicted))))


def _rmse(actual, predicted):
    return float(np.sqrt(np.mean((np.array(actual) - np.array(predicted)) ** 2)))


def _fit_and_forecast(series: pd.DataFrame, steps: int, use_prophet: bool):
    """Fits a model on `series` and forecasts `steps` days ahead.
    Returns a list of predicted values, or None if fitting fails."""
    if use_prophet:
        try:
            from prophet import Prophet
            model = Prophet(daily_seasonality=False, weekly_seasonality=False, yearly_seasonality=False)
            model.fit(series)
            future = model.make_future_dataframe(periods=steps)
            forecast = model.predict(future)
            preds = forecast["yhat"].tail(steps).clip(lower=0).values
            return preds.tolist()
        except Exception:
            return None
    else:
        # linear regression baseline
        x = np.arange(len(series))
        y = series["y"].values
        coeffs = np.polyfit(x, y, deg=1)
        trend = np.poly1d(coeffs)
        future_x = np.arange(len(series), len(series) + steps)
        preds = np.clip(trend(future_x), 0, None)
        return preds.tolist()


def backtest_price_model(crop_name: str, test_days: int = 7) -> dict:
    series = _prepare_price_series(crop_name)
    return _run_backtest(series, crop_name, test_days, metric_label="price")


def backtest_demand_model(crop_name: str, test_days: int = 7) -> dict:
    series = _prepare_demand_series(crop_name)
    return _run_backtest(series, crop_name, test_days, metric_label="demand")


def _run_backtest(series: pd.DataFrame, crop_name: str, test_days: int, metric_label: str) -> dict:
    if series.empty or len(series) < test_days + 5:
        return {
            "error": (
                f"Not enough history to backtest '{crop_name}' "
                f"(need at least {test_days + 5} points, have {len(series)})."
            )
        }

    train = series.iloc[:-test_days].reset_index(drop=True)
    holdout = series.iloc[-test_days:].reset_index(drop=True)
    actual_values = holdout["y"].tolist()

    results = {}
    for model_name, use_prophet in [("prophet", True), ("linear_baseline", False)]:
        preds = _fit_and_forecast(train, test_days, use_prophet)
        if preds is None or len(preds) != len(actual_values):
            results[model_name] = {"error": "Model failed to fit on this data."}
            continue
        results[model_name] = {
            "mae": round(_mae(actual_values, preds), 3),
            "rmse": round(_rmse(actual_values, preds), 3),
            "predicted": [round(p, 2) for p in preds],
            "actual": [round(a, 2) for a in actual_values],
        }

    return {
        "cropName": crop_name,
        "metric": metric_label,
        "testDays": test_days,
        "trainingPoints": len(train),
        "comparison": results,
    }