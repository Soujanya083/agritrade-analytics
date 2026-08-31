"""
AI Chatbot Assistant — Phase 4 stretch feature.

Design choice: intent-based routing rather than a raw LLM call. This
keeps the assistant demo-safe (no API key/network dependency, so it
never fails during a live viva) while still being a genuine "AI
assistant" — it parses natural-language questions and routes them to
the real ML/analytics functions you already built, so answers are
grounded in actual data rather than a language model's guesses.

If you later want to swap this for a real LLM call (e.g. an Anthropic
or OpenAI API), keep this file's structure: detect intent + entities,
then hand off to the same service functions. Only the intent-detection
step would change.
"""
import re
from app.services import trends, price_prediction, recommendation, demand_forecast

KNOWN_CROPS = ["wheat", "rice", "tomato", "onion", "potato"]


def _find_crop(message: str) -> str | None:
    message = message.lower()
    for crop in KNOWN_CROPS:
        if crop in message:
            return crop.capitalize()
    return None


def _find_location(message: str) -> str | None:
    known_locations = ["pune", "nashik", "nagpur"]
    message = message.lower()
    for loc in known_locations:
        if loc in message:
            return loc.capitalize()
    return None


def handle_message(message: str) -> dict:
    text = message.lower().strip()
    crop = _find_crop(text)
    location = _find_location(text)

    # Intent: price prediction / forecast
    if any(k in text for k in ["price", "cost", "forecast", "predict"]) and crop:
        result = price_prediction.predict_price(crop, days_ahead=7)
        if "error" in result:
            return {"reply": f"Sorry, I don't have enough price history for {crop} yet."}
        next_price = result["forecast"][0]["yhat"] if result.get("forecast") else None
        return {
            "reply": (
                f"Based on recent trends, {crop}'s price is expected to be around "
                f"₹{next_price} per unit over the next few days (model: {result['model']})."
            ),
            "intent": "price_prediction",
            "data": result,
        }

    # Intent: demand forecast for a specific crop
    if any(k in text for k in ["demand for", "demand of"]) and crop:
        result = demand_forecast.predict_demand(crop, days_ahead=7)
        if "error" in result:
            return {"reply": f"Sorry, I don't have enough bid history for {crop} yet."}
        next_demand = result["forecast"][0]["yhat"] if result.get("forecast") else None
        return {
            "reply": f"Demand for {crop} is projected at roughly {next_demand} bids/day over the next week.",
            "intent": "demand_forecast",
            "data": result,
        }

    # Intent: "which crop has higher demand" / recommendation
    if any(k in text for k in ["which crop", "recommend", "higher demand", "best crop", "what should i sell", "what should i grow"]):
        results = recommendation.recommend_crops(location=location, top_n=3)
        if not results:
            return {"reply": "I don't have enough listing/bid data yet to make a recommendation."}
        top = results[0]
        location_phrase = f" in {location}" if location else ""
        return {
            "reply": (
                f"Right now{location_phrase}, {top['cropName']} looks like the strongest opportunity — "
                f"it has the highest demand relative to how much is currently listed."
            ),
            "intent": "recommendation",
            "data": results,
        }

    # Intent: best-selling crops
    if any(k in text for k in ["best selling", "best-selling", "top crops", "most sold"]):
        results = trends.best_selling_crops(top_n=3)
        if not results:
            return {"reply": "No completed transactions yet to rank best-selling crops."}
        names = ", ".join(r["cropName"] for r in results)
        return {
            "reply": f"The top-selling crops right now are: {names}.",
            "intent": "best_selling",
            "data": results,
        }

    # Intent: crop price trend (no prediction, just historical)
    if crop and any(k in text for k in ["trend", "history", "how has"]):
        results = trends.price_trend(crop)
        if not results:
            return {"reply": f"No price history found for {crop} yet."}
        latest = results[-1]
        return {
            "reply": f"{crop}'s most recent average price was ₹{latest['avgCurrentBid']} (as of {latest['date']}).",
            "intent": "price_trend",
            "data": results,
        }

    # Fallback: help message listing what the assistant can do
    return {
        "reply": (
            "I can help with things like:\n"
            "• \"What will wheat price be next week?\"\n"
            "• \"Which crop has higher demand in Pune?\"\n"
            "• \"What are the best-selling crops?\"\n"
            "• \"What's the demand for onion?\"\n"
            "Try asking me one of these!"
        ),
        "intent": "help",
    }