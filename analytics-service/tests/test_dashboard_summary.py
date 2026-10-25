"""Dashboard summary + the per-crop 'what does this mean for me?' decision summary."""
import pandas as pd

from app.services import (
    dashboard_summary,
    decision_engine,
    market_insights,
    market_recommendation,
    model_evaluation,
    price_prediction,
    recommendation,
)


def crops_df():
    return pd.DataFrame({
        "_id": ["c1", "c2", "c3", "c4"],
        "cropName": ["Onion", "Onion", "Wheat", "Tomato"],
        "currentBid": [20.0, 22.0, 30.0, 15.0],
        "basePrice": [18.0, 20.0, 28.0, 14.0],
    })


def tx_df():
    # every transaction references a DIFFERENT listing (a listing sells once) -
    # the situation in which the old cropId-based "most popular" was arbitrary.
    return pd.DataFrame({"cropId": ["c1", "c2", "c3", "c4"[:2] and "c4"], "status": ["delivery_completed"] * 4})


# ------------------------------------------------------ most popular crop
def test_most_sold_crop_counts_by_name_not_by_listing_id():
    # Onion sold twice (two listings), others once. Counting cropId gives 1 each.
    assert market_insights.most_sold_crop_name(tx_df(), crops_df()) == "Onion"


def test_most_sold_crop_is_none_without_data():
    assert market_insights.most_sold_crop_name(pd.DataFrame(), crops_df()) is None
    assert market_insights.most_sold_crop_name(tx_df(), pd.DataFrame()) is None


# ------------------------------------------------------ dashboard summary
def test_dashboard_summary_returns_a_dict_not_none(monkeypatch):
    """Regression: the function had no return statement, so the endpoint returned null."""
    monkeypatch.setattr(dashboard_summary, "load_crops", crops_df)
    monkeypatch.setattr(dashboard_summary, "load_bids", lambda: pd.DataFrame({"_id": ["b1", "b2"]}))
    monkeypatch.setattr(dashboard_summary, "load_transactions", tx_df)
    monkeypatch.setattr(dashboard_summary, "detect_bid_anomalies",
                        lambda: {"anomaliesDetected": 1, "anomalyPercentage": 50.0})

    result = dashboard_summary.get_dashboard_summary()

    assert isinstance(result, dict)
    assert result["totalCrops"] == 4
    assert result["totalBids"] == 2
    assert result["totalTransactions"] == 4
    assert result["topSellingCrop"] == "Onion"
    assert result["anomaliesDetected"] == 1
    assert result["averageCropPrice"] == 21.75


# ------------------------------------------------------ decision summary
FORECAST = {
    "model": "Prophet", "historyPoints": 60,
    "forecast": [{"ds": "2026-10-08", "yhat": 24.0, "yhat_lower": 20.0, "yhat_upper": 28.0}] * 7,
}
MARKET = {
    "recommendedMarket": {
        "market": "Lasalgaon", "district": "Nashik", "state": "Maharashtra",
        "modalPricePerQuintal": 2400.0, "transportCostPerQuintal": 80, "storageCostPerQuintal": 30,
        "expectedNetProfitPerQuintal": 2290.0, "expectedTotalNetProfit": 11450.0,
    },
    "assumptions": {"note": "flat-rate assumptions"},
    "source": "cached_snapshot",
}


def patch_services(monkeypatch, forecast=FORECAST, market=MARKET, backtest_beats=True):
    monkeypatch.setattr(price_prediction, "predict_price", lambda crop, days_ahead=7: dict(forecast))
    monkeypatch.setattr(decision_engine, "get_sell_or_wait_recommendation", lambda crop, h=7: {
        "currentPrice": 22.0, "recommendation": "Sell Now", "reason": "Only 1.0% change.", "horizonDays": 7})
    monkeypatch.setattr(model_evaluation, "backtest_price_model",
                        lambda crop, d=7: {"bestModelBeatsNaiveBaseline": backtest_beats})
    monkeypatch.setattr(recommendation, "recommend_crops", lambda location=None, top_n=5: [
        {"cropName": "Onion", "opportunityScore": 2.0}])
    monkeypatch.setattr(market_recommendation, "get_market_recommendation", lambda *a, **k: dict(market))


def test_decision_summary_exposes_all_headline_numbers(monkeypatch):
    patch_services(monkeypatch)
    s = dashboard_summary.get_crop_decision_summary("Onion", "Maharashtra", 500)

    assert s["predictedPrice"] == 24.0
    assert s["demandLevel"] == "High"
    assert s["bestMarket"] == "Lasalgaon"
    # revenue = 2400/quintal * 500kg / 100 ; cost = (80+30)/quintal * 500kg / 100
    assert s["expectedRevenue"] == 12000.0
    assert s["expectedCost"] == 550.0
    assert s["expectedNetProfit"] == 11450.0
    assert s["expectedRevenue"] - s["expectedCost"] == s["expectedNetProfit"]
    assert s["actionText"].startswith("SELL AT LASALGAON")
    assert s["timing"]["recommendation"] == "Sell Now"


def test_platform_forecast_uses_the_real_5_percent_fee(monkeypatch):
    patch_services(monkeypatch)
    s = dashboard_summary.get_crop_decision_summary("Onion", None, 100)
    assert s["platformForecast"] == {"expectedRevenue": 2400.0, "platformFeePercent": 5, "expectedPayout": 2280.0}


