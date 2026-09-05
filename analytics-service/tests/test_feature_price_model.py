"""
test_feature_price_model.py - tests the feature engineering logic
(lag/rolling features, no-leakage guarantees) using mocked crop data.
Model training and SHAP itself aren't asserted on here (that needs a
real fit), just that the feature matrix is built correctly and that
the module degrades gracefully when there isn't enough history.

Run with: pytest tests/test_feature_price_model.py -v
"""
from unittest.mock import patch
import pandas as pd
from datetime import datetime, timedelta

from app.services import feature_price_model


def _make_fake_crops_df(n_listings_per_crop=5, crop_names=("Wheat",)):
    base_date = datetime(2026, 1, 1)
    rows = []
    for crop in crop_names:
        for i in range(n_listings_per_crop):
            rows.append({
                "cropName": crop,
                "basePrice": 20 + i,
                "currentBid": 22 + i * 0.5,
                "location": "Karnataka",
                "createdAt": base_date + timedelta(days=i),
            })
    return pd.DataFrame(rows)


def test_feature_matrix_empty_when_required_columns_missing():
    df = pd.DataFrame({"cropName": ["Wheat"]})
    result = feature_price_model._build_feature_matrix(df)
    assert result.empty


def test_feature_matrix_drops_first_listing_per_crop_no_lag():
    # 5 listings for Wheat -> first has no lag_1, so 4 rows should remain.
    df = _make_fake_crops_df(n_listings_per_crop=5)
    result = feature_price_model._build_feature_matrix(df)
    assert len(result) == 4


def test_lag_1_matches_previous_listings_price():
    df = _make_fake_crops_df(n_listings_per_crop=3)
    result = feature_price_model._build_feature_matrix(df)
    # Listings are currentBid = 22, 22.5, 23 for i=0,1,2
    # Row for i=1 should have lag_1 == 22 (the i=0 price)
    row = result.iloc[0]
    assert row["lag_1"] == 22


def test_rolling_mean_never_includes_current_row():
    df = _make_fake_crops_df(n_listings_per_crop=4)
    result = feature_price_model._build_feature_matrix(df)
    # For the last row (i=3), rolling_mean_3 should average i=0,1,2 only
    last_row = result.iloc[-1]
    expected = (22 + 22.5 + 23) / 3
    assert round(last_row["rolling_mean_3"], 2) == round(expected, 2)


def test_multiple_crops_do_not_leak_lag_across_each_other():
    df = _make_fake_crops_df(n_listings_per_crop=3, crop_names=("Wheat", "Rice"))
    result = feature_price_model._build_feature_matrix(df)
    # Each crop should independently drop its own first listing,
    # so 2 crops * (3-1) = 4 rows total.
    assert len(result) == 4
    assert set(result["cropName"].unique()) == {"Wheat", "Rice"}


def test_train_and_evaluate_reports_error_with_too_little_history():
    fake_df = _make_fake_crops_df(n_listings_per_crop=3)
    with patch.object(feature_price_model, "load_crops", return_value=fake_df):
        result = feature_price_model.train_and_evaluate_feature_model()
    assert "error" in result


def test_explain_with_shap_falls_back_when_no_history():
    fake_df = pd.DataFrame()
    with patch.object(feature_price_model, "load_crops", return_value=fake_df):
        with patch(
            "app.services.explainability.explain_price_prediction",
            return_value={"cropName": "Wheat", "factors": []},
        ):
            result = feature_price_model.explain_with_shap("Wheat")
    assert result["cropName"] == "Wheat"
    assert "note" in result