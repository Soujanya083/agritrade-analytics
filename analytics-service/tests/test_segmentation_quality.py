"""Segmentation must report whether its clusters are real."""
import numpy as np
import pandas as pd
import pytest
from unittest.mock import patch

from app.services import buyer_segmentation as bs
from app.services import segmentation_quality as sq


def blobs(seed=0, n_per=40, separation=6.0, k=3):
    rng = np.random.default_rng(seed)
    centres = [np.array([separation * i, separation * (i % 2), 0.0]) for i in range(k)]
    return np.vstack([rng.normal(c, 1.0, (n_per, 3)) for c in centres])


def test_well_separated_groups_score_high_and_are_stable():
    out = sq.evaluate_clustering(blobs(), 3)
    assert out["silhouette"] > 0.6 and out["silhouetteReading"] in {"reasonable structure", "strong structure"}
    assert out["stabilityARI"] > 0.9
    assert out["segmentsAreSolid"] is True
    assert out["bestKBySilhouette"] == 3


def test_structureless_noise_is_reported_as_weak_not_celebrated():
    noise = np.random.default_rng(1).normal(0, 1, (150, 3))
    out = sq.evaluate_clustering(noise, 3)
    assert out["silhouette"] < 0.35
    assert out["segmentsAreSolid"] is False
    assert "descriptive grouping" in out["reading"]


def test_the_scan_notices_when_a_different_k_fits_better():
    out = sq.evaluate_clustering(blobs(k=2, separation=9.0), 5)
    assert out["bestKBySilhouette"] == 2
    assert any("better into k=2" in note for note in out["notes"])


def test_tiny_samples_are_not_validated_with_made_up_numbers():
    out = sq.evaluate_clustering(np.random.default_rng(0).normal(0, 1, (4, 3)), 3)
    assert out["available"] is False


def test_silhouette_scale_is_labelled_per_the_standard_thresholds():
    assert sq.interpret_silhouette(0.8) == "strong structure"
    assert sq.interpret_silhouette(0.6) == "reasonable structure"
    assert sq.interpret_silhouette(0.3) == "weak structure"
    assert sq.interpret_silhouette(0.1) == "no substantial structure"


def test_a_tiny_outlier_segment_is_flagged():
    data = np.vstack([np.random.default_rng(0).normal(0, 1, (200, 3)), [[40, 40, 40]]])
    out = sq.evaluate_clustering(data, 2)
    assert out["smallestSegmentShare"] < 0.05
    assert any("under 5%" in n for n in out["notes"])


# --------------------------------------------------- the segmentation itself
def transactions(spend_by_buyer, days_ago=5):
    rows = []
    for buyer, amounts in spend_by_buyer.items():
        for i, amount in enumerate(amounts):
            rows.append({"_id": f"{buyer}-{i}", "buyerId": buyer, "status": "delivery_completed", "totalAmount": amount,
                         "createdAt": pd.Timestamp.now() - pd.Timedelta(days=days_ago + i * 3)})
    return pd.DataFrame(rows)


def make_buyers():
    spend = {}
    rng = np.random.default_rng(0)
    for i in range(20):
        spend[f"low{i}"] = list(rng.uniform(500, 1500, 1))
    for i in range(20):
        spend[f"mid{i}"] = list(rng.uniform(4000, 9000, 3))
    for i in range(20):
        spend[f"high{i}"] = list(rng.uniform(40000, 90000, 8))
    return spend


def test_result_now_includes_cluster_quality_and_method():
    with patch.object(bs, "load_transactions", return_value=transactions(make_buyers())):
        result = bs.segment_buyers(3)
    assert result["clusterQuality"]["available"] is True
    assert "log" in result["method"]
    assert result["clusterQuality"]["silhouette"] > 0.4


def test_one_whale_buyer_does_not_become_a_cluster_of_its_own():
    """With raw standardised spend, a single huge buyer captures a cluster; with log transforms it doesn't."""
    spend = make_buyers()
    spend["whale"] = [5_000_000.0] * 30
    with patch.object(bs, "load_transactions", return_value=transactions(spend)):
        result = bs.segment_buyers(3)
    sizes = sorted(row["buyerCount"] for row in result["summary"])
    assert sizes[0] >= 5                       # no singleton segment


def test_segment_labels_still_run_from_high_to_low_value():
    with patch.object(bs, "load_transactions", return_value=transactions(make_buyers())):
        result = bs.segment_buyers(3)
    by_label = {row["segment"]: row["avgMonetary"] for row in result["summary"]}
    assert by_label["High Value"] > by_label["Medium Value"] > by_label["Low Value"]


def test_errors_for_too_few_buyers_are_unchanged():
    with patch.object(bs, "load_transactions", return_value=transactions({"a": [100], "b": [200]})):
        assert "Not enough" in bs.segment_buyers(3)["error"]
