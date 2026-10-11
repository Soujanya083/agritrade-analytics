"""
REAL market data: AGMARKNET mandi prices.

Why this module exists
----------------------
Everything the marketplace forecasts from its own listings is only as real as
its data - and the demo data is synthetic. AGMARKNET (Government of India)
publishes real wholesale prices for thousands of mandis. The official
data.gov.in API only serves the CURRENT day, so history has to be built from
a bulk dataset plus a daily collector (scripts/import_mandi_prices.py). This
module turns those rows into clean, forecastable time series.

Pure functions only (no DB access here) so they are unit-testable:
  normalize_records()  raw rows (API or CSV) -> clean DataFrame
  build_series()       clean rows -> one daily Rs/kg series + a quality report
"""
import re

import numpy as np
import pandas as pd

QUINTAL_KG = 100.0

# Column spellings seen in data.gov.in and the public bulk datasets.
_COLUMN_ALIASES = {
    "state": ["state", "State"],
    "district": ["district", "District"],
    "market": ["market", "Market"],
    "commodity": ["commodity", "Commodity"],
    "variety": ["variety", "Variety"],
    "grade": ["grade", "Grade"],
    "arrivalDate": ["arrival_date", "Arrival_Date", "arrivaldate", "date", "Date", "Reported Date"],
    "minPrice": ["min_price", "Min_Price", "Min Price", "min_x0020_price", "Min_x0020_Price"],
    "maxPrice": ["max_price", "Max_Price", "Max Price", "max_x0020_price", "Max_x0020_Price"],
    "modalPrice": ["modal_price", "Modal_Price", "Modal Price", "modal_x0020_price", "Modal_x0020_Price"],
}
REQUIRED = ["state", "market", "commodity", "arrivalDate", "modalPrice"]


def _clean_text(series: pd.Series) -> pd.Series:
    """Upstream text is messy ('Pointed gourd(Parval)' vs 'Pointed gourd (Parval)')."""
    return (
        series.fillna("").astype(str).str.strip()
        .str.replace(r"\s+", " ", regex=True)
        .str.replace(r"\s*\(\s*", " (", regex=True)
        .str.replace(r"\s*\)", ")", regex=True)
    )


def _find(df: pd.DataFrame, target: str):
    lowered = {c.lower(): c for c in df.columns}
    for alias in _COLUMN_ALIASES[target]:
        if alias in df.columns:
            return alias
        if alias.lower() in lowered:
            return lowered[alias.lower()]
    return None


def _suspected_unit_errors(df: pd.DataFrame, min_quotes: int = 5, band: float = 5.0, tolerance: float = 0.15) -> pd.Series:
    key = df["commodity"].str.lower()
    grouped = df.groupby([key, df["date"]])["modalPrice"]
    median = grouped.transform("median")
    quotes = grouped.transform("size")
    ratio = df["modalPrice"] / median
    log_ratio = np.log10(ratio)
    power_of_ten = (log_ratio - log_ratio.round()).abs() < tolerance
    return (quotes >= min_quotes) & ((ratio > band) | (ratio < 1 / band)) & power_of_ten


