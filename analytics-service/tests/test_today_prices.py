from datetime import date

from app.services import mandi_comparison, today_prices

TODAY = date(2026, 10, 23)


def rec(market, modal, when="23/10/2026", state="Karnataka"):
    return {"state": state, "district": "D", "market": market, "variety": "Local", "grade": "FAQ",
            "arrival_date": when, "min_price": modal - 100, "max_price": modal + 100, "modal_price": modal}


def patch(monkeypatch, records, source="live"):
    monkeypatch.setattr(mandi_comparison, "fetch_mandi_prices",
                        lambda *a, **k: {"commodity": "Onion", "records": records, "source": source})


def test_converts_to_per_kg_and_summarises(monkeypatch):
    patch(monkeypatch, [rec("A", 1800), rec("B", 2000), rec("C", 2200)])
    result = today_prices.get_today_prices("onion", today=TODAY)
    assert result["commodity"] == "Onion" and result["isCurrent"] is True and result["asOf"] == "2026-10-23"
    assert result["summary"] == {"marketsReported": 3, "medianPerKg": 20.0, "lowPerKg": 18.0, "highPerKg": 22.0}
    assert [r["market"] for r in result["rows"]] == ["C", "B", "A"]   # highest first


def test_old_data_is_never_presented_as_today(monkeypatch):
    patch(monkeypatch, [rec("A", 1800, "23/08/2026"), rec("B", 2000, "23/08/2026"), rec("C", 2200, "23/08/2026")],
          source="cached_snapshot")
    result = today_prices.get_today_prices("Onion", today=TODAY)
    assert result["isCurrent"] is False and result["ageDays"] == 61 and result["source"] == "cached_snapshot"


def test_extreme_markets_are_flagged_and_left_out_of_the_summary(monkeypatch):
    patch(monkeypatch, [rec("A", 1800), rec("B", 2000), rec("C", 2200), rec("Retail", 9000)])
    result = today_prices.get_today_prices("Onion", today=TODAY)
    assert result["unusualMarkets"] == 1 and result["summary"]["highPerKg"] == 22.0
    assert result["rows"][-1]["market"] == "Retail" and result["rows"][-1]["unusual"] is True


def test_records_without_a_usable_price_are_skipped(monkeypatch):
    patch(monkeypatch, [rec("A", 1800), {"market": "B", "modal_price": "NA"}, {"market": "C"}])
    assert today_prices.get_today_prices("Onion", today=TODAY)["summary"]["marketsReported"] == 1


def test_errors_pass_through_and_empty_results_are_reported(monkeypatch):
    monkeypatch.setattr(mandi_comparison, "fetch_mandi_prices", lambda *a, **k: {"error": "credentials missing"})
    assert today_prices.get_today_prices("Onion", today=TODAY) == {"error": "credentials missing"}
    patch(monkeypatch, [{"market": "X"}])
    assert "No usable price records" in today_prices.get_today_prices("Onion", "Kerala", today=TODAY)["error"]


def test_a_state_with_no_records_falls_back_to_all_india_and_says_so(monkeypatch):
    def fake(commodity, state=None, limit=200):
        if state:
            return {"error": "No mandi price records found - live API: the API answered but has no records for this commodity/state today; and no cached snapshot"}
        return {"commodity": commodity, "records": [rec("A", 1800), rec("B", 2200)], "source": "live"}
    monkeypatch.setattr(mandi_comparison, "fetch_mandi_prices", fake)
    result = today_prices.get_today_prices("Onion", "Karnataka", today=TODAY)
    assert result["stateFallback"] is True and result["requestedState"] == "Karnataka" and result["state"] is None
    assert "no records for Karnataka today" in result["note"] and result["summary"]["marketsReported"] == 2


def test_a_timeout_does_not_trigger_the_all_india_fallback(monkeypatch):
    calls = []

    def fake(commodity, state=None, limit=200):
        calls.append(state)
        return {"error": "No mandi price records found - live API: the API did not answer in time; and no cached snapshot"}
    monkeypatch.setattr(mandi_comparison, "fetch_mandi_prices", fake)
    result = today_prices.get_today_prices("Onion", "Karnataka", today=TODAY)
    assert "did not answer in time" in result["error"] and calls == ["Karnataka"]


