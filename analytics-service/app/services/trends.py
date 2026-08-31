"""
Core Data Analytics layer:
- crop price trend analysis
- best-selling crops
- region-wise demand
- farmer revenue analysis
- buyer purchasing patterns

All pure pandas aggregation — no ML here. This is the layer that
powers your dashboard charts.
"""
import pandas as pd
from app.services.data_loader import load_crops, load_bids, load_transactions


def price_trend(crop_name: str = None) -> list[dict]:
    """Average base price and current (winning) bid over time, optionally
    filtered to one crop. Powers the price-trend line chart."""
    df = load_crops()
    if df.empty:
        return []
    if crop_name:
        df = df[df["cropName"].str.lower() == crop_name.lower()]
    if df.empty:
        return []
    df["date"] = df["createdAt"].dt.date
    grouped = (
        df.groupby(["date", "cropName"])
        .agg(avgBasePrice=("basePrice", "mean"), avgCurrentBid=("currentBid", "mean"), listings=("_id", "count"))
        .reset_index()
        .sort_values("date")
    )
    grouped["date"] = grouped["date"].astype(str)
    return grouped.to_dict(orient="records")


def best_selling_crops(top_n: int = 10) -> list[dict]:
    """Ranks crops by completed transaction volume and revenue."""
    tx = load_transactions()
    crops = load_crops()
    if tx.empty or crops.empty:
        return []
    merged = tx.merge(crops[["_id", "cropName"]], left_on="cropId", right_on="_id", how="left")
    grouped = (
        merged.groupby("cropName")
        .agg(totalRevenue=("totalAmount", "sum"), dealsCount=("_id_x", "count"))
        .reset_index()
        .sort_values("totalRevenue", ascending=False)
        .head(top_n)
    )
    return grouped.to_dict(orient="records")


def region_wise_demand() -> list[dict]:
    """Bid counts per region — proxy for buyer demand by location."""
    crops = load_crops()
    bids = load_bids()
    if crops.empty or bids.empty:
        return []
    merged = bids.merge(crops[["_id", "location", "cropName"]], left_on="cropId", right_on="_id", how="left")
    grouped = (
        merged.groupby(["location", "cropName"])
        .agg(bidCount=("_id_x", "count"), avgBidAmount=("amount", "mean"))
        .reset_index()
        .sort_values("bidCount", ascending=False)
    )
    return grouped.to_dict(orient="records")


def farmer_revenue() -> list[dict]:
    """Total payout per farmer from completed transactions."""
    tx = load_transactions()
    if tx.empty:
        return []
    completed = tx[tx["status"] == "delivery_completed"]
    if completed.empty:
        return []
    grouped = (
        completed.groupby("farmerId")
        .agg(totalPayout=("payout", "sum"), completedDeals=("_id", "count"))
        .reset_index()
        .sort_values("totalPayout", ascending=False)
    )
    return grouped.to_dict(orient="records")


def buyer_purchasing_patterns() -> list[dict]:
    """Frequency and spend per buyer — basis for an RFM-style segmentation later."""
    tx = load_transactions()
    if tx.empty:
        return []
    grouped = (
        tx.groupby("buyerId")
        .agg(totalSpend=("totalAmount", "sum"), purchaseCount=("_id", "count"))
        .reset_index()
        .sort_values("totalSpend", ascending=False)
    )
    grouped["avgOrderValue"] = grouped["totalSpend"] / grouped["purchaseCount"]
    return grouped.to_dict(orient="records")
