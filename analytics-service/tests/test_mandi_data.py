"""Cleaning and series-building for REAL AGMARKNET data."""
import numpy as np
import pandas as pd
import pytest

from app.services.market import mandi_data


def raw(**over):
    row = {"State": "Maharashtra", "District": "Nashik", "Market": "Lasalgaon", "Commodity": "Onion", "Variety": "Red",
           "Grade": "FAQ", "Arrival_Date": "15/03/2025", "Min_Price": "1500", "Max_Price": "2500", "Modal_Price": "2000"}
    row.update(over)
    return row


def test_normalises_column_spellings_and_converts_quintal_to_kg():
    clean, report = mandi_data.normalize_records([raw()])
    assert len(clean) == 1
    assert clean.loc[0, "modalPricePerKg"] == 20.0          # Rs 2000 / quintal = Rs 20 / kg
    assert clean.loc[0, "date"] == pd.Timestamp("2025-03-15")  # dd/mm/yyyy, not mm/dd
    assert report["rowsIn"] == 1 and report["rowsOut"] == 1


def test_accepts_data_gov_in_api_field_names():
    api = {"state": "Punjab", "district": "Gurdaspur", "market": "Quadian APMC", "commodity": "Onion", "variety": "Other",
           "grade": "A", "arrival_date": "23/08/2025", "min_price": 3300, "max_price": 3500, "modal_price": 3400}
    clean, _ = mandi_data.normalize_records([api])
    assert clean.loc[0, "modalPricePerKg"] == 34.0


def test_day_first_dates_are_not_swapped():
    clean, _ = mandi_data.normalize_records([raw(Arrival_Date="03/04/2025")])
    assert clean.loc[0, "date"] == pd.Timestamp("2025-04-03")   # 3 April, not 4 March


def test_bad_rows_are_dropped_and_counted_never_repaired():
    rows = [raw(), raw(Arrival_Date="not a date", Market="M2"), raw(Modal_Price="0", Market="M3"), raw(Modal_Price="", Market="M4"),
            raw(Min_Price="9000", Max_Price="100", Market="M5"), raw(Market="", State="X"), raw(Arrival_Date="01/01/2999", Market="M6")]
    clean, report = mandi_data.normalize_records(rows)
    assert len(clean) == 1
    assert report["rowsIn"] == 7
    assert report["dropped"]["unparseable date"] == 1
    assert report["dropped"]["modal price missing or not positive"] == 2
    assert report["dropped"]["incoherent min/modal/max"] == 1
    assert report["dropped"]["missing state/market/commodity"] == 1
    assert report["dropped"]["date in the future"] == 1


def test_duplicate_rows_are_collapsed_keeping_the_latest():
    rows = [raw(Modal_Price="2000"), raw(Modal_Price="2100")]
    clean, report = mandi_data.normalize_records(rows)
    assert len(clean) == 1 and clean.loc[0, "modalPrice"] == 2100
    assert report["dropped"]["duplicate rows"] == 1


def test_messy_text_is_standardised():
    a, _ = mandi_data.normalize_records([raw(Commodity="Pointed gourd(Parval)")])
    b, _ = mandi_data.normalize_records([raw(Commodity="Pointed  gourd (Parval) ")])
    assert a.loc[0, "commodity"] == b.loc[0, "commodity"] == "Pointed gourd (Parval)"
    assert a.loc[0, "key"] == b.loc[0, "key"]


def test_missing_required_columns_is_a_clear_error():
    with pytest.raises(ValueError, match="missing required column"):
        mandi_data.normalize_records([{"State": "X", "Market": "Y"}])


def test_empty_input_is_handled():
    clean, report = mandi_data.normalize_records([])
    assert clean.empty and report["rowsIn"] == 0


