"""Anomaly detection compares bids to their own listing, not to other crops."""
import numpy as np
import pandas as pd

from app.services import anomaly_detection as ad


def build(n_cheap=40, n_pricey=10):
    rng = np.random.default_rng(1)
    crops = pd.DataFrame({
        "_id": ["cheap", "pricey"], "basePrice": [20.0, 120.0], "farmerId": ["f1", "f2"],
    })
    rows = []
    for i in range(n_cheap):
        rows.append({"_id": f"bc{i}", "cropId": "cheap", "buyerId": f"b{i % 7}", "amount": 20 * rng.uniform(1.0, 1.1),
                     "createdAt": pd.Timestamp("2026-01-01") + pd.Timedelta(hours=i)})
    for i in range(n_pricey):
        rows.append({"_id": f"bp{i}", "cropId": "pricey", "buyerId": f"b{i % 7}", "amount": 120 * rng.uniform(1.0, 1.1),
                     "createdAt": pd.Timestamp("2026-01-01") + pd.Timedelta(hours=100 + i)})
    return crops, pd.DataFrame(rows)


def test_expensive_crops_are_not_flagged_just_for_being_expensive(monkeypatch):
    crops, bids = build()
    monkeypatch.setattr(ad, "load_crops", lambda: crops)
    monkeypatch.setattr(ad, "load_bids", lambda: bids)

    result = ad.detect_bid_anomalies()

    # Every bid here is normal. Isolation Forest always labels ~`contamination`
    # of points as outliers by construction (a "low"-confidence, single-method
    # flag), so assert on the statistical detectors and on confidence instead.
    pricey = [a for a in result["anomalies"] if a["bidId"].startswith("bp")]
    assert not any(a["flaggedBy"]["zScore"] or a["flaggedBy"]["iqr"] for a in pricey)
    assert all(a["confidence"] == "low" for a in pricey)
    assert "base price" in result["featureAnalyzed"]


def test_a_genuinely_odd_bid_is_still_caught(monkeypatch):
    crops, bids = build()
    bids.loc[bids["_id"] == "bp3", "amount"] = 120 * 6   # 6x the asking price
    monkeypatch.setattr(ad, "load_crops", lambda: crops)
    monkeypatch.setattr(ad, "load_bids", lambda: bids)

    result = ad.detect_bid_anomalies()
    ids = {a["bidId"] for a in result["anomalies"]}
    assert "bp3" in ids
    top = next(a for a in result["anomalies"] if a["bidId"] == "bp3")
    assert top["bidToBasePriceRatio"] > 5


def test_falls_back_to_raw_amounts_and_says_so_when_base_prices_are_missing(monkeypatch):
    crops, bids = build()
    monkeypatch.setattr(ad, "load_crops", lambda: crops.iloc[0:0])   # no crop info
    monkeypatch.setattr(ad, "load_bids", lambda: bids)
    result = ad.detect_bid_anomalies()
    assert result["featureAnalyzed"] == "amount"
    assert "over-flagged" in result["methodology"]
