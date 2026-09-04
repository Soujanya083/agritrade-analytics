import pandas as pd
from sklearn.ensemble import IsolationForest

from app.services.data_loader import load_bids


def detect_bid_anomalies(contamination: float = 0.05) -> dict:
    """
    Detect unusual or suspicious bidding patterns using Isolation Forest.
    """

    df = load_bids()

    if df.empty:
        return {
            "error": "No bidding data available for anomaly detection."
        }

    # Find bid amount column safely
    possible_columns = ["bidAmount", "amount", "price"]

    bid_column = None

    for column in possible_columns:
        if column in df.columns:
            bid_column = column
            break

    if bid_column is None:
        return {
            "error": "Could not find a bid amount column.",
            "availableColumns": df.columns.tolist()
        }

    # Convert bid amount to numeric
    df[bid_column] = pd.to_numeric(
        df[bid_column],
        errors="coerce"
    )

    # Remove invalid records
    clean_df = df.dropna(subset=[bid_column]).copy()

    if len(clean_df) < 10:
        return {
            "error": "Not enough bidding data for anomaly detection.",
            "recordsAvailable": len(clean_df)
        }

    # Prepare feature data
    X = clean_df[[bid_column]]

    # Create Isolation Forest model
    model = IsolationForest(
        contamination=contamination,
        random_state=42
    )

    # Predict anomalies
    clean_df["anomalyLabel"] = model.fit_predict(X)

    # Calculate anomaly scores
    clean_df["anomalyScore"] = model.decision_function(X)

    # -1 means anomaly
    clean_df["isAnomaly"] = (
        clean_df["anomalyLabel"] == -1
    )

    # Get anomaly records
    anomalies = clean_df[
        clean_df["isAnomaly"]
    ].copy()

    anomaly_records = []

    for _, row in anomalies.iterrows():

        score = float(row["anomalyScore"])

        # Determine severity
        if score <= -0.10:
            severity = "high"
        elif score <= -0.05:
            severity = "medium"
        else:
            severity = "low"

        anomaly_record = {
            "bidAmount": round(
                float(row[bid_column]),
                2
            ),
            "anomalyScore": round(
                score,
                4
            ),
            "severity": severity,
            "status": "anomaly"
        }

        # Add bid ID if available
        if "_id" in row.index:
            anomaly_record["bidId"] = str(row["_id"])

        elif "bidId" in row.index:
            anomaly_record["bidId"] = str(row["bidId"])

        # Add created date if available
        if "createdAt" in row.index:

            created_at = row["createdAt"]

            if pd.notna(created_at):

                anomaly_record["createdAt"] = str(
                    created_at
                )

        anomaly_records.append(anomaly_record)

    total_records = len(clean_df)
    anomaly_count = len(anomalies)

    return {
        "method": "Isolation Forest",
        "featureAnalyzed": bid_column,
        "recordsAnalyzed": total_records,
        "anomaliesDetected": anomaly_count,
        "anomalyPercentage": round(
            (anomaly_count / total_records) * 100,
            2
        ),
        "normalRecords": total_records - anomaly_count,
        "anomalies": anomaly_records
    }