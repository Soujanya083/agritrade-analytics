"""
Predictability diagnostics for a price series.

The forecast lab says WHETHER a model beats "price stays the same". This
module says WHY, with standard tests on the daily log-returns:

  * autocorrelation (ACF) at lags 1..10 and the Ljung-Box test: is there any
    linear memory in returns at all?
  * Lo-MacKinlay variance-ratio test at 5/10/20 days (heteroskedasticity-
    robust): a random walk has VR = 1; VR > 1 means momentum (trends persist),
    VR < 1 means mean reversion.

If these show nothing, a naive forecast being unbeatable is not a modelling
failure - it is the correct description of the data. If they show structure,
models have something to learn. Pure numpy/scipy, so it is fully unit-tested.
"""
import math

import numpy as np
from scipy import stats

ACF_LAGS = 10
VR_HORIZONS = (5, 10, 20)
SIGNIFICANCE = 0.05


def log_returns(values) -> np.ndarray:
    v = np.clip(np.asarray(values, dtype=float), 1e-9, None)
    return np.diff(np.log(v))


def autocorrelations(returns: np.ndarray, nlags: int = ACF_LAGS) -> np.ndarray:
    r = returns - returns.mean()
    denom = float(np.dot(r, r))
    if denom == 0:
        return np.zeros(nlags)
    return np.array([float(np.dot(r[k:], r[:-k]) / denom) for k in range(1, nlags + 1)])


def ljung_box(returns: np.ndarray, nlags: int = ACF_LAGS) -> dict:
    n = len(returns)
    if n <= nlags + 5:
        return {"statistic": None, "pValue": None, "lags": nlags}
    rho = autocorrelations(returns, nlags)
    q = n * (n + 2) * float(np.sum(rho ** 2 / (n - np.arange(1, nlags + 1))))
    return {"statistic": round(q, 3), "pValue": round(float(stats.chi2.sf(q, nlags)), 4), "lags": nlags}


def variance_ratio(returns: np.ndarray, q: int) -> dict:
    """Lo-MacKinlay VR(q) with the heteroskedasticity-robust z statistic."""
    n = len(returns)
    if n < q * 5:
        return {"q": q, "vr": None, "z": None, "pValue": None}
    mu = returns.mean()
    centered = returns - mu
    var1 = float(np.sum(centered ** 2) / (n - 1))
    if var1 == 0:
        return {"q": q, "vr": None, "z": None, "pValue": None}
    agg = np.convolve(returns, np.ones(q), mode="valid")           # overlapping q-day returns
    m = q * (n - q + 1) * (1 - q / n)
    varq = float(np.sum((agg - q * mu) ** 2) / m)
    vr = varq / var1
    sq = centered ** 2
    denom = float(np.sum(sq)) ** 2
    theta = 0.0
    for j in range(1, q):
        delta = n * float(np.sum(sq[j:] * sq[:-j])) / denom
        theta += (2 * (q - j) / q) ** 2 * delta
    if theta <= 0:
        return {"q": q, "vr": round(vr, 3), "z": None, "pValue": None}
    z = math.sqrt(n) * (vr - 1) / math.sqrt(theta)
    return {"q": q, "vr": round(vr, 3), "z": round(z, 2), "pValue": round(float(2 * stats.norm.sf(abs(z))), 4)}


def predictability(values) -> dict:
    """Full diagnostic report with a plain-language reading."""
    returns = log_returns(values)
    if len(returns) < 60:
        return {"available": False, "note": "Need at least 60 daily returns."}
    rho = autocorrelations(returns)
    lb = ljung_box(returns)
    vrs = [variance_ratio(returns, q) for q in VR_HORIZONS]
    significant_vr = [v for v in vrs if v["pValue"] is not None and v["pValue"] < SIGNIFICANCE]
    memory = lb["pValue"] is not None and lb["pValue"] < SIGNIFICANCE

    if significant_vr:
        kind = "momentum" if np.mean([v["vr"] for v in significant_vr]) > 1 else "mean reversion"
        reading = (f"Prices show statistically significant {kind} over multi-day horizons "
                   f"(variance ratio {', '.join(str(v['vr']) for v in significant_vr)}). That means structure exists "
                   f"that a model could in principle exploit; whether the models tried here actually did is what the "
                   f"backtest above reports.")
        label = kind
    elif memory:
        reading = ("Daily returns have significant short-term autocorrelation (Ljung-Box), but it does not accumulate into "
                   "a reliable multi-day pattern.")
        label = "short-term memory only"
    else:
        reading = ("Returns look like a random walk: no significant autocorrelation and variance ratios close to 1. "
                   "Over these horizons tomorrow's price change is essentially unpredictable from past prices, which is why "
                   "'price stays where it is' is so hard to beat.")
        label = "random walk"
    return {
        "available": True,
        "observations": int(len(returns)),
        "acf": [{"lag": i + 1, "value": round(float(v), 3)} for i, v in enumerate(rho)],
        "acfBand95": round(1.96 / math.sqrt(len(returns)), 3),
        "ljungBox": lb,
        "varianceRatios": vrs,
        "classification": label,
        "reading": reading,
    }
