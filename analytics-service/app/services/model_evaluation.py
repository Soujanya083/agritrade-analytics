import pandas as pd
import numpy as np

from app.services.price_prediction import _prepare_series
from app.services.demand_forecast import _prepare_demand_series


def _calculate_metrics(actual, predicted):
    """
    Calculate common regression evaluation metrics.
    """

    actual = np.array(actual, dtype=float)
    predicted = np.array(predicted, dtype=float)

    mae = np.mean(np.abs(actual - predicted))

    rmse = np.sqrt(
        np.mean((actual - predicted) ** 2)
    )

    # Avoid division by zero for MAPE
    non_zero = actual != 0

    if np.any(non_zero):
        mape = np.mean(
            np.abs(
                (actual[non_zero] - predicted[non_zero])
                / actual[non_zero]
            )
        ) * 100
    else:
        mape = 0

    return {
        "MAE": round(float(mae), 4),
        "RMSE": round(float(rmse), 4),
        "MAPE": round(float(mape), 2)
    }


def backtest_price_model(
    crop_name: str,
    test_days: int = 7
) -> dict:
    """
    Backtest crop price prediction.

    The latest `test_days` historical observations are
    hidden from the model and used as test data.
    """

    series = _prepare_series(crop_name)

    if series.empty:
        return {
            "error": (
                f"No price history found for "
                f"crop '{crop_name}'"
            )
        }

    # Need enough points for train + test
    if len(series) <= test_days + 2:
        return {
            "error": (
                f"Not enough historical data for backtesting "
                f"'{crop_name}'. "
                f"Need more than {test_days + 2} points."
            ),
            "historyPoints": len(series)
        }

    train = series.iloc[:-test_days].copy()
    test = series.iloc[-test_days:].copy()

    x_train = np.arange(len(train))
    y_train = train["y"].values

    # Linear regression used for consistent backtesting
    coefficients = np.polyfit(
        x_train,
        y_train,
        deg=1
    )

    trend = np.poly1d(coefficients)

    x_test = np.arange(
        len(train),
        len(train) + len(test)
    )

    predictions = trend(x_test)

    metrics = _calculate_metrics(
        test["y"].values,
        predictions
    )

    results = []

    for date, actual, predicted in zip(
        test["ds"],
        test["y"],
        predictions
    ):
        results.append({
            "date": date.strftime("%Y-%m-%d"),
            "actual": round(float(actual), 2),
            "predicted": round(float(predicted), 2),
            "absoluteError": round(
                abs(float(actual) - float(predicted)),
                2
            )
        })

    return {
        "cropName": crop_name,
        "model": "Linear Regression Backtest",
        "historyPoints": len(series),
        "trainingPoints": len(train),
        "testingPoints": len(test),
        "metrics": metrics,
        "results": results
    }


def backtest_demand_model(
    crop_name: str,
    test_days: int = 7
) -> dict:
    """
    Backtest crop demand forecasting.
    """

    series = _prepare_demand_series(crop_name)

    if series.empty:
        return {
            "error": (
                f"No demand history found for "
                f"crop '{crop_name}'"
            )
        }

    if len(series) <= test_days + 2:
        return {
            "error": (
                f"Not enough demand history for backtesting "
                f"'{crop_name}'. "
                f"Need more than {test_days + 2} points."
            ),
            "historyPoints": len(series)
        }

    train = series.iloc[:-test_days].copy()
    test = series.iloc[-test_days:].copy()

    x_train = np.arange(len(train))
    y_train = train["y"].values

    coefficients = np.polyfit(
        x_train,
        y_train,
        deg=1
    )

    trend = np.poly1d(coefficients)

    x_test = np.arange(
        len(train),
        len(train) + len(test)
    )

    predictions = trend(x_test)

    # Demand cannot be negative
    predictions = np.clip(
        predictions,
        0,
        None
    )

    metrics = _calculate_metrics(
        test["y"].values,
        predictions
    )

    results = []

    for date, actual, predicted in zip(
        test["ds"],
        test["y"],
        predictions
    ):
        results.append({
            "date": date.strftime("%Y-%m-%d"),
            "actual": round(float(actual), 2),
            "predicted": round(float(predicted), 2),
            "absoluteError": round(
                abs(float(actual) - float(predicted)),
                2
            )
        })

    return {
        "cropName": crop_name,
        "model": "Linear Regression Demand Backtest",
        "historyPoints": len(series),
        "trainingPoints": len(train),
        "testingPoints": len(test),
        "metrics": metrics,
        "results": results
    }