"""Predictability diagnostics: they must say 'random walk' for noise and find real structure."""
import numpy as np
import pytest

from app.services.market import diagnostics as dg


def random_walk(seed, n=400, vol=0.02):
    return 20 * np.exp(np.cumsum(np.random.default_rng(seed).normal(0, vol, n)))


def momentum(seed, n=400, phi=0.25):
    e = np.random.default_rng(seed).normal(0, 0.02, n)
    r = np.zeros(n)
    for i in range(1, n):
        r[i] = phi * r[i - 1] + e[i]
    return 20 * np.exp(np.cumsum(r))


def mean_reverting(seed, n=400, phi=0.9):
    e = np.random.default_rng(seed).normal(0, 0.03, n)
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return 20 * np.exp(x)


def test_acf_of_known_ar1_returns_matches_theory():
    e = np.random.default_rng(0).normal(0, 1, 20000)
    r = np.zeros(20000)
    for i in range(1, 20000):
        r[i] = 0.5 * r[i - 1] + e[i]
    rho = dg.autocorrelations(r, 3)
    assert rho[0] == pytest.approx(0.5, abs=0.03)
    assert rho[1] == pytest.approx(0.25, abs=0.03)
    assert rho[2] == pytest.approx(0.125, abs=0.03)


def test_acf_of_constant_returns_is_zero_not_nan():
    assert list(dg.autocorrelations(np.zeros(50), 3)) == [0, 0, 0]


def test_ljung_box_calibration_on_white_noise():
    """About 5% of pure-noise series should be (wrongly) flagged at the 5% level."""
    rejections = np.mean([dg.ljung_box(dg.log_returns(random_walk(s)))["pValue"] < 0.05 for s in range(200)])
    assert 0.01 < rejections < 0.11


def test_variance_ratio_is_near_one_for_a_random_walk():
    ratios = [dg.variance_ratio(dg.log_returns(random_walk(s, n=1000)), 10)["vr"] for s in range(20)]
    assert 0.8 < np.mean(ratios) < 1.2


def test_variance_ratio_above_one_for_momentum_and_below_one_for_mean_reversion():
    assert dg.variance_ratio(dg.log_returns(momentum(1, n=2000)), 10)["vr"] > 1.3
    assert dg.variance_ratio(dg.log_returns(mean_reverting(1, n=2000)), 10)["vr"] < 0.7


def test_variance_ratio_needs_enough_data():
    assert dg.variance_ratio(np.random.default_rng(0).normal(0, 1, 30), 20)["vr"] is None


def test_a_random_walk_is_classified_as_such_most_of_the_time():
    labels = [dg.predictability(random_walk(s))["classification"] for s in range(40)]
    assert labels.count("random walk") >= 30


def test_momentum_is_detected_as_structure():
    hits = sum(dg.predictability(momentum(s))["classification"] != "random walk" for s in range(30))
    assert hits >= 27


def test_report_shape_and_plain_language_reading():
    out = dg.predictability(random_walk(0))
    assert out["available"] and len(out["acf"]) == 10 and len(out["varianceRatios"]) == 3
    assert out["acfBand95"] == pytest.approx(1.96 / np.sqrt(out["observations"]), abs=0.001)
    assert isinstance(out["reading"], str) and len(out["reading"]) > 40
    assert out["ljungBox"]["lags"] == 10


def test_random_walk_reading_explains_why_naive_is_hard_to_beat():
    out = dg.predictability(random_walk(0))
    if out["classification"] == "random walk":
        assert "price stays where it is" in out["reading"]


def test_too_little_data_is_reported_not_guessed():
    assert dg.predictability(random_walk(0, n=40))["available"] is False
