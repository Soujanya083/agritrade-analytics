import numpy as np
import pandas as pd

from app.services.price_prediction import _prepare_series as _prepare_price_series
from app.services.demand_forecast import _prepare_demand_series


def _mae(actual, predicted):
    return float(np.mean(np.abs(np.array(actual) - np.array(predicted))))


def _rmse(actual, predicted):
    return float(
        np.sqrt(np.mean((np.array(actual) - np.array(predicted)) ** 2))
    )


def _fit_prophet(series: pd.DataFrame, steps: int):
    try:
        from prophet import Prophet

        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=False,
            yearly_seasonality=False
        )

        model.fit(series)
        future = model.make_future_dataframe(periods=steps)
        forecast = model.predict(future)

        return forecast["yhat"].tail(steps).clip(lower=0).tolist()

    except Exception:
        return None


def _fit_linear(series: pd.DataFrame, steps: int):
    try:
        x = np.arange(len(series))
        y = series["y"].values

        coeffs = np.polyfit(x, y, deg=1)
        trend = np.poly1d(coeffs)

        future_x = np.arange(len(series), len(series) + steps)
        preds = np.clip(trend(future_x), 0, None)

        return preds.tolist()

    except Exception:
        return None


def _fit_arima(series: pd.DataFrame, steps: int):
    try:
        from statsmodels.tsa.arima.model import ARIMA

        y = series["y"].astype(float)

        if len(y) < 8:
            return None

        model = ARIMA(y, order=(1, 1, 1))
        fitted_model = model.fit()

        forecast = fitted_model.forecast(steps=steps)
        preds = np.clip(np.asarray(forecast, dtype=float), 0, None)

        return preds.tolist()

    except Exception:
        return None


def backtest_price_model(crop_name: str, test_days: int = 7) -> dict:
    series = _prepare_price_series(crop_name)

    return _run_backtest(
        series,
        crop_name,
        test_days,
        metric_label="price"
    )


def backtest_demand_model(crop_name: str, test_days: int = 7) -> dict:
    series = _prepare_demand_series(crop_name)

    return _run_backtest(
        series,
        crop_name,
        test_days,
        metric_label="demand"
    )


def _run_backtest(
    series: pd.DataFrame,
    crop_name: str,
    test_days: int,
    metric_label: str
) -> dict:

    if series.empty or len(series) < test_days + 8:
        return {
            "error": (
                f"Not enough history to backtest '{crop_name}' "
                f"(need at least {test_days + 8} points, have {len(series)})."
            )
        }

    train = series.iloc[:-test_days].reset_index(drop=True)
    holdout = series.iloc[-test_days:].reset_index(drop=True)

    actual_values = holdout["y"].tolist()

    models = {
        "prophet": _fit_prophet,
        "linear_baseline": _fit_linear,
        "arima": _fit_arima
    }

    results = {}

    for model_name, model_function in models.items():
        preds = model_function(train, test_days)

        if preds is None or len(preds) != len(actual_values):
            results[model_name] = {
                "error": "Model failed to fit on this data."
            }
            continue

        results[model_name] = {
            "mae": round(_mae(actual_values, preds), 3),
            "rmse": round(_rmse(actual_values, preds), 3),
            "predicted": [round(float(p), 2) for p in preds],
            "actual": [round(float(a), 2) for a in actual_values]
        }

    successful_models = {
        name: result
        for name, result in results.items()
        if "mae" in result
    }

    best_model = None

    if successful_models:
        best_model = min(
            successful_models,
            key=lambda name: successful_models[name]["mae"]
        )

    return {
        "cropName": crop_name,
        "metric": metric_label,
        "testDays": test_days,
        "trainingPoints": len(train),
        "comparison": results,
        "bestModelByMAE": best_model
    }