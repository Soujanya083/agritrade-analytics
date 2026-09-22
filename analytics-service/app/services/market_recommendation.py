"""
Market recommendation engine - ranks real markets for a crop by
EXPECTED NET PROFIT, not just raw price.

This directly extends mandi_comparison.py's real, multi-market
AGMARKNET data (rather than re-fetching or duplicating it) by
subtracting a transport cost and a storage cost from each market's
real modal price, so a farmer sees which market is actually worth
the trip - not just which one quotes the highest number.

Honesty note (documented, not hidden): we do NOT have real per-route
transport cost data or real per-crop storage cost data. Building
either from scratch (fuel prices, vehicle type, real warehousing
rates) is out of scope for this project. Instead we use a disclosed,
two-tier flat-rate assumption:

  - "same state as the farmer"      -> lower transport cost tier
  - "different state from the farmer" -> higher transport cost tier

and a flat per-day storage cost assumption, disclosed below. This
mirrors how decision_engine.py already discloses when it is making a
simplifying assumption rather than presenting an estimate as measured
fact. If real logistics-cost data becomes available later, only the
constants below need to change - the ranking logic does not.
"""
from app.services.mandi_comparison import fetch_mandi_prices

# ---- Disclosed assumptions (₹ per quintal unless noted) ----
TRANSPORT_COST_SAME_STATE = 80       # short-haul, within farmer's own state
TRANSPORT_COST_OTHER_STATE = 250     # long-haul, crossing a state border
STORAGE_COST_PER_QUINTAL_PER_DAY = 15
ASSUMED_STORAGE_DAYS = 2             # typical gap between harvest and sale


def _transport_cost(record_state: str, farmer_state: str) -> tuple[float, str]:
    """Two-tier flat-rate transport cost. Returns (cost, tier_label)."""
    if farmer_state and record_state and record_state.strip().lower() == farmer_state.strip().lower():
        return TRANSPORT_COST_SAME_STATE, "same_state"
    return TRANSPORT_COST_OTHER_STATE, "other_state"


def get_market_recommendation(
    crop_name: str,
    farmer_state: str = None,
    quantity_kg: float = None,
) -> dict:
    """Ranks real markets for a crop by expected net profit per quintal
    (modal price minus transport cost minus storage cost), using real
    AGMARKNET records. Returns an error dict, unchanged, if no market
    data is available - never fabricates a market or a price."""
    mandi_data = fetch_mandi_prices(crop_name, state=None, limit=25)
    if "error" in mandi_data:
        return mandi_data

    records = mandi_data["records"]
    ranked = []

    for r in records:
        try:
            modal_price = r.get("modal_price") or r.get("Modal_x0020_Price")
            modal_price = float(modal_price)
        except (TypeError, ValueError):
            continue

        record_state = r.get("state") or r.get("State")
        market_name = r.get("market") or r.get("Market")
        district = r.get("district") or r.get("District")

        transport_cost, tier = _transport_cost(record_state, farmer_state)
        storage_cost = STORAGE_COST_PER_QUINTAL_PER_DAY * ASSUMED_STORAGE_DAYS
        net_profit_per_quintal = modal_price - transport_cost - storage_cost
        net_profit_per_kg = net_profit_per_quintal / 100

        entry = {
            "state": record_state,
            "district": district,
            "market": market_name,
            "modalPricePerQuintal": round(modal_price, 2),
            "transportCostPerQuintal": transport_cost,
            "transportTier": tier,
            "storageCostPerQuintal": storage_cost,
            "expectedNetProfitPerQuintal": round(net_profit_per_quintal, 2),
            "expectedNetProfitPerKg": round(net_profit_per_kg, 2),
        }
        if quantity_kg:
            entry["expectedTotalNetProfit"] = round(net_profit_per_kg * quantity_kg, 2)

        ranked.append(entry)

    if not ranked:
        return {"error": f"Mandi records found for '{crop_name}', but none had a usable price field."}

    ranked.sort(key=lambda e: e["expectedNetProfitPerQuintal"], reverse=True)
    best = ranked[0]

    return {
        "cropName": crop_name,
        "farmerState": farmer_state,
        "quantityKg": quantity_kg,
        "assumptions": {
            "transportCostSameStatePerQuintal": TRANSPORT_COST_SAME_STATE,
            "transportCostOtherStatePerQuintal": TRANSPORT_COST_OTHER_STATE,
            "storageCostPerQuintalPerDay": STORAGE_COST_PER_QUINTAL_PER_DAY,
            "assumedStorageDays": ASSUMED_STORAGE_DAYS,
            "note": (
                "Transport and storage costs are disclosed flat-rate "
                "assumptions, not measured logistics data. Market prices "
                "themselves are real AGMARKNET records."
            ),
        },
        "recommendedMarket": best,
        "rankedMarkets": ranked,
        "source": mandi_data.get("source"),
    }