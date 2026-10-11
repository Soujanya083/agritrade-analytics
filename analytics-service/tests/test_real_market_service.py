"""Service layer for real-market analysis + commodity-name resolution."""
import numpy as np
import pandas as pd
import pytest

from app.services.market import real_market
from app.errors import classify_error

AVAILABLE = ["Onion", "Tomato", "Arhar (Tur/Red Gram)(Whole)", "Bhindi (Ladies Finger)", "Bengal Gram (Gram)(Whole)",
             "Green Gram (Moong)(Whole)", "Brinjal", "Rice", "Paddy (Dhan)(Common)", "Wheat", "Potato", "Onion Green"]


@pytest.mark.parametrize("crop,expected", [
    ("Onion", "Onion"), ("onion ", "Onion"), ("Toor Dal", "Arhar (Tur/Red Gram)(Whole)"),
    ("Ladies Finger", "Bhindi (Ladies Finger)"), ("Okra", "Bhindi (Ladies Finger)"), ("Chana", "Bengal Gram (Gram)(Whole)"),
    ("Moong", "Green Gram (Moong)(Whole)"), ("Brinjal", "Brinjal"), ("Eggplant", "Brinjal"), ("Rice", "Rice"),
    ("Paddy", "Paddy (Dhan)(Common)"), ("Wheat", "Wheat"), ("Tomatoe", "Tomato"),
])
def test_marketplace_crops_resolve_to_agmarknet_commodities(crop, expected):
    assert real_market.resolve_mandi_commodity(crop, AVAILABLE) == expected


def test_exact_name_wins_over_longer_partial_matches():
    assert real_market.resolve_mandi_commodity("Onion", AVAILABLE) == "Onion"      # not "Onion Green"


@pytest.mark.parametrize("crop", ["Dragon Fruit", "", "   "])
def test_unknown_crops_do_not_resolve_to_something_unrelated(crop):
    assert real_market.resolve_mandi_commodity(crop, AVAILABLE) is None


def test_nothing_resolves_when_no_history_is_imported():
    assert real_market.resolve_mandi_commodity("Onion", []) is None


# ------------------------------------------------------------- forecast flow
def history(days=320, markets=("A", "B", "C"), seed=0):
    rng = np.random.default_rng(seed)
    base = 20 * np.exp(np.cumsum(rng.normal(0, 0.015, days)))
    rows = []
    for d in range(days):
        for i, m in enumerate(markets):
            rows.append({"state": "Maharashtra", "district": "X", "market": m, "commodity": "Onion", "variety": "Red",
                         "date": pd.Timestamp("2024-01-01") + pd.Timedelta(days=d),
                         "modalPrice": base[d] * 100 * (1 + 0.01 * i), "modalPricePerKg": base[d] * (1 + 0.01 * i)})
    return pd.DataFrame(rows)


def test_forecast_on_imported_history_returns_the_full_lab_result(monkeypatch):
    monkeypatch.setattr(real_market, "load_mandi_prices", lambda c, s=None, m=None: history())
    out = real_market.forecast_real_market("Onion", None, None, 7)
    assert "error" not in out
    assert out["commodity"] == "Onion" and out["horizon"] == 7 and len(out["forecast"]) == 7
    assert out["dataQuality"]["marketsContributing"] == 3
    assert out["champion"]["model"] in {r["model"] for r in out["leaderboard"]}
    assert any("AGMARKNET" in c for c in out["caveats"])


def test_no_imported_history_is_a_clear_404_with_instructions(monkeypatch):
    monkeypatch.setattr(real_market, "load_mandi_prices", lambda c, s=None, m=None: pd.DataFrame())
    out = real_market.forecast_real_market("Onion", None, None, 7)
    assert "error" in out and "REAL_DATA.md" in out["error"]
    assert classify_error(out["error"]) == 404


def test_too_little_history_is_a_422_that_says_how_much_is_needed(monkeypatch):
    monkeypatch.setattr(real_market, "load_mandi_prices", lambda c, s=None, m=None: history(days=50))
    out = real_market.forecast_real_market("Onion", None, None, 7)
    assert "error" in out and out["minimumDays"] == 120
    assert classify_error(out["error"]) == 422


