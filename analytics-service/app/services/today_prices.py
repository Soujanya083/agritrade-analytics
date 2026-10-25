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
from app.services.market.market_kinds import dominant_variety, is_retail_style_market, variety_key
from app.services.market.market_overview import PRICE_BAND
from app.services.districts import same_district
from app.services.states import state_variants

CURRENT_WITHIN_DAYS = 3   # records at most this old count as "today's prices"
NO_RECORDS_HINT = "no records for this commodity/state"   # wording of mandi_comparison's "empty answer" error


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


VARIETY_GAP_RATIO = 1.5   # varieties priced this far apart are different products for comparison purposes


def _fetch_with_state_spellings(name: str, state: str | None, limit: int) -> dict:
    """The feed spells some states differently from other sources: try each spelling until one has records."""
    if not state:
        return mandi_comparison.fetch_mandi_prices(name, None, limit)
    data = {}
    for spelling in state_variants(state):
        data = mandi_comparison.fetch_mandi_prices(name, spelling, limit)
        if "error" not in data or NO_RECORDS_HINT not in data["error"]:
            return data   # found something, or failed for a reason another spelling cannot fix (timeout, key)
    return data


def get_today_prices(commodity: str, state: str | None = None, limit: int = 200, today: date | None = None,
                     variety: str | None = None, district: str | None = None) -> dict:
    today = today or date.today()
    name = commodity.strip().title()
    data = _fetch_with_state_spellings(name, state, limit)
    state_fallback = False
    # If the farmer's state simply has no records today, show all-India and say so. A timeout or a rejected key
    # is NOT an empty answer, so those errors are passed through untouched.
    if "error" in data and state and NO_RECORDS_HINT in data["error"]:
        wider = _fetch_with_state_spellings(name, None, limit)
        if "error" not in wider:
            data, state_fallback = wider, True
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
            "retailStyle": is_retail_style_market(r.get("market")),
            "date": when.isoformat() if when else None,
            "modalPricePerKg": round(modal / 100, 2),
            "minPricePerKg": round(low / 100, 2) if low else None,
            "maxPricePerKg": round(high / 100, 2) if high else None,
        })
    if not rows:
        return {"error": f"No usable price records for {commodity}"
                         + (f" in {state}" if state else "") + "."}

    # The farmer's own district first (Karnataka districts are known by their old and new names).
    district_fallback = False
    if district:
        in_district = [r for r in rows if same_district(r["district"], district)]
        if in_district:
            rows = in_district
        else:
            district_fallback = True

    # Varieties: group them, and when one variety is the clear majority, compare like with like by default
    # (for example "Onion Green" is spring onion, a different product from bulb onion).
    by_variety = {}
    for r in rows:
        by_variety.setdefault(variety_key(r["variety"]), []).append(r)
    varieties = sorted(
        ({"variety": key, "label": (grp[0]["variety"] or "Other"), "markets": len(grp),
          "medianPerKg": round(median(x["modalPricePerKg"] for x in grp), 2)} for key, grp in by_variety.items()),
        key=lambda v: -v["markets"])
    medians = [v["medianPerKg"] for v in varieties]
    varieties_differ = len(varieties) > 1 and max(medians) / max(min(medians), 0.01) > VARIETY_GAP_RATIO
    chosen, variety_note = None, None
    if variety:
        chosen = variety_key(variety)
        if chosen not in by_variety:
            return {"error": f"No {commodity.strip().title()} records of variety '{variety}' today."}
    elif varieties_differ:
        main = dominant_variety([r["variety"] for r in rows])
        if main:
            chosen = main
            variety_note = (f"Showing the most common variety ({by_variety[main][0]['variety'] or 'Other'}); "
                            "other varieties are priced very differently, so choose one below to compare.")
        else:
            variety_note = "Varieties are priced very differently here: choose one below for a fair comparison."
    shown = by_variety[chosen] if chosen else rows

    # Flag (never hide) markets far from the others and farmers' direct-sale markets; neither counts in the summary.
    wholesale = [r for r in shown if not r["retailStyle"]] or shown
    mid = median(r["modalPricePerKg"] for r in wholesale)
    for r in shown:
        r["unusual"] = not (PRICE_BAND[0] * mid <= r["modalPricePerKg"] <= PRICE_BAND[1] * mid)
    normal = sorted((r for r in shown if not r["unusual"] and not r["retailStyle"]), key=lambda r: -r["modalPricePerKg"])
    if not normal:
        normal = sorted((r for r in shown if not r["unusual"]), key=lambda r: -r["modalPricePerKg"])
    flagged = [r for r in shown if r not in normal]
    prices = [r["modalPricePerKg"] for r in normal]

    dates = [r["date"] for r in rows if r["date"]]
    as_of = max(dates) if dates else None
    age = (today - date.fromisoformat(as_of)).days if as_of else None
    return {
        "commodity": name,
        "state": None if state_fallback else state,
        "requestedState": state,
        "stateFallback": state_fallback,
        "requestedDistrict": district,
        "districtFallback": district_fallback,
        "source": data.get("source"),
        "asOf": as_of,
        "ageDays": age,
        "isCurrent": age is not None and age <= CURRENT_WITHIN_DAYS,
        "summary": {"marketsReported": len(normal), "medianPerKg": round(median(prices), 2),
                    "lowPerKg": min(prices), "highPerKg": max(prices)},
        "unusualMarkets": len([r for r in flagged if r["unusual"]]),
        "retailStyleMarkets": len([r for r in flagged if r["retailStyle"]]),
        "variety": (by_variety[chosen][0]["variety"] or "Other") if chosen else None,
        "varieties": varieties,
        "varietyNote": variety_note,
        "rows": normal + flagged,
        "note": ("Wholesale (mandi) modal prices from AGMARKNET, shown per kg. Retail prices are higher, "
                 "and prices differ from market to market."
                 + " Farmers' direct-sale markets (such as Uzhavar Sandhai) are marked and left out of the summary, because they sell small lots near retail prices."
                 + (f" There are no records for {state} today, so these are all-India prices." if state_fallback else "")
                 + (f" There are no records for {district} district today, so this shows the wider area." if district_fallback else "")),
    }
