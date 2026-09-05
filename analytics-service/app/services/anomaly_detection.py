import pandas as pd
from sklearn.ensemble import IsolationForest

from app.services.data_loader import load_bids


def _find_bid_column(df: pd.DataFrame):
    for column in ["bidAmount", "amount", "price"]:
        if column in df.columns:
            return column
    return None


def _zscore_anomalies(values: pd.Series, threshold: float = 3.0) -> pd.Series:
    """Flags values more than `threshold` standard deviations from the mean."""
    mean = values.mean()
    std = values.std()
    if std == 0 or pd.isna(std):
        return pd.Series(False, index=values.index)
    z_scores = (values - mean) / std
    return z_scores.abs() > threshold


def _iqr_anomalies(values: pd.Series, multiplier: float = 1.5) -> pd.Series:
    """Flags values outside [Q1 - multiplier*IQR, Q3 + multiplier*IQR]."""
    q1 = values.quantile(0.25)
    q3 = values.quantile(0.75)
    iqr = q3 - q1
    if iqr == 0:
        return pd.Series(False, index=values.index)
    lower_bound = q1 - multiplier * iqr
    upper_bound = q3 + multiplier * iqr
    return (values < lower_bound) | (values > upper_bound)


def _confidence_label(flag_count: int) -> str:
    if flag_count >= 3:
        return "high"     # all three methods agree
    if flag_count == 2:
        return "medium"   # two of three agree
    if flag_count == 1:
        return "low"      # only one method flagged it
    return "none"


def detect_bid_anomalies(contamination: float = 0.05) -> dict:
    """
    Detects unusual bidding patterns using three independent methods -
    Z-score, IQR, and Isolation Forest - and reports where they agree.

    A record flagged by more than one method is stronger evidence of
    genuinely unusual behaviour than any single method alone; a record
    flagged by only one is a weaker, worth-a-second-look signal. This
    reports 'anomalous behaviour', never 'fraud' - there's no labelled
    fraud data in this dataset to validate a fraud claim against, and
    claiming one would be scientifically unjustified.
    """

    df = load_bids()

    if df.empty:
        return {"error": "No bidding data available for anomaly detection."}

    bid_column = _find_bid_column(df)

    if bid_column is None:
        return {
            "error": "Could not find a bid amount column.",
            "availableColumns": df.columns.tolist(),
        }

    df[bid_column] = pd.to_numeric(df[bid_column], errors="coerce")
    clean_df = df.dropna(subset=[bid_column]).copy()

    if len(clean_df) < 10:
        return {
            "error": "Not enough bidding data for anomaly detection.",
            "recordsAvailable": len(clean_df),
        }

    values = clean_df[bid_column]

    clean_df["zscoreFlag"] = _zscore_anomalies(values)
    clean_df["iqrFlag"] = _iqr_anomalies(values)

    X = clean_df[[bid_column]]
    model = IsolationForest(contamination=contamination, random_state=42)
    clean_df["isolationForestLabel"] = model.fit_predict(X)
    clean_df["anomalyScore"] = model.decision_function(X)
    clean_df["isolationForestFlag"] = clean_df["isolationForestLabel"] == -1

    clean_df["flagCount"] = (
        clean_df["zscoreFlag"].astype(int)
        + clean_df["iqrFlag"].astype(int)
        + clean_df["isolationForestFlag"].astype(int)
    )
    clean_df["confidence"] = clean_df["flagCount"].apply(_confidence_label)

    flagged = clean_df[clean_df["flagCount"] > 0].copy()
    flagged = flagged.sort_values("flagCount", ascending=False)

    anomaly_records = []
    for _, row in flagged.iterrows():
        record = {
            "bidAmount": round(float(row[bid_column]), 2),
            "flaggedBy": {
                "zScore": bool(row["zscoreFlag"]),
                "iqr": bool(row["iqrFlag"]),
                "isolationForest": bool(row["isolationForestFlag"]),
            },
            "confidence": row["confidence"],
            "isolationForestScore": round(float(row["anomalyScore"]), 4),
        }
        if "_id" in row.index:
            record["bidId"] = str(row["_id"])
        if "createdAt" in row.index and pd.notna(row["createdAt"]):
            record["createdAt"] = str(row["createdAt"])
        anomaly_records.append(record)

    total_records = len(clean_df)
    anomaly_count = len(flagged)

    return {
        "methodology": (
            "Three independent detectors - Z-score, IQR, and Isolation "
            "Forest - are each run on bid amounts. Records are reported "
            "as 'anomalous behaviour', not 'fraud', since there is no "
            "labelled fraud data available to validate a fraud claim."
        ),
        "featureAnalyzed": bid_column,
        "recordsAnalyzed": total_records,
        "methodAgreement": {
            "flaggedByAllThree": int((clean_df["flagCount"] == 3).sum()),
            "flaggedByTwo": int((clean_df["flagCount"] == 2).sum()),
            "flaggedByOneOnly": int((clean_df["flagCount"] == 1).sum()),
        },
        "anomaliesDetected": anomaly_count,
        "normalRecords": total_records - anomaly_count,
        "anomalyPercentage": (
            round((anomaly_count / total_records) * 100, 2)
            if total_records else 0.0
        ),
        "anomalies": anomaly_records,
    }