"""
Analytics API.

Every route here requires authentication (router-level dependency, see
app/deps.py + app/auth.py). Errors use real HTTP status codes:

  401 missing/invalid/expired token      403 token role not allowed
  404 crop/commodity has no data         422 invalid parameter / not enough data
  429 chatbot LLM budget exceeded        500 unexpected failure
  503 database / auth / upstream not available

The body is {"detail": "...", "error": "...", "status": N}. Services still
return {"error": ...} internally; ok_or_http_error() translates it here.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.auth import Principal
from app.deps import rate_limit, require_principal
from app.http_errors import ApiError, ok_or_http_error
from app.privacy import pseudonymize
from app.services import (
    anomaly_benchmark,
    anomaly_detection,
    buyer_segmentation,
    catalog,
    chatbot,
    crop_performance,
    crop_recommendation_score,
    dashboard_summary,
    data_quality,
    decision_backtesting,
    decision_engine,
    demand_forecast,
    eda_analysis,
    explainability,
    feature_price_model,
    llm_client,
    mandi_comparison,
    market_insights,
    market_recommendation,
    model_evaluation,
    price_prediction,
    price_volatility,
    provenance,
    recommendation,
    today_prices,
    trends,
)
from app.services.market import real_market

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_principal), Depends(rate_limit)],
)

CropNameParam = Annotated[str, Query(min_length=1, max_length=80)]


# ============================================================
# MODELS
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
    note: str | None = None
    priceBasis: str | None = None


class ChatMessage(BaseModel):
    message: str = Field(min_length=1, max_length=chatbot.MAX_MESSAGE_CHARS)


# ============================================================
# HELPERS
# ============================================================

def require_crop(name: str) -> str:
    """Canonical marketplace crop name, or 404 if no listing uses it."""
    resolved = catalog.resolve_crop_name(name)
    if resolved is None:
        raise ApiError(404, f"Unknown crop '{name.strip()}': no marketplace listings found for it.")
    return resolved


def lenient_crop(name: str) -> str:
    """Canonical name when the marketplace knows the crop; otherwise the
    trimmed input (mandi endpoints work on commodities with no listings)."""
    return catalog.resolve_crop_name(name) or name.strip()


# ============================================================
# CATALOG
# ============================================================

@router.get("/crops")
def get_crops():
    """Crops that actually have marketplace listings (drives the dashboard dropdown)."""
    return {"data": catalog.list_crops(), "locations": catalog.list_locations()}


# ============================================================
# TRENDS
# ============================================================

@router.get("/price-trend")
def get_price_trend(cropName: str | None = Query(None, max_length=80)):
    return {"data": trends.price_trend(lenient_crop(cropName) if cropName else None)}


@router.get("/best-selling-crops")
def get_best_selling_crops(topN: int = Query(10, ge=1, le=50)):
    return {"data": trends.best_selling_crops(topN)}


@router.get("/region-demand")
def get_region_demand():
    return {"data": trends.region_wise_demand()}


@router.get("/farmer-revenue")
def get_farmer_revenue(principal: Principal = Depends(require_principal)):
    return {"data": pseudonymize(trends.farmer_revenue(), principal.subject)}


@router.get("/buyer-patterns")
def get_buyer_patterns(principal: Principal = Depends(require_principal)):
    return {"data": pseudonymize(trends.buyer_purchasing_patterns(), principal.subject)}


# ============================================================
# PRICE PREDICTION / DEMAND / RECOMMENDATION
# ============================================================

@router.get("/price-prediction", response_model=PricePredictionResponse)
def get_price_prediction(
    cropName: CropNameParam,
    daysAhead: int = Query(14, ge=1, le=price_prediction.MAX_FORECAST_DAYS),
):
    result = price_prediction.predict_price(require_crop(cropName), daysAhead)
    return ok_or_http_error(result)


@router.get("/demand-forecast")
def get_demand_forecast(
    cropName: CropNameParam,
    daysAhead: int = Query(14, ge=1, le=demand_forecast.MAX_FORECAST_DAYS),
):
    return ok_or_http_error(demand_forecast.predict_demand(require_crop(cropName), daysAhead))


@router.get("/recommend-crops")
def get_recommendation(
    location: str | None = Query(None, max_length=80),
    topN: int = Query(5, ge=1, le=50),
):
    return {"data": recommendation.recommend_crops(location, topN)}


# ============================================================
# CHATBOT
# ============================================================

@router.get("/chatbot/status")
def get_chatbot_status():
    """Tells the UI honestly whether general (LLM) answers are available."""
    return {"llm": llm_client.describe(), "projectDataAnswers": True}


@router.post("/chatbot")
def post_chatbot(payload: ChatMessage, principal: Principal = Depends(require_principal)):
    try:
        return chatbot.handle_message(payload.message, user_key=principal.subject)
    except chatbot.RateLimited as exc:
        raise ApiError(
            429,
            "Too many AI questions - please wait a bit before asking another general question.",
            headers={"Retry-After": str(exc.retry_after)},
        )


# ============================================================
# MODEL EVALUATION / BACKTESTING
# ============================================================

@router.get("/backtest/price")
def get_price_backtest(cropName: CropNameParam, testDays: int = Query(7, ge=1, le=30)):
    return ok_or_http_error(model_evaluation.backtest_price_model(require_crop(cropName), testDays))


@router.get("/backtest/demand")
def get_demand_backtest(cropName: CropNameParam, testDays: int = Query(7, ge=1, le=30)):
    return ok_or_http_error(model_evaluation.backtest_demand_model(require_crop(cropName), testDays))


# ============================================================
# DECISION SUPPORT
# ============================================================

@router.get("/decision/sell-or-wait")
def get_sell_or_wait_decision(cropName: CropNameParam, horizonDays: int = Query(7, ge=1, le=60)):
    """Live sell-now-vs-wait recommendation for a single crop."""
    return ok_or_http_error(decision_engine.get_sell_or_wait_recommendation(require_crop(cropName), horizonDays))


@router.get("/decision/backtest")
def get_decision_backtest(horizonDays: int = Query(7, ge=1, le=60)):
    """Backtests sell-now-vs-wait against baseline strategies on completed sales."""
    return ok_or_http_error(decision_backtesting.backtest_decisions(horizonDays))


# ============================================================
# BUYER SEGMENTATION
# ============================================================

@router.get("/buyer-segments")
def get_buyer_segments(
    nClusters: int = Query(3, ge=2, le=8),
    principal: Principal = Depends(require_principal),
):
    result = ok_or_http_error(buyer_segmentation.segment_buyers(nClusters))
    return pseudonymize(result, principal.subject)


# ============================================================
# MANDI PRICES / MARKET RECOMMENDATION
# ============================================================

@router.get("/mandi-prices")
def get_mandi_prices(commodity: str = Query(..., min_length=1, max_length=80), state: str | None = Query(None, max_length=60)):
    return ok_or_http_error(mandi_comparison.fetch_mandi_prices(commodity.strip(), state))


@router.get("/today-prices")
def get_today_prices_endpoint(
    commodity: str = Query(..., min_length=1, max_length=80),
    state: str | None = Query(None, max_length=60),
    limit: int = Query(200, ge=1, le=500),
    variety: str | None = Query(None, max_length=60),
    district: str | None = Query(None, max_length=60),
):
    """Today's mandi prices, market by market (live from data.gov.in; says clearly when the data is old)."""
    return ok_or_http_error(today_prices.get_today_prices(commodity, state, limit, variety=variety, district=district))


