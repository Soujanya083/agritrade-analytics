"""
Today's mandi prices - what a farmer asks first: "what is onion selling for today?"

Source: AGMARKNET through the data.gov.in API (current-day records), using the same client as the
rest of the project (live call, with a saved snapshot as fallback). Nothing is estimated here: every
row is a government record, converted from Rs/quintal to Rs/kg. If the data is not from the last few
days the response says so (isCurrent = False) instead of presenting old prices as today's.
"""
from datetime import date, datetime
from statistics import median

from app.services import mandi_comparison
from app.services.market.market_overview import PRICE_BAND

CURRENT_WITHIN_DAYS = 3   # records at most this old count as "today's prices"


def _number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _pick(record: dict, *names):
    for name in names:
        if record.get(name) not in (None, ""):
            return record[name]
    return None


def _parse_date(text):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(text).strip(), fmt).date()
        except ValueError:
            continue
    return None


def get_today_prices(commodity: str, state: str | None = None, limit: int = 200, today: date | None = None) -> dict:
    today = today or date.today()
    data = mandi_comparison.fetch_mandi_prices(commodity.strip().title(), state, limit)
    if "error" in data:
        return data

    rows = []
    for r in data.get("records", []):
        modal = _number(_pick(r, "modal_price", "Modal_x0020_Price"))
        if modal is None:
            continue
        low = _number(_pick(r, "min_price", "Min_x0020_Price"))
        high = _number(_pick(r, "max_price", "Max_x0020_Price"))
        when = _parse_date(_pick(r, "arrival_date", "Arrival_Date"))
        rows.append({
            "market": r.get("market"), "district": r.get("district"), "state": r.get("state"),
            "variety": r.get("variety"), "grade": r.get("grade"),
            "date": when.isoformat() if when else None,
            "modalPricePerKg": round(modal / 100, 2),
            "minPricePerKg": round(low / 100, 2) if low else None,
            "maxPricePerKg": round(high / 100, 2) if high else None,
        })
    if not rows:
        return {"error": f"No usable price records for {commodity}"
                         + (f" in {state}" if state else "") + "."}

    # Flag (never hide) markets far from the others: usually retail-style markets or entry errors.
    mid = median(r["modalPricePerKg"] for r in rows)
    for r in rows:
        r["unusual"] = not (PRICE_BAND[0] * mid <= r["modalPricePerKg"] <= PRICE_BAND[1] * mid)
    normal = sorted((r for r in rows if not r["unusual"]), key=lambda r: -r["modalPricePerKg"])
    unusual = [r for r in rows if r["unusual"]]
    prices = [r["modalPricePerKg"] for r in normal]

    dates = [r["date"] for r in rows if r["date"]]
    as_of = max(dates) if dates else None
    age = (today - date.fromisoformat(as_of)).days if as_of else None
    return {
        "commodity": commodity.strip().title(),
        "state": state,
        "source": data.get("source"),
        "asOf": as_of,
        "ageDays": age,
        "isCurrent": age is not None and age <= CURRENT_WITHIN_DAYS,
        "summary": {"marketsReported": len(normal), "medianPerKg": round(median(prices), 2),
                    "lowPerKg": min(prices), "highPerKg": max(prices)},
        "unusualMarkets": len(unusual),
        "rows": normal + unusual,
        "note": "Wholesale (mandi) modal prices from AGMARKNET, shown per kg. Retail prices are higher, "
                "and prices differ from market to market.",
    }
