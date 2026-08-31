"""
Buyer segmentation — RFM (Recency, Frequency, Monetary) + K-Means clustering.

This is the one genuinely unsupervised-ML piece of the project (everything
else so far is time-series forecasting or a scoring formula). It groups
buyers into behavioral segments so a platform could target them
differently (e.g. loyalty offers for high-value buyers, win-back
campaigns for at-risk ones).

Approach:
  1. Compute RFM per buyer from transactions:
       Recency  = days since their last purchase (lower = more recent)
       Frequency = number of completed purchases
       Monetary  = total amount spent
  2. Standardize these 3 features (K-Means is distance-based, so scale
     matters — without this, Monetary would dominate purely because its
     numbers are bigger).
  3. Run K-Means with k=3 (Low/Medium/High value — a deliberately simple,
     explainable choice; you could tune k with an elbow plot if you want
     to go further in your report).
  4. Label clusters by their average Monetary value so the output reads
     as "High/Medium/Low value" rather than an arbitrary cluster number.
"""
import pandas as pd
import numpy as np
from datetime import datetime
from app.services.data_loader import load_transactions


def segment_buyers(n_clusters: int = 3) -> dict:
    tx = load_transactions()
    if tx.empty:
        return {"error": "No transaction data available to segment buyers."}

    completed = tx[tx["status"] == "delivery_completed"]
    if completed.empty or completed["buyerId"].nunique() < n_clusters:
        return {"error": f"Not enough distinct buyers with completed transactions to form {n_clusters} clusters."}

    now = pd.Timestamp(datetime.utcnow())
    rfm = (
        completed.groupby("buyerId")
        .agg(
            lastPurchase=("createdAt", "max"),
            frequency=("_id", "count"),
            monetary=("totalAmount", "sum"),
        )
        .reset_index()
    )
    rfm["recencyDays"] = (now - rfm["lastPurchase"]).dt.days

    features = rfm[["recencyDays", "frequency", "monetary"]].copy()

    # standardize manually (mean 0, std 1) — avoids adding a hard sklearn
    # dependency just for scaling, and is easy to explain in a viva
    standardized = (features - features.mean()) / features.std().replace(0, 1)

    try:
        from sklearn.cluster import KMeans
        model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        rfm["cluster"] = model.fit_predict(standardized)
    except Exception as e:
        return {"error": f"Clustering failed: {str(e)}"}

    # label clusters by average monetary value so output is human-readable
    cluster_order = (
        rfm.groupby("cluster")["monetary"].mean().sort_values(ascending=False).index.tolist()
    )
    labels = ["High Value", "Medium Value", "Low Value"]
    label_map = {cluster_id: labels[i] if i < len(labels) else f"Segment {i}" for i, cluster_id in enumerate(cluster_order)}
    rfm["segment"] = rfm["cluster"].map(label_map)

    segment_summary = (
        rfm.groupby("segment")
        .agg(
            buyerCount=("buyerId", "count"),
            avgRecencyDays=("recencyDays", "mean"),
            avgFrequency=("frequency", "mean"),
            avgMonetary=("monetary", "mean"),
        )
        .reset_index()
        .round(2)
    )

    rfm["buyerId"] = rfm["buyerId"].astype(str)
    buyer_detail = rfm[["buyerId", "recencyDays", "frequency", "monetary", "segment"]].round(2)

    return {
        "summary": segment_summary.to_dict(orient="records"),
        "buyers": buyer_detail.to_dict(orient="records"),
        "totalBuyers": len(rfm),
    }