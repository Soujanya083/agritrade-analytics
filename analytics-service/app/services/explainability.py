import numpy as np
from app.services.price_prediction import _prepare_series


def explain_price_prediction(crop_name: str):
    series = _prepare_series(crop_name)

    if series.empty:
        return {
            "error": f"No price history found for crop '{crop_name}'"
        }

    y = series["y"].astype(float).values

    if len(y) < 3:
        return {
            "error": f"Not enough historical data to explain '{crop_name}'"
        }

    recent_window = min(5, len(y))
    recent_prices = y[-recent_window:]

    overall_mean = float(np.mean(y))
    recent_mean = float(np.mean(recent_prices))

    # Trend using linear regression slope
    x = np.arange(len(y))
    slope = float(np.polyfit(x, y, 1)[0])

    # Volatility
    volatility = float(np.std(y))

    # Recent momentum
    if len(y) >= 2:
        momentum = float(y[-1] - y[-2])
    else:
        momentum = 0.0

    factors = []

    factors.append({
        "factor": "Historical Average Price",
        "value": round(overall_mean, 2),
        "impact": "baseline",
        "explanation": "Provides the baseline price level from historical observations."
    })

    trend_impact = "positive" if slope > 0 else "negative" if slope < 0 else "neutral"

    factors.append({
        "factor": "Price Trend",
        "value": round(slope, 4),
        "impact": trend_impact,
        "explanation": (
            "Historical prices are trending upward."
            if slope > 0
            else "Historical prices are trending downward."
            if slope < 0
            else "Historical prices show no significant trend."
        )
    })

    momentum_impact = (
        "positive" if momentum > 0
        else "negative" if momentum < 0
        else "neutral"
    )

    factors.append({
        "factor": "Recent Price Momentum",
        "value": round(momentum, 2),
        "impact": momentum_impact,
        "explanation": (
            "The most recent price movement was upward."
            if momentum > 0
            else "The most recent price movement was downward."
            if momentum < 0
            else "No recent price movement was detected."
        )
    })

    volatility_level = (
        "high" if volatility > overall_mean * 0.25
        else "moderate" if volatility > overall_mean * 0.10
        else "low"
    )

    factors.append({
        "factor": "Price Volatility",
        "value": round(volatility, 2),
        "impact": volatility_level,
        "explanation": f"Historical price volatility is {volatility_level}."
    })

    recent_difference = recent_mean - overall_mean

    recent_impact = (
        "above_average"
        if recent_difference > 0
        else "below_average"
        if recent_difference < 0
        else "average"
    )

    factors.append({
        "factor": "Recent Price Level",
        "value": round(recent_mean, 2),
        "impact": recent_impact,
        "explanation": (
            "Recent prices are above the historical average."
            if recent_difference > 0
            else "Recent prices are below the historical average."
            if recent_difference < 0
            else "Recent prices are close to the historical average."
        )
    })

    confidence = "high"

    if len(y) < 15:
        confidence = "medium"

    if len(y) < 8:
        confidence = "low"

    return {
        "cropName": crop_name,
        "historyPoints": len(y),
        "explanationType": "time_series_factor_analysis",
        "confidence": confidence,
        "factors": factors
    }