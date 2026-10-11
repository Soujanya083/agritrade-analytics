"""Descriptive analytics on a real price series."""
import numpy as np
import pandas as pd
import pytest

from app.services.market import market_overview as mo


def S(values, start="2022-01-01"):
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="D"))


def seasonal(years=3, peak_month=7, amplitude=0.2, seed=0):
    n = int(years * 365)
    idx = pd.date_range("2022-01-01", periods=n, freq="D")
    rng = np.random.default_rng(seed)
    phase = (idx.dayofyear.to_numpy() / 365.25 - (peak_month - 0.5) / 12) * 2 * np.pi
    return pd.Series(20 * np.exp(amplitude * np.cos(phase) + rng.normal(0, 0.01, n)), index=idx)


def test_seasonal_index_recovers_the_peak_month():
    result = mo.seasonal_index(seasonal(peak_month=7))
    assert result["reliable"] is True
    assert "Jul" in result["highestMonths"]
    assert "Jan" in result["lowestMonths"] or "Dec" in result["lowestMonths"]
    by_month = {r["month"]: r["index"] for r in result["index"]}
    assert by_month["Jul"] > 1.1 and min(by_month.values()) < 0.9
    assert np.mean(list(by_month.values())) == pytest.approx(1.0, abs=0.01)


def test_a_steady_trend_is_not_mistaken_for_seasonality():
    trend = S(20 * np.exp(0.0015 * np.arange(3 * 365)))
    result = mo.seasonal_index(trend)
    values = [r["index"] for r in result["index"]]
    assert max(values) - min(values) < 0.1


def test_less_than_two_years_is_flagged_unreliable():
    result = mo.seasonal_index(seasonal(years=1.5))
    assert result["reliable"] is False
    assert "Only" in result["note"]


def test_less_than_a_year_gives_no_seasonality_at_all():
    result = mo.seasonal_index(S(np.linspace(10, 20, 200)))
    assert result["index"] == [] and result["reliable"] is False


def test_volatility_flags_a_recent_spike_as_high():
    rng = np.random.default_rng(1)
    calm = rng.normal(0, 0.005, 300)
    wild = rng.normal(0, 0.05, 40)
    series = S(20 * np.exp(np.cumsum(np.concatenate([calm, wild]))))
    result = mo.volatility(series)
    assert result["available"] and result["level"] == "high"
    assert result["latestVolatilityPct"] > result["medianVolatilityPct"]


def test_volatility_flags_a_calm_period_as_low_or_normal():
    rng = np.random.default_rng(2)
    series = S(20 * np.exp(np.cumsum(np.concatenate([rng.normal(0, 0.05, 300), rng.normal(0, 0.003, 40)]))))
    assert mo.volatility(series)["level"] == "low"


def test_volatility_needs_enough_history():
    assert mo.volatility(S(np.ones(20)))["available"] is False


def test_year_on_year_compares_the_same_period():
    series = S(np.concatenate([np.full(365, 10.0), np.full(30, 15.0)]))
    result = mo.year_on_year(series)
    assert result["available"] and result["changePct"] == pytest.approx(50.0)


def test_year_on_year_unavailable_without_a_year_of_history():
    assert mo.year_on_year(S(np.ones(200)))["available"] is False


def market_frame():
    rows = []
    for market, price in [("A", 30), ("B", 25), ("C", 20), ("D", 18), ("E", 15), ("F", 40)]:
        for d in range(10):
            rows.append({"state": "Maharashtra", "market": market, "commodity": "Onion",
                         "date": pd.Timestamp("2025-03-01") + pd.Timedelta(days=d), "modalPricePerKg": float(price)})
    return pd.DataFrame(rows)


def test_market_spread_ranks_markets_and_measures_dispersion():
    result = mo.market_spread(market_frame(), "Onion")
    assert result["available"] and result["marketsCompared"] == 6
    assert result["highest"][0]["market"] == "F" and result["lowest"][0]["market"] == "E"
    assert result["spreadPct"] == pytest.approx((40 - 15) / 22.5 * 100, abs=0.2)
    assert "transport" in result["note"].lower()


def test_market_spread_ignores_markets_with_too_few_quotes():
    df = market_frame()
    df = df[~((df["market"] == "F") & (df["date"] > pd.Timestamp("2025-03-02")))]   # F has only 2 quotes
    result = mo.market_spread(df, "Onion")
    assert all(r["market"] != "F" for r in result["highest"])


def test_market_spread_needs_at_least_three_markets():
    df = market_frame()
    assert mo.market_spread(df[df["market"].isin(["A", "B"])], "Onion")["available"] is False
    assert mo.market_spread(df, "Unicorn")["available"] is False
