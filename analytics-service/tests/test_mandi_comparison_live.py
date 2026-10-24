"""The live data.gov.in call: honest identity, retry, and a truthful reason when it falls back."""
import requests

from app.services import mandi_comparison


class Resp:
    def __init__(self, body=None, status=200):
        self.body, self.status_code = body or {}, status
    def raise_for_status(self):
        if self.status_code >= 400:
            error = requests.exceptions.HTTPError(str(self.status_code))
            error.response = self
            raise error
    def json(self):
        return self.body


def creds(monkeypatch):
    monkeypatch.setenv("DATAGOVIN_API_KEY", "dummy")
    monkeypatch.setenv("DATAGOVIN_RESOURCE_ID", "dummy-res")
    mandi_comparison.fetch_mandi_prices.cache_clear() if hasattr(mandi_comparison.fetch_mandi_prices, "cache_clear") else None


def test_live_call_sends_a_clear_user_agent_and_a_patient_timeout(monkeypatch):
    creds(monkeypatch)
    seen = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        seen.update(headers=headers, timeout=timeout)
        return Resp({"records": [{"market": "M", "modal_price": 2000}]})

    monkeypatch.setattr(mandi_comparison.requests, "get", fake_get)
    result = mandi_comparison.fetch_mandi_prices("HeaderTest", "Karnataka", 5)
    assert result["source"] == "live"
    assert "python-requests" not in seen["headers"]["User-Agent"] and "AgriTrade" in seen["headers"]["User-Agent"]
    assert seen["timeout"] == (5, 12)


def test_a_timeout_is_retried_once_and_then_reported_honestly(monkeypatch):
    creds(monkeypatch)
    calls = []

    def slow(*args, **kwargs):
        calls.append(1)
        raise requests.exceptions.ReadTimeout("slow")

    monkeypatch.setattr(mandi_comparison.requests, "get", slow)
    result = mandi_comparison.fetch_mandi_prices("TimeoutCrop", "Nowhere", 5)
    assert len(calls) == 2
    assert "did not answer in time" in result["error"]


def test_a_rejected_key_is_named_and_not_retried(monkeypatch):
    creds(monkeypatch)
    calls = []

    def rejected(*args, **kwargs):
        calls.append(1)
        return Resp(status=403)

    monkeypatch.setattr(mandi_comparison.requests, "get", rejected)
    result = mandi_comparison.fetch_mandi_prices("RejectedCrop", "Nowhere", 5)
    assert len(calls) == 1 and "HTTP 403" in result["error"] and "key rejected" in result["error"]


def test_an_empty_answer_says_so(monkeypatch):
    creds(monkeypatch)
    monkeypatch.setattr(mandi_comparison.requests, "get", lambda *a, **k: Resp({"records": []}))
    result = mandi_comparison.fetch_mandi_prices("EmptyCrop", "Nowhere", 5)
    assert "no records for this commodity/state today" in result["error"]