def test_confidence_and_limitations_are_always_present(monkeypatch):
    patch_services(monkeypatch)
    s = dashboard_summary.get_crop_decision_summary("Onion", None, None)
    assert s["confidence"]["level"] in {"Low", "Medium", "High"}
    assert s["confidence"]["reasons"]
    assert any("flat-rate" in item for item in s["limitations"])


def test_confidence_is_lower_when_model_does_not_beat_naive_baseline(monkeypatch):
    patch_services(monkeypatch, backtest_beats=True)
    high = dashboard_summary.get_crop_decision_summary("Onion", None, None)["confidence"]["level"]
    dashboard_summary  # (cache cleared between calls below)
    from app.utils.ttl_cache import clear_cache
    clear_cache()
    patch_services(monkeypatch, backtest_beats=False)
    low = dashboard_summary.get_crop_decision_summary("Onion", None, None)["confidence"]
    order = {"Low": 0, "Medium": 1, "High": 2}
    assert order[low["level"]] <= order[high]
    assert any("did NOT beat" in r for r in low["reasons"])


def test_totals_are_omitted_without_a_quantity_instead_of_invented(monkeypatch):
    patch_services(monkeypatch, market={**MARKET, "recommendedMarket": {
        **MARKET["recommendedMarket"], "expectedTotalNetProfit": None}})
    s = dashboard_summary.get_crop_decision_summary("Onion", None, None)
    assert "expectedRevenue" not in s and "expectedCost" not in s and "platformForecast" not in s


def test_summary_degrades_when_forecast_is_unavailable(monkeypatch):
    patch_services(monkeypatch, forecast={"error": "No valid price history found for crop 'Onion'."})
    s = dashboard_summary.get_crop_decision_summary("Onion", None, 100)
    assert s["predictedPrice"] is None
    assert s["bestMarket"] == "Lasalgaon"            # the rest still works
    assert any("No valid price history" in w for w in s["warnings"])
    assert s["confidence"]["level"] == "Low"


def test_holds_when_no_market_covers_costs(monkeypatch):
    losing = {**MARKET, "recommendedMarket": {**MARKET["recommendedMarket"], "expectedNetProfitPerQuintal": -10.0}}
    patch_services(monkeypatch, market=losing)
    s = dashboard_summary.get_crop_decision_summary("Onion", None, None)
    assert s["actionText"].startswith("CONSIDER HOLDING")


def test_error_only_when_nothing_at_all_can_be_computed(monkeypatch):
    patch_services(monkeypatch, forecast={"error": "No valid price history found."},
                   market={"error": "No mandi price records found for commodity='Ghost'"})
    monkeypatch.setattr(recommendation, "recommend_crops", lambda location=None, top_n=5: [])
    s = dashboard_summary.get_crop_decision_summary("Ghost", None, None)
    assert "error" in s


# ------------------------------------------------------ stale history is never shown as a forecast for today
def fake_real(last_date):
    point = {"point": 14.0, "lower": 10.3, "upper": 17.7}
    return {"commodity": "Onion", "scope": "All India", "result": {
        "forecast": [point] * 7, "lastObserved": {"date": last_date, "price": 14.0},
        "champion": {"label": "Naive (last price)", "beatsNaive": False, "reason": "none beat naive"},
        "intervalCoverage": {"empirical": None}, "dataQuality": {"daysInSeries": 126}}}


def test_a_forecast_from_old_history_is_withheld_and_the_reason_is_shown(monkeypatch):
    patch_services(monkeypatch)
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda crop, state: fake_real("2025-06-11"))
    s = dashboard_summary.get_crop_decision_summary("Onion", "Tamil Nadu", 500)
    assert s["predictedPrice"] is None and s["predictedPriceModel"] is None
    assert s["predictedPriceSource"] == "unavailable_stale_history"
    assert s["staleHistory"]["lastDate"] == "2025-06-11" and "No price forecast is shown" in s["forecastUnavailableReason"]
    assert s["timing"]["recommendation"] == "No reliable forecast"
    assert s["confidence"]["level"] == "Low" and "platformForecast" not in s
    assert s["marketplacePredictedPrice"] is not None          # still available as a labelled comparison


def test_recent_history_still_gives_a_real_forecast(monkeypatch):
    from datetime import date, timedelta
    patch_services(monkeypatch)
    recent = (date.today() - timedelta(days=3)).isoformat()
    monkeypatch.setattr(dashboard_summary, "_real_market_signal", lambda crop, state: fake_real(recent))
    s = dashboard_summary.get_crop_decision_summary("Onion", "Tamil Nadu", 500)
    assert s["predictedPrice"] == 14.0 and s["predictedPriceSource"] == "agmarknet_real" and s["staleHistory"] is None


def test_todays_mandi_price_is_shown_when_the_market_data_has_a_median(monkeypatch):
    patch_services(monkeypatch, market={**MARKET, "medianModalPricePerKg": 41.5, "dataAsOf": "2026-10-24", "marketsCompared": 30})
    s = dashboard_summary.get_crop_decision_summary("Onion", "Tamil Nadu", 500)
    assert s["todayMandiPrice"]["pricePerKg"] == 41.5 and s["todayMandiPrice"]["asOf"] == "2026-10-24"
