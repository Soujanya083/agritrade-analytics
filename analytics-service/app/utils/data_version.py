"""
Cheap "has the underlying data changed?" fingerprint used for cache
invalidation.

A pure TTL cache serves stale analytics for up to the TTL after a new bid
or sale. Folding this fingerprint into every cache key means the moment a
crop / bid / transaction is added (or a transaction completes), the next
request recomputes instead of returning the old answer.

Cost: four small count queries, memoised for a few seconds so a burst of
dashboard requests shares one check.

Honest limitation: it detects *inserts* and *transaction completion*, not
arbitrary in-place edits that leave every count unchanged. The TTL on each
cached value is the backstop for those.

Set ANALYTICS_DISABLE_DATA_VERSION=1 (the test-suite does) to turn this
off so unit tests never touch a database.
"""
import os
import threading
import time

_MEMO_SECONDS = 5.0
_lock = threading.Lock()
_memo: dict = {"at": 0.0, "value": None}


def get_data_version():
    if os.getenv("ANALYTICS_DISABLE_DATA_VERSION"):
        return None

    now = time.monotonic()
    with _lock:
        if _memo["value"] is not None and now - _memo["at"] < _MEMO_SECONDS:
            return _memo["value"]

    # Imported lazily so importing this module never needs a DB driver.
    from app.db import crops_collection, bids_collection, transactions_collection, mandi_prices_collection

    value = (
        crops_collection.estimated_document_count(),
        bids_collection.estimated_document_count(),
        transactions_collection.estimated_document_count(),
        transactions_collection.count_documents({"status": "delivery_completed"}),
        mandi_prices_collection.estimated_document_count(),  # imported real market history
    )
    with _lock:
        _memo["at"], _memo["value"] = now, value
    return value


def reset_data_version_memo():
    with _lock:
        _memo["at"], _memo["value"] = 0.0, None
