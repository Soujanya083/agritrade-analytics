import pandas as pd

from app.services.data_loader import (
    load_crops,
    load_bids,
    load_transactions,
)


def get_market_insights() -> dict:
    """
    Generate useful marketplace insights from crops, bids,
    and transaction data.
    """

    crops_df = load_crops()
    bids_df = load_bids()
    transactions_df = load_transactions()

    # -----------------------------------
    # MARKET STATUS
    # -----------------------------------

    total_activity = len(bids_df) + len(transactions_df)

    if total_activity >= 200:
        market_status = "Highly Active"
    elif total_activity >= 100:
        market_status = "Active"
    elif total_activity > 0:
        market_status = "Moderate"
    else:
        market_status = "Inactive"

    # -----------------------------------
    # BID INSIGHTS
    # -----------------------------------

    average_bid_amount = 0
    highest_bid = 0
    lowest_bid = 0

    possible_bid_columns = [
        "bidAmount",
        "amount",
        "price"
    ]

    bid_column = None

    for column in possible_bid_columns:
        if column in bids_df.columns:
            bid_column = column
            break

    if bid_column is not None and not bids_df.empty:

        bid_values = pd.to_numeric(
            bids_df[bid_column],
            errors="coerce"
        ).dropna()

        if not bid_values.empty:

            average_bid_amount = round(
                float(bid_values.mean()),
                2
            )

            highest_bid = round(
                float(bid_values.max()),
                2
            )

            lowest_bid = round(
                float(bid_values.min()),
                2
            )

    # -----------------------------------
    # MOST POPULAR CROP
    # -----------------------------------

    most_popular_crop = "No data available"

    if not transactions_df.empty:

        crop_column = None

        possible_crop_columns = [
            "cropName",
            "crop",
            "cropId"
        ]

        for column in possible_crop_columns:
            if column in transactions_df.columns:
                crop_column = column
                break

        if crop_column is not None:

            top_crop_value = (
                transactions_df[crop_column]
                .value_counts()
                .idxmax()
            )

            # If crop name already exists
            if crop_column == "cropName":

                most_popular_crop = str(top_crop_value)

            # Convert cropId to cropName
            elif (
                not crops_df.empty
                and "_id" in crops_df.columns
                and "cropName" in crops_df.columns
            ):

                matching_crop = crops_df[
                    crops_df["_id"].astype(str)
                    == str(top_crop_value)
                ]

                if not matching_crop.empty:

                    most_popular_crop = str(
                        matching_crop.iloc[0]["cropName"]
                    )

                else:

                    most_popular_crop = str(top_crop_value)

            else:

                most_popular_crop = str(top_crop_value)

    # -----------------------------------
    # MARKET ACTIVITY LEVEL
    # -----------------------------------

    if len(bids_df) >= 250:
        market_activity = "High"
    elif len(bids_df) >= 100:
        market_activity = "Medium"
    elif len(bids_df) > 0:
        market_activity = "Low"
    else:
        market_activity = "No Activity"

    # -----------------------------------
    # GENERATE INSIGHT
    # -----------------------------------

    if most_popular_crop != "No data available":

        insight = (
            f"{most_popular_crop} currently has the highest "
            f"transaction activity in the marketplace."
        )

    else:

        insight = (
            "Not enough transaction data is available "
            "to identify the most popular crop."
        )

    # -----------------------------------
    # FINAL RESPONSE
    # -----------------------------------

    return {
        "marketStatus": market_status,
        "mostPopularCrop": most_popular_crop,
        "averageBidAmount": average_bid_amount,
        "highestBid": highest_bid,
        "lowestBid": lowest_bid,
        "marketActivity": market_activity,
        "insight": insight
    }