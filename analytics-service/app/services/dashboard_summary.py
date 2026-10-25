import pandas as pd

from app.services.data_loader import (
    load_crops,
    load_bids,
    load_transactions,
)

from app.services.anomaly_detection import detect_bid_anomalies
from app.services.market_insights import most_sold_crop_name
from app.utils.ttl_cache import ttl_cache

PLATFORM_FEE_PERCENT = 5  # mirrors platformFee = 5% in server/server.js


@ttl_cache(seconds=120)
def get_dashboard_summary() -> dict:
    """
    Generate an overall analytics summary for the AgriTrade dashboard.
    """

    # Load data
    crops_df = load_crops()
    bids_df = load_bids()
    transactions_df = load_transactions()

    # -----------------------------------
    # Total counts
    # -----------------------------------

    total_crops = len(crops_df)
    total_bids = len(bids_df)
    total_transactions = len(transactions_df)

    # -----------------------------------
    # Average crop price
    # -----------------------------------

    average_crop_price = 0

    possible_price_columns = [
        "currentBid",
        "price",
        "amount"
    ]

    for column in possible_price_columns:

        if column in crops_df.columns:

            prices = pd.to_numeric(
                crops_df[column],
                errors="coerce"
            )

            if prices.notna().any():

                average_crop_price = round(
                    float(prices.mean()),
                    2
                )

            break

    # -----------------------------------
    # Find top selling crop
    # -----------------------------------

    top_selling_crop = most_sold_crop_name(transactions_df, crops_df) or "No data available"

    # -----------------------------------
    # Anomaly detection summary
    # -----------------------------------

    anomaly_result = detect_bid_anomalies()

    anomalies_detected = anomaly_result.get(
        "anomaliesDetected",
        0
    )

    anomaly_percentage = anomaly_result.get(
        "anomalyPercentage",
        0
    )

    # -----------------------------------
    # Final dashboard response
    # -----------------------------------
    # (This return was missing in the original: the function ended after
    # computing everything, so GET /dashboard-summary returned `null`.)

    return {
        "totalCrops": total_crops,
        "totalBids": total_bids,
        "totalTransactions": total_transactions,
        "averageCropPrice": average_crop_price,
        "topSellingCrop": top_selling_crop,
        "anomaliesDetected": anomalies_detected,
        "anomalyPercentage": anomaly_percentage,
    }


STALE_REAL_FORECAST_DAYS = 45   # a forecast learned from history older than this does not describe today


def _history_age_days(real, today=None):
    """Days between the last real observation and today (None if unknown)."""
    from datetime import date
    try:
        last = date.fromisoformat(str(real["result"]["lastObserved"]["date"])[:10])
    except (KeyError, TypeError, ValueError):
        return None
    return ((today or date.today()) - last).days


def _real_market_signal(crop_name, farmer_state):
    """
    Forecast from REAL imported AGMARKNET history for this crop, or None when
    none has been imported (the summary then falls back to marketplace data).
    State-level history is preferred; All-India is the fallback.
    """
    try:
        from app.services.market import real_market

        names = [c["commodity"] for c in real_market.real_market_commodities()]
        commodity = real_market.resolve_mandi_commodity(crop_name, names)
        if not commodity:
            return None
        scopes = ([farmer_state] if farmer_state else []) + [None]
        for scope in scopes:
            result = real_market.forecast_real_market(commodity, scope, None, 14)
            if "error" not in result:
                return {"commodity": commodity, "scope": scope or "All India", "result": result}
    except Exception:  # DB not reachable etc. - the summary must still work
        return None
    return None


def _provenance():
    try:
        from app.services.provenance import get_data_provenance

        return get_data_provenance()
    except Exception:
        return None


