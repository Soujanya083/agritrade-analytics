"""
Crop price forecasting — Phase 3 core ML feature.

Uses Prophet as the primary model (handles small/irregular datasets well,
which matters early on when you don't have years of data yet).
Falls back to a simple linear trend when there isn't enough history
for Prophet to fit reliably (Prophet needs at least ~2 data points,
but a linear fallback keeps results sane below ~10 points).

For your literature-survey comparison writeup: swap `model="linear"` vs
`model="prophet"` in the endpoint call and log MAE for both — that
comparison table is exactly what your base papers report.
"""
import pandas as pd
import numpy as np
from app.services.data_loader import load_crops


def _prepare_series(crop_name: str) -> pd.DataFrame:
    df = load_crops()
    if df.empty:
        return pd.DataFrame()
    df = df[df["cropName"].str.lower() == crop_name.lower()]
    if df.empty:
        return pd.DataFrame()
    df["date"] = df["createdAt"].dt.date
    daily = (
        df.groupby("date")
        .agg(y=("currentBid", "mean"))
        .reset_index()
        .rename(columns={"date": "ds"})
    )
    daily["ds"] = pd.to_datetime(daily["ds"])
    return daily.sort_values("ds")


def predict_price(crop_name: str, days_ahead: int = 14) -> dict:
    series = _prepare_series(crop_name)
    if series.empty:
        return {"error": f"No price history found for crop '{crop_name}'"}

    if len(series) < 10:
        return _linear_fallback(series, days_ahead, crop_name)

    try:
        from prophet import Prophet
        # weekly_seasonality is OFF: our listings aren't evenly spaced day-by-day,
        # so with limited sparse data Prophet was fitting a "weekly cycle" to pure
        # noise, which produced wild swings (even negative prices). Re-enable this
        # once you have months of dense, near-daily data to genuinely support it.
        model = Prophet(daily_seasonality=False, weekly_seasonality=False, yearly_seasonality=False)
        model.fit(series)
        future = model.make_future_dataframe(periods=days_ahead)
        forecast = model.predict(future)
        result = forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(days_ahead).copy()
        # safety floor: a crop price can never be negative, regardless of what
        # the raw model output says
        for col in ["yhat", "yhat_lower", "yhat_upper"]:
            result[col] = result[col].clip(lower=0)
        result["ds"] = result["ds"].dt.strftime("%Y-%m-%d")
        return {
            "cropName": crop_name,
            "model": "prophet",
            "historyPoints": len(series),
            "forecast": result.round(2).to_dict(orient="records"),
        }
    except Exception as e:
        # graceful fallback if Prophet fails to converge on sparse data
        return _linear_fallback(series, days_ahead, crop_name, note=str(e))


def _linear_fallback(series: pd.DataFrame, days_ahead: int, crop_name: str, note: str = None) -> dict:
    """Simple linear regression fallback for small datasets.
    Not meant to be your final model — swap to Prophet/LSTM once you
    have more transaction history. This exists so the endpoint never
    hard-fails during early development/demo with limited seed data."""
    if len(series) < 2:
        return {"error": f"Not enough data points to forecast '{crop_name}' (need at least 2)"}

    x = np.arange(len(series))
    y = series["y"].values
    coeffs = np.polyfit(x, y, deg=1)
    trend = np.poly1d(coeffs)

    last_date = series["ds"].max()
    future_x = np.arange(len(series), len(series) + days_ahead)
    future_dates = pd.date_range(last_date, periods=days_ahead + 1, freq="D")[1:]
    preds = trend(future_x)

    forecast = [
        {"ds": d.strftime("%Y-%m-%d"), "yhat": round(float(p), 2)}
        for d, p in zip(future_dates, preds)
    ]
    return {
        "cropName": crop_name,
        "model": "linear_fallback",
        "historyPoints": len(series),
        "forecast": forecast,
        "note": note or "Fell back to linear trend — fewer than 10 historical points.",
    }