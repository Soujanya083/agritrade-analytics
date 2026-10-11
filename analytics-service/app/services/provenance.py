"""
How much of the marketplace data is SYNTHETIC?

seed_data.py creates demo users whose email starts with "seed.". Anything
those users own (crops, bids, sales) is synthetic. Forecasts trained on it
show that the pipeline works, not that it predicts real markets - so the
share is measured, exposed through the API, shown in the UI, and used to cap
the confidence label of marketplace-based forecasts.
"""
import pandas as pd

from app.services.data_loader import load_bids, load_crops, load_transactions, load_users
from app.utils.ttl_cache import ttl_cache

SYNTHETIC_EMAIL_PREFIX = "seed."
SYNTHETIC_CONFIDENCE_CAP_SHARE = 0.5   # above this, confidence cannot be better than "Low"


def _share(flagged: int, total: int) -> float:
    return round(flagged / total, 4) if total else 0.0


def compute_provenance(users, crops, bids, transactions) -> dict:
    seed_ids = set()
    if not users.empty and "email" in users.columns:
        mask = users["email"].fillna("").astype(str).str.lower().str.startswith(SYNTHETIC_EMAIL_PREFIX)
        seed_ids = set(users.loc[mask, "_id"].astype(str))

    def count(df, *cols):
        if df.empty:
            return 0, 0
        flagged = pd.Series(False, index=df.index)
        for col in cols:
            if col in df.columns:
                flagged |= df[col].astype(str).isin(seed_ids)
        return int(flagged.sum()), int(len(df))

    crop_s, crop_n = count(crops, "farmerId")
    bid_s, bid_n = count(bids, "buyerId")
    tx_s, tx_n = count(transactions, "farmerId", "buyerId")
    total_s, total_n = crop_s + bid_s + tx_s, crop_n + bid_n + tx_n
    share = _share(total_s, total_n)
    return {
        "syntheticShare": share,
        "syntheticPercent": round(share * 100, 1),
        "records": {
            "crops": {"synthetic": crop_s, "total": crop_n},
            "bids": {"synthetic": bid_s, "total": bid_n},
            "transactions": {"synthetic": tx_s, "total": tx_n},
        },
        "syntheticUsers": len(seed_ids),
        "mostlySynthetic": share > SYNTHETIC_CONFIDENCE_CAP_SHARE,
        "message": (
            "Most marketplace records are synthetic demo data (seed_data.py). Marketplace forecasts demonstrate the "
            "method but do not describe real markets; use the real-market (AGMARKNET) analysis for that."
            if share > SYNTHETIC_CONFIDENCE_CAP_SHARE else
            "Synthetic demo data makes up part of the marketplace records."
            if share > 0 else "No synthetic demo records detected."),
    }


@ttl_cache(seconds=300)
def get_data_provenance() -> dict:
    return compute_provenance(load_users(), load_crops(), load_bids(), load_transactions())
