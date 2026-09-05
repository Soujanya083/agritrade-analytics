"""
Feature-engineered price model + SHAP explainability.

price_prediction.py forecasts a *time series* (Prophet) - it has no
individual input features for SHAP to attribute a prediction to.
This module takes a complementary approach: it engineers per-listing
features (previous price for the same crop, a short rolling average,
day-of-week, month, the farmer's asking price, crop type, location)
and fits a RandomForestRegressor on them, so SHAP has an actual
feature vector to explain rather than a pure time index.

If SHAP isn't installed, fails to import, or there isn't enough
listing history yet, callers fall back to the rule-based explainer in
explainability.py - a missing optional dependency or a young dataset
degrades gracefully instead of breaking the endpoint.
"""

import numpy as np
import pandas as pd

from app.services.data_loader import load_crops


_FEATURE_COLUMNS = [
    "basePrice",
    "lag_1",
    "rolling_mean_3",
    "dayOfWeek",
    "month",
    "cropNameEncoded",
    "locationEncoded",
]

_FEATURE_LABELS = {
    "basePrice": "Farmer's Asking Price",
    "lag_1": "Previous Listing Price (Same Crop)",
    "rolling_mean_3": "Recent Average Price (Last 3 Listings)",
    "dayOfWeek": "Day of Week",
    "month": "Month",
    "cropNameEncoded": "Crop Type",
    "locationEncoded": "Location",
}


def _build_feature_matrix(crops_df: pd.DataFrame) -> pd.DataFrame:
    """
    Builds one row per crop listing with engineered features and the
    target (currentBid). basePrice is safe to use as a feature - it's
    the farmer's asking price, set when the listing is created, before
    the final bid settles, so it isn't leaking the target.
    """

    required = ["cropName", "currentBid", "basePrice", "location", "createdAt"]
    if crops_df.empty or any(col not in crops_df.columns for col in required):
        return pd.DataFrame()

    df = crops_df.copy()
    df["currentBid"] = pd.to_numeric(df["currentBid"], errors="coerce")
    df["basePrice"] = pd.to_numeric(df["basePrice"], errors="coerce")
    df["createdAt"] = pd.to_datetime(df["createdAt"], errors="coerce")

    df = df.dropna(subset=["cropName", "currentBid", "basePrice", "location", "createdAt"])
    df = df[df["currentBid"] >= 0]

    if df.empty:
        return pd.DataFrame()

    df = df.sort_values(["cropName", "createdAt"]).reset_index(drop=True)

    # Lag / rolling features are shifted by 1 so a listing's own price
    # never leaks into its own features - only prior listings do.
    df["lag_1"] = df.groupby("cropName")["currentBid"].shift(1)
    df["rolling_mean_3"] = (
        df.groupby("cropName")["currentBid"]
        .transform(lambda s: s.shift(1).rolling(window=3, min_periods=1).mean())
    )

    df["dayOfWeek"] = df["createdAt"].dt.dayofweek
    df["month"] = df["createdAt"].dt.month

    # Label-encoding is fine here (not one-hot) because RandomForest
    # splits on thresholds without assuming the codes are ordinal.
    df["cropNameEncoded"] = df["cropName"].astype("category").cat.codes
    df["locationEncoded"] = df["location"].astype("category").cat.codes

    # First listing per crop has no lag history - drop those rows.
    df = df.dropna(subset=["lag_1", "rolling_mean_3"]).reset_index(drop=True)

    return df


def _train_model(feature_df: pd.DataFrame):
    from sklearn.ensemble import RandomForestRegressor

    X = feature_df[_FEATURE_COLUMNS]
    y = feature_df["currentBid"]

    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=6,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X, y)
    return model


def train_and_evaluate_feature_model() -> dict:
    """
    Trains the feature-engineered RandomForest on a chronological
    80/20 split (not a random split - that would leak future listings
    into training) and reports MAE/RMSE/MAPE/sMAPE plus feature
    importances, so accuracy is reported honestly rather than assumed.
    """
    from app.services.model_evaluation import _calculate_metrics

    crops = load_crops()
    feature_df = _build_feature_matrix(crops)

    if feature_df.empty or len(feature_df) < 20:
        return {
            "error": (
                "Not enough listings with prior history to train a "
                "feature-based model yet. Needs at least 20 listings "
                "that have a previous listing for the same crop."
            ),
            "listingsAvailable": len(feature_df),
        }

    split_index = max(int(len(feature_df) * 0.8), len(feature_df) - 5)
    train_df = feature_df.iloc[:split_index]
    test_df = feature_df.iloc[split_index:]

    if test_df.empty:
        return {
            "error": "Not enough recent listings to hold out a test set.",
            "listingsAvailable": len(feature_df),
        }

    model = _train_model(train_df)
    predictions = model.predict(test_df[_FEATURE_COLUMNS])
    metrics = _calculate_metrics(test_df["currentBid"].values, predictions)

    return {
        "model": "RandomForestRegressor",
        "trainingListings": len(train_df),
        "testingListings": len(test_df),
        "metrics": metrics,
        "featureImportances": {
            _FEATURE_LABELS[col]: round(float(importance), 4)
            for col, importance in zip(_FEATURE_COLUMNS, model.feature_importances_)
        },
    }


def explain_with_shap(crop_name: str, top_n: int = 5) -> dict:
    """
    Explains the most recent listing's predicted price for a crop
    using real SHAP values from the feature-engineered RandomForest.

    Falls back to the rule-based trend/volatility/momentum explainer
    in explainability.py when SHAP isn't installed, fails, or there
    isn't enough marketplace-wide listing history yet to train a
    reliable feature model.
    """
    from app.services.explainability import explain_price_prediction

    def _fallback(note: str):
        result = explain_price_prediction(crop_name)
        if isinstance(result, dict) and "error" not in result:
            result["note"] = note
        return result

    crops = load_crops()
    feature_df = _build_feature_matrix(crops)

    if feature_df.empty or len(feature_df) < 20:
        return _fallback(
            "Not enough marketplace-wide listing history yet for a "
            "feature-based SHAP explanation; used trend-based "
            "explanation instead."
        )

    crop_rows = feature_df[
        feature_df["cropName"].astype(str).str.lower() == crop_name.lower()
    ]

    if crop_rows.empty:
        return _fallback(
            f"No listing history with prior context found for '{crop_name}' "
            "yet; used trend-based explanation instead."
        )

    try:
        import shap

        model = _train_model(feature_df)

        latest_row = crop_rows.iloc[[-1]]
        X_target = latest_row[_FEATURE_COLUMNS]

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_target)[0]
        base_value = float(explainer.expected_value)

        contributions = sorted(
            [
                {
                    "factor": _FEATURE_LABELS[col],
                    "value": round(float(X_target.iloc[0][col]), 2),
                    "shapContribution": round(float(value), 2),
                    "impact": (
                        "positive" if value > 0 else "negative" if value < 0 else "neutral"
                    ),
                }
                for col, value in zip(_FEATURE_COLUMNS, shap_values)
            ],
            key=lambda item: abs(item["shapContribution"]),
            reverse=True,
        )[:top_n]

        predicted_price = base_value + float(np.sum(shap_values))

        return {
            "cropName": crop_name,
            "method": "SHAP (TreeExplainer on RandomForestRegressor)",
            "basePredictionValue": round(base_value, 2),
            "predictedPrice": round(predicted_price, 2),
            "topFactors": contributions,
        }

    except Exception:
        return _fallback(
            "SHAP explanation unavailable in this environment; used "
            "trend-based explanation instead."
        )