def normalize_records(raw) -> tuple[pd.DataFrame, dict]:
    """
    Clean raw mandi rows. Returns (clean_df, report).

    clean_df columns: state, district, market, commodity, variety, grade,
    date (datetime64, day), minPrice, maxPrice, modalPrice (Rs/quintal),
    modalPricePerKg (Rs/kg), key (unique row identity for upserts).

    Rows are DROPPED (and counted in `report`) when: required fields are
    missing, the date can't be parsed or is in the future, a price is not a
    positive number, or the price range is incoherent (min > max). Duplicate
    (date, market, commodity, variety, grade) rows keep the last one.
    Nothing is imputed here.
    """
    df = pd.DataFrame(raw).copy()
    report = {"rowsIn": int(len(df)), "dropped": {}}
    if df.empty:
        return pd.DataFrame(columns=["state", "district", "market", "commodity", "variety", "grade", "date",
                                     "minPrice", "maxPrice", "modalPrice", "modalPricePerKg", "key"]), report

    renamed = {}
    for target in _COLUMN_ALIASES:
        found = _find(df, target)
        if found:
            renamed[found] = target
    df = df.rename(columns=renamed)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"Mandi data is missing required column(s): {', '.join(missing)}")

    for col in ("district", "variety", "grade"):
        if col not in df.columns:
            df[col] = ""
    for col in ("state", "district", "market", "commodity", "variety", "grade"):
        df[col] = _clean_text(df[col])

    def drop(mask, reason):
        n = int(mask.sum())
        if n:
            report["dropped"][reason] = report["dropped"].get(reason, 0) + n
        return df[~mask]

    df = drop((df["state"] == "") | (df["market"] == "") | (df["commodity"] == ""), "missing state/market/commodity")

    # dd/mm/yyyy is what AGMARKNET uses; try that first, then ISO.
    parsed = pd.to_datetime(df["arrivalDate"], format="%d/%m/%Y", errors="coerce")
    iso = pd.to_datetime(df["arrivalDate"], errors="coerce", format="mixed")
    df["date"] = parsed.fillna(iso).dt.normalize()
    # pandas 2.x cannot represent years beyond 2262 and returns NaT for them, newer
    # versions parse them. Decide "future" from the text itself so the same row is
    # classified the same way on every pandas version.
    year = pd.to_numeric(df["arrivalDate"].astype(str).str.extract(r"(\d{4})")[0], errors="coerce")
    df = drop(year > pd.Timestamp.today().year + 1, "date in the future")
    df = drop(df["date"].isna(), "unparseable date")
    df = drop(df["date"] > pd.Timestamp.today().normalize() + pd.Timedelta(days=1), "date in the future")

    for col in ("minPrice", "maxPrice", "modalPrice"):
        df[col] = pd.to_numeric(df[col] if col in df.columns else np.nan, errors="coerce")
    df = drop(~(df["modalPrice"] > 0), "modal price missing or not positive")
    df["minPrice"] = df["minPrice"].where(df["minPrice"] > 0)
    df["maxPrice"] = df["maxPrice"].where(df["maxPrice"] > 0)
    incoherent = (df["minPrice"] > df["maxPrice"]) | (df["modalPrice"] < df["minPrice"] * 0.5) | (df["modalPrice"] > df["maxPrice"] * 1.5)
    df = drop(incoherent.fillna(False), "incoherent min/modal/max")

    # Real Agmarknet data contains prices typed in the wrong unit (per kg or per
    # tonne instead of per quintal), which show up as ~10x / 100x outliers. On a
    # day with several quotes for the same commodity, a quote that is a power of
    # ten away from the cross-market median is almost certainly a unit error:
    # genuine market spreads are within tens of percent. Only that specific
    # pattern is dropped (and counted); an ordinary 7x outlier is NOT touched.
    df = drop(_suspected_unit_errors(df), "suspected unit-entry error (price ~10x/100x off the day's median)")

    df["key"] = (df["date"].dt.strftime("%Y-%m-%d") + "|" + df["state"].str.lower() + "|" + df["market"].str.lower()
                 + "|" + df["commodity"].str.lower() + "|" + df["variety"].str.lower() + "|" + df["grade"].str.lower())
    before = len(df)
    df = df.drop_duplicates("key", keep="last")
    if before - len(df):
        report["dropped"]["duplicate rows"] = before - len(df)

    df["modalPricePerKg"] = (df["modalPrice"] / QUINTAL_KG).round(4)
    report["rowsOut"] = int(len(df))
    return df[["state", "district", "market", "commodity", "variety", "grade", "date",
               "minPrice", "maxPrice", "modalPrice", "modalPricePerKg", "key"]].reset_index(drop=True), report


