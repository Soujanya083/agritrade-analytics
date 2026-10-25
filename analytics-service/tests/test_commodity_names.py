import requests

from app.services import mandi_comparison
from app.services.market import commodity_names


class Resp:
    def __init__(self, records):
        self.records = records
        self.status_code = 200
    def raise_for_status(self):
        pass
    def json(self):
        return {"records": self.records}


def test_variants_start_with_the_name_given_and_never_repeat_it():
    assert commodity_names.variants("Okra") == ["Okra", "Bhindi(Ladies Finger)"]
    assert commodity_names.variants("Onion") == ["Onion"]
    assert commodity_names.variants("  green   gram ")[0] == "green gram"


def test_the_feeds_own_name_is_tried_when_the_plain_name_has_no_records(monkeypatch):
    monkeypatch.setenv("DATAGOVIN_API_KEY", "dummy")
    monkeypatch.setenv("DATAGOVIN_RESOURCE_ID", "dummy-res")
    asked = []

    def fake_get(url, params=None, headers=None, timeout=None):
        asked.append(params["filters[commodity]"])
        return Resp([{"market": "M", "modal_price": 3000}] if params["filters[commodity]"] == "Bhindi(Ladies Finger)" else [])

    monkeypatch.setattr(mandi_comparison.requests, "get", fake_get)
    result = mandi_comparison.fetch_mandi_prices("Okra", "Karnataka", 5)
    assert result["source"] == "live" and result["commodity"] == "Bhindi(Ladies Finger)"
    assert asked == ["Okra", "Bhindi(Ladies Finger)"]


def test_a_timeout_does_not_try_other_names(monkeypatch):
    monkeypatch.setenv("DATAGOVIN_API_KEY", "dummy")
    monkeypatch.setenv("DATAGOVIN_RESOURCE_ID", "dummy-res")
    asked = []

    def slow(url, params=None, headers=None, timeout=None):
        asked.append(params["filters[commodity]"])
        raise requests.exceptions.ReadTimeout("slow")

    monkeypatch.setattr(mandi_comparison.requests, "get", slow)
    result = mandi_comparison.fetch_mandi_prices("Cucumber", "Kerala", 5)
    assert "did not answer in time" in result["error"] and set(asked) == {"Cucumber"}
