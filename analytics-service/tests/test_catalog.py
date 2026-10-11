"""Crop catalog: dropdown source + canonical crop-name resolution."""
import pandas as pd

from app.services import catalog


def crops():
    return pd.DataFrame({
        "cropName": ["Tomato", "tomato ", "TOMATO", "Wheat", "Orange"],
        "category": ["Vegetables", "Vegetables", "Vegetables", "Grains", "Fruits"],
        "location": ["Pune", "Pune", "Nashik", "Hubli", None],
    })


def test_list_crops_merges_case_and_whitespace_variants(monkeypatch):
    monkeypatch.setattr(catalog, "load_crops", crops)
    rows = catalog.list_crops()
    tomato = [r for r in rows if r["cropName"].lower() == "tomato"]
    assert len(tomato) == 1
    assert tomato[0]["listings"] == 3
    assert tomato[0]["category"] == "Vegetables"
    assert {r["cropName"] for r in rows} >= {"Wheat", "Orange"}


def test_most_listed_crop_comes_first(monkeypatch):
    monkeypatch.setattr(catalog, "load_crops", crops)
    assert catalog.list_crops()[0]["listings"] == 3


def test_resolve_crop_name_returns_canonical_spelling(monkeypatch):
    monkeypatch.setattr(catalog, "load_crops", crops)
    assert catalog.resolve_crop_name("  wheat ") == "Wheat"
    assert catalog.resolve_crop_name("ORANGE") == "Orange"


def test_resolve_unknown_or_blank_crop_is_none(monkeypatch):
    monkeypatch.setattr(catalog, "load_crops", crops)
    assert catalog.resolve_crop_name("Dragon Fruit") is None
    assert catalog.resolve_crop_name("") is None
    assert catalog.resolve_crop_name(None) is None


def test_locations_are_distinct_and_blank_free(monkeypatch):
    monkeypatch.setattr(catalog, "load_crops", crops)
    assert catalog.list_locations() == ["Hubli", "Nashik", "Pune"]


def test_empty_marketplace_gives_empty_lists(monkeypatch):
    monkeypatch.setattr(catalog, "load_crops", lambda: pd.DataFrame())
    assert catalog.list_crops() == []
    assert catalog.list_locations() == []
    assert catalog.resolve_crop_name("Wheat") is None