def _robust_daily(group: pd.DataFrame) -> float:
    """Median across markets/varieties that day: robust to one mistyped price."""
    return float(np.median(group["modalPricePerKg"]))


def extreme_moves(series: pd.Series, threshold: float = 8.0, keep: int = 3) -> dict:
    """
    Days whose one-day price change is wildly out of line with the series' own
    history (robust z-score from the median absolute deviation, so the outliers
    themselves don't hide each other). These are FLAGGED, never removed or
    smoothed: a real shock and a typo look the same to a program.
    """
    if len(series) < 30:
        return {"count": 0, "examples": []}
    returns = np.log(series).diff().dropna()
    mad = float(np.median(np.abs(returns - returns.median()))) * 1.4826
    if mad == 0:
        return {"count": 0, "examples": []}
    z = (returns - returns.median()) / mad
    flagged = z[np.abs(z) > threshold]
    top = flagged.reindex(flagged.abs().sort_values(ascending=False).index).head(keep)
    return {"count": int(len(flagged)),
            "examples": [{"date": d.strftime("%Y-%m-%d"), "changePct": round(float((np.exp(returns[d]) - 1) * 100), 1)}
                         for d in top.index]}


def build_series(df: pd.DataFrame, commodity: str, state: str | None = None, market: str | None = None,
                 max_gap_days: int = 3) -> tuple[pd.Series, dict]:
    """
    One daily price series (Rs/kg) for a commodity, optionally one state/market.

    Days with several observations are summarised by their MEDIAN. Missing days
    are forward-filled ONLY across gaps up to `max_gap_days` (a market that
    skips a weekend); longer gaps stay missing and the series is cut at the
    start of the most recent long gap, so a model never trains across a hole
    that was silently papered over. The quality report says exactly what was
    filled, so nothing is hidden.
    """
    quality = {"commodity": commodity, "state": state, "market": market}
    if df is None or df.empty:
        return pd.Series(dtype=float), {**quality, "observations": 0, "error": "no data"}

    mask = df["commodity"].str.lower() == commodity.strip().lower()
    if state:
        mask &= df["state"].str.lower() == state.strip().lower()
    if market:
        mask &= df["market"].str.lower() == market.strip().lower()
    sub = df[mask]
    if sub.empty:
        return pd.Series(dtype=float), {**quality, "observations": 0, "error": "no matching rows"}

    daily = sub.groupby("date").apply(_robust_daily, include_groups=False).sort_index()
    full_index = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    reindexed = daily.reindex(full_index)

    # locate runs of missing days longer than the tolerated gap
    missing = reindexed.isna()
    run_id = (missing != missing.shift()).cumsum()
    run_len = missing.groupby(run_id).transform("sum")
    long_gap = missing & (run_len > max_gap_days)
    if long_gap.any():
        last_gap_end = long_gap[long_gap].index.max()
        reindexed = reindexed.loc[last_gap_end + pd.Timedelta(days=1):]
        missing = reindexed.isna()

    filled = reindexed.ffill(limit=max_gap_days).dropna()
    extreme = extreme_moves(filled)
    last_date = filled.index.max() if len(filled) else None
    quality.update({
        "daysSinceLastObservation": None if last_date is None else int((pd.Timestamp.today().normalize() - last_date).days),
        "extremeMoves": extreme,
        "observations": int(len(daily)),
        "daysInSeries": int(len(filled)),
        "forwardFilledDays": int(missing.sum() - filled.isna().sum()) if len(filled) else 0,
        "firstDate": filled.index.min().strftime("%Y-%m-%d") if len(filled) else None,
        "lastDate": filled.index.max().strftime("%Y-%m-%d") if len(filled) else None,
        "marketsContributing": int(sub["market"].nunique()),
        "cutAtLongGap": bool(long_gap.any()),
        "unit": "INR per kg (AGMARKNET modal price per quintal / 100)",
    })
    return filled.astype(float), quality
