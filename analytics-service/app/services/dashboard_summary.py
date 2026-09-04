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

    return {
        "totalCrops": total_crops,
        "totalBids": total_bids,
        "totalTransactions": total_transactions,
        "averageCropPrice": average_crop_price,
        "topSellingCrop": top_selling_crop,
        "anomaliesDetected": anomalies_detected,
        "anomalyPercentage": anomaly_percentage
    }