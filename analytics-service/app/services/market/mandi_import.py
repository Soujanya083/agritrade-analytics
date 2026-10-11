"""
Importing AGMARKNET data into MongoDB (collection: mandi_prices).

Two sources, same cleaning (mandi_data.normalize_records):
  * BULK CSV history (e.g. the public Agmarknet datasets on Kaggle / CEDA) -
    the only way to get years of history, because the official data.gov.in
    API only serves the CURRENT day.
  * DAILY API collector - run it every day (cron / GitHub Action) so the
    history keeps growing after the bulk import.

Re-importing is safe: rows have a unique `key`, duplicates are skipped.
"""
import time
from typing import Callable, Iterator

import pandas as pd

from app.services.market.mandi_data import normalize_records

DEFAULT_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"  # AGMARKNET daily prices on data.gov.in
API_URL = "https://api.data.gov.in/resource/{resource}"
_BATCH = 2000


def to_documents(clean: pd.DataFrame) -> list[dict]:
    docs = clean.to_dict(orient="records")
    for d in docs:
        d["date"] = pd.Timestamp(d["date"]).to_pydatetime()
        d["commodityKey"] = d["commodity"].lower()
    return docs


def insert_clean_frame(collection, clean: pd.DataFrame) -> dict:
    """Insert cleaned rows; rows whose `key` already exists are skipped, not duplicated."""
    inserted = duplicates = 0
    docs = to_documents(clean)
    for start in range(0, len(docs), _BATCH):
        batch = docs[start:start + _BATCH]
        try:
            result = collection.insert_many(batch, ordered=False)
            inserted += len(result.inserted_ids)
        except Exception as exc:  # pymongo BulkWriteError: duplicates are expected on re-import
            details = getattr(exc, "details", None)
            if not details or "writeErrors" not in details:
                raise
            dup = sum(1 for e in details["writeErrors"] if e.get("code") == 11000)
            other = [e for e in details["writeErrors"] if e.get("code") != 11000]
            if other:
                raise
            duplicates += dup
            inserted += details.get("nInserted", len(batch) - dup)
    return {"inserted": inserted, "duplicatesSkipped": duplicates}


def import_csv(collection, path: str, chunksize: int = 100_000, progress: Callable[[str], None] = print) -> dict:
    """Stream a (possibly very large) CSV into the collection, cleaning as it goes."""
    totals = {"rowsRead": 0, "rowsKept": 0, "inserted": 0, "duplicatesSkipped": 0, "dropped": {}}
    first = last = None
    for chunk in pd.read_csv(path, dtype=str, chunksize=chunksize, keep_default_na=False):
        clean, report = normalize_records(chunk)
        totals["rowsRead"] += report["rowsIn"]
        totals["rowsKept"] += len(clean)
        for reason, n in report["dropped"].items():
            totals["dropped"][reason] = totals["dropped"].get(reason, 0) + n
        if len(clean):
            outcome = insert_clean_frame(collection, clean)
            totals["inserted"] += outcome["inserted"]
            totals["duplicatesSkipped"] += outcome["duplicatesSkipped"]
            lo, hi = clean["date"].min(), clean["date"].max()
            first = lo if first is None else min(first, lo)
            last = hi if last is None else max(last, hi)
        progress(f"  {path}: read {totals['rowsRead']:,} rows, inserted {totals['inserted']:,}")
    totals["firstDate"] = None if first is None else first.strftime("%Y-%m-%d")
    totals["lastDate"] = None if last is None else last.strftime("%Y-%m-%d")
    return totals


def iter_api_records(fetch_page: Callable[[int, int], dict], page_size: int = 1000, max_records: int | None = None,
                     pause: float = 0.0) -> Iterator[dict]:
    """
    Page through the data.gov.in API. `fetch_page(offset, limit)` returns the
    JSON body. The offset advances by the number of records the server ACTUALLY
    returned: some keys silently cap a page at 10 rows, and advancing by the
    requested size would then skip 99% of the data.
    """
    offset = 0
    yielded = 0
    while True:
        body = fetch_page(offset, page_size)
        records = body.get("records") or []
        if not records:
            return
        for record in records:
            yield record
            yielded += 1
            if max_records and yielded >= max_records:
                return
        offset += len(records)
        total = int(body.get("total") or 0)
        if total and offset >= total:
            return
        if pause:
            time.sleep(pause)


def make_api_fetcher(api_key: str, resource_id: str = DEFAULT_RESOURCE_ID, filters: dict | None = None, get=None):
    import requests

    getter = get or requests.get

    def fetch(offset: int, limit: int) -> dict:
        params = {"api-key": api_key, "format": "json", "offset": offset, "limit": limit}
        for field, value in (filters or {}).items():
            params[f"filters[{field}]"] = value
        response = getter(API_URL.format(resource=resource_id), params=params, timeout=30)
        response.raise_for_status()
        return response.json()

    return fetch


def import_api(collection, api_key: str, resource_id: str = DEFAULT_RESOURCE_ID, filters: dict | None = None,
               max_records: int | None = None, pause: float = 0.2, get=None) -> dict:
    fetch = make_api_fetcher(api_key, resource_id, filters, get)
    rows = list(iter_api_records(fetch, 1000, max_records, pause))
    clean, report = normalize_records(rows)
    outcome = insert_clean_frame(collection, clean) if len(clean) else {"inserted": 0, "duplicatesSkipped": 0}
    return {"rowsRead": report["rowsIn"], "rowsKept": len(clean), "dropped": report["dropped"], **outcome,
            "firstDate": clean["date"].min().strftime("%Y-%m-%d") if len(clean) else None,
            "lastDate": clean["date"].max().strftime("%Y-%m-%d") if len(clean) else None}
