"""
Demand forecasting — Phase 3 stretch feature.

Reuses the exact same Prophet approach as price_prediction.py, but the
target variable is bid COUNT per day (a proxy for buyer demand) instead
of price. Kept as a separate module rather than a parameter on
price_prediction.py so each stays simple and independently explainable
in your report/viva ("here's how I forecast price... and here's the
near-identical approach I reused for demand").
"""
import pandas as pd
import numpy as np
from app.services.data_loader import load_crops, load_bids


def _prepare_demand_series(crop_name: str) -> pd.DataFrame:
    crops = load_crops()
    bids = load_bids()
    if crops.empty or bids.empty:
        return pd.DataFrame()

    crops = crops[crops["cropName"].str.lower() == crop_name.lower()]
    if crops.empty:
        return pd.DataFrame()

    merged = bids.merge(crops[["_id"]], left_on="cropId", right_on="_id", how="inner")
    if merged.empty:
        return pd.DataFrame()

    merged["date"] = merged["createdAt"].dt.date
    daily = (
        merged.groupby("date")
        .agg(y=("_id_x", "count"))  # bid count per day = demand proxy
        .reset_index()
        .rename(columns={"date": "ds"})
    )
    daily["ds"] = pd.to_datetime(daily["ds"])
    return daily.sort_values("ds")


def predict_demand(crop_name: str, days_ahead: int = 14) -> dict:
    series = _prepare_demand_series(crop_name)
    if series.empty:
        return {"error": f"No bid history found for crop '{crop_name}'"}

    if len(series) < 10:
        return _linear_fallback(series, days_ahead, crop_name)

    try:
        from prophet import Prophet
        model = Prophet(daily_seasonality=False, weekly_seasonality=False, yearly_seasonality=False)
        model.fit(series)
        future = model.make_future_dataframe(periods=days_ahead)
        forecast = model.predict(future)
        result = forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(days_ahead).copy()
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
        return _linear_fallback(series, days_ahead, crop_name, note=str(e))


def _linear_fallback(series: pd.DataFrame, days_ahead: int, crop_name: str, note: str = None) -> dict:
    if len(series) < 2:
        return {"error": f"Not enough data points to forecast demand for '{crop_name}' (need at least 2)"}

    x = np.arange(len(series))
    y = series["y"].values
    coeffs = np.polyfit(x, y, deg=1)
    trend = np.poly1d(coeffs)

    last_date = series["ds"].max()
    future_x = np.arange(len(series), len(series) + days_ahead)
    future_dates = pd.date_range(last_date, periods=days_ahead + 1, freq="D")[1:]
    preds = np.clip(trend(future_x), 0, None)

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