"""
Loads MongoDB collections into pandas DataFrames.
Every analytics/ML module in this service starts from here —
keep the raw-to-DataFrame logic in one place so schema changes
only need to be updated once.
"""
import pandas as pd
from app.db import crops_collection, bids_collection, transactions_collection, users_collection


def load_crops() -> pd.DataFrame:
    docs = list(crops_collection.find({}))
    df = pd.DataFrame(docs)
    if df.empty:
        return df
    df["_id"] = df["_id"].astype(str)
    df["farmerId"] = df["farmerId"].astype(str)
    df["createdAt"] = pd.to_datetime(df["createdAt"])
    df["harvestedDate"] = pd.to_datetime(df["harvestedDate"], errors="coerce")
    return df


def load_bids() -> pd.DataFrame:
    docs = list(bids_collection.find({}))
    df = pd.DataFrame(docs)
    if df.empty:
        return df
    df["_id"] = df["_id"].astype(str)
    df["cropId"] = df["cropId"].astype(str)
    df["buyerId"] = df["buyerId"].astype(str)
    df["createdAt"] = pd.to_datetime(df["createdAt"])
    return df


def load_transactions() -> pd.DataFrame:
    docs = list(transactions_collection.find({}))
    df = pd.DataFrame(docs)
    if df.empty:
        return df
    df["_id"] = df["_id"].astype(str)
    df["cropId"] = df["cropId"].astype(str)
    df["farmerId"] = df["farmerId"].astype(str)
    df["buyerId"] = df["buyerId"].astype(str)
    df["createdAt"] = pd.to_datetime(df["createdAt"])
    return df


def load_users() -> pd.DataFrame:
    docs = list(users_collection.find({}))
    df = pd.DataFrame(docs)
    if df.empty:
        return df
    df["_id"] = df["_id"].astype(str)
    return df


def crops_with_location(crops_df: pd.DataFrame) -> pd.DataFrame:
    """crops already store their own location field directly (server.js line 50),
    so no join to users is needed for region-wise analysis."""
    return crops_df