def test_normal_state_results_are_not_marked_as_fallback(monkeypatch):
    patch(monkeypatch, [rec("A", 1800), rec("B", 2200)])
    result = today_prices.get_today_prices("Onion", "Karnataka", today=TODAY)
    assert result["stateFallback"] is False and result["state"] == "Karnataka"


def rec_v(market, modal, variety, state="Tamil Nadu"):
    r = rec(market, modal, state=state)
    r["variety"] = variety
    return r


def test_a_different_product_is_not_mixed_into_the_main_variety(monkeypatch):
    big = [rec_v(f"Mandi{i}", 4000 + i * 100, "Onion Big") for i in range(6)]
    green = [rec_v("GreenMkt", 10000, "Onion Green"), rec_v("GreenMkt2", 9500, "Onion Green")]
    patch(monkeypatch, big + green)
    result = today_prices.get_today_prices("Onion", "Tamil Nadu", today=TODAY)
    assert result["variety"] == "Onion Big" and "most common variety" in result["varietyNote"]
    assert result["summary"]["highPerKg"] < 50                # spring-onion prices are not in the summary
    assert {v["label"] for v in result["varieties"]} == {"Onion Big", "Onion Green"}
    green_view = today_prices.get_today_prices("Onion", "Tamil Nadu", today=TODAY, variety="onion green")
    assert green_view["variety"] == "Onion Green" and green_view["summary"]["marketsReported"] == 2


def test_an_unknown_variety_is_an_honest_error(monkeypatch):
    patch(monkeypatch, [rec_v("A", 2000, "Local"), rec_v("B", 2100, "Local")])
    assert "No Onion records of variety" in today_prices.get_today_prices("Onion", None, today=TODAY, variety="Imaginary")["error"]


def test_farmers_direct_sale_markets_are_flagged_and_kept_out_of_the_summary(monkeypatch):
    rows = [rec_v("Lasalgaon", 2000, "Local"), rec_v("Pimpalgaon", 2200, "Local"), rec_v("Vellore", 2100, "Local"),
            rec_v("Katpadi(Uzhavar Sandhai )", 6000, "Local")]
    patch(monkeypatch, rows)
    result = today_prices.get_today_prices("Onion", None, today=TODAY)
    assert result["retailStyleMarkets"] == 1 and result["summary"]["highPerKg"] == 22.0
    flagged = [r for r in result["rows"] if r["retailStyle"]]
    assert [r["market"] for r in flagged] == ["Katpadi(Uzhavar Sandhai )"]


def test_the_other_spelling_of_a_state_is_tried_when_the_first_has_no_records(monkeypatch):
    asked = []

    def fake(commodity, state=None, limit=200):
        asked.append(state)
        if state == "Orissa":
            return {"commodity": commodity, "records": [rec("A", 1800, state="Orissa"), rec("B", 2200, state="Orissa")], "source": "live"}
        return {"error": "No mandi price records found - live API: the API answered but has no records for this commodity/state today; and no cached snapshot"}
    monkeypatch.setattr(mandi_comparison, "fetch_mandi_prices", fake)
    result = today_prices.get_today_prices("Onion", "Odisha", today=TODAY)
    assert asked == ["Odisha", "Orissa"] and result["stateFallback"] is False and result["summary"]["marketsReported"] == 2


def rec_d(market, modal, district):
    r = rec(market, modal, state="Karnataka")
    r["district"] = district
    return r


def test_a_karnataka_district_is_shown_first_under_its_old_or_new_name(monkeypatch):
    patch(monkeypatch, [rec_d("Mysore APMC", 2000, "Mysore"), rec_d("Mandya APMC", 2100, "Mandya"), rec_d("Hunsur", 2200, "Mysuru"), rec_d("Bidar", 1900, "Bidar")])
    result = today_prices.get_today_prices("Onion", "Karnataka", today=TODAY, district="Mysuru")
    assert {r["market"] for r in result["rows"]} == {"Mysore APMC", "Hunsur"} and result["districtFallback"] is False


def test_a_district_with_no_records_falls_back_to_the_wider_area_and_says_so(monkeypatch):
    patch(monkeypatch, [rec_d("Mandya APMC", 2100, "Mandya"), rec_d("Bidar", 1900, "Bidar")])
    result = today_prices.get_today_prices("Onion", "Karnataka", today=TODAY, district="Udupi")
    assert result["districtFallback"] is True and len(result["rows"]) == 2
    assert "no records for Udupi district today" in result["note"]
