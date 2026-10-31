"""
test_market_recommendation.py - tests the Net Profit market ranking
engine. Uses the cached AGMARKNET snapshot (via mandi_comparison's
existing fallback path), so no network call or API key is needed -
matches the pattern in test_mandi_snapshot.py.

Run with: pytest tests/test_market_recommendation.py -v
"""
import pytest
import requests

from app.services import mandi_comparison
from app.services.market_recommendation import (
    get_market_recommendation,
    _transport_cost,
    TRANSPORT_COST_SAME_STATE,
    TRANSPORT_COST_OTHER_STATE,
    STORAGE_COST_PER_QUINTAL_PER_DAY,
    ASSUMED_STORAGE_DAYS,
)


@pytest.fixture(autouse=True)
def _force_cached_snapshot_path(monkeypatch):
    """
    fetch_mandi_prices short-circuits to an error unless credentials are
    "configured", and otherwise makes a live HTTP call. These tests want
    the cached-snapshot path, so: set dummy credentials AND make the live
    call fail deterministically. Previously the credentials were set at
    import time, after the module under test had already read the
    environment, so the tests only passed on a machine whose .env held
    real keys (and then hit the real network).
    """
    monkeypatch.setenv("DATAGOVIN_API_KEY", "test-dummy-key")
    monkeypatch.setenv("DATAGOVIN_RESOURCE_ID", "test-dummy-resource")

    def _offline(*args, **kwargs):
        raise requests.exceptions.ConnectionError("network disabled in tests")

    monkeypatch.setattr(mandi_comparison.requests, "get", _offline)


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

# ---------------------------------------------------------------------------
# Profit band: the legacy number is an optimistic UPPER BOUND, so every market
# also reports conservative / expected / optimistic scenarios.
# ---------------------------------------------------------------------------
from app.services.market_recommendation import (  # noqa: E402
    PROFIT_SCENARIOS,
    profit_band,
    recommendation_robustness,
    scenario_net_per_quintal,
)


def test_optimistic_scenario_equals_the_legacy_formula():
    band = profit_band(2500, 80, 30)
    assert band["optimistic"] == 2500 - 80 - 30


def test_band_is_ordered_conservative_below_expected_below_optimistic():
    for modal in (800, 2500, 6000):
        for transport in (TRANSPORT_COST_SAME_STATE, TRANSPORT_COST_OTHER_STATE):
            band = profit_band(modal, transport, 30)
            assert band["conservative"] < band["expected"] < band["optimistic"]


def test_expected_scenario_hand_calculation():
    # 2500 * 0.98 (shrinkage) = 2450; minus 3% commission = 2376.5;
    # minus 10 handling, minus 80 * 1.15 transport, minus 30 storage = 2244.5
    assert profit_band(2500, 80, 30)["expected"] == 2244.5


def test_conservative_scenario_hand_calculation():
    # 2500 * 0.93 * 0.95 = 2208.75; minus 5% commission = 2098.3125;
    # minus 20 handling, minus 80 * 1.4, minus 30 * 1.5 = 1921.31
    assert profit_band(2500, 80, 30)["conservative"] == 1921.31


def test_scenarios_are_disclosed_and_cover_all_three_cases():
    assert set(PROFIT_SCENARIOS) == {"conservative", "expected", "optimistic"}
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu", quantity_kg=500)
    assert set(result["assumptions"]["profitScenarios"]) == set(PROFIT_SCENARIOS)
    assert "OPTIMISTIC" in result["assumptions"]["note"]


def test_every_ranked_market_carries_a_band_and_totals():
    result = get_market_recommendation("onion", farmer_state="Tamil Nadu", quantity_kg=500)
    for m in result["rankedMarkets"]:
        assert m["netProfitBandPerQuintal"]["optimistic"] == m["expectedNetProfitPerQuintal"]
        assert m["netProfitBandTotal"]["expected"] == round(m["netProfitBandPerQuintal"]["expected"] * 500 / 100, 2)


def test_a_thin_margin_can_turn_into_a_loss_in_the_conservative_case():
    # a market paying only a little above the costs: optimistic profit, conservative loss
    band = profit_band(190, 80, 30)
    assert band["optimistic"] > 0
    assert band["conservative"] < 0


def _entry(name, state, modal, transport=80, storage=30):
    return {"market": name, "district": "d", "state": state, "netProfitBandPerQuintal": profit_band(modal, transport, storage)}


def test_robustness_is_stable_when_one_market_wins_everywhere():
    ranked = [_entry("A", "X", 3000), _entry("B", "X", 2000)]
    r = recommendation_robustness(ranked)
    assert r["stable"] is True
    assert r["headlineMarketStillBestWhenConservative"] is True
    assert r["canLoseMoney"] is False


def test_robustness_flags_a_winner_that_changes_under_pessimistic_assumptions():
    # A quotes more but is far away: wins on the legacy number only if transport is cheap.
    a = _entry("A", "X", 2600, transport=250)
    b = _entry("B", "X", 2560, transport=80)
    # make A the headline by the optimistic number (as the legacy ranking would)
    a["netProfitBandPerQuintal"]["optimistic"] = 9999
    r = recommendation_robustness([a, b])
    assert r["stable"] is False
    assert r["headlineMarketStillBestWhenConservative"] is False
    assert r["bestMarketByScenario"]["conservative"] == "B"


def test_robustness_reports_the_width_of_the_band_and_loss_risk():
    r = recommendation_robustness([_entry("A", "X", 190)])
    assert r["bandWidthPerQuintal"] > 0
    assert r["canLoseMoney"] is True


def test_scenario_function_never_mutates_inputs_and_is_monotonic_in_price():
    sc = PROFIT_SCENARIOS["expected"]
    before = dict(sc)
    low = scenario_net_per_quintal(1000, 80, 30, sc)
    high = scenario_net_per_quintal(1200, 80, 30, sc)
    assert high > low
    assert sc == before
