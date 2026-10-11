"""
The forecast lab must be HONEST: find structure that exists, refuse to invent
structure that doesn't, never peek at the future, and give intervals that
actually cover.
"""
import math

import numpy as np
import pandas as pd
import pytest

from app.services.market import forecast_lab as fl


def S(values, start="2024-01-01"):
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="D"))


def random_walk(seed, n=300, vol=0.02):
    r = np.random.default_rng(seed)
    return S(20 * np.exp(np.cumsum(r.normal(0, vol, n))))


def trending(seed=3, n=300):
    r = np.random.default_rng(seed)
    return S(20 + 0.1 * np.arange(n) + r.normal(0, 0.3, n))


# ---------------------------------------------------------------- mechanics
def test_every_model_returns_a_forecast_of_the_right_shape():
    s = trending()
    for spec in fl.model_registry(len(s)):
        out = spec.fn(s.to_numpy(), s.index, 10)
        assert out.shape == (10,) and np.all(np.isfinite(out)), spec.key


def test_naive_is_the_last_value_and_seasonal_naive_repeats_the_week():
    y = np.arange(1, 31, dtype=float)
    idx = pd.date_range("2024-01-01", periods=30)
    assert list(fl._naive(y, idx, 3)) == [30, 30, 30]
    assert list(fl._seasonal_naive(7)(y, idx, 9)) == [24, 25, 26, 27, 28, 29, 30, 24, 25]


def test_origins_are_chronological_and_leave_room_for_the_horizon():
    n, h = 300, 14
    origins = fl.choose_origins(n, h)
    assert origins == sorted(origins)
    assert origins[-1] + h <= n            # the last test window fits inside the data
    assert origins[0] >= fl.MIN_TRAIN
    assert len(origins) >= 4


def test_no_model_ever_sees_data_from_its_own_forecast_window():
    """Leakage guard: at each origin the model is handed exactly values[:origin]."""
    s = trending()
    values, index = s.to_numpy(), s.index
    seen = []

    def spy(y, idx, h):
        seen.append((len(y), y[-1], idx[-1]))
        return np.repeat(y[-1], h)

    spec = fl.ModelSpec("spy", "spy", spy)
    origins = fl.choose_origins(len(values), 14)
    fl._run_model(spec, values, index, origins, 14)
    for (length, last, last_date), origin in zip(seen, origins):
        assert length == origin
        assert last == values[origin - 1]
        assert last_date == index[origin - 1]


def test_a_crashing_model_falls_back_to_naive_and_is_counted():
    s = trending()

    def broken(y, idx, h):
        raise RuntimeError("boom")

    spec = fl.ModelSpec("broken", "broken", broken)
    origins = fl.choose_origins(len(s), 14)
    forecasts, failures = fl._run_model(spec, s.to_numpy(), s.index, origins, 14)
    assert failures == len(origins)
    assert np.allclose(forecasts[0], s.to_numpy()[origins[0] - 1])


# --------------------------------------------------------- Diebold-Mariano
def test_dm_detects_a_clearly_better_model_and_not_a_worse_one():
    rng = np.random.default_rng(0)
    bench = rng.normal(4, 0.5, 30) ** 2
    better = bench * 0.4
    assert fl.diebold_mariano(bench, better, lag=1)["pValue"] < 0.01
    assert fl.diebold_mariano(bench, bench * 2.5, lag=1)["pValue"] > 0.9


def test_dm_on_identical_losses_is_undefined_not_significant():
    x = np.linspace(1, 2, 20)
    assert fl.diebold_mariano(x, x, lag=1) == {"statistic": None, "pValue": None}


def test_dm_needs_enough_origins():
    assert fl.diebold_mariano([1, 2, 3], [1, 1, 1], 1)["pValue"] is None


def test_dm_does_not_reject_for_pure_noise_differences():
    rng = np.random.default_rng(1)
    p = [fl.diebold_mariano(rng.normal(5, 1, 25), rng.normal(5, 1, 25), lag=1)["pValue"] for _ in range(200)]
    # one-sided test at 10%: about 10% false positives is correct behaviour
    assert 0.02 < np.mean(np.array(p) < 0.10) < 0.20


