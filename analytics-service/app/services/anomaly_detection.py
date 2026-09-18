import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

from app.services.data_loader import load_bids, load_crops


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


# ---------------------------------------------------------------------------
# Marketplace-pattern checks. Unlike the amount-based detector above (which
# only looks at "is this bid amount unusual"), these look at *behaviour*
# patterns specific to a bidding marketplace: a buyer bidding on their own
# listing, one buyer placing an unusual burst of bids in a short window, and
# a bid jumping far more than a crop's bidding history normally does. Same
# framing rule as above applies: these are reported as "flagged patterns"
# worth a manual look, never asserted as confirmed fraud, since there's no
# labelled ground truth to validate that claim against.
# ---------------------------------------------------------------------------

def _detect_self_dealing(bids_df: pd.DataFrame) -> list:
    """
    Flags bids where the buyer is the same account as the farmer who
    listed the crop - i.e. someone bidding on their own listing. This
    is a hard rule, not a statistical threshold: there's no legitimate
    reason for it to happen, so any instance is worth surfacing.
    """
    crops_df = load_crops()
    if crops_df.empty or "farmerId" not in crops_df.columns:
        return []

    crop_farmer_map = crops_df.set_index("_id")["farmerId"].to_dict()
    self_dealing = []

    for _, bid in bids_df.iterrows():
        crop_id = bid.get("cropId")
        farmer_id = crop_farmer_map.get(crop_id)
        if farmer_id is not None and farmer_id == bid.get("buyerId"):
            self_dealing.append({
                "bidId": str(bid.get("_id", "")),
                "cropId": str(crop_id),
                "userId": str(farmer_id),
                "createdAt": str(bid["createdAt"]) if pd.notna(bid.get("createdAt")) else None,
            })

    return self_dealing


def _detect_rapid_fire_bidding(bids_df: pd.DataFrame, window_minutes: int = 5, min_bids_in_window: int = 4) -> list:
    """
    Flags buyers who placed an unusually fast burst of bids - e.g. 4+
    bids inside a 5-minute window. A genuine buyer comparison-shopping
    across several crops doesn't usually move this fast; automated or
    shill-bidding scripts often do. Threshold is deliberately loose
    (a real buyer occasionally doing this isn't itself proof of
    anything) - this flags a pattern worth a manual look, not a verdict.
    """
    flagged = []

    for buyer_id, group in bids_df.groupby("buyerId"):
        times = group["createdAt"].sort_values().reset_index(drop=True)
        if len(times) < min_bids_in_window:
            continue

        window = pd.Timedelta(minutes=window_minutes)
        # Sliding window over this buyer's own bid timestamps: for each
        # bid, count how many of their other bids fall within the next
        # `window_minutes`. Cheap for a single buyer's bid count (rarely
        # more than a few dozen even for an active user).
        for i in range(len(times)):
            count_in_window = ((times >= times[i]) & (times < times[i] + window)).sum()
            if count_in_window >= min_bids_in_window:
                flagged.append({
                    "buyerId": str(buyer_id),
                    "bidsInWindow": int(count_in_window),
                    "windowMinutes": window_minutes,
                    "windowStart": str(times[i]),
                })
                break  # one flag per buyer is enough signal, not one per overlapping window

    return flagged


def _detect_unrealistic_bid_jumps(bids_df: pd.DataFrame, jump_threshold: float = 0.5) -> list:
    """
    Within each crop's own bid history, flags a bid that jumps more
    than `jump_threshold` (50% by default) above the immediately
    preceding bid on that same crop. A steady escalation of bids is
    normal in an auction-style listing; a sudden large jump is either a
    genuine burst of buyer interest or a bid designed to push the price
    up quickly (shill bidding) - this can't tell those apart, it can
    only flag that the jump is unusually large relative to how bids on
    this crop have moved so far.
    """
    bid_column = _find_bid_column(bids_df)
    if bid_column is None:
        return []

    flagged = []

    for crop_id, group in bids_df.groupby("cropId"):
        ordered = group.sort_values("createdAt")
        amounts = pd.to_numeric(ordered[bid_column], errors="coerce")
        previous = amounts.shift(1)

        with np.errstate(divide="ignore", invalid="ignore"):
            pct_jump = (amounts - previous) / previous

        for idx, jump in pct_jump.items():
            if pd.notna(jump) and jump > jump_threshold:
                row = ordered.loc[idx]
                flagged.append({
                    "bidId": str(row.get("_id", "")),
                    "cropId": str(crop_id),
                    "previousBid": round(float(previous[idx]), 2),
                    "newBid": round(float(amounts[idx]), 2),
                    "percentJump": round(float(jump) * 100, 1),
                })

    return flagged


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

    # Pattern-based checks run on the full (unfiltered-by-amount) bid set,
    # since self-dealing/rapid-fire/jump patterns are about behaviour over
    # time, not about which individual amounts look statistically odd.
    self_dealing = _detect_self_dealing(df)
    rapid_fire = _detect_rapid_fire_bidding(df)
    unrealistic_jumps = _detect_unrealistic_bid_jumps(df)

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
        "patternAnomalies": {
            "methodology": (
                "Marketplace-behaviour checks, separate from the amount-based "
                "detectors above: bids where the buyer is the crop's own "
                "farmer (self-dealing), buyers placing an unusually fast "
                "burst of bids, and bids that jump far above the previous "
                "bid on the same crop. These flag patterns worth a manual "
                "look, not confirmed fraud."
            ),
            "selfDealing": self_dealing,
            "rapidFireBidding": rapid_fire,
            "unrealisticJumps": unrealistic_jumps,
            "selfDealingCount": len(self_dealing),
            "rapidFireBuyerCount": len(rapid_fire),
            "unrealisticJumpCount": len(unrealistic_jumps),
        },
    }