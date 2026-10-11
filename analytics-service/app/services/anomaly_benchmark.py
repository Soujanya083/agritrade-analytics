"""
How good are the bid-anomaly detectors? A benchmark with KNOWN anomalies.

Real marketplaces have no labels saying which bids are suspicious, so the
detectors cannot be scored on real data. The standard answer is to inject
anomalies of known size into realistic synthetic bids and measure:
  * recall    - what share of the injected anomalies were caught
  * precision - what share of the flagged bids were really injected
  * false-positive rate - what share of NORMAL bids were flagged

This validates the METHOD (and the confidence tiers: 1 / 2 / 3 detectors
agreeing); it says nothing about how many anomalies your real data contains.
Normal bids are a slightly-above-asking premium with a heavy tail, expressed
as bid / base price - the same feature the live detector uses.
"""
import numpy as np
import pandas as pd

from app.utils.ttl_cache import ttl_cache

from app.services.anomaly_detection import _iqr_anomalies, _zscore_anomalies
from sklearn.ensemble import IsolationForest

DETECTORS = ("zScore", "iqr", "isolationForest", "anyOfThree", "atLeastTwo", "allThree")


def _generate(rng, n_bids: int, rate: float, magnitude: float):
    premium = np.abs(rng.standard_t(df=5, size=n_bids)) * 0.05 + 0.02          # heavy-tailed, > 0
    ratio = 1 + premium
    injected = np.zeros(n_bids, dtype=bool)
    k = max(1, int(round(n_bids * rate)))
    injected[rng.choice(n_bids, k, replace=False)] = True
    ratio = np.where(injected, ratio * magnitude, ratio)
    return pd.Series(ratio), injected


def _flags(values: pd.Series, contamination: float) -> dict:
    z = _zscore_anomalies(values).to_numpy()
    q = _iqr_anomalies(values).to_numpy()
    iso = IsolationForest(contamination=contamination, random_state=42).fit_predict(values.to_frame()) == -1
    votes = z.astype(int) + q.astype(int) + iso.astype(int)
    return {"zScore": z, "iqr": q, "isolationForest": iso, "anyOfThree": votes >= 1, "atLeastTwo": votes >= 2, "allThree": votes >= 3}


@ttl_cache(seconds=3600, data_aware=False)   # pure simulation: independent of the database
def run_benchmark(n_bids: int = 400, anomaly_rate: float = 0.03, magnitudes=(1.1, 1.2, 1.3, 1.5, 2.0, 4.0),
                  seeds: int = 15, contamination: float = 0.05) -> dict:
    rows = []
    for magnitude in magnitudes:
        tally = {d: {"tp": 0, "fp": 0, "fn": 0, "tn": 0} for d in DETECTORS}
        for seed in range(seeds):
            rng = np.random.default_rng(seed)
            values, injected = _generate(rng, n_bids, anomaly_rate, magnitude)
            for name, flagged in _flags(values, contamination).items():
                t = tally[name]
                t["tp"] += int((flagged & injected).sum())
                t["fp"] += int((flagged & ~injected).sum())
                t["fn"] += int((~flagged & injected).sum())
                t["tn"] += int((~flagged & ~injected).sum())
        for name, t in tally.items():
            caught, flagged_total = t["tp"], t["tp"] + t["fp"]
            rows.append({
                "magnitude": magnitude, "detector": name,
                "recall": round(caught / max(t["tp"] + t["fn"], 1), 3),
                "precision": None if flagged_total == 0 else round(caught / flagged_total, 3),
                "falsePositiveRate": round(t["fp"] / max(t["fp"] + t["tn"], 1), 4),
            })
    return {
        "setup": {"bidsPerRun": n_bids, "anomalyRate": anomaly_rate, "runsPerMagnitude": seeds,
                  "isolationForestContamination": contamination,
                  "anomalyDefinition": "an injected bid of `magnitude` x the asking price on top of a normal heavy-tailed premium"},
        "results": rows,
        "reading": [
            "magnitude 2.0 means the anomalous bid is twice the asking price.",
            "Isolation Forest is told to flag ~5% of bids, so its false-positive rate is at least ~5% by construction.",
            "Requiring several detectors to agree trades recall for fewer false alarms: that is what the confidence tiers mean.",
            "This benchmarks the method on synthetic anomalies; it does not measure how many real anomalies your data has.",
        ],
    }
