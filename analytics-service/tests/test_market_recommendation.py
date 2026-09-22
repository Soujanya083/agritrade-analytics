"""
test_market_recommendation.py - tests the Net Profit market ranking
engine. Uses the cached AGMARKNET snapshot (via mandi_comparison's
existing fallback path), so no network call or API key is needed -
matches the pattern in test_mandi_snapshot.py.

Run with: pytest tests/test_market_recommendation.py -v
"""
import os
from app.services.market_recommendation import (
    get_market_recommendation,
    _transport_cost,
    TRANSPORT_COST_SAME_STATE,
    TRANSPORT_COST_OTHER_STATE,
    STORAGE_COST_PER_QUINTAL_PER_DAY,
    ASSUMED_STORAGE_DAYS,
)

# fetch_mandi_prices short-circuits to an error unless credentials are
# "configured" (even a dummy value forces it down the live-call-fails
# -> cached-snapshot path, which is what these tests exercise).
os.environ.setdefault("DATAGOVIN_API_KEY", "test-dummy-key")
os.environ.setdefault("DATAGOVIN_RESOURCE_ID", "test-dummy-resource")


def test_transport_cost_same_state_is_cheaper():
    cost, tier = _transport_cost("Tamil Nadu", "Tamil Nadu")
    assert cost == TRANSPORT_COST_SAME_STATE
    assert tier == "same_state"


def test_transport_cost_different_state_is_costlier():
    cost, tier = _transport_cost("Punjab", "Tamil Nadu")
    assert cost == TRANSPORT_COST_OTHER_STATE
    assert tier == "other_state"
    assert TRANSPORT_COST_OTHER_STATE > TRANSPORT_COST_SAME_STATE


def test_transport_cost_is_case_insensitive():
    cost, tier = _transport_cost("tamil nadu", "Tamil Nadu")
    assert tier == "same_state"


def test_transport_cost_defaults_to_other_state_when_farmer_state_missing():
    cost, tier = _transport_cost("Punjab", None)
    assert tier == "other_state"


def test_recommendation_returns_error_for_unknown_crop():
    result = get_market_recommendation("dragonfruit", farmer_state="Tamil Nadu")
    assert "error" in result


def test_recommendation_ranks_markets_by_net_profit_descending():
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu", quantity_kg=500)
    assert "rankedMarkets" in result
    profits = [m["expectedNetProfitPerQuintal"] for m in result["rankedMarkets"]]
    assert profits == sorted(profits, reverse=True)


def test_recommended_market_is_the_top_ranked_one():
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu")
    assert result["recommendedMarket"] == result["rankedMarkets"][0]


def test_net_profit_arithmetic_is_correct():
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu", quantity_kg=500)
    top = result["recommendedMarket"]
    expected_storage = STORAGE_COST_PER_QUINTAL_PER_DAY * ASSUMED_STORAGE_DAYS
    expected_net_per_quintal = (
        top["modalPricePerQuintal"] - top["transportCostPerQuintal"] - expected_storage
    )
    assert top["expectedNetProfitPerQuintal"] == round(expected_net_per_quintal, 2)
    assert top["expectedTotalNetProfit"] == round((expected_net_per_quintal / 100) * 500, 2)


def test_same_state_markets_get_lower_transport_cost_than_other_state():
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu")
    for m in result["rankedMarkets"]:
        if m["state"].lower() == "tamil nadu":
            assert m["transportTier"] == "same_state"
        else:
            assert m["transportTier"] == "other_state"


def test_assumptions_are_disclosed_in_the_response():
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu")
    assert "assumptions" in result
    assert result["assumptions"]["transportCostSameStatePerQuintal"] == TRANSPORT_COST_SAME_STATE
    assert result["assumptions"]["assumedStorageDays"] == ASSUMED_STORAGE_DAYS


def test_quantity_kg_is_optional():
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu")
    assert "expectedTotalNetProfit" not in result["recommendedMarket"]