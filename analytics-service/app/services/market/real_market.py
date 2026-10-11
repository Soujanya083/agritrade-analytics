"""Service layer: real-market forecast + overview for the API."""
import difflib
import re

from app.services.market import market_overview, mandi_data
from app.services.market.forecast_lab import MIN_POINTS, run_forecast_lab
from app.services.market.mandi_store import list_mandi_commodities, load_mandi_prices
from app.utils.ttl_cache import ttl_cache

NO_HISTORY = (
    "No imported mandi history found for '{what}'. Import AGMARKNET history first: "
    "see docs/REAL_DATA.md (scripts/import_mandi_prices.py)."
)


def _series_for(commodity: str, state, market):
    df = load_mandi_prices(commodity, state, market)
    if df.empty:
        return None, df, None
    series, quality = mandi_data.build_series(df, commodity, state, market)
    return series, df, quality


def _label(commodity, state, market):
    return commodity + (f" / {state}" if state else "") + (f" / {market}" if market else "")


@ttl_cache(seconds=3600)
def forecast_real_market(commodity: str, state: str | None = None, market: str | None = None, horizon: int = 14) -> dict:
    series, _, quality = _series_for(commodity, state, market)
    if series is None or series.empty:
        return {"error": NO_HISTORY.format(what=_label(commodity, state, market))}
    result = run_forecast_lab(series, horizon)
    if "error" in result:
        return {**result, "dataQuality": quality, "minimumDays": MIN_POINTS}
    caveats = list(result.get("caveats", []))
    stale = quality.get("daysSinceLastObservation")
    if stale is not None and stale > 14:
        caveats.insert(0, f"The imported history ends {stale} days ago, so the forecast starts from that date, not from today. "
                          "Run the daily collector (scripts/import_mandi_prices.py api) to keep it current.")
    if quality.get("extremeMoves", {}).get("count"):
        caveats.append(f"{quality['extremeMoves']['count']} day(s) show extreme one-day price jumps; they are kept in the data "
                       "(they may be real shocks or entry errors).")
    return {"commodity": commodity, "state": state, "market": market, "dataQuality": quality, **{**result, "caveats": caveats}}


@ttl_cache(seconds=1800)
def real_market_overview(commodity: str, state: str | None = None, market: str | None = None) -> dict:
    series, df, quality = _series_for(commodity, state, market)
    if series is None or series.empty:
        return {"error": NO_HISTORY.format(what=_label(commodity, state, market))}
    return {"commodity": commodity, "state": state, "market": market, "dataQuality": quality,
            **market_overview.overview(series, df, commodity, state)}


def analysis_readiness(days_spanned: int) -> dict:
    """What the imported history of a commodity can support (matches the thresholds used in the analysis)."""
    if days_spanned < 120:
        return {"tier": "insufficient", "label": f"Not enough yet: {days_spanned} days (need 120 for a forecast)"}
    if days_spanned < 365:
        return {"tier": "forecast", "label": "Forecast + backtest (no seasonality yet)"}
    if days_spanned < 730:
        return {"tier": "forecast_seasonality_unreliable", "label": "Forecast + backtest; seasonality shown but flagged unreliable"}
    return {"tier": "full", "label": "Full analysis (forecast, backtest, reliable seasonality)"}


def real_market_commodities() -> list[dict]:
    return [{**row, "readiness": analysis_readiness(row["daysSpanned"])} for row in list_mandi_commodities()]


# Marketplace crop names -> a word that appears in the AGMARKNET commodity name
# (AGMARKNET uses names like "Arhar (Tur/Red Gram)(Whole)" or "Bhindi(Ladies Finger)").
CROP_TO_MANDI = {
    "toor dal": "arhar", "tur dal": "arhar", "toor": "arhar", "pigeon pea": "arhar",
    "chana": "bengal gram", "chickpea": "bengal gram", "moong": "green gram", "urad": "black gram",
    "okra": "bhindi", "ladies finger": "bhindi", "brinjal": "brinjal", "eggplant": "brinjal",
    "maize": "maize", "corn": "maize", "rice": "rice", "paddy": "paddy", "jowar": "jowar", "sorghum": "jowar",
    "bajra": "bajra", "groundnut": "groundnut", "peanut": "groundnut", "mustard": "mustard",
    "green chilli": "green chilli", "capsicum": "capsicum", "peas": "peas", "banana": "banana",
}


def _words(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def resolve_mandi_commodity(crop_name: str, available: list[str]) -> str | None:
    """Best AGMARKNET commodity name for a marketplace crop, or None. Exact > alias > whole word > close match."""
    crop = _words(crop_name)
    if not crop or not available:
        return None
    cleaned = {name: _words(name) for name in available}
    for name, words in cleaned.items():
        if words == crop:
            return name
    needle = CROP_TO_MANDI.get(crop, crop)
    # Prefer the commodity whose name STARTS with the word ("Onion" before "Onion Green").
    for name, words in sorted(cleaned.items(), key=lambda kv: len(kv[1])):
        if re.search(rf"(?<![a-z]){re.escape(needle)}(?![a-z])", words):
            return name
    singles = [w for w in cleaned.values() if " " not in w and len(w) >= 5]
    close = difflib.get_close_matches(crop, singles, n=1, cutoff=0.86)
    if close:
        return next(n for n, w in cleaned.items() if w == close[0])
    return None
