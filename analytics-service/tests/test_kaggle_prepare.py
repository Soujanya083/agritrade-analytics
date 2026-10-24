import pandas as pd
import pytest

from app.services.market import kaggle_prepare as kp


def raw(dates, prices=None):
    n = len(dates)
    return pd.DataFrame({
        "STATE": ["Maharashtra"] * n, "District Name": ["nashik"] * n, "Market Name": ["Lasalgaon"] * n,
        "Commodity": ["Onion"] * n, "Variety": ["Local"] * n, "Grade": ["FAQ"] * n,
        "Min_Price": ["1000"] * n, "Max_Price": ["1500"] * n, "Modal_Price": prices or ["1200"] * n,
        "Price Date": dates})


def test_dashed_and_slashed_dates_are_both_read_month_first_and_prices_are_untouched():
    frame = raw(["06-06-2023", "06-07-2023", "6/13/2023", "12/1/2023"], prices=["1200", "1250", "1300", "1350"])
    clean, report = kp.prepare(frame)
    assert list(clean["Arrival_Date"]) == ["2023-06-06", "2023-06-07", "2023-06-13", "2023-12-01"]
    assert list(clean["Modal_Price"]) == ["1200", "1250", "1300", "1350"]
    assert list(clean.columns) == kp.OUTPUT_COLUMNS
    assert report["rowsWhereFileOrderGoesBackInTime"] == 0 and report["pricesChanged"] is False


def test_a_day_first_date_stops_the_conversion():
    with pytest.raises(ValueError, match="day-first"):
        kp.prepare(raw(["06-06-2023", "25-07-2023"]))


def test_impossible_dates_and_odd_years_are_rejected():
    with pytest.raises(ValueError, match="do not exist"):
        kp.prepare(raw(["02-31-2023"]))
    with pytest.raises(ValueError, match="1990-2100"):
        kp.prepare(raw(["06-06-23"]))


def test_missing_columns_are_named():
    with pytest.raises(ValueError, match="Modal_Price"):
        kp.prepare(raw(["06-06-2023"]).drop(columns=["Modal_Price"]))


def test_report_counts_gaps_longer_than_three_days_per_crop():
    dates = ["06-01-2024", "06-02-2024", "06-03-2024", "06-20-2024", "06-21-2024"]   # 16 missing days in between
    _, report = kp.prepare(raw(dates))
    onion = report["topCommodities"][0]
    assert onion["commodity"] == "Onion" and onion["gapsLongerThan3Days"] == 1 and onion["missingDaysInGaps"] == 16
    assert onion["firstDate"] == "2024-06-01" and onion["lastDate"] == "2024-06-21"


def test_rows_out_of_order_are_reported_not_hidden():
    _, report = kp.prepare(raw(["06-10-2023", "06-05-2023"]))
    assert report["rowsWhereFileOrderGoesBackInTime"] == 1 and "go back in time" in report["orderCheck"]
