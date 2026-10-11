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
from app.utils.ttl_cache import ttl_cache
from app.utils.intervals import ols_prediction_interval

# Longest horizon the API accepts. One forecast of this length is computed
# per crop and every shorter request is a slice of it, so the dashboard
# asking for 1, 7 and 14 days of the same crop costs ONE model fit, not
# three. (Prophet's point forecast `yhat` for day k does not depend on how
# many further days were requested.)
MAX_FORECAST_DAYS = 90


PRICE_BASIS_ASKING = "asking price (basePrice, fixed at listing time: no look-ahead)"
PRICE_BASIS_FALLBACK = "highest bid so far (currentBid: contains later information - asking prices unavailable)"


def _price_column(df: pd.DataFrame) -> str:
    """basePrice when the data has usable asking prices, else currentBid."""
    if "basePrice" in df.columns and pd.to_numeric(df["basePrice"], errors="coerce").gt(0).any():
        return "basePrice"
    return "currentBid"


def price_basis(df: pd.DataFrame) -> str:
    return PRICE_BASIS_ASKING if _price_column(df) == "basePrice" else PRICE_BASIS_FALLBACK


def _prepare_series(crop_name: str) -> pd.DataFrame:
    """
    Load crop data and prepare daily average price history
    for forecasting.
    """

    df = load_crops()

    if df.empty:
        return pd.DataFrame()

    # WHICH price? `currentBid` keeps rising AFTER a listing is created, so the
    # value stored against a listing's creation date contains information from
    # later days (look-ahead): a backtest that trains on it is quietly peeking.
    # The asking price (`basePrice`) is fixed when the listing is created, so a
    # series built from it only contains what was knowable on that day. It is
    # used whenever it exists; `currentBid` is only a fallback for data that
    # has no asking prices.
    price_column = _price_column(df)

    # Validate required columns
    required_columns = ["cropName", price_column, "createdAt"]

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
    df[price_column] = pd.to_numeric(
        df[price_column],
        errors="coerce"
    )

    df["createdAt"] = pd.to_datetime(
        df["createdAt"],
        errors="coerce"
    )

    # Remove invalid records
    df = df.dropna(
        subset=["cropName", price_column, "createdAt"]
    )

    if df.empty:
        return pd.DataFrame()

    # Prices cannot be negative
    df = df[df[price_column] >= 0]

    if df.empty:
        return pd.DataFrame()

    # Create daily average price series
    df["date"] = df["createdAt"].dt.normalize()

    daily = (
        df.groupby("date")
        .agg(
            y=(price_column, "mean")
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

    if days_ahead > MAX_FORECAST_DAYS:
        return {
            "error": f"days_ahead cannot exceed {MAX_FORECAST_DAYS} days."
        }

    full = _forecast_full_horizon(crop_name)

    if "error" in full:
        return full

    sliced = {key: value for key, value in full.items() if key != "forecast"}
    sliced["forecastDays"] = days_ahead
    sliced["forecast"] = full["forecast"][:days_ahead]
    return sliced


@ttl_cache(seconds=600)
def _forecast_full_horizon(crop_name: str) -> dict:
    """Fits the model once and forecasts MAX_FORECAST_DAYS. Cached per crop
    and invalidated when marketplace data changes (see ttl_cache)."""

    days_ahead = MAX_FORECAST_DAYS

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
            "priceBasis": PRICE_BASIS_ASKING if _series_uses_asking(crop_name) else PRICE_BASIS_FALLBACK,
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

    # Proper OLS prediction interval (not a fake zero-width band).
    predictions, lower, upper = ols_prediction_interval(y, future_x)

    # Safety floor: prices cannot be negative
    predictions = np.clip(predictions, 0, None)
    lower = np.clip(lower, 0, None)
    upper = np.clip(upper, 0, None)

    last_date = series["ds"].max()

    future_dates = pd.date_range(
        start=last_date,
        periods=days_ahead + 1,
        freq="D"
    )[1:]

    forecast = []

    for date, prediction, low, high in zip(
        future_dates,
        predictions,
        lower,
        upper
    ):
        forecast.append({
            "ds": date.strftime("%Y-%m-%d"),
            "yhat": round(float(prediction), 2),
            # 90% prediction interval; with < 3 points it is the point itself
            # flagged by `note`, never a claim of certainty
            "yhat_lower": round(float(prediction if np.isnan(low) else low), 2),
            "yhat_upper": round(float(prediction if np.isnan(high) else high), 2),
        })

    return {
        "cropName": crop_name,
        "priceBasis": PRICE_BASIS_ASKING if _series_uses_asking(crop_name) else PRICE_BASIS_FALLBACK,
        "model": "Linear Regression Fallback",
        "historyPoints": len(series),
        "forecastDays": days_ahead,
        "forecast": forecast,
        "note": note or (
            "Limited historical data available. "
            "Linear trend forecasting was used."
        )
    }

def _series_uses_asking(crop_name: str) -> bool:
    try:
        return _price_column(load_crops()) == "basePrice"
    except Exception:
        return False
