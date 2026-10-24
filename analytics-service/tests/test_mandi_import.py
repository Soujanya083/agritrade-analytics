"""Bulk and API import of real mandi data."""
import pandas as pd
import pytest

from app.services.market import mandi_import
from app.services.market.mandi_data import normalize_records


class FakeCollection:
    """Minimal insert_many with a unique `key`, like the real index."""

    def __init__(self):
        self.docs = {}

    def insert_many(self, docs, ordered=False):
        errors, inserted = [], []
        for doc in docs:
            if doc["key"] in self.docs:
                errors.append({"code": 11000, "index": len(inserted)})
            else:
                self.docs[doc["key"]] = doc
                inserted.append(doc["key"])
        if errors:
            exc = RuntimeError("duplicates")
            exc.details = {"writeErrors": errors, "nInserted": len(inserted)}
            raise exc
        return type("R", (), {"inserted_ids": inserted})()


def rows(n=5, start_day=1):
    return [{"State": "Maharashtra", "Market": "Lasalgaon", "Commodity": "Onion", "Variety": "Red", "Grade": "FAQ",
             "Arrival_Date": f"{d:02d}/03/2025", "Min_Price": "1500", "Max_Price": "2500", "Modal_Price": str(2000 + d)}
            for d in range(start_day, start_day + n)]


def test_insert_skips_duplicates_instead_of_double_counting():
    collection = FakeCollection()
    clean, _ = normalize_records(rows(5))
    assert mandi_import.insert_clean_frame(collection, clean) == {"inserted": 5, "duplicatesSkipped": 0}
    again = mandi_import.insert_clean_frame(collection, clean)
    assert again == {"inserted": 0, "duplicatesSkipped": 5}
    assert len(collection.docs) == 5


def test_overlapping_reimport_only_adds_the_new_rows():
    collection = FakeCollection()
    mandi_import.insert_clean_frame(collection, normalize_records(rows(5))[0])
    outcome = mandi_import.insert_clean_frame(collection, normalize_records(rows(5, start_day=4))[0])   # days 4..8
    assert outcome == {"inserted": 3, "duplicatesSkipped": 2}


def test_documents_carry_a_lowercase_commodity_key_and_python_datetimes():
    docs = mandi_import.to_documents(normalize_records(rows(1))[0])
    assert docs[0]["commodityKey"] == "onion"
    assert docs[0]["date"].year == 2025 and not isinstance(docs[0]["date"], pd.Timestamp)


def test_csv_import_streams_in_chunks_and_reports_what_it_dropped(tmp_path):
    bad = {"State": "Maharashtra", "Market": "X", "Commodity": "Onion", "Variety": "Red", "Grade": "FAQ",
           "Arrival_Date": "garbage", "Min_Price": "1", "Max_Price": "2", "Modal_Price": "2"}
    path = tmp_path / "prices.csv"
    pd.DataFrame(rows(10) + [bad]).to_csv(path, index=False)
    collection = FakeCollection()
    messages = []
    report = mandi_import.import_csv(collection, str(path), chunksize=4, progress=messages.append)
    assert report["rowsRead"] == 11 and report["rowsKept"] == 10 and report["inserted"] == 10
    assert report["dropped"]["unparseable date"] == 1
    assert report["firstDate"] == "2025-03-01" and report["lastDate"] == "2025-03-10"
    assert len(messages) == 3                                   # 11 rows / chunks of 4


def test_csv_import_is_idempotent(tmp_path):
    path = tmp_path / "prices.csv"
    pd.DataFrame(rows(6)).to_csv(path, index=False)
    collection = FakeCollection()
    mandi_import.import_csv(collection, str(path), progress=lambda m: None)
    second = mandi_import.import_csv(collection, str(path), progress=lambda m: None)
    assert second["inserted"] == 0 and second["duplicatesSkipped"] == 6


# ------------------------------------------------------------------ API paging
def api_rows(n):
    return [{"state": "Punjab", "market": f"M{i}", "commodity": "Onion", "arrival_date": "23/08/2025",
             "modal_price": 3000 + i, "min_price": 2900, "max_price": 3100} for i in range(n)]


def test_paging_advances_by_what_the_server_returned_not_what_was_requested():
    """Regression for the known pitfall: some keys cap a page at 10 rows even when 1000 are requested."""
    data = api_rows(35)
    calls = []

    def fetch(offset, limit):
        calls.append((offset, limit))
        return {"records": data[offset:offset + 10], "total": len(data)}     # server ignores `limit`

    got = list(mandi_import.iter_api_records(fetch, page_size=1000))
    assert len(got) == 35
    assert [c[0] for c in calls] == [0, 10, 20, 30]


def test_paging_stops_when_the_server_returns_nothing():
    data = api_rows(5)
    got = list(mandi_import.iter_api_records(lambda o, l: {"records": data[o:o + 100]}, page_size=100))
    assert len(got) == 5


def test_paging_respects_max_records():
    data = api_rows(50)
    got = list(mandi_import.iter_api_records(lambda o, l: {"records": data[o:o + 20], "total": 50}, 20, max_records=25))
    assert len(got) == 25


