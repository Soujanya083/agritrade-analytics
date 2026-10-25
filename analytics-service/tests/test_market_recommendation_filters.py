"""Best market: no farmers' direct-sale markets, no mixing of different varieties, state spellings compared by meaning."""
from app.services import market_recommendation as mr


def live(records):
    return {"commodity": "Onion", "source": "live", "records": records}


def rec(market, state, modal, variety="Onion Big", when="24/10/2026"):
    return {"market": market, "state": state, "district": "D", "modal_price": modal, "variety": variety, "arrival_date": when}


def run(monkeypatch, records, farmer_state="Tamil Nadu", quantity=500):
    monkeypatch.setattr(mr, "fetch_mandi_prices", lambda *a, **k: live(records))
    return mr.get_market_recommendation("Onion", farmer_state=farmer_state, quantity_kg=quantity)


def test_a_farmers_direct_sale_market_is_never_the_recommendation(monkeypatch):
    result = run(monkeypatch, [rec("Katpadi(Uzhavar Sandhai )", "Tamil Nadu", 6750), rec("Vellore", "Tamil Nadu", 4200),
                               rec("Salem", "Tamil Nadu", 4000), rec("Erode", "Tamil Nadu", 4100)])
    assert result["recommendedMarket"]["market"] == "Vellore"
    assert result["retailStyleMarketsLeftOut"] == 1 and result["marketsCompared"] == 3


def test_if_every_market_is_direct_sale_they_are_still_ranked_rather_than_nothing(monkeypatch):
    result = run(monkeypatch, [rec("A(Uzhavar Sandhai)", "Tamil Nadu", 5000), rec("B(Uzhavar Sandhai)", "Tamil Nadu", 5200)])
    assert result["marketsCompared"] == 2 and result["retailStyleMarketsLeftOut"] == 0


def test_a_clearly_different_variety_is_left_out_of_the_ranking(monkeypatch):
    big = [rec(f"M{i}", "Tamil Nadu", 4000 + i * 50) for i in range(6)]
    result = run(monkeypatch, big + [rec("GreenMkt", "Tamil Nadu", 11000, variety="Onion Green")])
    assert all(m["market"] != "GreenMkt" for m in result["rankedMarkets"]) and result["variety"] == "onion big"


def test_state_spellings_count_as_the_same_state_for_transport_cost(monkeypatch):
    result = run(monkeypatch, [rec("Vellore", "Tamilnadu", 4200), rec("Salem", "Tamilnadu", 4000), rec("Pune", "Maharashtra", 4400)])
    tiers = {m["market"]: m["transportTier"] for m in result["rankedMarkets"]}
    assert tiers == {"Vellore": "same_state", "Salem": "same_state", "Pune": "other_state"}


def test_the_result_carries_todays_median_and_the_data_date(monkeypatch):
    result = run(monkeypatch, [rec("A", "Tamil Nadu", 2000), rec("B", "Tamil Nadu", 2200), rec("C", "Tamil Nadu", 2400)])
    assert result["medianModalPricePerKg"] == 22.0 and result["dataAsOf"] == "2026-10-24"
