"""
Descriptive analytics on a REAL price series: what a farmer can read off the
history without any forecasting model.

Everything here is pure (Series/DataFrame in, dict out) and each result says
how reliable it is, e.g. a "best month to sell" is flagged unreliable when
there are fewer than two years of history, because with one year a seasonal
pattern cannot be told apart from a trend.
"""
import numpy as np
import pandas as pd

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def seasonal_index(series: pd.Series) -> dict:
    """
    Month-of-year price index (1.00 = typical price). Each day's price is
    divided by a centred 365-day moving average (removes the trend), then the
    ratios are averaged by calendar month and rescaled to average 1.0.
    """
    if len(series) < 365:
        return {"reliable": False, "yearsOfData": round(len(series) / 365, 2), "index": [],
                "note": "Less than one year of history - no seasonal pattern can be measured."}
    trend = series.rolling(365, center=True, min_periods=300).mean()
    ratio = (series / trend).dropna()
    if ratio.empty:
        return {"reliable": False, "yearsOfData": round(len(series) / 365, 2), "index": [],
                "note": "History is too short to remove the trend."}
    by_month = ratio.groupby(ratio.index.month).agg(["mean", "count"])
    by_month["mean"] = by_month["mean"] / by_month["mean"].mean()
    years = round(len(series) / 365, 2)
    index = [{"month": MONTHS[m - 1], "monthNumber": int(m), "index": round(float(r["mean"]), 3), "days": int(r["count"])}
             for m, r in by_month.iterrows()]
    ordered = sorted(index, key=lambda r: r["index"], reverse=True)
    reliable = years >= 2
    return {
        "reliable": reliable,
        "yearsOfData": years,
        "index": index,
        "highestMonths": [r["month"] for r in ordered[:3]],
        "lowestMonths": [r["month"] for r in ordered[-3:][::-1]],
        "note": ("Averaged over " + f"{years} years of history." if reliable else
                 f"Only {years} years of history: this may reflect one year's events rather than a repeating seasonal pattern."),
    }


def volatility(series: pd.Series, window: int = 30) -> dict:
    """How jumpy prices are lately compared with their own history."""
    if len(series) < window * 2:
        return {"available": False, "note": f"Need at least {window * 2} days."}
    returns = np.log(series).diff().dropna()
    rolling = returns.rolling(window).std().dropna() * np.sqrt(window)
    latest = float(rolling.iloc[-1])
    percentile = float((rolling <= latest).mean() * 100)
    level = "high" if percentile >= 75 else "low" if percentile <= 25 else "normal"
    return {
        "available": True,
        "windowDays": window,
        "latestVolatilityPct": round(latest * 100, 2),
        "medianVolatilityPct": round(float(rolling.median()) * 100, 2),
        "percentileVsHistory": round(percentile, 1),
        "level": level,
        "note": f"Prices are moving {level} relative to their own history over the last {window} days.",
    }


def year_on_year(series: pd.Series, window: int = 14) -> dict:
    """Latest price level vs the same period a year earlier."""
    if len(series) < 365 + window:
        return {"available": False}
    now = series.iloc[-window:].mean()
    then = series.loc[series.index[-1] - pd.Timedelta(days=365 + window - 1): series.index[-1] - pd.Timedelta(days=365)].mean()
    if not np.isfinite(then) or then <= 0:
        return {"available": False}
    return {"available": True, "currentPerKg": round(float(now), 2), "yearAgoPerKg": round(float(then), 2),
            "changePct": round(float((now / then - 1) * 100), 1)}


def market_spread(df: pd.DataFrame, commodity: str, state: str | None = None, days: int = 30,
                  min_observations: int = 5) -> dict:
    """
    Price differences between markets over the last `days` (median modal price
    per kg per market). Shows where the same crop actually sells higher - the
    descriptive version of 'where should I sell'. Transport cost is NOT
    subtracted here (see market_recommendation for that).
    """
    sub = df[df["commodity"].str.lower() == commodity.strip().lower()]
    if state:
        sub = sub[sub["state"].str.lower() == state.strip().lower()]
    if sub.empty:
        return {"available": False}
    cutoff = sub["date"].max() - pd.Timedelta(days=days)
    recent = sub[sub["date"] > cutoff]
    grouped = recent.groupby(["state", "market"]).agg(
        medianPerKg=("modalPricePerKg", "median"), observations=("modalPricePerKg", "size")).reset_index()
    grouped = grouped[grouped["observations"] >= min_observations]
    if len(grouped) < 3:
        return {"available": False, "note": f"Fewer than 3 markets with {min_observations}+ recent quotes."}
    grouped = grouped.sort_values("medianPerKg", ascending=False)
    median = float(grouped["medianPerKg"].median())
    rows = lambda frame: [{"state": r.state, "market": r.market, "medianPerKg": round(float(r.medianPerKg), 2),
                           "observations": int(r.observations)} for r in frame.itertuples()]
    return {
        "available": True,
        "windowDays": days,
        "marketsCompared": int(len(grouped)),
        "medianAcrossMarketsPerKg": round(median, 2),
        "spreadPct": round(float((grouped["medianPerKg"].max() - grouped["medianPerKg"].min()) / median * 100), 1),
        "highest": rows(grouped.head(5)),
        "lowest": rows(grouped.tail(5).iloc[::-1]),
        "note": "Wholesale modal prices only; transport and storage costs are not deducted.",
    }


def overview(series: pd.Series, df: pd.DataFrame, commodity: str, state: str | None) -> dict:
    return {
        "seasonality": seasonal_index(series),
        "volatility": volatility(series),
        "yearOnYear": year_on_year(series),
        "marketSpread": market_spread(df, commodity, state),
    }
