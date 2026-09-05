"""
test_crop_recommendation_score.py - tests the single-listing stability
artifact fix and the "Insufficient Data" sample-size threshold, using
mocked crop data.

Run with: pytest tests/test_crop_recommendation_score.py -v
"""
import pandas as pd
from unittest.mock import patch

from app.services import crop_recommendation_score as crs


def _make_crops_df():
    rows = []
    # Wheat: only 1 listing - should NOT get a confident recommendation,
    # even though its zero variance would otherwise look "perfectly stable".
    rows.append({"cropName": "Wheat", "currentBid": 1000})

    # Rice: 5 listings with real price variation - enough data for a
    # confident score.
    for price in [100, 110, 105, 120, 95]:
        rows.append({"cropName": "Rice", "currentBid": price})

    return pd.DataFrame(rows)


def test_single_listing_crop_marked_insufficient_data():
    df = _make_crops_df()
    with patch.object(crs, "load_crops", return_value=df):
        result = crs.get_crop_recommendation_scores()

    wheat = next(c for c in result["recommendedCrops"] if c["cropName"] == "Wheat")
    assert wheat["recommendation"] == "Insufficient Data"
    assert wheat["dataConfidence"] == "low"


def test_multi_listing_crop_gets_confident_label():
    df = _make_crops_df()
    with patch.object(crs, "load_crops", return_value=df):
        result = crs.get_crop_recommendation_scores()

    rice = next(c for c in result["recommendedCrops"] if c["cropName"] == "Rice")
    assert rice["dataConfidence"] == "high"
    assert rice["recommendation"] != "Insufficient Data"


def test_methodology_note_present_and_mentions_weights():
    df = _make_crops_df()
    with patch.object(crs, "load_crops", return_value=df):
        result = crs.get_crop_recommendation_scores()

    assert "methodology" in result
    assert str(crs.PRICE_WEIGHT) in result["methodology"]


def test_weights_sum_to_one():
    # Sanity check that the documented weights are still a valid
    # convex combination.
    total = crs.PRICE_WEIGHT + crs.LISTING_WEIGHT + crs.STABILITY_WEIGHT
    assert abs(total - 1.0) < 1e-9