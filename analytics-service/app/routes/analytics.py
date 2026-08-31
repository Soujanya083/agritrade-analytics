from fastapi import APIRouter, Query
from pydantic import BaseModel
from app.services import trends, price_prediction, recommendation, demand_forecast, chatbot, model_evaluation, buyer_segmentation, mandi_comparison
 
router = APIRouter(prefix="/api/analytics", tags=["analytics"])
 
 
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
 
 
@router.get("/price-prediction")
def get_price_prediction(cropName: str = Query(...), daysAhead: int = Query(14)):
    return price_prediction.predict_price(cropName, daysAhead)
 
 
@router.get("/recommend-crops")
def get_recommendation(location: str = Query(None), topN: int = Query(5)):
    return {"data": recommendation.recommend_crops(location, topN)}
 
 
@router.get("/demand-forecast")
def get_demand_forecast(cropName: str = Query(...), daysAhead: int = Query(14)):
    return demand_forecast.predict_demand(cropName, daysAhead)
 
 
class ChatMessage(BaseModel):
    message: str
 
 
@router.post("/chatbot")
def post_chatbot(payload: ChatMessage):
    return chatbot.handle_message(payload.message)
 
 
@router.get("/backtest/price")
def get_price_backtest(cropName: str = Query(...), testDays: int = Query(7)):
    return model_evaluation.backtest_price_model(cropName, testDays)
 
 
@router.get("/backtest/demand")
def get_demand_backtest(cropName: str = Query(...), testDays: int = Query(7)):
    return model_evaluation.backtest_demand_model(cropName, testDays)
 
 
@router.get("/buyer-segments")
def get_buyer_segments(nClusters: int = Query(3)):
    return buyer_segmentation.segment_buyers(nClusters)
 
 
@router.get("/mandi-prices")
def get_mandi_prices(commodity: str = Query(...), state: str = Query(None)):
    return mandi_comparison.fetch_mandi_prices(commodity, state)
 
 
@router.get("/mandi-compare")
def get_mandi_compare(cropName: str = Query(...), state: str = Query(None)):
    prediction = price_prediction.predict_price(cropName, days_ahead=1)
    if "error" in prediction or not prediction.get("forecast"):
        return {"error": f"Could not get a prediction for '{cropName}' to compare."}
    predicted_price = prediction["forecast"][0]["yhat"]
    return mandi_comparison.compare_with_prediction(cropName, predicted_price, state)
 