# ------------------------------------------------- multiple comparisons
def test_holm_adjustment_is_never_smaller_than_raw_and_capped_at_one():
    raw = [0.01, 0.04, 0.30, 0.90]
    adjusted = fl.holm_adjust(raw)
    assert all(a >= r for a, r in zip(adjusted, raw))
    assert all(a <= 1 for a in adjusted)
    assert adjusted[0] == pytest.approx(0.04)            # 0.01 * 4 tests


def test_holm_adjustment_is_monotone_in_the_raw_order():
    adjusted = fl.holm_adjust([0.03, 0.01, 0.02])
    assert adjusted[1] <= adjusted[2] <= adjusted[0]


def test_holm_keeps_untestable_models_untestable():
    assert fl.holm_adjust([0.01, None, 0.5]) == [0.02, None, 0.5]


def test_a_model_that_only_looks_significant_before_correction_does_not_win():
    """p=0.06 on its own would pass at 10%; among 5 models it is not convincing."""
    adjusted = fl.holm_adjust([0.06, 0.5, 0.6, 0.7, 0.8])
    assert adjusted[0] > fl.DM_ALPHA


def test_interval_widths_never_shrink_with_the_horizon():
    jagged = np.abs(np.array([[1.0, 3.0, 2.0, 5.0, 4.0]] * 20))
    widths = fl.conformal_halfwidths(jagged)
    assert list(widths) == sorted(widths)


# ---------------------------------------------------------------- conformal
def test_conformal_halfwidth_is_the_calibration_error_quantile():
    errors = np.tile(np.arange(1, 21, dtype=float).reshape(-1, 1), (1, 3))   # |err| = 1..20
    widths = fl.conformal_halfwidths(errors, level=0.9)
    assert widths.shape == (3,)
    assert 18 <= widths[0] <= 20


def test_interval_coverage_is_close_to_target_on_exchangeable_errors():
    rng = np.random.default_rng(5)
    errors = rng.normal(0, 1, (400, 5))
    coverage = fl.interval_coverage(errors, 0.9)
    assert coverage["origins"] == 200
    assert 0.84 <= coverage["empirical"] <= 0.96


def test_interval_coverage_is_not_reported_with_too_few_origins():
    assert fl.interval_coverage(np.ones((5, 3)))["empirical"] is None


# ------------------------------------------------------------ champion logic
def board(naive=2.0, challenger=1.5, p=0.01, beats=True):
    return [
        {"model": "gbm_lags", "label": "GBM", "MASE": challenger, "dmPValue": p, "dmPValueAdjusted": p, "beatsNaive": beats},
        {"model": "naive", "label": "Naive (last price)", "MASE": naive, "dmPValue": None, "beatsNaive": False},
    ]


def test_a_significantly_better_model_becomes_champion():
    key, reason = fl.choose_champion(board())
    assert key == "gbm_lags" and "statistically significant" in reason


def test_a_better_but_not_significant_model_does_not_unseat_naive():
    key, reason = fl.choose_champion(board(challenger=1.9, p=0.4, beats=False))
    assert key == "naive"
    assert "not statistically significant" in reason


def test_naive_wins_when_nothing_is_better():
    key, reason = fl.choose_champion(board(challenger=2.5, p=0.9, beats=False))
    assert key == "naive" and "No model beat" in reason


# ------------------------------------------------------------- end to end
def test_short_history_is_refused_clearly():
    out = fl.run_forecast_lab(random_walk(0, n=60), 14)
    assert "error" in out and "Not enough" in out["error"]


def test_a_real_trend_is_found_and_judged_significant():
    out = fl.run_forecast_lab(trending(), 14)
    assert out["champion"]["beatsNaive"] is True
    assert out["champion"]["model"] != "naive"
    top = out["leaderboard"][0]
    naive = next(r for r in out["leaderboard"] if r["model"] == "naive")
    assert top["MASE"] < naive["MASE"]
    assert top["dmPValue"] < 0.05


def test_pure_noise_does_not_get_a_confident_winner_most_of_the_time():
    """Random walks have no learnable structure. With the Holm correction across
    all challengers, a false win should be rare (measured: 0 of 40 random walks;
    before the correction 4 of 40)."""
    crowned = sum(fl.run_forecast_lab(random_walk(seed), 14)["champion"]["beatsNaive"] for seed in range(10))
    assert crowned <= 1