@router.get("/mandi-compare")
def get_mandi_compare(cropName: CropNameParam, state: str | None = Query(None, max_length=60)):
    crop = require_crop(cropName)
    prediction = ok_or_http_error(price_prediction.predict_price(crop, days_ahead=1))
    predicted_price = prediction["forecast"][0]["yhat"]
    return ok_or_http_error(mandi_comparison.compare_with_prediction(crop, predicted_price, state))


@router.get("/market-recommendation")
def get_market_recommendation(
    cropName: CropNameParam,
    farmerState: str | None = Query(None, max_length=60),
    quantityKg: float | None = Query(None, gt=0, le=1_000_000),
):
    return ok_or_http_error(
        market_recommendation.get_market_recommendation(lenient_crop(cropName), farmerState, quantityKg)
    )


@router.get("/decision-summary")
def get_crop_decision_summary(
    cropName: CropNameParam,
    farmerState: str | None = Query(None, max_length=60),
    quantityKg: float | None = Query(None, gt=0, le=1_000_000),
):
    """The 'what does this mean for me?' card - see dashboard_summary.get_crop_decision_summary."""
    return ok_or_http_error(
        dashboard_summary.get_crop_decision_summary(lenient_crop(cropName), farmerState, quantityKg)
    )


# ============================================================
# DATA QUALITY / EDA / EXPLAINABILITY
# ============================================================

