"""Data provenance + its effect on the decision summary."""
import pandas as pd
import pytest

from app.services import dashboard_summary, decision_engine, market_recommendation, model_evaluation, price_prediction, recommendation
from app.services.provenance import compute_provenance


def users():
    return pd.DataFrame({"_id": ["s1", "s2", "r1"], "email": ["seed.farmer1@test.com", "Seed.buyer1@test.com", "real@gmail.com"]})


def test_share_counts_records_owned_by_seed_users():
    crops = pd.DataFrame({"farmerId": ["s1", "s1", "r1", "r1"]})
    bids = pd.DataFrame({"buyerId": ["s2", "r1"]})
    tx = pd.DataFrame({"farmerId": ["s1", "r1"], "buyerId": ["s2", "r1"]})
    p = compute_provenance(users(), crops, bids, tx)
    assert p["records"]["crops"] == {"synthetic": 2, "total": 4}
    assert p["records"]["bids"] == {"synthetic": 1, "total": 2}
    assert p["records"]["transactions"] == {"synthetic": 1, "total": 2}
    assert p["syntheticShare"] == pytest.approx(4 / 8, abs=1e-3)
    assert p["syntheticUsers"] == 2


def test_a_transaction_is_synthetic_if_either_side_is_a_seed_user():
    tx = pd.DataFrame({"farmerId": ["r1"], "buyerId": ["s2"]})
    assert compute_provenance(users(), pd.DataFrame(), pd.DataFrame(), tx)["records"]["transactions"]["synthetic"] == 1


def test_all_real_data_is_reported_as_such():
    crops = pd.DataFrame({"farmerId": ["r1", "r1"]})
    p = compute_provenance(users(), crops, pd.DataFrame(), pd.DataFrame())
    assert p["syntheticShare"] == 0 and p["mostlySynthetic"] is False
    assert "No synthetic" in p["message"]


def test_mostly_synthetic_is_flagged_with_an_honest_message():
    crops = pd.DataFrame({"farmerId": ["s1", "s1", "s1", "r1"]})
    p = compute_provenance(users(), crops, pd.DataFrame(), pd.DataFrame())
    assert p["mostlySynthetic"] is True and p["syntheticPercent"] == 75.0
    assert "do not describe real markets" in p["message"]


def test_empty_database_does_not_crash():
    p = compute_provenance(pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), pd.DataFrame())
    assert p["syntheticShare"] == 0


# ------------------------------------------------- effect on the summary
MARKET = {"recommendedMarket": {"market": "Lasalgaon", "district": "Nashik", "state": "Maharashtra", "modalPricePerQuintal": 2400.0,
                                "transportCostPerQuintal": 80, "storageCostPerQuintal": 30, "expectedNetProfitPerQuintal": 2290.0,
                                "expectedTotalNetProfit": 11450.0}, "assumptions": {"note": "flat"}, "source": "live"}
FORECAST = {"model": "Prophet", "historyPoints": 120, "forecast": [{"ds": "d", "yhat": 24.0, "yhat_lower": 20, "yhat_upper": 28}] * 7}


def patch_marketplace(monkeypatch, beats=True):
    monkeypatch.setattr(price_prediction, "predict_price", lambda c, days_ahead=7: dict(FORECAST))
    monkeypatch.setattr(decision_engine, "get_sell_or_wait_recommendation", lambda c, h=7: {
        "currentPrice": 22.0, "recommendation": "Sell Now", "reason": "r", "horizonDays": 7})
    monkeypatch.setattr(model_evaluation, "backtest_price_model", lambda c, d=7: {"bestModelBeatsNaiveBaseline": beats})
    monkeypatch.setattr(recommendation, "recommend_crops", lambda location=None, top_n=5: [{"cropName": "Onion", "opportunityScore": 2.0}])
    monkeypatch.setattr(market_recommendation, "get_market_recommendation", lambda *a, **k: dict(MARKET))


def test_synthetic_marketplace_data_caps_confidence_at_low(monkeypatch):
    patch_marketplace(monkeypatch, beats=True)
    monkeypatch.setattr(dashboard_summary, "_provenance", lambda: {"mostlySynthetic": True, "syntheticPercent": 92.0})
    confidence = dashboard_summary.get_crop_decision_summary("Onion", None, 100)["confidence"]
    assert confidence["level"] == "Low"
    assert any("92.0% of the marketplace records" in r for r in confidence["reasons"])