def test_forecast_output_is_well_formed():
    s = trending()
    out = fl.run_forecast_lab(s, 14)
    forecast = out["forecast"]
    assert len(forecast) == 14
    assert forecast[0]["date"] == (s.index[-1] + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    for row in forecast:
        assert row["lower"] <= row["point"] <= row["upper"]
        assert row["lower"] >= 0
    widths = [row["upper"] - row["lower"] for row in forecast]
    assert widths[-1] >= widths[0] - 0.01                  # never shrinks (tolerance = 3dp rounding of lower/upper)
    assert out["lastObserved"]["price"] == round(float(s.iloc[-1]), 3)
    assert len(out["history"]) == 120
    assert out["evaluation"]["origins"] >= 4
    assert all(r["MASE"] >= 0 for r in out["leaderboard"])
    assert {r["model"] for r in out["leaderboard"]} >= {"naive", "ridge_lags", "gbm_lags", "drift_60"}


def test_leaderboard_is_sorted_by_mase_and_reports_the_honest_metrics():
    out = fl.run_forecast_lab(trending(), 14)
    mases = [r["MASE"] for r in out["leaderboard"]]
    assert mases == sorted(mases)
    for row in out["leaderboard"]:
        assert {"MAE", "RMSE", "sMAPE", "MASE", "bias", "directionalAccuracy", "winRateVsNaive", "dmPValue"} <= set(row)


def test_reported_intervals_cover_future_prices_about_as_often_as_claimed():
    """Out-of-sample: calibrate on the first half of the origins, test on the second."""
    out = fl.run_forecast_lab(random_walk(2, n=500), 14)
    coverage = out["intervalCoverage"]["empirical"]
    assert coverage is not None and coverage >= 0.7


# ------------------------------------------------------------ economic value
def test_economic_value_policy_math():
    """Hand-checkable: 4 origins, h=2. Model says wait on #0 and #1 (forecast +10%, +10%)."""
    last_seen = np.array([100.0, 100.0, 100.0, 100.0])
    actual = np.array([[101, 110], [101, 90], [101, 120], [101, 80]], dtype=float)      # realised +10%, -10%, +20%, -20%
    forecasts = np.array([[101, 110], [101, 110], [101, 101], [101, 101]], dtype=float)
    errors = forecasts - actual
    ev = fl.economic_value(actual, errors, last_seen, horizon=2, threshold=0.03, step=7)
    assert ev["timesModelSaidWait"] == 2
    assert ev["hitRateWhenWait"] == 0.5                       # waited twice: +10% (win), -10% (loss)
    assert ev["followForecast"]["meanGainPct"] == pytest.approx(0.0)    # (10 - 10 + 0 + 0) / 4
    assert ev["alwaysWait"]["meanGainPct"] == pytest.approx(-0.0)       # (10 - 10 + 20 - 20) / 4
    assert ev["sellNowGainPct"] == 0.0


def test_economic_value_never_waiting_is_identical_to_selling_now():
    last_seen = np.full(6, 100.0)
    actual = np.tile([101.0, 105.0], (6, 1))
    errors = np.tile([100.0, 100.0], (6, 1)) - actual                  # model always forecasts "no change"
    ev = fl.economic_value(actual, errors, last_seen, horizon=2, step=7)
    assert ev["timesModelSaidWait"] == 0 and ev["hitRateWhenWait"] is None
    assert ev["followForecast"]["meanGainPct"] == 0.0
    assert "identical to selling immediately" in ev["verdict"]


def test_a_forecastable_trend_shows_a_reliable_gain_from_following_the_model():
    ev = fl.run_forecast_lab(trending(), 14)["economicValue"]
    assert ev["followForecast"]["ci95"][0] > 0
    assert "more than selling immediately" in ev["verdict"]
    assert ev["hitRateWhenWait"] >= 0.8


def test_random_walks_do_not_produce_a_reliable_policy_gain():
    reliable = sum(fl.run_forecast_lab(random_walk(s), 14)["economicValue"]["followForecast"]["ci95"][0] > 0 for s in range(8))
    assert reliable == 0


def test_economic_value_always_discloses_what_it_ignores():
    ev = fl.run_forecast_lab(trending(), 14)["economicValue"]
    text = " ".join(ev["caveats"]).lower()
    assert "storage" in text and "optimistic" in text and "overlap" in text


def test_block_bootstrap_interval_contains_the_mean_and_is_wider_with_more_noise():
    calm = np.random.default_rng(0).normal(1, 0.1, 40)
    noisy = np.random.default_rng(0).normal(1, 2.0, 40)
    lo, hi = fl._block_bootstrap_ci(calm, 2)
    assert lo < calm.mean() < hi
    lo2, hi2 = fl._block_bootstrap_ci(noisy, 2)
    assert (hi2 - lo2) > (hi - lo)


def test_lab_output_includes_predictability_and_economic_sections():
    out = fl.run_forecast_lab(trending(), 14)
    assert out["predictability"]["available"] is True
    assert {"followForecast", "alwaysWait", "verdict", "caveats"} <= set(out["economicValue"])


# ------------------------------------------------------------ mean reversion
def test_mean_reversion_forecast_decays_toward_the_trailing_mean():
    rng = np.random.default_rng(0)
    x = np.zeros(400)
    for i in range(1, 400):
        x[i] = 0.9 * x[i - 1] + rng.normal(0, 0.03)
    x[-1] = 0.25                                           # price currently well ABOVE its norm
    y = 20 * np.exp(x)
    idx = pd.date_range("2024-01-01", periods=400)
    path = fl._mean_reversion(y, idx, 30)
    trailing_mean = np.exp(np.log(y)[-90:].mean())
    assert path[0] < y[-1]                                 # starts moving down...
    assert abs(path[-1] - trailing_mean) < abs(y[-1] - trailing_mean)   # ...toward the mean
    assert np.all(np.diff(path) <= 1e-9)                   # monotone decay from above


def test_mean_reversion_does_not_extrapolate_a_trend():
    y = 20 + 0.1 * np.arange(300)
    path = fl._mean_reversion(y, pd.date_range("2024-01-01", periods=300), 14)
    assert np.all(np.isfinite(path)) and np.all(path > 0)


def test_mean_reversion_falls_back_to_naive_on_short_history():
    y = np.linspace(10, 12, 60)
    assert list(fl._mean_reversion(y, pd.date_range("2024-01-01", periods=60), 5)) == [y[-1]] * 5


def test_mean_reversion_model_is_part_of_the_comparison():
    s = trending()
    assert "mean_reversion" in {spec.key for spec in fl.model_registry(len(s))}
    # (that no model sees its own forecast window is covered by
    #  test_no_model_ever_sees_data_from_its_own_forecast_window)


def test_mean_reverting_series_ranks_the_mean_reversion_model_near_the_top():
    rng = np.random.default_rng(2)
    x = np.zeros(700)
    for i in range(1, 700):
        x[i] = 0.93 * x[i - 1] + rng.normal(0, 0.03)
    out = fl.run_forecast_lab(S(20 * np.exp(x)), 14)
    ranking = [r["model"] for r in out["leaderboard"]]
    assert ranking.index("mean_reversion") <= 1


# ------------------------------------------------ optional models that cannot actually run
def test_a_model_library_that_imports_but_cannot_run_is_left_out(monkeypatch):
    """Prophet can import on a machine where its Stan engine is missing; it must not be registered then."""
    monkeypatch.setattr(fl, "_prophet_usable", lambda: False)
    monkeypatch.setattr(fl, "_arima_usable", lambda: True)
    keys = {spec.key for spec in fl.model_registry(300)}
    assert "prophet" not in keys and "arima_111" in keys


def test_usable_optional_models_are_registered(monkeypatch):
    monkeypatch.setattr(fl, "_prophet_usable", lambda: True)
    monkeypatch.setattr(fl, "_arima_usable", lambda: True)
    assert {"prophet", "arima_111"} <= {spec.key for spec in fl.model_registry(300)}


def test_a_champion_that_fails_on_the_full_history_falls_back_to_naive(monkeypatch):
    s = trending()
    n = len(s)

    def fragile(y, idx, h):
        if len(y) == n:                       # fine on every past origin, fails on the full series
            raise RuntimeError("boom")
        return np.repeat(y[-1], h)

    original = fl.model_registry
    monkeypatch.setattr(fl, "model_registry", lambda size: original(size) + [fl.ModelSpec("fragile", "Fragile", fragile)])
    monkeypatch.setattr(fl, "choose_champion", lambda board: ("fragile", "chosen for the test"))
    out = fl.run_forecast_lab(s, 14)
    assert out["champion"]["model"] == "naive"
    assert "naive forecast is shown" in out["champion"]["reason"]
    assert len(out["forecast"]) == 14
