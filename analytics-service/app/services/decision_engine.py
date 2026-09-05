"""
Decision engine: "should a farmer sell now, or wait?"

This is distinct from recommendation.py and crop_recommendation_score.py,
which answer "which crop" - this answers "when". It's the missing piece
your Phase 6 decision backtesting needs: without an actual sell-now-vs-wait
decision, there's nothing concrete to backtest against baseline strategies.

No transportation, storage, or holding costs are assumed anywhere in this
module - this project doesn't have that data, and inventing plausible-
looking numbers for it would misrepresent the results. Every number here
either comes from real marketplace price history or is a bare price
forecast; the two are never blended into a fabricated "profit".
"""

import numpy as np
import pandas as pd

DEFAULT_HORIZON_DAYS = 7

# A forecasted increase has to clear this bar to justify recommending
# "wait" over "sell now" - otherwise noise-level forecast wobble would
# constantly flip the recommendation for no real reason.
WAIT_THRESHOLD_PERCENT = 2.0


def _forecast_price_as_of(series: pd.DataFrame, as_of_date, horizon_days: int):
    """
    Forecasts the price `horizon_days` after `as_of_date`, using only
    data up to and including `as_of_date` - critical for backtesting,
    where using later data would be lookahead bias. Uses a simple
    linear trend (fast enough to run once per historical case; Prophet
    is used for the live single-crop endpoint instead, see
    get_sell_or_wait_recommendation).
    """
    history = series[series["ds"] <= as_of_date]
    if len(history) < 5:
        return None

    y = history["y"].astype(float).values
    x = np.arange(len(y))
    coefficients = np.polyfit(x, y, deg=1)
    trend = np.poly1d(coefficients)
    predicted = trend(len(y) - 1 + horizon_days)
    return max(float(predicted), 0.0)


def _actual_price_after(series: pd.DataFrame, as_of_date, horizon_days: int):
    """
    The real market-wide average price actually observed around
    `horizon_days` after `as_of_date` - ground truth for what "waiting"
    would have achieved, not a forecast or an invented number.
    """
    target_date = as_of_date + pd.Timedelta(days=horizon_days)
    window = series[
        (series["ds"] >= target_date - pd.Timedelta(days=2))
        & (series["ds"] <= target_date + pd.Timedelta(days=2))
    ]
    if window.empty:
        return None
    return float(window["y"].mean())


def _recommend_sell_or_wait(current_price: float, forecasted_price):
    """
    Core decision rule: recommend "Wait" only if the forecast expects
    more than WAIT_THRESHOLD_PERCENT% improvement; "Sell Now" otherwise,
    including whenever there's no reliable forecast at all (the safer
    default when the system isn't confident).
    """
    if forecasted_price is None or not current_price:
        return "Sell Now", "No reliable forecast available - defaulting to the safer, immediate option."

    change_percent = ((forecasted_price - current_price) / current_price) * 100

    if change_percent > WAIT_THRESHOLD_PERCENT:
        return "Wait", f"Forecast expects a {change_percent:.1f}% price increase over the horizon."

    return "Sell Now", f"Forecast expects only a {change_percent:.1f}% change - not worth the wait."


def get_sell_or_wait_recommendation(crop_name: str, horizon_days: int = DEFAULT_HORIZON_DAYS) -> dict:
    """
    Live sell-now-vs-wait recommendation for a crop, using its full
    available price history (no lookahead restriction needed here -
    this isn't a backtest, there's no "future" being peeked at).
    """
    from app.services.price_prediction import _prepare_series

    series = _prepare_series(crop_name)

    if series.empty:
        return {"error": f"No price history found for crop '{crop_name}'"}

    current_price = float(series["y"].iloc[-1])
    as_of_date = series["ds"].iloc[-1]
    forecasted_price = _forecast_price_as_of(series, as_of_date, horizon_days)

    recommendation, reason = _recommend_sell_or_wait(current_price, forecasted_price)

    return {
        "cropName": crop_name,
        "currentPrice": round(current_price, 2),
        "forecastedPrice": round(forecasted_price, 2) if forecasted_price is not None else None,
        "horizonDays": horizon_days,
        "recommendation": recommendation,
        "reason": reason,
        "limitations": (
            "Based on marketplace-wide historical price trend only. Does not "
            "account for storage/holding costs, spoilage risk, or transport - "
            "this data isn't available in the current dataset. Forecast "
            "uncertainty increases with the horizon length; this is a "
            "decision-support signal, not a guaranteed outcome."
        ),
    }