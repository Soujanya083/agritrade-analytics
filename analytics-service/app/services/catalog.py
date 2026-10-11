"""
Crop / location catalog derived from the marketplace's own listings.

Two jobs:
  * feed the dashboard's crop dropdown from real data (it used to be a
    hardcoded list of five crops), and
  * resolve free-text crop names ("tomato ", "TOMATO") to the canonical
    spelling stored in the database, so every cache key and every
    response uses one consistent name and unknown crops get a clean 404.
"""
import pandas as pd

from app.services.data_loader import load_crops
from app.utils.ttl_cache import ttl_cache


def _clean(series: pd.Series) -> pd.Series:
    return series.dropna().astype(str).str.strip()


@ttl_cache(seconds=120)
def list_crops() -> list[dict]:
    crops = load_crops()
    if crops.empty or "cropName" not in crops.columns:
        return []

    crops = crops.copy()
    crops["_name"] = crops["cropName"].astype(str).str.strip()
    crops = crops[crops["_name"] != ""]
    crops["_key"] = crops["_name"].str.lower()

    rows = []
    for key, group in crops.groupby("_key"):
        canonical = group["_name"].value_counts().idxmax()
        category = None
        if "category" in group.columns:
            cats = _clean(group["category"])
            category = cats.value_counts().idxmax() if not cats.empty else None
        rows.append({"cropName": canonical, "category": category, "listings": int(len(group))})
    return sorted(rows, key=lambda r: (-r["listings"], r["cropName"]))


@ttl_cache(seconds=120)
def list_locations() -> list[str]:
    crops = load_crops()
    if crops.empty or "location" not in crops.columns:
        return []
    return sorted(set(_clean(crops["location"])) - {""})


def resolve_crop_name(name: str) -> str | None:
    """Canonical DB spelling for `name` (case/whitespace-insensitive), else None."""
    wanted = (name or "").strip().lower()
    if not wanted:
        return None
    for row in list_crops():
        if row["cropName"].lower() == wanted:
            return row["cropName"]
    return None
