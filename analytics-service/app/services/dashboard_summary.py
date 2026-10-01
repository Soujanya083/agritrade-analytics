import pandas as pd

from app.services.data_loader import (
    load_crops,
    load_bids,
    load_transactions,
)

from app.services.anomaly_detection import detect_bid_anomalies


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

    top_selling_crop = "No data available"

    if not transactions_df.empty:

        possible_crop_columns = [
            "cropName",
            "crop",
            "cropId"
        ]

        crop_column = None

        for column in possible_crop_columns:

            if column in transactions_df.columns:
                crop_column = column
                break

        if crop_column:

            # Find most frequent crop ID/name
            top_crop_value = (
                transactions_df[crop_column]
                .value_counts()
                .idxmax()
            )

            # If transactions already contain cropName
            if crop_column == "cropName":

                top_selling_crop = str(top_crop_value)

            else:

                # Convert crop ID into crop name
                if not crops_df.empty:

                    if "_id" in crops_df.columns and "cropName" in crops_df.columns:

                        matching_crop = crops_df[
                            crops_df["_id"].astype(str)
                            == str(top_crop_value)
                        ]

                        if not matching_crop.empty:

                            top_selling_crop = str(
                                matching_crop.iloc[0]["cropName"]
                            )

                        else:

                            top_selling_crop = str(top_crop_value)

                    else:

                        top_selling_crop = str(top_crop_value)

                else:

                    top_selling_crop = str(top_crop_value)

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

def get_crop_decision_summary(crop_name: str, farmer_state: str = None, quantity_kg: float = None) -> dict:
    """
    One plain-language "what should I do" card for a single crop -
    combines the price forecast, a demand level, and the net-profit
    market recommendation into a single answer, rather than leaving a
    farmer to interpret several separate charts themselves. This is
    the "Final Dashboard" summary the project's original checklist
    called for (Predicted Price / Demand / Best Market / Net Profit /
    "SELL AT MARKET B") - the detailed charts already built are useful
    supporting evidence, but nothing summarized them into one answer
    until this endpoint.
    """
    from app.services.price_prediction import predict_price
    from app.services.recommendation import recommend_crops
    from app.services.market_recommendation import get_market_recommendation

    forecast_result = predict_price(crop_name, days_ahead=7)
    predicted_price = None
    if "forecast" in forecast_result and forecast_result["forecast"]:
        predicted_price = round(forecast_result["forecast"][-1]["yhat"], 2)

    # Demand level: look this crop up among ALL ranked crops, not just
    # the top N - recommend_crops() defaults to a short top-N list for
    # its own "top opportunities" use case, but here we need this one
    # specific crop's score even if it isn't a top pick.
    all_crops_ranked = recommend_crops(top_n=1000)
    demand_level = "Unknown"
    crop_entry = next(
        (c for c in all_crops_ranked if str(c.get("cropName", "")).lower() == crop_name.lower()),
        None,
    )
    if crop_entry:
        opportunity_score = crop_entry.get("opportunityScore", 0)
        if opportunity_score >= 1.5:
            demand_level = "High"
        elif opportunity_score >= 0.7:
            demand_level = "Medium"
        else:
            demand_level = "Low"

    market_rec = get_market_recommendation(crop_name, farmer_state, quantity_kg)

    if "error" in market_rec:
        return {
            "cropName": crop_name,
            "predictedPrice": predicted_price,
            "demandLevel": demand_level,
            "actionText": "Not enough market data available yet to recommend where to sell.",
            "marketRecommendationError": market_rec["error"],
        }

    best = market_rec["recommendedMarket"]
    net_profit = best["expectedNetProfitPerQuintal"]
    action = (
        f"SELL AT {best['market'].upper()}"
        if net_profit > 0
        else "CONSIDER HOLDING — no available market currently covers transport and storage costs"
    )

    return {
        "cropName": crop_name,
        "predictedPrice": predicted_price,
        "demandLevel": demand_level,
        "bestMarket": best["market"],
        "bestMarketDistrict": best["district"],
        "bestMarketState": best["state"],
        "expectedNetProfitPerQuintal": net_profit,
        "expectedTotalNetProfit": best.get("expectedTotalNetProfit"),
        "actionText": action,
        "assumptions": market_rec["assumptions"],
    }