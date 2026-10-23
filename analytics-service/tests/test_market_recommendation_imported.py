"""Best-market ranking from IMPORTED AGMARKNET history (no API key needed)."""
import numpy as np
import pandas as pd

from app.services import market_recommendation as mr
from app.services.market import mandi_store, real_market

# conftest replaces this attribute with a stub for every test, so keep the real function.
REAL = mr._imported_market_records


def _frame(markets, days=40, end="2026-10-20"):
    dates = pd.date_range(end=end, periods=days)
    rows = []
    for state, market, price in markets:
        for d in dates:
            rows.append({"state": state, "district": "D", "market": market, "commodity": "Onion",
                         "date": d, "modalPrice": float(price), "modalPricePerKg": price / 100})
    return pd.DataFrame(rows)


def _patch(monkeypatch, df, names=("Onion",)):
    monkeypatch.setattr(real_market, "real_market_commodities", lambda: [{"commodity": n} for n in names])
    monkeypatch.setattr(mandi_store, "load_mandi_prices", lambda commodity, *a, **k: df)


def test_ranks_imported_markets_and_reports_data_date(monkeypatch):
    _patch(monkeypatch, _frame([("Karnataka", "Shimoga", 2200), ("Karnataka", "Udupi", 1800),
                                ("Maharashtra", "Lasalgaon", 2500)]))
    monkeypatch.setattr(mr, "_imported_market_records", REAL)
    result = mr.get_market_recommendation("Onion", farmer_state="Karnataka", quantity_kg=500)
    assert result["source"] == "imported_agmarknet"
    assert result["dataAsOf"] == "2026-10-20"
    assert result["marketsCompared"] == 3
    # Lasalgaon quotes most but needs the costly other-state haul: 2500-250-30 = 2220 vs Shimoga 2200-80-30 = 2090
    assert result["recommendedMarket"]["market"] == "Lasalgaon"
    assert result["recommendedMarket"]["expectedTotalNetProfit"] == round(2220 / 100 * 500, 2)


def test_too_few_markets_returns_none(monkeypatch):
    _patch(monkeypatch, _frame([("Karnataka", "Shimoga", 2200), ("Karnataka", "Udupi", 1800)]))
    assert REAL("Onion") is None


def test_markets_with_few_recent_quotes_are_ignored(monkeypatch):
    df = _frame([("Karnataka", "A", 2000), ("Karnataka", "B", 2100), ("Karnataka", "C", 2200)])
    thin = df[df["market"] == "C"].tail(1)  # only one recent quote for market C
    df = pd.concat([df[df["market"] != "C"], thin])
    _patch(monkeypatch, df)
    assert REAL("Onion") is None  # only 2 markets are usable


def test_unknown_crop_or_empty_data_returns_none(monkeypatch):
    _patch(monkeypatch, _frame([("K", "A", 1), ("K", "B", 2), ("K", "C", 3)]))
    assert REAL("Dragonfruit") is None
    _patch(monkeypatch, pd.DataFrame())
    assert REAL("Onion") is None


def test_database_errors_fall_back_quietly(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("db down")
    monkeypatch.setattr(real_market, "real_market_commodities", boom)
    assert REAL("Onion") is None


def test_only_the_latest_30_days_are_ranked(monkeypatch):
    old = _frame([("K", "A", 9000), ("K", "B", 9000), ("K", "C", 9000)], days=60, end="2026-08-01")
    new = _frame([("K", "A", 2000), ("K", "B", 2100), ("K", "C", 2200)], days=30, end="2026-10-20")
    _patch(monkeypatch, pd.concat([old, new]))
    recs = REAL("Onion")["records"]
    assert max(r["modal_price"] for r in recs) == 2200