def test_api_fetcher_sends_key_paging_and_filters():
    seen = {}

    def fake_get(url, params=None, timeout=None, headers=None):
        seen.update(url=url, params=params, headers=headers)
        return type("R", (), {"raise_for_status": lambda self: None, "json": lambda self: {"records": []}})()

    fetch = mandi_import.make_api_fetcher("KEY", "RES", {"state.keyword": "Punjab"}, get=fake_get)
    fetch(30, 10)
    assert seen["url"].endswith("/resource/RES")
    assert seen["params"]["api-key"] == "KEY" and seen["params"]["offset"] == 30 and seen["params"]["limit"] == 10
    assert seen["params"]["filters[state.keyword]"] == "Punjab"
    assert "python-requests" not in seen["headers"]["User-Agent"]


def test_api_import_end_to_end_with_a_fake_server():
    data = api_rows(12)

    def fake_get(url, params=None, timeout=None, headers=None):
        page = data[params["offset"]:params["offset"] + 5]
        body = {"records": page, "total": 12}
        return type("R", (), {"raise_for_status": lambda self: None, "json": lambda self: body})()

    collection = FakeCollection()
    report = mandi_import.import_api(collection, "KEY", get=fake_get, pause=0)
    assert report["rowsRead"] == 12 and report["inserted"] == 12
    assert report["lastDate"] == "2025-08-23"


# ------------------------------------------------ filters, dry run and scan (protect a 512 MB Atlas cluster)
def mixed_csv(tmp_path):
    data = (rows(5)                                                                       # Onion / Maharashtra
            + [dict(r, Commodity="Tomato", Modal_Price="1500") for r in rows(4)]          # Tomato / Maharashtra
            + [dict(r, State="Punjab", Market="Khanna", Commodity="Wheat", Modal_Price="2300") for r in rows(3)])
    path = tmp_path / "mixed.csv"
    pd.DataFrame(data).to_csv(path, index=False)
    return str(path)


def test_commodity_filter_imports_only_the_chosen_crops_and_counts_the_rest(tmp_path):
    collection = FakeCollection()
    report = mandi_import.import_csv(collection, mixed_csv(tmp_path), progress=lambda m: None, commodities=["onion", "WHEAT"])
    assert report["rowsRead"] == 12
    assert report["rowsKept"] == 8 and report["inserted"] == 8 and report["filteredOut"] == 4
    assert {d["commodity"] for d in collection.docs.values()} == {"Onion", "Wheat"}


def test_state_filter_and_commodity_filter_combine(tmp_path):
    collection = FakeCollection()
    report = mandi_import.import_csv(collection, mixed_csv(tmp_path), progress=lambda m: None,
                                     commodities=["Wheat", "Onion"], states=["maharashtra"])
    assert report["rowsKept"] == 5 and {d["state"] for d in collection.docs.values()} == {"Maharashtra"}


def test_a_filter_that_matches_nothing_imports_nothing_and_says_so(tmp_path):
    collection = FakeCollection()
    report = mandi_import.import_csv(collection, mixed_csv(tmp_path), progress=lambda m: None, commodities=["Dragon Fruit"])
    assert report["rowsKept"] == 0 and report["inserted"] == 0 and report["filteredOut"] == 12
    assert collection.docs == {} and report["firstDate"] is None


def test_filters_are_exact_so_a_similar_name_is_not_imported_by_accident(tmp_path):
    path = tmp_path / "similar.csv"
    pd.DataFrame(rows(3) + [dict(r, Commodity="Onion Green", Market="M9") for r in rows(2)]).to_csv(path, index=False)
    collection = FakeCollection()
    mandi_import.import_csv(collection, str(path), progress=lambda m: None, commodities=["Onion"])
    assert {d["commodity"] for d in collection.docs.values()} == {"Onion"}


def test_dry_run_reads_cleans_and_counts_but_writes_nothing(tmp_path):
    report = mandi_import.import_csv(None, mixed_csv(tmp_path), progress=lambda m: None, commodities=["Onion"])
    assert report["dryRun"] is True
    assert report["rowsKept"] == 5 and report["inserted"] == 0 and report["duplicatesSkipped"] == 0
    assert report["firstDate"] == "2025-03-01" and report["lastDate"] == "2025-03-05"


def test_a_normal_import_is_not_marked_as_a_dry_run(tmp_path):
    report = mandi_import.import_csv(FakeCollection(), mixed_csv(tmp_path), progress=lambda m: None)
    assert report["dryRun"] is False and report["inserted"] == 12


def test_scan_lists_what_a_file_holds_without_importing(tmp_path):
    scan = mandi_import.scan_csv(mixed_csv(tmp_path))
    assert scan["cleanRows"] == 12 and scan["commodityCount"] == 3 and scan["stateCount"] == 2
    assert dict(scan["commodities"]) == {"Onion": 5, "Tomato": 4, "Wheat": 3}
    assert scan["firstDate"] == "2025-03-01" and scan["lastDate"] == "2025-03-05"
    assert scan["approxMongoMB"] == round(12 * 0.5 / 1000, 2)       # a rough estimate: ~500 bytes per row


def test_scan_counts_only_cleaned_rows(tmp_path):
    bad = dict(rows(1)[0], Modal_Price="0", Market="Bad")
    path = tmp_path / "bad.csv"
    pd.DataFrame(rows(3) + [bad]).to_csv(path, index=False)
    assert mandi_import.scan_csv(str(path))["cleanRows"] == 3
