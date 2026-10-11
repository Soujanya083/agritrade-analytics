import pandas as pd
import numpy as np

from app.services.data_loader import load_transactions, load_crops
from app.utils.ttl_cache import ttl_cache
from app.utils.intervals import ols_prediction_interval

# Same "fit once, slice per request" approach as price_prediction.py.
MAX_FORECAST_DAYS = 90


def _prepare_demand_series(crop_name: str) -> pd.DataFrame:
    """
    Prepare daily demand data.

    Demand is calculated as the number of completed transactions
    for a particular crop per day.
    """

    transactions = load_transactions()
    crops = load_crops()

    if transactions.empty:
        return pd.DataFrame()

    if crops.empty:
        return pd.DataFrame()

    # Keep only the columns needed from crops
    crop_lookup = crops[["_id", "cropName"]].copy()

    # Convert IDs to strings so MongoDB ObjectIds / strings
    # can be matched safely
    crop_lookup["_id"] = crop_lookup["_id"].astype(str)

    transactions["cropId"] = transactions["cropId"].astype(str)

    # Merge transactions with crop names
    df = transactions.merge(
        crop_lookup,
        left_on="cropId",
        right_on="_id",
        how="left"
    )

    # Remove transactions where crop information was not found
    df = df.dropna(subset=["cropName"])

    # Filter the requested crop
    df = df[
        df["cropName"]
        .astype(str)
        .str.lower()
        == crop_name.lower()
    ]

    if df.empty:
        return pd.DataFrame()

    # Convert transaction creation date
    df["createdAt"] = pd.to_datetime(
        df["createdAt"],
        errors="coerce"
    )

    df = df.dropna(subset=["createdAt"])

    # Use only completed transactions if status exists
    if "status" in df.columns:
        completed = df[
            df["status"]
            .astype(str)
            .str.lower()
            .isin([
                "delivery_completed",
                "completed"
            ])
        ]

        # Use completed transactions if available
        if not completed.empty:
            df = completed

    # Extract date
    df["date"] = df["createdAt"].dt.date

    # Count transactions per day = demand
    daily = (
        df.groupby("date")
        .size()
        .reset_index(name="y")
        .rename(columns={"date": "ds"})
    )

    daily["ds"] = pd.to_datetime(daily["ds"])

    return (
        daily
        .sort_values("ds")
        .reset_index(drop=True)
    )


def predict_demand(
    crop_name: str,
    days_ahead: int = 14
) -> dict:
    """
    Predict future crop demand (completed sales per day).

    Primary model: Prophet. Fallback: linear regression when history is
    short. Demand here means COMPLETED TRANSACTIONS per day - not bids.
    """
    if days_ahead < 1:
        return {"error": "days_ahead must be at least 1."}
    if days_ahead > MAX_FORECAST_DAYS:
        return {"error": f"days_ahead cannot exceed {MAX_FORECAST_DAYS} days."}

    full = _demand_full_horizon(crop_name)
    if "error" in full:
        return full

    sliced = {key: value for key, value in full.items() if key != "forecast"}
    sliced["forecastDays"] = days_ahead
    sliced["forecast"] = full["forecast"][:days_ahead]
    return sliced


@ttl_cache(seconds=600)
def _demand_full_horizon(crop_name: str) -> dict:
    """
    Predict future crop demand.

    Primary model:
        Prophet

    Fallback model:
        Linear Regression
    """

    days_ahead = MAX_FORECAST_DAYS

    series = _prepare_demand_series(crop_name)

    if series.empty:
        return {
            "error": (
                f"No transaction history found for "
                f"crop '{crop_name}'"
            )
        }

    # Small datasets use Linear Regression
    if len(series) < 10:
        return _linear_demand_fallback(
            series,
            days_ahead,
            crop_name
        )

    try:
        from prophet import Prophet

        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=False,
            yearly_seasonality=False
        )

        model.fit(series)

        future = model.make_future_dataframe(
            periods=days_ahead
        )

        forecast = model.predict(future)

        result = forecast[
            [
                "ds",
                "yhat",
                "yhat_lower",
                "yhat_upper"
            ]
        ].tail(days_ahead).copy()

        # Demand cannot be negative
        for column in [
            "yhat",
            "yhat_lower",
            "yhat_upper"
        ]:
            result[column] = result[column].clip(lower=0)

        result["ds"] = result["ds"].dt.strftime(
            "%Y-%m-%d"
        )

        return {
            "cropName": crop_name,
            "model": "Prophet",
            "historyPoints": len(series),
            "forecastDays": days_ahead,
            "forecast": (
                result
                .round(2)
                .to_dict(orient="records")
            )
        }

    except Exception:

        # (The raw exception text is deliberately not echoed to the client.)
        return _linear_demand_fallback(
            series,
            days_ahead,
            crop_name,
            note=(
                "Prophet model could not generate a forecast. "
                "Linear trend fallback was used."
            )
        )


def _linear_demand_fallback(
    series: pd.DataFrame,
    days_ahead: int,
    crop_name: str,
    note: str = None
) -> dict:
    """
    Linear Regression fallback for small datasets.
    """

    if len(series) < 2:
        return {
            "error": (
                f"Not enough transaction history to "
                f"forecast demand for '{crop_name}'"
            )
        }

    x = np.arange(len(series))
    y = series["y"].values

    coefficients = np.polyfit(
        x,
        y,
        deg=1
    )

    trend = np.poly1d(coefficients)

    last_date = series["ds"].max()

    future_x = np.arange(
        len(series),
        len(series) + days_ahead
    )

    future_dates = pd.date_range(
        start=last_date,
        periods=days_ahead + 1,
        freq="D"
    )[1:]

    # Proper OLS prediction interval (previously lower == upper == forecast,
    # i.e. a fake claim of certainty).
    predictions, lower, upper = ols_prediction_interval(y, future_x)

    # Demand cannot be negative
    predictions = np.clip(predictions, 0, None)
    lower = np.clip(lower, 0, None)
    upper = np.clip(upper, 0, None)

    forecast = []

    for date, prediction, low, high in zip(future_dates, predictions, lower, upper):
        forecast.append({
            "ds": date.strftime("%Y-%m-%d"),
            "yhat": round(float(prediction), 2),
            "yhat_lower": round(float(prediction if np.isnan(low) else low), 2),
            "yhat_upper": round(float(prediction if np.isnan(high) else high), 2),
        })

    return {
        "cropName": crop_name,
        "model": "Linear Regression Fallback",
        "historyPoints": len(series),
        "forecastDays": days_ahead,
        "forecast": forecast,
        "note": note or (
            "Limited transaction history available. "
            "Linear trend fallback was used."
        )
    }