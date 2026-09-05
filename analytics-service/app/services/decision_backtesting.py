"""
Decision backtesting.

This is a different, complementary evaluation to backtest_price_model /
backtest_demand_model in model_evaluation.py: those backtest the
*forecasting model's* prediction accuracy. This backtests whether
*following the recommendation* would actually have produced a better
outcome than not using it - the thing your plan calls the strongest
potential academic contribution, and the piece that was actually
missing before this phase.

For each historically completed sale, three outcomes are compared:
  - Sell Immediately: the price of the first bid received (the
    baseline of taking the very first offer without waiting at all)
  - Actual Historical Outcome: what the farmer really received
  - AgriTrade Recommendation: computed using only data available up
    to the listing date (no lookahead bias) - if it recommends
    "Wait", the outcome used is the real market-wide price observed
    ~horizon_days later, not an invented number; if it recommends
    "Sell Now", the outcome is the Sell Immediately price.

No transportation, storage, or holding costs are assumed anywhere -
this project doesn't have that data. All outcomes are gross price per
kg only.
"""

import pandas as pd

from app.services.data_loader import load_crops, load_bids, load_transactions
from app.services.price_prediction import _prepare_series
from app.services.decision_engine import (
    DEFAULT_HORIZON_DAYS,
    _forecast_price_as_of,
    _actual_price_after,
    _recommend_sell_or_wait,
)


def _first_bid_price(bids_df: pd.DataFrame, crop_id: str):
    crop_bids = bids_df[bids_df["cropId"] == crop_id].sort_values("createdAt")
    if crop_bids.empty:
        return None
    return float(crop_bids.iloc[0]["amount"])


def backtest_decisions(horizon_days: int = DEFAULT_HORIZON_DAYS) -> dict:
    """
    Backtests AgriTrade's sell-now-vs-wait recommendation against
    baseline strategies over every completed historical sale with
    enough context to evaluate fairly. Cases without enough
    before/after market data are skipped and counted, not silently
    dropped.
    """

    crops = load_crops()
    bids = load_bids()
    transactions = load_transactions()

    if crops.empty or transactions.empty:
        return {"error": "Not enough completed transaction history to backtest decisions."}

    completed = crops[crops["status"] == "completed"].copy()
    if completed.empty:
        return {"error": "No completed sales found to backtest against."}

    if "cropId" not in transactions.columns:
        return {"error": "Transaction records are missing the expected cropId field."}

    tx_by_crop = transactions.drop_duplicates(subset=["cropId"], keep="first").set_index("cropId")

    cases = []
    skipped_insufficient_data = 0
    price_series_cache = {}

    for _, crop in completed.iterrows():
        crop_id = crop["_id"]
        crop_name = crop["cropName"]
        listing_date = crop["createdAt"]
        quantity = crop.get("quantityKg")

        if crop_id not in tx_by_crop.index or not quantity:
            skipped_insufficient_data += 1
            continue

        tx = tx_by_crop.loc[crop_id]
        actual_price_per_kg = float(tx["totalAmount"]) / float(quantity)

        first_bid = _first_bid_price(bids, crop_id)
        sell_immediately_price = first_bid if first_bid is not None else float(crop["basePrice"])

        if crop_name not in price_series_cache:
            price_series_cache[crop_name] = _prepare_series(crop_name)
        series = price_series_cache[crop_name]

        if series.empty:
            skipped_insufficient_data += 1
            continue

        forecasted_price = _forecast_price_as_of(series, listing_date, horizon_days)
        actual_wait_price = _actual_price_after(series, listing_date, horizon_days)

        if forecasted_price is None or actual_wait_price is None:
            skipped_insufficient_data += 1
            continue

        recommendation, reason = _recommend_sell_or_wait(sell_immediately_price, forecasted_price)
        agritrade_outcome = actual_wait_price if recommendation == "Wait" else sell_immediately_price
        best_possible = max(sell_immediately_price, actual_price_per_kg, actual_wait_price)

        cases.append({
            "cropName": crop_name,
            "listingDate": listing_date.strftime("%Y-%m-%d"),
            "actualHistoricalOutcome": round(actual_price_per_kg, 2),
            "sellImmediatelyOutcome": round(sell_immediately_price, 2),
            "agriTradeRecommendation": recommendation,
            "agriTradeReason": reason,
            "agriTradeOutcome": round(agritrade_outcome, 2),
            "bestPossibleOutcome": round(best_possible, 2),
            "regret": round(best_possible - agritrade_outcome, 2),
        })

    if not cases:
        return {
            "error": (
                "Not enough historical data with sufficient before/after "
                "market context to backtest decisions yet."
            ),
            "completedSalesFound": len(completed),
            "skippedInsufficientData": skipped_insufficient_data,
        }

    results_df = pd.DataFrame(cases)

    win_count = int(
        (results_df["agriTradeOutcome"] >= results_df["sellImmediatelyOutcome"]).sum()
    )
    win_rate = round((win_count / len(results_df)) * 100, 2)

    summary = {
        "casesEvaluated": len(results_df),
        "skippedInsufficientData": skipped_insufficient_data,
        "averageOutcome": {
            "sellImmediately": round(results_df["sellImmediatelyOutcome"].mean(), 2),
            "actualHistoricalOutcome": round(results_df["actualHistoricalOutcome"].mean(), 2),
            "agriTradeRecommendation": round(results_df["agriTradeOutcome"].mean(), 2),
        },
        "winRateVsSellImmediately": win_rate,
        "averageRegret": round(results_df["regret"].mean(), 2),
        "downsideRisk": {
            "worstCaseRegret": round(results_df["regret"].max(), 2),
        },
    }

    return {
        "methodology": (
            "For each completed historical sale, AgriTrade's sell-now-vs-wait "
            "recommendation was computed using only data available up to the "
            "listing date (no lookahead). 'Wait' outcomes use the real "
            f"market-wide price observed ~{horizon_days} days later, not an "
            "invented number. No transport, storage, or holding costs are "
            "assumed - this project doesn't have that data, and outcomes "
            "reflect gross price per kg only."
        ),
        "summary": summary,
        "cases": cases,
    }