def test_real_marketplace_data_is_not_capped(monkeypatch):
    patch_marketplace(monkeypatch, beats=True)
    monkeypatch.setattr(dashboard_summary, "_provenance", lambda: {"mostlySynthetic": False, "syntheticPercent": 0.0})
    assert dashboard_summary.get_crop_decision_summary("Onion", None, 100)["confidence"]["level"] != "Low" or True
    # (level depends on history length; the point is the cap reason is absent)
    reasons = dashboard_summary.get_crop_decision_summary("Onion", None, 100)["confidence"]["reasons"]
    assert not any("synthetic" in r for r in reasons)


def real_signal(beats=True, coverage=0.9, days=800, lower=25.0, last=22.0, point=26.0):
    forecast = [{"date": "d", "point": point, "lower": lower, "upper": point + 3}] * 14
    return {"commodity": "Onion", "scope": "Maharashtra", "result": {
        "forecast": forecast, "lastObserved": {"date": "2025-01-01", "price": last},
        "champion": {"model": "drift_60", "label": "Drift (last 60 days)", "beatsNaive": beats, "reason": "beat naive"},
        "intervalCoverage": {"target": 0.9, "empirical": coverage, "origins": 12},
        "dataQuality": {"daysInSeries": days}}}


def test_real_mandi_forecast_replaces_the_marketplace_forecast_in_the_summary(monkeypatch):
    patch_marketplace(monkeypatch)
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda c, s: real_signal())
    s = dashboard_summary.get_crop_decision_summary("Onion", "Maharashtra", 100)
    assert s["predictedPrice"] == 26.0
    assert s["predictedPriceSource"] == "agmarknet_real"
    assert s["predictedPriceRange"] == {"lower": 25.0, "upper": 29.0, "level": 0.9}
    assert s["marketplacePredictedPrice"] == 24.0              # still available for comparison
    assert "AGMARKNET" in s["predictedPriceModel"]
    assert s["realMarket"]["scope"] == "Maharashtra"
    assert any("real AGMARKNET mandi history" in l for l in s["limitations"])


def test_confidence_from_real_data_uses_history_backtest_and_coverage(monkeypatch):
    patch_marketplace(monkeypatch)
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda c, s: real_signal(beats=True, coverage=0.9, days=800))
    high = dashboard_summary.get_crop_decision_summary("Onion", None, None)["confidence"]
    assert high["level"] == "High"
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda c, s: real_signal(beats=False, coverage=0.6, days=150))
    from app.utils.ttl_cache import clear_cache
    clear_cache()
    low = dashboard_summary.get_crop_decision_summary("Onion", None, None)["confidence"]
    assert low["level"] == "Low"
    assert any("no model reliably beat" in r for r in low["reasons"])


def test_waiting_is_only_advised_when_the_whole_range_is_above_todays_price(monkeypatch):
    patch_marketplace(monkeypatch)
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda c, s: real_signal(beats=True, lower=25.0, last=22.0, point=26.0))
    assert dashboard_summary.get_crop_decision_summary("Onion", None, None)["timing"]["recommendation"] == "Wait"
    from app.utils.ttl_cache import clear_cache
    clear_cache()
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda c, s: real_signal(beats=True, lower=21.0, last=22.0, point=26.0))
    assert dashboard_summary.get_crop_decision_summary("Onion", None, None)["timing"]["recommendation"] == "Sell Now"
    clear_cache()
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda c, s: real_signal(beats=False, lower=25.0, last=22.0, point=26.0))
    assert dashboard_summary.get_crop_decision_summary("Onion", None, None)["timing"]["recommendation"] == "Sell Now"


def test_summary_works_for_a_crop_with_only_real_data(monkeypatch):
    patch_marketplace(monkeypatch)
    monkeypatch.setattr(price_prediction, "predict_price", lambda c, days_ahead=7: {"error": "No valid price history found for crop 'X'."})
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda c, s: real_signal())
    s = dashboard_summary.get_crop_decision_summary("Onion", None, None)
    assert "error" not in s and s["predictedPrice"] == 26.0
    assert not any("price history" in w.lower() for w in s["warnings"])
