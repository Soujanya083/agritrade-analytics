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
