"""DB access for imported AGMARKNET history (collection: mandi_prices)."""
import pandas as pd

from app.db import mandi_prices_collection
from app.utils.ttl_cache import ttl_cache

_FIELDS = {"_id": 0, "state": 1, "district": 1, "market": 1, "commodity": 1, "variety": 1,
           "date": 1, "modalPrice": 1, "modalPricePerKg": 1}


def ensure_indexes():
    """Idempotent; called by the importer."""
    mandi_prices_collection.create_index("key", unique=True)
    mandi_prices_collection.create_index([("commodityKey", 1), ("date", 1)])


def load_mandi_prices(commodity: str, state: str | None = None, market: str | None = None) -> pd.DataFrame:
    query = {"commodityKey": commodity.strip().lower()}
    if state:
        query["state"] = {"$regex": f"^{_escape(state.strip())}$", "$options": "i"}
    if market:
        query["market"] = {"$regex": f"^{_escape(market.strip())}$", "$options": "i"}
    df = pd.DataFrame(list(mandi_prices_collection.find(query, _FIELDS)))
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    return df


def _escape(text: str) -> str:
    import re
    return re.escape(text)


@ttl_cache(seconds=900)
def list_mandi_commodities(min_days: int = 0, limit: int = 200) -> list[dict]:
    """Commodities with imported history: days of data, markets, date range."""
    pipeline = [
        {"$group": {"_id": {"c": "$commodityKey", "m": "$market"}, "name": {"$first": "$commodity"},
                    "rows": {"$sum": 1}, "first": {"$min": "$date"}, "last": {"$max": "$date"}}},
        {"$group": {"_id": "$_id.c", "name": {"$first": "$name"}, "rows": {"$sum": "$rows"},
                    "markets": {"$sum": 1}, "first": {"$min": "$first"}, "last": {"$max": "$last"}}},
        {"$sort": {"rows": -1}},
        {"$limit": int(limit)},
    ]
    out = []
    for doc in mandi_prices_collection.aggregate(pipeline, allowDiskUse=True):
        span = (doc["last"] - doc["first"]).days + 1
        if span >= min_days:
            age = (pd.Timestamp.today().normalize() - pd.Timestamp(doc["last"]).normalize()).days
            out.append({"commodity": doc["name"], "rows": doc["rows"], "markets": doc["markets"],
                        "firstDate": doc["first"].strftime("%Y-%m-%d"), "lastDate": doc["last"].strftime("%Y-%m-%d"),
                        "daysSpanned": int(span), "daysSinceLastRecord": int(age), "stale": bool(age > 14)})
    return out