# ------------------------------------------------------------------ series
def frame(days=40, markets=("A", "B", "C"), base=20.0, skip=()):
    rows = []
    for d in range(days):
        if d in skip:
            continue
        date = pd.Timestamp("2025-01-01") + pd.Timedelta(days=d)
        for i, m in enumerate(markets):
            rows.append({"state": "Maharashtra" if m != "C" else "Gujarat", "market": m, "commodity": "Onion",
                         "date": date, "modalPricePerKg": base + d * 0.1 + i})
    return pd.DataFrame(rows)


def test_series_uses_the_median_across_markets():
    series, quality = mandi_data.build_series(frame(10), "Onion")
    assert len(series) == 10
    assert series.iloc[0] == pytest.approx(21.0)          # median of 20, 21, 22
    assert quality["marketsContributing"] == 3


def test_series_can_be_scoped_to_a_state_or_market():
    df = frame(10)
    assert mandi_data.build_series(df, "Onion", state="Gujarat")[0].iloc[0] == pytest.approx(22.0)
    assert mandi_data.build_series(df, "Onion", market="A")[0].iloc[0] == pytest.approx(20.0)


def test_commodity_match_is_case_insensitive_and_unknown_is_empty():
    assert len(mandi_data.build_series(frame(10), "ONION")[0]) == 10
    series, quality = mandi_data.build_series(frame(10), "Unicorn")
    assert series.empty and quality["error"]


def test_short_gaps_are_forward_filled_and_reported():
    series, quality = mandi_data.build_series(frame(20, skip=(5, 6)), "Onion")
    assert len(series) == 20
    assert quality["forwardFilledDays"] == 2
    assert series.iloc[5] == series.iloc[4]


def test_long_gaps_are_not_papered_over():
    """A 10-day hole must not be silently filled; the series restarts after it."""
    series, quality = mandi_data.build_series(frame(40, skip=range(10, 20)), "Onion")
    assert quality["cutAtLongGap"] is True
    assert series.index.min() == pd.Timestamp("2025-01-01") + pd.Timedelta(days=20)
    assert series.notna().all()


def test_empty_frame_is_handled():
    series, quality = mandi_data.build_series(pd.DataFrame(), "Onion")
    assert series.empty and quality["observations"] == 0


# ------------------------------------------------------- data quality extras
def test_extreme_moves_are_flagged_but_never_removed():
    rng = np.random.default_rng(0)
    values = 20 * np.exp(np.cumsum(rng.normal(0, 0.01, 200)))
    values[100:] *= 3.0                                           # a tripled price overnight (typo or shock)
    series = pd.Series(values, index=pd.date_range("2025-01-01", periods=200))
    result = mandi_data.extreme_moves(series)
    assert result["count"] >= 1
    assert result["examples"][0]["date"] == series.index[100].strftime("%Y-%m-%d")
    assert result["examples"][0]["changePct"] > 150
    assert len(series) == 200                                     # nothing was dropped or altered


def test_calm_series_has_no_extreme_moves():
    series = pd.Series(20 * np.exp(np.cumsum(np.random.default_rng(1).normal(0, 0.01, 200))),
                       index=pd.date_range("2025-01-01", periods=200))
    assert mandi_data.extreme_moves(series)["count"] == 0


def test_extreme_move_detection_needs_history_and_variation():
    assert mandi_data.extreme_moves(pd.Series(np.ones(10)))["count"] == 0
    assert mandi_data.extreme_moves(pd.Series(np.full(100, 5.0), index=pd.date_range("2025-01-01", periods=100)))["count"] == 0


def test_quality_report_includes_staleness_and_extreme_moves():
    old = pd.Timestamp.today().normalize() - pd.Timedelta(days=60)
    df = pd.DataFrame([{"state": "M", "market": "A", "commodity": "Onion", "date": old + pd.Timedelta(days=d),
                        "modalPricePerKg": 20.0 + 0.01 * d} for d in range(40)])
    _, quality = mandi_data.build_series(df, "Onion")
    assert quality["daysSinceLastObservation"] == 60 - 39
    assert quality["extremeMoves"]["count"] == 0


