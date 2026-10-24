"""
Mandi price comparison - validates your ML forecasts against REAL
government agricultural price data (AGMARKNET, via data.gov.in).

This is your strongest credibility booster: instead of just claiming
"my model predicts X", you can show "my model predicts X, and the
government's own mandi data for a similar crop/region shows Y" -
turning an unverified forecast into a benchmarked one.

Setup required (see README): register at data.gov.in, generate a free
API key, and set DATAGOVIN_API_KEY + DATAGOVIN_RESOURCE_ID in .env.

Note on matching: the government dataset uses official commodity/state
names (e.g. "Onion", "Wheat", "Maharashtra") which may not exactly match
your app's crop names or seeded locations - this module does a
best-effort case-insensitive match and reports clearly when no match
is found, rather than fabricating a comparison.
"""
import logging

import requests
from dotenv import load_dotenv
from app import config
from app.services.mandi_snapshot import get_snapshot
from app.utils.ttl_cache import ttl_cache

load_dotenv()
log = logging.getLogger(__name__)

BASE_URL = "https://api.data.gov.in/resource"


# Government API results change at most daily; 15 minutes keeps the
# dashboard fast and stays well inside the API's rate limits. Not tied to
# the marketplace data version (it is external data).
@ttl_cache(seconds=900, data_aware=False)
def fetch_mandi_prices(commodity: str, state: str = None, limit: int = 20) -> dict:
    """Fetches recent real mandi prices for a commodity from data.gov.in.
    Falls back to a cached snapshot of real government data if the live
    call fails (network block, timeout, government server downtime) -
    a standard resilience pattern for third-party API dependencies, and
    it means a demo never breaks just because a network policy or the
    government server is uncooperative at the wrong moment."""
    # Read at call time (not import time) so behaviour never depends on
    # import order - that is what made the original tests environment-dependent.
    api_key, resource_id = config.mandi_credentials()
    if not api_key or not resource_id:
        return {
            "error": (
                "Mandi API credentials not configured. Set DATAGOVIN_API_KEY "
                "and DATAGOVIN_RESOURCE_ID in analytics-service/.env "
                "(see README for how to get a free key from data.gov.in)."
            )
        }

    url = f"{BASE_URL}/{resource_id}"
    params = {
        "api-key": api_key,
        "format": "json",
        "limit": limit,
        "filters[commodity]": commodity,
    }
    if state:
        params["filters[state.keyword]"] = state

    failure = None
    for attempt in (1, 2):   # one retry: the government server is occasionally slow
        try:
            resp = requests.get(url, params=params, headers=config.GOVT_API_HEADERS, timeout=(5, 12))
            resp.raise_for_status()
            records = resp.json().get("records", [])
            if records:
                return {"commodity": commodity, "state": state, "records": records, "source": "live"}
            failure = "the API answered but has no records for this commodity/state today"
            break
        except requests.exceptions.HTTPError as error:
            status = getattr(error.response, "status_code", "?")
            failure = f"HTTP {status} from the API" + (" (key rejected?)" if status in (401, 403) else "")
            break
        except requests.exceptions.Timeout:
            failure = "the API did not answer in time"
        except requests.exceptions.RequestException as error:
            failure = f"could not reach the API ({type(error).__name__})"
        except ValueError:
            failure = "the API answered with something that is not JSON"
            break
    log.warning("data.gov.in live call failed for %s/%s: %s", commodity, state, failure)

    # Live call failed or returned nothing - use cached real-data snapshot
    cached = get_snapshot(commodity, state)
    if cached:
        return {"commodity": commodity, "state": state, "records": cached, "source": "cached_snapshot",
                "liveFailure": failure}

    return {
        "error": (
            f"No mandi price records found for commodity='{commodity}'"
            + (f", state='{state}'" if state else "")
            + f" - live API: {failure}; and no cached snapshot is available for this "
            "commodity/state."
        )
    }


def compare_with_prediction(crop_name: str, predicted_price: float, state: str = None) -> dict:
    """Compares your model's predicted price against the average real
    mandi 'modal price' (the most common trading price) for the same
    commodity, giving a concrete over/under-estimate percentage."""
    mandi_data = fetch_mandi_prices(crop_name, state=state, limit=20)
    if "error" in mandi_data:
        return mandi_data

    records = mandi_data["records"]
    modal_prices = []
    for r in records:
        try:
            price = r.get("modal_price") or r.get("Modal_x0020_Price")
            if price:
                modal_prices.append(float(price))
        except (ValueError, TypeError):
            continue

    if not modal_prices:
        return {"error": "Mandi records found, but no usable price field to compare."}

    avg_mandi_price_per_quintal = sum(modal_prices) / len(modal_prices)
    avg_mandi_price_per_kg = avg_mandi_price_per_quintal / 100

    diff_pct = ((predicted_price - avg_mandi_price_per_kg) / avg_mandi_price_per_kg) * 100

    return {
        "cropName": crop_name,
        "state": state,
        "yourPredictedPrice": round(predicted_price, 2),
        "realMandiAvgPricePerKg": round(avg_mandi_price_per_kg, 2),
        "differencePercent": round(diff_pct, 1),
        "sampleSize": len(modal_prices),
        "interpretation": (
            f"Your prediction is {abs(round(diff_pct, 1))}% "
            f"{'higher' if diff_pct > 0 else 'lower'} than the real average "
            f"mandi price across {len(modal_prices)} recent government records."
        ),
    }