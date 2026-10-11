"""
Loads MongoDB collections into pandas DataFrames.
Every analytics/ML module in this service starts from here - keep the
raw-to-DataFrame logic in one place so schema changes only need updating
once.

Two changes versus the original:

1. PROJECTION. The loaders used to pull every field of every document.
   That included crops' `imageUrl` (which can be a multi-hundred-KB
   base64 photo), users' password hashes and verification OTPs, and
   transactions' delivery OTP codes - none of which analytics needs, and
   the sensitive ones were also being written into CSVs by
   export_data_for_eda.py. They are now excluded at the database.

2. FRAME CACHE. A single dashboard request used to reload the same
   collection several times (decision summary alone loads crops 3x). The
   frames are now cached per data version (see utils/data_version.py), so
   a burst of requests shares one load, and a new bid/sale invalidates it
   immediately. Callers receive a COPY, because several services add
   columns to the frame they are given.
"""
import threading
import time

import pandas as pd

from app.db import crops_collection, bids_collection, transactions_collection, users_collection
from app.utils.data_version import get_data_version

_FRAME_TTL_SECONDS = 30
_frames: dict = {}
_frames_lock = threading.Lock()

_CROP_PROJECTION = {"imageUrl": 0}
_USER_PROJECTION = {"password": 0, "verificationOtp": 0, "otpExpiresAt": 0}
_TRANSACTION_PROJECTION = {"otpCode": 0, "otpExpiresAt": 0}


def clear_frame_cache():
    with _frames_lock:
        _frames.clear()


def _cached_frame(name: str, build):
    version = get_data_version()
    if version is None:  # data-version disabled (tests): never serve a stale frame
        return build()

    now = time.time()
    with _frames_lock:
        entry = _frames.get(name)
        if entry and entry[0] == version and now - entry[2] < _FRAME_TTL_SECONDS:
            return entry[1].copy()
    frame = build()
    with _frames_lock:
        _frames[name] = (version, frame, now)
    return frame.copy()


def _to_frame(collection, projection) -> pd.DataFrame:
    return pd.DataFrame(list(collection.find({}, projection)))


def load_crops() -> pd.DataFrame:
    def build():
        df = _to_frame(crops_collection, _CROP_PROJECTION)
        if df.empty:
            return df
        df["_id"] = df["_id"].astype(str)
        df["farmerId"] = df["farmerId"].astype(str)
        df["createdAt"] = pd.to_datetime(df["createdAt"])
        df["harvestedDate"] = pd.to_datetime(df["harvestedDate"], errors="coerce")
        return df

    return _cached_frame("crops", build)


def load_bids() -> pd.DataFrame:
    def build():
        df = _to_frame(bids_collection, None)
        if df.empty:
            return df
        df["_id"] = df["_id"].astype(str)
        df["cropId"] = df["cropId"].astype(str)
        df["buyerId"] = df["buyerId"].astype(str)
        df["createdAt"] = pd.to_datetime(df["createdAt"])
        return df

    return _cached_frame("bids", build)


def load_transactions() -> pd.DataFrame:
    def build():
        df = _to_frame(transactions_collection, _TRANSACTION_PROJECTION)
        if df.empty:
            return df
        df["_id"] = df["_id"].astype(str)
        df["cropId"] = df["cropId"].astype(str)
        df["farmerId"] = df["farmerId"].astype(str)
        df["buyerId"] = df["buyerId"].astype(str)
        df["createdAt"] = pd.to_datetime(df["createdAt"])
        return df

    return _cached_frame("transactions", build)


def load_users() -> pd.DataFrame:
    def build():
        df = _to_frame(users_collection, _USER_PROJECTION)
        if df.empty:
            return df
        df["_id"] = df["_id"].astype(str)
        return df

    return _cached_frame("users", build)


def crops_with_location(crops_df: pd.DataFrame) -> pd.DataFrame:
    """crops already store their own location field directly (server.js),
    so no join to users is needed for region-wise analysis."""
    return crops_df