# ------------------------------------------------ real-world format and unit errors
def day(prices, commodity="Onion", date="15/03/2025"):
    return [raw(Market=f"M{i}", Commodity=commodity, Arrival_Date=date, Modal_Price=str(p), Min_Price=str(p * 0.8), Max_Price=str(p * 1.2))
            for i, p in enumerate(prices)]


def test_prices_typed_in_the_wrong_unit_are_dropped_and_counted():
    rows = day([2000, 2100, 1900, 2050, 1950, 2000, 20, 200000])          # last two: /100 and x100
    clean, report = mandi_data.normalize_records(rows)
    reason = "suspected unit-entry error (price ~10x/100x off the day's median)"
    assert report["dropped"][reason] == 2
    assert len(clean) == 6 and clean["modalPrice"].between(1900, 2100).all()


def test_a_genuine_wide_spread_is_not_mistaken_for_a_unit_error():
    rows = day([2000, 2100, 1900, 2050, 1950, 3000, 1400])                  # up to +50%
    clean, report = mandi_data.normalize_records(rows)
    assert len(clean) == 7 and not any("unit" in k for k in report["dropped"])


def test_an_outlier_that_is_not_a_power_of_ten_is_left_alone_for_the_analysis_to_flag():
    rows = day([2000, 2100, 1900, 2050, 1950, 2000, 14000])                 # 7x: odd, but not a unit typo
    clean, report = mandi_data.normalize_records(rows)
    assert len(clean) == 7


def test_unit_check_needs_enough_quotes_to_judge():
    rows = day([2000, 2100, 20])                                            # 3 quotes: cannot tell which is wrong
    clean, _ = mandi_data.normalize_records(rows)
    assert len(clean) == 3


def test_unit_check_is_per_commodity_and_per_day():
    rows = day([2000] * 6, "Onion") + day([200] * 6, "Potato") + day([2000] * 6, "Onion", date="16/03/2025")
    clean, report = mandi_data.normalize_records(rows)
    assert len(clean) == 18                                                 # Potato at 200 is not an error for Onion


@pytest.mark.parametrize("date_text", ["01-May-2025", "2025-05-01", "01/05/2025", "1-May-2025"])
def test_the_date_formats_seen_in_real_agmarknet_files_all_parse_to_the_same_day(date_text):
    clean, _ = mandi_data.normalize_records([raw(Arrival_Date=date_text)])
    assert clean.loc[0, "date"] == pd.Timestamp("2025-05-01")


def test_lowercase_scraper_schema_is_accepted():
    """date,state,district,market,commodity,min_price,max_price,modal_price (a common scraper layout)."""
    row = {"date": "01-May-2025", "state": "Maharashtra", "district": "Pune", "market": "Pune", "commodity": "Onion",
           "min_price": 800, "max_price": 1200, "modal_price": 1000}
    clean, _ = mandi_data.normalize_records([row])
    assert clean.loc[0, "modalPricePerKg"] == 10.0


def test_the_legacy_x0020_column_names_used_by_the_government_api_are_accepted():
    row = {"State": "Punjab", "District": "D", "Market": "M", "Commodity": "Onion", "Variety": "V", "Grade": "FAQ",
           "Arrival_Date": "23/08/2025", "Min_x0020_Price": "3300", "Max_x0020_Price": "3500", "Modal_x0020_Price": "3400"}
    clean, _ = mandi_data.normalize_records([row])
    assert clean.loc[0, "modalPrice"] == 3400


def test_far_future_dates_are_classified_as_future_on_every_pandas_version():
    """pandas 2.x returns NaT for year 2999 (cannot represent it); newer pandas parses it. Same answer either way."""
    clean, report = mandi_data.normalize_records([raw(), raw(Arrival_Date="01/01/2999", Market="M2")])
    assert len(clean) == 1
    assert report["dropped"] == {"date in the future": 1}