@router.get("/data-quality")
def get_data_quality():
    return ok_or_http_error(data_quality.generate_data_quality_report())


@router.get("/eda-report")
def get_eda_report():
    return ok_or_http_error(eda_analysis.generate_eda_report())


@router.get("/prediction-explanation")
def get_prediction_explanation(cropName: CropNameParam):
    """SHAP explanation from the feature-engineered RandomForest, falling
    back to the rule-based explanation when listing history is thin."""
    return ok_or_http_error(feature_price_model.explain_with_shap(require_crop(cropName)))


@router.get("/prediction-explanation/rule-based")
def get_prediction_explanation_rule_based(cropName: CropNameParam):
    """Explicitly requests the rule-based explanation, bypassing SHAP."""
    return ok_or_http_error(explainability.explain_price_prediction(require_crop(cropName)))


@router.get("/price-model/evaluation")
def get_price_model_evaluation():
    """Chronological hold-out evaluation of the RandomForest price model,
    including naive baselines it must beat."""
    return ok_or_http_error(feature_price_model.train_and_evaluate_feature_model())


# ============================================================
# ANOMALIES / SUMMARIES
# ============================================================

@router.get("/bid-anomalies")
def get_bid_anomalies(
    contamination: float = Query(0.05, ge=0.01, le=0.20),
    principal: Principal = Depends(require_principal),
):
    result = ok_or_http_error(anomaly_detection.detect_bid_anomalies(contamination))
    return pseudonymize(result, principal.subject)


@router.get("/bid-anomalies/benchmark")
def get_bid_anomaly_benchmark():
    """Recall / precision / false-alarm rate of each detector on bids with KNOWN injected anomalies."""
    return anomaly_benchmark.run_benchmark()


@router.get("/dashboard-summary")
def get_dashboard_summary():
    return dashboard_summary.get_dashboard_summary()


@router.get("/market-insights")
def get_market_insights():
    return ok_or_http_error(market_insights.get_market_insights())


@router.get("/crop-performance")
def get_crop_performance():
    return ok_or_http_error(crop_performance.get_crop_performance())


@router.get("/price-volatility")
def get_price_volatility():
    return ok_or_http_error(price_volatility.get_price_volatility())


@router.get("/crop-recommendation-score")
def get_crop_recommendation_score():
    return ok_or_http_error(crop_recommendation_score.get_crop_recommendation_scores())


# ============================================================
# REAL MARKET DATA (imported AGMARKNET history) + DATA PROVENANCE
# ============================================================

@router.get("/data-provenance")
def get_data_provenance():
    """How much of the marketplace data is synthetic demo data, and how much real mandi history is imported."""
    result = provenance.get_data_provenance()
    commodities = real_market.real_market_commodities()
    return {**result, "realMandiHistory": {
        "commodities": len(commodities),
        "rows": sum(c["rows"] for c in commodities),
        "firstDate": min((c["firstDate"] for c in commodities), default=None),
        "lastDate": max((c["lastDate"] for c in commodities), default=None),
        # newest record across ALL commodities; warns when the daily collector has stopped
        "daysSinceLastRecord": min((c["daysSinceLastRecord"] for c in commodities), default=None),
        "stale": bool(commodities) and min(c["daysSinceLastRecord"] for c in commodities) > 14,
    }}


@router.get("/real-market/commodities")
def get_real_market_commodities():
    """Commodities with imported AGMARKNET history (empty until scripts/import_mandi_prices.py is run)."""
    return {"data": real_market.real_market_commodities()}


@router.get("/real-market/overview")
def get_real_market_overview(
    commodity: CropNameParam,
    state: str | None = Query(None, max_length=60),
    market: str | None = Query(None, max_length=80),
):
    """Seasonality, volatility, year-on-year change and market spread from REAL mandi prices."""
    return ok_or_http_error(real_market.real_market_overview(commodity.strip(), state, market))


@router.get("/real-market/forecast")
def get_real_market_forecast(
    commodity: CropNameParam,
    state: str | None = Query(None, max_length=60),
    market: str | None = Query(None, max_length=80),
    horizon: int = Query(14, ge=1, le=30),
):
    """Honest model comparison + conformal-interval forecast on REAL mandi prices (see forecast_lab.py)."""
    return ok_or_http_error(real_market.forecast_real_market(commodity.strip(), state, market, horizon))