def _confidence_real(real):
    """Confidence for a forecast learned from real AGMARKNET history - rule and reasons are returned."""
    result = real["result"]
    days = result["dataQuality"].get("daysInSeries", 0)
    reasons, score = [], 0
    if days >= 730:
        score += 2
        reasons.append(f"{days} days (~{days / 365:.1f} years) of real mandi history.")
    elif days >= 365:
        score += 1
        reasons.append(f"{days} days of real mandi history (about a year).")
    else:
        reasons.append(f"Only {days} days of real mandi history.")
    if result["champion"]["beatsNaive"]:
        score += 2
        reasons.append("Backtest: " + result["champion"]["reason"])
    else:
        reasons.append("Backtest: no model reliably beat 'price stays where it is', so that is the forecast. "
                       "Treat the range, not the point, as the message.")
    coverage = result["intervalCoverage"].get("empirical")
    if coverage is not None and coverage >= 0.8:
        score += 1
        reasons.append(f"Out-of-sample check: the 90% range contained the real price {coverage * 100:.0f}% of the time.")
    elif coverage is not None:
        reasons.append(f"The 90% range contained the real price only {coverage * 100:.0f}% of the time in testing.")
    level = "High" if score >= 4 else "Medium" if score >= 2 else "Low"
    return {"level": level, "reasons": reasons}


def _confidence(history_points, model_name, beats_naive):
    """Transparent rule-of-thumb confidence label - the rule is returned with it."""
    reasons = []
    score = 0
    if history_points is None:
        reasons.append("No marketplace price history for this crop.")
    elif history_points >= 45:
        score += 2
        reasons.append(f"{history_points} days of price history.")
    elif history_points >= 15:
        score += 1
        reasons.append(f"Only {history_points} days of price history.")
    else:
        reasons.append(f"Very little price history ({history_points} days).")

    if beats_naive is True:
        score += 1
        reasons.append("Backtest: the model beat the naive baseline.")
    elif beats_naive is False:
        reasons.append("Backtest: the model did NOT beat the naive baseline.")
    else:
        reasons.append("Backtest accuracy unavailable for this crop.")

    if model_name and "Fallback" in model_name:
        reasons.append("Simple linear-trend fallback used instead of Prophet.")
    else:
        score += 1 if model_name else 0

    level = "High" if score >= 4 else "Medium" if score >= 2 else "Low"
    return {"level": level, "reasons": reasons}


def _cap_for_synthetic(confidence, provenance):
    """Forecasts learned mostly from synthetic demo data can never be 'High'/'Medium'."""
    if provenance and provenance.get("mostlySynthetic"):
        return {
            "level": "Low",
            "reasons": confidence["reasons"] + [
                f"{provenance['syntheticPercent']}% of the marketplace records this forecast learned from are synthetic demo data."],
        }
    return confidence


def _demand_level(crop_name):
    from app.services.recommendation import recommend_crops

    ranked = recommend_crops(top_n=1000)
    entry = next((c for c in ranked if str(c.get("cropName", "")).lower() == crop_name.lower()), None)
    if not entry:
        return "Unknown", None
    score = entry.get("opportunityScore", 0)
    level = "High" if score >= 1.5 else "Medium" if score >= 0.7 else "Low"
    return level, round(float(score), 2)


