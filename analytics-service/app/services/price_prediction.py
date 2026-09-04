"""
Crop price forecasting — Analytics ML feature.

Uses Prophet as the primary forecasting model for datasets with
sufficient historical observations.

Falls back to a linear trend model when historical data is limited
or Prophet cannot successfully generate a forecast.
"""

import pandas as pd
import numpy as np

from app.services.data_loader import load_crops


def _prepare_series(crop_name: str) -> pd.DataFrame:
    """
    Load crop data and prepare daily average price history
    for forecasting.
    """

    df = load_crops()

    if df.empty:
        return pd.DataFrame()

    # Validate required columns
    required_columns = ["cropName", "currentBid", "createdAt"]

    missing_columns = [
        column for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        return pd.DataFrame()

    # Filter selected crop
    df = df[
        df["cropName"]
        .astype(str)
        .str.lower()
        == crop_name.lower()
    ].copy()

    if df.empty:
        return pd.DataFrame()

    # Ensure correct data types
    df["currentBid"] = pd.to_numeric(
        df["currentBid"],
        errors="coerce"
    )

    df["createdAt"] = pd.to_datetime(
        df["createdAt"],
        errors="coerce"
    )

    # Remove invalid records
    df = df.dropna(
        subset=["cropName", "currentBid", "createdAt"]
    )

    if df.empty:
        return pd.DataFrame()

    # Prices cannot be negative
    df = df[df["currentBid"] >= 0]

    if df.empty:
        return pd.DataFrame()

    # Create daily average price series
    df["date"] = df["createdAt"].dt.normalize()

    daily = (
        df.groupby("date")
        .agg(
            y=("currentBid", "mean")
        )
        .reset_index()
        .rename(columns={"date": "ds"})
    )

    daily["ds"] = pd.to_datetime(daily["ds"])

    return daily.sort_values("ds").reset_index(drop=True)


def predict_price(
    crop_name: str,
    days_ahead: int = 14
) -> dict:
    """
    Forecast crop prices for the specified number of future days.
    """

    # Validate forecast horizon
    if days_ahead < 1:
        return {
            "error": "days_ahead must be at least 1."
        }

    if days_ahead > 90:
        return {
            "error": "days_ahead cannot exceed 90 days."
        }

    series = _prepare_series(crop_name)

    if series.empty:
        return {
            "error": (
                f"No valid price history found "
                f"for crop '{crop_name}'."
            )
        }

    # Use linear fallback for small datasets
    if len(series) < 10:
        return _linear_fallback(
            series,
            days_ahead,
            crop_name
        )

    try:
        from prophet import Prophet

        # Disable seasonalities because sparse marketplace data
        # may not contain enough observations to support them.
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

        result = (
            forecast[
                [
                    "ds",
                    "yhat",
                    "yhat_lower",
                    "yhat_upper"
                ]
            ]
            .tail(days_ahead)
            .copy()
        )

        # Crop prices cannot be negative
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

    except Exception as error:

        # Graceful fallback if Prophet fails
        return _linear_fallback(
            series,
            days_ahead,
            crop_name,
            note=(
                "Prophet model could not generate a forecast. "
                "Linear trend fallback was used."
            )
        )


def _linear_fallback(
    series: pd.DataFrame,
    days_ahead: int,
    crop_name: str,
    note: str = None
) -> dict:
    """
    Linear regression fallback for limited historical data.
    """

    if len(series) < 2:
        return {
            "error": (
                f"Not enough historical data to forecast "
                f"'{crop_name}'. At least 2 data points are required."
            )
        }

    # Numerical representation of time
    x = np.arange(len(series))

    # Historical prices
    y = series["y"].values

    # Fit linear trend
    coefficients = np.polyfit(
        x,
        y,
        deg=1
    )

    trend_model = np.poly1d(coefficients)

    # Generate future points
    future_x = np.arange(
        len(series),
        len(series) + days_ahead
    )

    predictions = trend_model(future_x)

    # Safety floor: prices cannot be negative
    predictions = np.clip(
        predictions,
        0,
        None
    )

    last_date = series["ds"].max()

    future_dates = pd.date_range(
        start=last_date,
        periods=days_ahead + 1,
        freq="D"
    )[1:]

    forecast = []

    for date, prediction in zip(
        future_dates,
        predictions
    ):
        forecast.append({
            "ds": date.strftime("%Y-%m-%d"),
            "yhat": round(float(prediction), 2),

            # Keep response structure consistent
            "yhat_lower": round(
                float(prediction),
                2
            ),

            "yhat_upper": round(
                float(prediction),
                2
            )
        })

    return {
        "cropName": crop_name,
        "model": "Linear Regression Fallback",
        "historyPoints": len(series),
        "forecastDays": days_ahead,
        "forecast": forecast,
        "note": note or (
            "Limited historical data available. "
            "Linear trend forecasting was used."
        )
    }