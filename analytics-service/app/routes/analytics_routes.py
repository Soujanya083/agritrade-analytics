from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services import (
    trends,
    price_prediction,
    recommendation,
    demand_forecast,
    chatbot,
    model_evaluation,
    buyer_segmentation,
    mandi_comparison,
    data_quality,
    eda_analysis,
    explainability,
    feature_price_model,
    anomaly_detection,
    dashboard_summary,
    market_insights,
    crop_performance,
    price_volatility,
    crop_recommendation_score,
    decision_engine,
    decision_backtesting,
)

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"]
)


# ============================================================
# PYDANTIC RESPONSE MODELS
# ============================================================

class ForecastItem(BaseModel):
    ds: str
    yhat: float
    yhat_lower: float
    yhat_upper: float


class PricePredictionResponse(BaseModel):
    cropName: str
    model: str
    historyPoints: int
    forecastDays: int
    forecast: list[ForecastItem]


class ChatMessage(BaseModel):
    message: str


# ============================================================
# TREND ANALYTICS
# ============================================================

@router.get("/price-trend")
def get_price_trend(cropName: str = Query(None)):
    return {"data": trends.price_trend(cropName)}


@router.get("/best-selling-crops")
def get_best_selling_crops(topN: int = Query(10)):
    return {"data": trends.best_selling_crops(topN)}


@router.get("/region-demand")
def get_region_demand():
    return {"data": trends.region_wise_demand()}


@router.get("/farmer-revenue")
def get_farmer_revenue():
    return {"data": trends.farmer_revenue()}


@router.get("/buyer-patterns")
def get_buyer_patterns():
    return {"data": trends.buyer_purchasing_patterns()}


# ============================================================
# PRICE PREDICTION
# ============================================================

@router.get(
    "/price-prediction",
    response_model=PricePredictionResponse
)
def get_price_prediction(
    cropName: str = Query(...),
    daysAhead: int = Query(14, ge=1, le=365)
):
    return price_prediction.predict_price(cropName, daysAhead)


# ============================================================
# CROP RECOMMENDATION
# ============================================================

@router.get("/recommend-crops")
def get_recommendation(
    location: str = Query(None),
    topN: int = Query(5)
):
    return {"data": recommendation.recommend_crops(location, topN)}


# ============================================================
# DEMAND FORECASTING
# ============================================================

@router.get("/demand-forecast")
def get_demand_forecast(
    cropName: str = Query(...),
    daysAhead: int = Query(14)
):
    return demand_forecast.predict_demand(cropName, daysAhead)


# ============================================================
# AI CHATBOT
# ============================================================

@router.post("/chatbot")
def post_chatbot(payload: ChatMessage):
    return chatbot.handle_message(payload.message)


# ============================================================
# MODEL EVALUATION / BACKTESTING
# ============================================================

@router.get("/backtest/price")
def get_price_backtest(
    cropName: str = Query(...),
    testDays: int = Query(7)
):
    return model_evaluation.backtest_price_model(cropName, testDays)


@router.get("/backtest/demand")
def get_demand_backtest(
    cropName: str = Query(...),
    testDays: int = Query(7)
):
    return model_evaluation.backtest_demand_model(cropName, testDays)


# ============================================================
# DECISION SUPPORT & DECISION BACKTESTING
# ============================================================

@router.get("/decision/sell-or-wait")
def get_sell_or_wait_decision(
    cropName: str = Query(...),
    horizonDays: int = Query(7, ge=1, le=60)
):
    """Live sell-now-vs-wait recommendation for a single crop."""
    return decision_engine.get_sell_or_wait_recommendation(cropName, horizonDays)


@router.get("/decision/backtest")
def get_decision_backtest(
    horizonDays: int = Query(7, ge=1, le=60)
):
    """
    Backtests the sell-now-vs-wait recommendation against baseline
    strategies (sell immediately, actual historical outcome) across
    every completed historical sale with enough context to evaluate.
    """
    return decision_backtesting.backtest_decisions(horizonDays)


# ============================================================
# BUYER SEGMENTATION
# ============================================================

@router.get("/buyer-segments")
def get_buyer_segments(
    nClusters: int = Query(3)
):
    return buyer_segmentation.segment_buyers(nClusters)


# ============================================================
# MANDI PRICE COMPARISON
# ============================================================

@router.get("/mandi-prices")
def get_mandi_prices(
    commodity: str = Query(...),
    state: str = Query(None)
):
    return mandi_comparison.fetch_mandi_prices(
        commodity,
        state
    )


@router.get("/mandi-compare")
def get_mandi_compare(
    cropName: str = Query(...),
    state: str = Query(None)
):
    prediction = price_prediction.predict_price(
        cropName,
        days_ahead=1
    )

    if "error" in prediction or not prediction.get("forecast"):
        return {
            "error": (
                f"Could not get a prediction for "
                f"'{cropName}' to compare."
            )
        }

    predicted_price = prediction["forecast"][0]["yhat"]

    return mandi_comparison.compare_with_prediction(
        cropName,
        predicted_price,
        state
    )


# ============================================================
# DATA QUALITY
# ============================================================

@router.get("/data-quality")
def get_data_quality():
    return data_quality.generate_data_quality_report()


# ============================================================
# EXPLORATORY DATA ANALYSIS
# ============================================================

@router.get("/eda-report")
def get_eda_report():
    return eda_analysis.generate_eda_report()


# ============================================================
# MODEL EXPLAINABILITY
# ============================================================

@router.get("/prediction-explanation")
def get_prediction_explanation(
    cropName: str = Query(...)
):
    """
    SHAP-based explanation from the feature-engineered RandomForest
    when there's enough listing history; otherwise falls back to the
    rule-based trend/volatility/momentum explanation automatically.
    """
    return feature_price_model.explain_with_shap(cropName)


@router.get("/prediction-explanation/rule-based")
def get_prediction_explanation_rule_based(
    cropName: str = Query(...)
):
    """Explicitly requests the rule-based explanation, bypassing SHAP."""
    return explainability.explain_price_prediction(cropName)


@router.get("/price-model/evaluation")
def get_price_model_evaluation():
    """
    Trains and evaluates the feature-engineered RandomForest price
    model (chronological hold-out), reporting accuracy metrics and
    feature importances.
    """
    return feature_price_model.train_and_evaluate_feature_model()


# ============================================================
# ANOMALY DETECTION
# ============================================================

@router.get("/bid-anomalies")
def get_bid_anomalies(
    contamination: float = Query(
        0.05,
        ge=0.01,
        le=0.20
    )
):
    return anomaly_detection.detect_bid_anomalies(
        contamination
    )

@router.get("/dashboard-summary")
def get_dashboard_summary():
    return dashboard_summary.get_dashboard_summary()

@router.get("/market-insights")
def get_market_insights():
    return market_insights.get_market_insights()

@router.get("/crop-performance")
def get_crop_performance():
    return crop_performance.get_crop_performance()

@router.get("/price-volatility")
def get_price_volatility():
    return price_volatility.get_price_volatility()

@router.get("/crop-recommendation-score")
def get_crop_recommendation_score():
    return crop_recommendation_score.get_crop_recommendation_scores()