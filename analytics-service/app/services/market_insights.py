import pandas as pd

from app.services.data_loader import (
    load_crops,
    load_bids,
    load_transactions,
)
from app.utils.ttl_cache import ttl_cache


def most_sold_crop_name(transactions_df, crops_df):
    """Crop name with the most transactions, or None when it can't be determined."""
    if transactions_df.empty or crops_df.empty:
        return None
    if "cropId" not in transactions_df.columns or "cropName" not in crops_df.columns:
        return None
    names = crops_df[["_id", "cropName"]].rename(columns={"_id": "cropId"})
    merged = transactions_df[["cropId"]].merge(names, on="cropId", how="left").dropna(subset=["cropName"])
    if merged.empty:
        return None
    counts = merged["cropName"].astype(str).str.strip().value_counts()
    return str(counts.idxmax())


@ttl_cache(seconds=120)
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
    # Count sales per crop NAME. (Counting per cropId, as this used to,
    # is meaningless: each listing is sold at most once, so every id has
    # a count of 1 and idxmax() just returned whichever came first.)

    most_popular_crop = most_sold_crop_name(transactions_df, crops_df) or "No data available"

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