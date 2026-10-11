"""The reproducible report is generated only from the analysis code and states its limits."""
import numpy as np
import pandas as pd
import pytest

from app.services.market import mandi_data
from app.services.market.report import build_report


def market_frame(days=500, seed=0):
    rng = np.random.default_rng(seed)
    idx = pd.date_range(pd.Timestamp.today().normalize() - pd.Timedelta(days=days), periods=days)
    base = 20 * np.exp(np.cumsum(rng.normal(0, 0.012, days)))
    rows = [{"state": "Maharashtra", "market": m, "commodity": "Onion", "date": d, "modalPricePerKg": p * (1 + 0.02 * i)}
            for d, p in zip(idx, base) for i, m in enumerate("ABCD")]
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def built():
    df = market_frame()
    series, quality = mandi_data.build_series(df, "Onion", "Maharashtra")
    return build_report(series, df, "Onion", "Maharashtra", quality, 14)


def test_report_contains_every_section(built):
    markdown, _ = built
    for heading in ["## 1. Data", "## 2. Is the price predictable at all?", "## 3. Forecast (14 days)",
                    "## 4. Model comparison", "## 5. Would following the forecast have paid?",
                    "## 6. Seasonality, volatility and markets", "## 7. Limitations"]:
        assert heading in markdown


def test_report_numbers_come_from_the_analysis_not_from_hand_written_text(built):
    markdown, _ = built
    df = market_frame()
    series, quality = mandi_data.build_series(df, "Onion", "Maharashtra")
    assert f"{quality['daysInSeries']} daily observations" in markdown
    assert "Champion:" in markdown and "MASE" in markdown
    assert "nan" not in markdown.lower().replace("finance", "")


def test_report_always_states_its_limitations(built):
    markdown, _ = built
    assert "Weather, policy changes and export restrictions are not modelled" in markdown
    assert "farm-gate" in markdown or "farm gate" in markdown
    assert "Storage cost, spoilage and interest are not deducted" in markdown


def test_report_produces_the_figures_it_references(built):
    markdown, figures = built
    for name in figures:
        assert f"]({name})" in markdown
    assert {"forecast.png", "leaderboard.png"} <= set(figures) or figures == {}   # {} only without matplotlib


def test_short_history_gives_an_honest_non_report():
    df = market_frame(days=60)
    series, quality = mandi_data.build_series(df, "Onion", "Maharashtra")
    markdown, figures = build_report(series, df, "Onion", "Maharashtra", quality)
    assert "report not possible" in markdown and "Not enough" in markdown
    assert figures == {}