def test_overview_combines_all_descriptive_analytics(monkeypatch):
    monkeypatch.setattr(real_market, "load_mandi_prices", lambda c, s=None, m=None: history(days=800))
    out = real_market.real_market_overview("Onion", None, None)
    assert {"seasonality", "volatility", "yearOnYear", "marketSpread", "dataQuality"} <= set(out)
    assert out["seasonality"]["yearsOfData"] > 2


def test_overview_without_data_is_a_404(monkeypatch):
    monkeypatch.setattr(real_market, "load_mandi_prices", lambda c, s=None, m=None: pd.DataFrame())
    assert classify_error(real_market.real_market_overview("Onion")["error"]) == 404


def test_stale_history_is_called_out_in_the_caveats(monkeypatch):
    df = history(days=320)
    shift = pd.Timestamp.today().normalize() - pd.Timedelta(days=100) - df["date"].max()
    df["date"] = df["date"] + shift                                 # history ends 100 days ago
    monkeypatch.setattr(real_market, "load_mandi_prices", lambda c, s=None, m=None: df)
    out = real_market.forecast_real_market("Onion", None, None, 7)
    assert out["dataQuality"]["daysSinceLastObservation"] == 100
    assert "ends 100 days ago" in out["caveats"][0]


def test_fresh_history_has_no_staleness_caveat(monkeypatch):
    df = history(days=320)
    df["date"] = df["date"] + (pd.Timestamp.today().normalize() - pd.Timedelta(days=2) - df["date"].max())
    monkeypatch.setattr(real_market, "load_mandi_prices", lambda c, s=None, m=None: df)
    out = real_market.forecast_real_market("Onion", None, None, 7)
    assert not any("ends" in c and "days ago" in c for c in out["caveats"])


def test_commodity_list_reports_how_fresh_each_history_is(monkeypatch):
    from app.services.market import mandi_store

    today = pd.Timestamp.today().normalize()
    docs = [
        {"_id": "onion", "name": "Onion", "rows": 5000, "markets": 40, "first": today - pd.Timedelta(days=800), "last": today - pd.Timedelta(days=2)},
        {"_id": "wheat", "name": "Wheat", "rows": 900, "markets": 12, "first": today - pd.Timedelta(days=400), "last": today - pd.Timedelta(days=90)},
    ]

    class FakeCollection:
        def aggregate(self, pipeline, allowDiskUse=False):
            return iter(docs)

    monkeypatch.setattr(mandi_store, "mandi_prices_collection", FakeCollection())
    rows = {r["commodity"]: r for r in mandi_store.list_mandi_commodities.__wrapped__() }
    assert rows["Onion"]["daysSinceLastRecord"] == 2 and rows["Onion"]["stale"] is False
    assert rows["Wheat"]["daysSinceLastRecord"] == 90 and rows["Wheat"]["stale"] is True


@pytest.mark.parametrize("days,tier", [(50, "insufficient"), (119, "insufficient"), (120, "forecast"), (364, "forecast"),
                                       (365, "forecast_seasonality_unreliable"), (729, "forecast_seasonality_unreliable"), (730, "full")])
def test_readiness_tiers_match_what_the_analysis_actually_needs(days, tier):
    assert real_market.analysis_readiness(days)["tier"] == tier


def test_commodity_list_carries_a_readiness_label(monkeypatch):
    monkeypatch.setattr(real_market, "list_mandi_commodities", lambda: [
        {"commodity": "Onion", "rows": 9000, "markets": 40, "daysSpanned": 900, "firstDate": "a", "lastDate": "b"},
        {"commodity": "Mango", "rows": 90, "markets": 5, "daysSpanned": 60, "firstDate": "a", "lastDate": "b"}])
    rows = real_market.real_market_commodities()
    assert rows[0]["readiness"]["tier"] == "full" and rows[1]["readiness"]["tier"] == "insufficient"