def get_crop_decision_summary(crop_name: str, farmer_state: str = None, quantity_kg: float = None) -> dict:
    """
    One plain-language "what should I do?" answer for a single crop,
    assembled ONLY from values the project actually computes:

      * predicted price  - Prophet / linear forecast on marketplace listings
      * demand level     - demand-vs-supply opportunity score (recommendation.py)
      * best market      - real AGMARKNET mandi prices minus disclosed
                           flat transport/storage assumptions
      * revenue / cost / net profit - from that best market's modal price
      * sell-or-wait     - decision_engine.py's rule on the same price series
      * confidence       - derived from history length + backtest result

    If a component can't be computed it is left out and listed in
    `warnings`; nothing is filled in with a made-up value. Raises-by-
    return {"error": ...} only if NOTHING could be computed for the crop.
    """
    from app.services.price_prediction import predict_price
    from app.services.market_recommendation import get_market_recommendation
    from app.services.decision_engine import get_sell_or_wait_recommendation
    from app.services.model_evaluation import backtest_price_model

    warnings = []
    forecast = predict_price(crop_name, days_ahead=7)
    if "error" in forecast:
        warnings.append(forecast["error"])
        forecast = None

    predicted_price = model_name = history_points = None
    if forecast and forecast.get("forecast"):
        predicted_price = round(forecast["forecast"][-1]["yhat"], 2)
        model_name = forecast.get("model")
        history_points = forecast.get("historyPoints")

    sell_wait = get_sell_or_wait_recommendation(crop_name)
    if "error" in sell_wait:
        sell_wait = None

    beats_naive = None
    if forecast:
        backtest = backtest_price_model(crop_name)
        if "error" not in backtest:
            beats_naive = backtest.get("bestModelBeatsNaiveBaseline")

    demand_level, opportunity_score = _demand_level(crop_name)
    market_rec = get_market_recommendation(crop_name, farmer_state, quantity_kg)

    real = _real_market_signal(crop_name, farmer_state)
    stale_history = None
    if real:
        age = _history_age_days(real)
        if age is not None and age > STALE_REAL_FORECAST_DAYS:
            # Do NOT present a forecast learned from old data as a forecast for today.
            stale_history = {
                "commodity": real["commodity"], "scope": real["scope"],
                "lastDate": real["result"]["lastObserved"]["date"], "ageDays": age,
                "message": (f"The real mandi price history for {real['commodity']} ends on "
                            f"{str(real['result']['lastObserved']['date'])[:10]} ({age} days ago), so a forecast from it would "
                            "describe that date, not today. No price forecast is shown."),
            }
            real = None

    if real is None and forecast is None and "error" in market_rec and demand_level == "Unknown":
        return {"error": f"No marketplace or mandi data found for crop '{crop_name}'."}

    provenance = _provenance()
    price_source = "marketplace_listings"
    price_range = None
    real_confidence = None
    marketplace_price = predicted_price
    if stale_history:
        predicted_price = None
        model_name = None
        price_source = "unavailable_stale_history"
    if real:
        point = real["result"]["forecast"][min(6, len(real["result"]["forecast"]) - 1)]
        predicted_price = round(point["point"], 2)
        price_range = {"lower": point["lower"], "upper": point["upper"], "level": 0.9}
        model_name = real["result"]["champion"]["label"] + " (AGMARKNET)"
        history_points = real["result"]["dataQuality"].get("daysInSeries")
        price_source = "agmarknet_real"
        real_confidence = _confidence_real(real)
        warnings = [w for w in warnings if "price history" not in w.lower()]

    summary = {
        "cropName": crop_name,
        "predictedPrice": predicted_price,              # INR per kg, +7 days
        "predictedPriceModel": model_name,
        "predictedPriceSource": price_source,           # agmarknet_real | marketplace_listings
        "predictedPriceRange": price_range,
        "marketplacePredictedPrice": marketplace_price if (real or stale_history) else None,
        "forecastUnavailableReason": stale_history["message"] if stale_history else None,
        "staleHistory": stale_history,
        "dataProvenance": provenance,
        "realMarket": None if not real else {
            "commodity": real["commodity"], "scope": real["scope"],
            "lastObserved": real["result"]["lastObserved"],
            "champion": real["result"]["champion"],
            "intervalCoverage": real["result"]["intervalCoverage"],
            "dataQuality": real["result"]["dataQuality"],
        },
        "currentMarketplacePrice": sell_wait["currentPrice"] if sell_wait else None,
        "demandLevel": demand_level,
        "opportunityScore": opportunity_score,
        "quantityKg": quantity_kg,
        "confidence": real_confidence or (
            {"level": "Low", "reasons": [stale_history["message"], "Today's prices below are live; the forecast is withheld."]}
            if stale_history else _cap_for_synthetic(_confidence(history_points, model_name, beats_naive), provenance)),
        "limitations": [
            ("Price forecast is learned from real AGMARKNET mandi history (" + real["scope"] + "), not from this marketplace's listings."
             if real else
             "Price forecast is learned from this marketplace's own listings only; it is not a national price forecast."),
            "Transport and storage costs are disclosed flat-rate assumptions, not measured logistics data.",
            "Mandi prices come from AGMARKNET (data.gov.in); the source is shown below.",
            "Decision support, not a guarantee of outcome.",
        ],
        "warnings": warnings,
    }

    # Sell-now-or-wait signal on the marketplace price series.
    if sell_wait:
        summary["timing"] = {
            "recommendation": sell_wait["recommendation"],
            "reason": sell_wait["reason"],
            "horizonDays": sell_wait["horizonDays"],
        }

    if stale_history:
        summary["timing"] = {
            "recommendation": "No reliable forecast",
            "reason": "The price history behind the forecast is too old to say where prices are heading from today. Use today's prices below.",
            "horizonDays": 7,
            "basis": "stale_history",
        }

    # With real AGMARKNET history the timing signal comes from THAT forecast: only
    # "Wait" when the whole 90% range sits above today's price and a model beat naive.
    if real:
        result = real["result"]
        last = result["lastObserved"]["price"]
        point = result["forecast"][min(6, len(result["forecast"]) - 1)]
        gain_pct = (point["point"] / last - 1) * 100 if last else 0
        confident_rise = result["champion"]["beatsNaive"] and point["lower"] > last and gain_pct >= 3
        summary["timing"] = {
            "recommendation": "Wait" if confident_rise else "Sell Now",
            "reason": (f"The forecast range (Rs.{point['lower']}-{point['upper']}/kg) is entirely above today's Rs.{last}/kg."
                       if confident_rise else
                       "No statistically reliable price rise is forecast, so waiting adds risk without an expected gain."),
            "horizonDays": 7,
            "basis": "agmarknet_real",
        }
        summary["currentMarketplacePrice"] = summary.get("currentMarketplacePrice")
        summary["currentMandiPrice"] = last

    # What selling on THIS platform at the forecast price would look like.
    if predicted_price is not None and quantity_kg:
        gross = round(predicted_price * quantity_kg, 2)
        fee = round(gross * PLATFORM_FEE_PERCENT / 100, 2)
        summary["platformForecast"] = {
            "expectedRevenue": gross,
            "platformFeePercent": PLATFORM_FEE_PERCENT,
            "expectedPayout": round(gross - fee, 2),
        }

    if "error" in market_rec:
        warnings.append(market_rec["error"])
        summary["actionText"] = "Not enough market data available yet to recommend where to sell."
        summary["marketRecommendationError"] = market_rec["error"]
        return summary

    if market_rec.get("medianModalPricePerKg") is not None:
        summary["todayMandiPrice"] = {
            "pricePerKg": market_rec["medianModalPricePerKg"], "asOf": market_rec.get("dataAsOf"),
            "source": market_rec.get("source"), "marketsCompared": market_rec.get("marketsCompared"),
            "retailStyleMarketsLeftOut": market_rec.get("retailStyleMarketsLeftOut", 0),
        }

    best = market_rec["recommendedMarket"]
    net_per_quintal = best["expectedNetProfitPerQuintal"]
    per_quintal_cost = best["transportCostPerQuintal"] + best["storageCostPerQuintal"]

    summary.update({
        "bestMarket": best["market"],
        "bestMarketDistrict": best["district"],
        "bestMarketState": best["state"],
        "bestMarketModalPricePerQuintal": best["modalPricePerQuintal"],
        "expectedNetProfitPerQuintal": net_per_quintal,
        "expectedTotalNetProfit": best.get("expectedTotalNetProfit"),
        "mandiDataSource": market_rec.get("source"),
        "mandiDataAsOf": market_rec.get("dataAsOf"),
        "assumptions": market_rec["assumptions"],
    })
    if quantity_kg:
        summary["expectedRevenue"] = round(best["modalPricePerQuintal"] * quantity_kg / 100, 2)
        summary["expectedCost"] = round(per_quintal_cost * quantity_kg / 100, 2)
        summary["expectedNetProfit"] = best.get("expectedTotalNetProfit")

    if net_per_quintal > 0:
        action = f"SELL AT {best['market'].upper()}"
        if summary.get("timing", {}).get("recommendation") == "Wait":
            action += f" - but the marketplace trend suggests waiting: {summary['timing']['reason']}"
    else:
        action = "CONSIDER HOLDING - no available market currently covers transport and storage costs"
    summary["actionText"] = action
    return summary
