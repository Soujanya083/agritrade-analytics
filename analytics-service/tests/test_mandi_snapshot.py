"""
test_mandi_snapshot.py - tests the cached fallback data used when the
live data.gov.in API is unreachable. Pure logic, no network call needed.

Run with: pytest tests/test_mandi_snapshot.py -v
"""
from app.services.mandi_snapshot import get_snapshot


def test_get_snapshot_returns_records_for_known_commodity():
    records = get_snapshot("onion")
    assert len(records) > 0
    assert all(r["commodity"] == "Onion" for r in records)


def test_get_snapshot_is_case_insensitive():
    records_lower = get_snapshot("onion")
    records_upper = get_snapshot("ONION")
    assert records_lower == records_upper


def test_get_snapshot_returns_empty_for_unknown_commodity():
    records = get_snapshot("dragonfruit")
    assert records == []


def test_get_snapshot_filters_by_state():
    all_records = get_snapshot("onion")
    punjab_records = get_snapshot("onion", state="Punjab")
    assert len(punjab_records) <= len(all_records)
    assert all(r["state"] == "Punjab" for r in punjab_records)


def test_get_snapshot_unknown_state_returns_empty():
    records = get_snapshot("onion", state="Atlantis")
    assert records == []