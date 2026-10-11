"""
Forecast lab: an honest model comparison for ONE price series.

The question it answers is not "which model has the lowest error?" but
"is any model reliably better than just assuming tomorrow's price equals
today's?" - for daily commodity prices that bar is surprisingly high, and a
system that always crowns a fancy model is overstating what it knows.

Method
------
* Models (each takes only the past): naive, seasonal naive, drift, moving
  average, Ridge and gradient boosting on lagged log-returns, and - when the
  libraries are installed - ARIMA(1,1,1) and Prophet.
* ROLLING-ORIGIN cross-validation (expanding window, refit at every origin):
  at each origin the model sees only earlier data and forecasts the next
  `horizon` days; the forecasts are scored against what actually happened.
  No shuffling, no look-ahead.
* Metrics: MAE, RMSE, sMAPE, MASE (error relative to the naive one-step
  error on the training data, so it is comparable across commodities),
  bias, directional accuracy, and win-rate against naive.
* Significance: Diebold-Mariano test (Newey-West variance, because
  overlapping forecast windows make errors autocorrelated) of each model
  against naive.
* Champion: the best challenger is only crowned if it beats naive on MASE
  AND the DM test is significant at 10%. Otherwise the champion is naive and
  the verdict says so plainly.
* Intervals: split-conformal prediction intervals from the champion's
  out-of-sample errors per forecast day. Coverage is checked honestly by
  calibrating on the first half of the origins and testing on the second.
"""
import functools
import math
import warnings
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats

from app.services.market.diagnostics import predictability

MIN_POINTS = 120          # days of history needed to evaluate anything
MIN_TRAIN = 60            # smallest training window used in any fold
MAX_ORIGINS = 60
DM_ALPHA = 0.10
INTERVAL_LEVEL = 0.90
_LAGS = 7
_FEATURE_START = 35


# ------------------------------------------------------------------ models
# Every model: fn(values: np.ndarray, index: DatetimeIndex, horizon: int) -> np.ndarray(horizon)

def _naive(y, idx, h):
    return np.repeat(y[-1], h)


def _seasonal_naive(season):
    def forecast(y, idx, h):
        if len(y) < season:
            return _naive(y, idx, h)
        return np.array([y[len(y) - season + (i % season)] for i in range(h)])
    return forecast


def _drift(window):
    def forecast(y, idx, h):
        w = y[-window:]
        slope = (w[-1] - w[0]) / max(len(w) - 1, 1)
        return y[-1] + slope * np.arange(1, h + 1)
    return forecast


def _moving_average(window):
    def forecast(y, idx, h):
        return np.repeat(np.mean(y[-window:]), h)
    return forecast


def _mean_reversion(y, idx, h):
    """
    Interpretable mean-reversion model: the log price's deviation from its
    trailing 90-day mean is modelled as AR(1), x[t+1] = phi * x[t], and the
    forecast decays back toward that mean: ly[t+k] = mean + phi**k * x[t].
    The trailing mean at each time uses only that time and earlier (no
    look-ahead). This is the model the variance-ratio test points to when it
    reports mean reversion; whether it actually beats naive is up to the backtest.
    """
    ly = np.log(np.clip(y, 1e-6, None))
    window = 90
    if len(ly) < window + 30:
        return _naive(y, idx, h)
    trailing = pd.Series(ly).rolling(window).mean().to_numpy()
    x = (ly - trailing)[window - 1:]
    denom = float(np.dot(x[:-1], x[:-1]))
    phi = float(np.clip(np.dot(x[:-1], x[1:]) / denom, 0.0, 0.999)) if denom > 0 else 0.0
    steps = np.arange(1, h + 1)
    return np.exp(trailing[-1] + (phi ** steps) * x[-1])


def _features(ly, dates, t):
    """Features known at time t (uses ly[:t+1] only) to predict ly[t+1]-ly[t]."""
    diffs = np.diff(ly[t - _LAGS:t + 1])
    last7 = ly[t - 6:t + 1]
    last30 = ly[t - 29:t + 1]
    month = (dates[t] + pd.Timedelta(days=1)).month
    angle = 2 * math.pi * month / 12
    return np.concatenate([diffs, [ly[t] - last7.mean(), ly[t] - last30.mean(), diffs.std(),
                                   math.sin(angle), math.cos(angle)]])


def _tabular(make_model):
    """Recursive one-step model of the log-return, so trend is learned as changes, not levels."""
    def forecast(y, idx, h):
        ly = np.log(np.clip(y, 1e-6, None))
        dates = list(idx)
        if len(ly) <= _FEATURE_START + 10:
            return _naive(y, idx, h)
        X, target = [], []
        for t in range(_FEATURE_START, len(ly) - 1):
            X.append(_features(ly, dates, t))
            target.append(ly[t + 1] - ly[t])
        model = make_model()
        model.fit(np.array(X), np.array(target))
        ext, ext_dates = list(ly), list(dates)
        out = []
        for _ in range(h):
            row = _features(np.array(ext), ext_dates, len(ext) - 1)
            step = float(model.predict(row.reshape(1, -1))[0])
            ext.append(ext[-1] + step)
            ext_dates.append(ext_dates[-1] + pd.Timedelta(days=1))
            out.append(math.exp(ext[-1]))
        return np.array(out)
    return forecast


def _ridge():
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    return make_pipeline(StandardScaler(), Ridge(alpha=10.0))


def _gbm():
    from sklearn.ensemble import HistGradientBoostingRegressor
    return HistGradientBoostingRegressor(max_iter=80, max_depth=3, learning_rate=0.05, min_samples_leaf=20, random_state=0)


def _arima(y, idx, h):
    from statsmodels.tsa.arima.model import ARIMA
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = ARIMA(np.log(np.clip(y, 1e-6, None)), order=(1, 1, 1)).fit()
        return np.exp(np.asarray(fit.forecast(h)))


def _prophet(y, idx, h):
    import logging
    from prophet import Prophet
    logging.getLogger("cmdstanpy").setLevel(logging.ERROR)
    logging.getLogger("prophet").setLevel(logging.ERROR)
    model = Prophet(daily_seasonality=False, weekly_seasonality=len(y) >= 60, yearly_seasonality=len(y) >= 730)
    model.fit(pd.DataFrame({"ds": idx, "y": y}))
    forecast = model.predict(model.make_future_dataframe(periods=h))
    return np.clip(forecast["yhat"].tail(h).to_numpy(), 1e-6, None)


@functools.lru_cache(maxsize=1)
def _prophet_usable() -> bool:
    """`import prophet` can succeed while its Stan engine is missing (common on Windows);
    constructing the model is what fails then, so probe that once and skip Prophet if it does."""
    try:
        from prophet import Prophet

        Prophet()
        return True
    except Exception:
        return False


@functools.lru_cache(maxsize=1)
def _arima_usable() -> bool:
    try:
        from statsmodels.tsa.arima.model import ARIMA  # noqa: F401

        return True
    except Exception:
        return False


@dataclass
class ModelSpec:
    key: str
    label: str
    fn: callable
    optional: bool = False


def model_registry(n_points: int) -> list[ModelSpec]:
    specs = [
        ModelSpec("naive", "Naive (last price)", _naive),
        ModelSpec("seasonal_naive_7", "Seasonal naive (weekly)", _seasonal_naive(7)),
        ModelSpec("drift_60", "Drift (last 60 days)", _drift(60)),
        ModelSpec("mean_reversion", "Mean reversion (AR on deviation from 90-day mean)", _mean_reversion),
        ModelSpec("moving_average_7", "Moving average (7 days)", _moving_average(7)),
        ModelSpec("ridge_lags", "Ridge on lagged returns", _tabular(_ridge)),
        ModelSpec("gbm_lags", "Gradient boosting on lagged returns", _tabular(_gbm)),
    ]
    if n_points >= 600:
        specs.insert(2, ModelSpec("seasonal_naive_365", "Seasonal naive (yearly)", _seasonal_naive(365)))
    for key, label, fn, usable in (("arima_111", "ARIMA(1,1,1)", _arima, _arima_usable),
                                   ("prophet", "Prophet", _prophet, _prophet_usable)):
        if usable():
            specs.append(ModelSpec(key, label, fn, optional=True))
    return specs


# ------------------------------------------------------------- evaluation
def choose_origins(n: int, horizon: int, step: int | None = None) -> list[int]:
    """Forecast origins (index of the first unseen day), oldest first."""
    step = step or max(horizon // 2, 7)
    test_window = min(max(n // 3, horizon * 4), 540)
    last = n - horizon
    origins = []
    origin = last
    while origin >= max(n - test_window, MIN_TRAIN) and len(origins) < MAX_ORIGINS:
        origins.append(origin)
        origin -= step
    return sorted(origins)


def _run_model(spec: ModelSpec, values, index, origins, horizon):
    """Forecast matrix (n_origins x horizon). A failed fit falls back to naive and is counted."""
    forecasts = np.zeros((len(origins), horizon))
    failures = 0
    for i, origin in enumerate(origins):
        try:
            f = np.asarray(spec.fn(values[:origin], index[:origin], horizon), dtype=float)
            if f.shape != (horizon,) or not np.all(np.isfinite(f)):
                raise ValueError("bad forecast")
        except Exception:
            f, failures = _naive(values[:origin], index[:origin], horizon), failures + 1
        forecasts[i] = np.clip(f, 1e-6, None)
    return forecasts, failures


def _smape(actual, forecast):
    denom = (np.abs(actual) + np.abs(forecast)) / 2
    return float(np.mean(np.abs(actual - forecast) / np.where(denom == 0, 1, denom)) * 100)


def diebold_mariano(loss_benchmark, loss_model, lag: int) -> dict:
    """
    One-sided Diebold-Mariano test, H1: the model's loss is LOWER than the
    benchmark's. Newey-West long-run variance with `lag` autocovariances and
    the Harvey-Leybourne-Newbold small-sample correction (t distribution).
    """
    d = np.asarray(loss_benchmark, dtype=float) - np.asarray(loss_model, dtype=float)
    n = len(d)
    if n < 5 or np.allclose(d, 0):
        return {"statistic": None, "pValue": None}
    mean = d.mean()
    centered = d - mean
    variance = float(np.dot(centered, centered) / n)
    for k in range(1, min(lag, n - 1) + 1):
        gamma = float(np.dot(centered[k:], centered[:-k]) / n)
        variance += 2 * (1 - k / (lag + 1)) * gamma
    if variance <= 0:
        return {"statistic": None, "pValue": None}
    statistic = mean / math.sqrt(variance / n)
    statistic *= math.sqrt(max((n - 1) / n, 1e-9))
    return {"statistic": round(float(statistic), 3), "pValue": round(float(stats.t.sf(statistic, df=n - 1)), 4)}


def holm_adjust(p_values: list) -> list:
    """
    Holm-Bonferroni step-down adjustment (controls the chance of ANY false win
    across all challengers). Several models are tested against naive and the
    best is crowned; without a correction that selection inflates false wins.
    None (untestable) stays None and is not counted.
    """
    indexed = sorted((p, i) for i, p in enumerate(p_values) if p is not None)
    m = len(indexed)
    adjusted = [None] * len(p_values)
    running = 0.0
    for rank, (p, i) in enumerate(indexed):
        running = max(running, min(1.0, (m - rank) * p))
        adjusted[i] = round(running, 4)
    return adjusted


def conformal_halfwidths(abs_errors: np.ndarray, level: float = INTERVAL_LEVEL) -> np.ndarray:
    """Per-horizon split-conformal half-widths from calibration |errors| (origins x horizon)."""
    n = abs_errors.shape[0]
    q = min(1.0, math.ceil((n + 1) * level) / n)
    widths = np.quantile(abs_errors, q, axis=0, method="higher")
    # Uncertainty can't shrink as we look further ahead; sampling noise in the
    # per-day quantiles shouldn't be allowed to say otherwise.
    return np.maximum.accumulate(widths)


def interval_coverage(errors: np.ndarray, level: float = INTERVAL_LEVEL) -> dict:
    """Calibrate on the older half of the origins, measure coverage on the newer half."""
    n = errors.shape[0]
    if n < 8:
        return {"target": level, "empirical": None, "origins": 0}
    half = n // 2
    widths = conformal_halfwidths(np.abs(errors[:half]), level)
    covered = np.abs(errors[half:]) <= widths
    return {"target": level, "empirical": round(float(covered.mean()), 3), "origins": int(n - half)}


def evaluate(values: np.ndarray, index: pd.DatetimeIndex, horizon: int = 14) -> dict:
    """Rolling-origin comparison of every model. Returns leaderboard + raw CV errors."""
    origins = choose_origins(len(values), horizon)
    if len(origins) < 4:
        raise ValueError("Not enough history for a rolling-origin evaluation.")
    actual = np.array([values[o:o + horizon] for o in origins])
    scale = float(np.mean(np.abs(np.diff(values[:origins[0]])))) or 1e-9
    last_seen = np.array([values[o - 1] for o in origins])

    specs = model_registry(len(values))
    rows, errors_by_model, losses = [], {}, {}
    for spec in specs:
        forecasts, failures = _run_model(spec, values, index, origins, horizon)
        errors = forecasts - actual
        errors_by_model[spec.key] = errors
        losses[spec.key] = (errors ** 2).mean(axis=1)
        moved = (actual[:, -1] != last_seen)
        direction = float(np.mean(np.sign(forecasts[moved, -1] - last_seen[moved]) == np.sign(actual[moved, -1] - last_seen[moved]))) if moved.any() else None
        rows.append({
            "model": spec.key, "label": spec.label,
            "MAE": round(float(np.abs(errors).mean()), 4),
            "RMSE": round(float(math.sqrt((errors ** 2).mean())), 4),
            "sMAPE": round(_smape(actual, forecasts), 2),
            "MASE": round(float(np.abs(errors).mean() / scale), 3),
            "bias": round(float(errors.mean()), 4),
            "directionalAccuracy": None if direction is None else round(direction, 3),
            "fitFailures": failures,
        })

    lag = max(math.ceil(horizon / max(horizon // 2, 7)) - 1, 1)
    naive_loss = losses["naive"]
    naive_mase = next(r for r in rows if r["model"] == "naive")["MASE"]
    challengers = [r for r in rows if r["model"] != "naive"]
    raw_p = [diebold_mariano(naive_loss, losses[r["model"]], lag)["pValue"] for r in challengers]
    adjusted_p = holm_adjust(raw_p)
    for row in rows:
        if row["model"] == "naive":
            row.update({"winRateVsNaive": None, "dmPValue": None, "dmPValueAdjusted": None, "beatsNaive": False})
    for row, p, p_adj in zip(challengers, raw_p, adjusted_p):
        row.update({
            "winRateVsNaive": round(float(np.mean(losses[row["model"]] < naive_loss)), 3),
            "dmPValue": p,
            "dmPValueAdjusted": p_adj,
            # the multiple-comparison-adjusted p is what decides, not the raw one
            "beatsNaive": bool(row["MASE"] < naive_mase and p_adj is not None and p_adj < DM_ALPHA),
        })
    rows.sort(key=lambda r: r["MASE"])
    return {"origins": origins, "horizon": horizon, "scaleMAE": scale, "leaderboard": rows,
            "errors": errors_by_model, "actual": actual, "lastSeen": last_seen,
            "specs": {s.key: s for s in specs}}


WAIT_THRESHOLD = 0.03   # only wait if the model expects a rise of at least 3%
BOOTSTRAP_DRAWS = 2000


def _block_bootstrap_ci(values: np.ndarray, block: int, draws: int = BOOTSTRAP_DRAWS, seed: int = 0) -> tuple[float, float]:
    """95% CI of the mean, resampling BLOCKS of consecutive origins (their windows overlap, so plain
    resampling would understate the uncertainty)."""
    rng = np.random.default_rng(seed)
    n = len(values)
    block = max(1, min(block, n))
    n_blocks = math.ceil(n / block)
    starts = rng.integers(0, n - block + 1, size=(draws, n_blocks))
    means = np.array([np.concatenate([values[s:s + block] for s in row])[:n].mean() for row in starts])
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def economic_value(actual: np.ndarray, errors: np.ndarray, last_seen: np.ndarray, horizon: int,
                   threshold: float = WAIT_THRESHOLD, step: int | None = None) -> dict:
    """
    Would FOLLOWING the forecast have paid? At each backtest origin a farmer
    holding the crop either sells now (gain 0 by definition) or waits `horizon`
    days (gain = realised price change). The policy waits only when the model
    forecast a rise of at least `threshold`. Gains are % of the price at the
    origin, with a block-bootstrap 95% CI, and compared with "always wait".

    Honest limits, returned with the result: storage cost, spoilage and
    interest on money are NOT deducted (so real gains are lower); the champion
    was chosen on these same origins (optimistic); origins overlap in time.
    """
    forecasts = errors + actual
    predicted = forecasts[:, -1] / last_seen - 1
    realised = actual[:, -1] / last_seen - 1
    wait = predicted >= threshold
    follow = np.where(wait, realised, 0.0)
    block = max(1, math.ceil(horizon / (step or max(horizon // 2, 7))))
    f_lo, f_hi = _block_bootstrap_ci(follow, block)
    w_lo, w_hi = _block_bootstrap_ci(realised, block)
    n_wait = int(wait.sum())
    mean_follow = float(follow.mean() * 100)
    verdict = (
        "Following the forecast would have earned more than selling immediately (the 95% interval is above zero)."
        if f_lo > 0 else
        "Following the forecast would NOT have reliably beaten selling immediately (the 95% interval includes zero)."
        if n_wait else
        "The model never forecast a rise large enough to justify waiting, so the policy is identical to selling immediately.")
    return {
        "decisions": int(len(realised)),
        "waitThresholdPct": round(threshold * 100, 1),
        "timesModelSaidWait": n_wait,
        "hitRateWhenWait": None if not n_wait else round(float((realised[wait] > 0).mean()), 3),
        "followForecast": {"meanGainPct": round(mean_follow, 2), "ci95": [round(f_lo * 100, 2), round(f_hi * 100, 2)]},
        "alwaysWait": {"meanGainPct": round(float(realised.mean() * 100), 2), "ci95": [round(w_lo * 100, 2), round(w_hi * 100, 2)]},
        "sellNowGainPct": 0.0,
        "verdict": verdict,
        "caveats": [
            "Storage cost, spoilage and interest are not deducted, so real gains would be lower.",
            "The champion model was chosen on these same test points, so this is somewhat optimistic.",
            "Test points overlap in time; the interval uses a block bootstrap to allow for that.",
        ],
    }


def choose_champion(leaderboard: list[dict]) -> tuple[str, str]:
    naive = next(r for r in leaderboard if r["model"] == "naive")
    winners = [r for r in leaderboard if r["model"] != "naive" and r["beatsNaive"]]
    if winners:
        best = winners[0]
        gain = (1 - best["MASE"] / naive["MASE"]) * 100
        return best["model"], (
            f"{best['label']} beat the naive last-price forecast by {gain:.1f}% (MASE {best['MASE']} vs {naive['MASE']}) "
            f"and the difference is statistically significant (Diebold-Mariano p={best['dmPValue']}, "
            f"p={best['dmPValueAdjusted']} after correcting for testing {len([r for r in leaderboard if r['model'] != 'naive'])} models).")
    challengers = [r for r in leaderboard if r["model"] != "naive"]
    best = challengers[0] if challengers else None
    if best and best["MASE"] < naive["MASE"]:
        p = best.get("dmPValueAdjusted", best["dmPValue"])
        gain = (1 - best["MASE"] / naive["MASE"]) * 100
        return "naive", (
            f"No model was reliably better than assuming the price stays where it is. The best challenger ({best['label']}) "
            f"was {gain:.1f}% better on MASE but not statistically significant (adjusted p={p}), so the naive forecast is used.")
    return "naive", "No model beat the naive last-price forecast on this history, so the naive forecast is used."


def run_forecast_lab(series: pd.Series, horizon: int = 14) -> dict:
    """Full pipeline for one series. Returns {"error": ...} when history is too short."""
    if len(series) < MIN_POINTS:
        return {"error": f"Not enough price history: need at least {MIN_POINTS} days, found {len(series)}."}
    values, index = series.to_numpy(dtype=float), series.index
    try:
        result = evaluate(values, index, horizon)
    except ValueError as exc:
        return {"error": str(exc)}

    champion_key, reason = choose_champion(result["leaderboard"])
    errors = result["errors"][champion_key]
    halfwidths = conformal_halfwidths(np.abs(errors))
    try:
        point = np.asarray(result["specs"][champion_key].fn(values, index, horizon), dtype=float)
        if point.shape != (horizon,) or not np.all(np.isfinite(point)):
            raise ValueError("bad forecast")
    except Exception:
        # The champion fit fine on every past origin but failed on the full history:
        # show the naive forecast and say so, rather than failing the whole request.
        reason += " (The champion model could not be fitted on the full history, so the naive forecast is shown.)"
        champion_key = "naive"
        point = _naive(values, index, horizon)
    point = np.clip(point, 1e-6, None)
    dates = pd.date_range(index[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
    label = result["specs"][champion_key].label

    return {
        "horizon": horizon,
        "evaluation": {
            "method": "Rolling-origin cross-validation (expanding window, refit at every origin)",
            "origins": len(result["origins"]),
            "testWindowDays": int(len(values) - result["origins"][0]),
            "forecastHorizonDays": horizon,
            "scale": "MASE = MAE / mean absolute one-day change in the training data (1.0 = as good as naive one-step)",
        },
        "leaderboard": result["leaderboard"],
        "champion": {"model": champion_key, "label": label, "reason": reason,
                     "beatsNaive": champion_key != "naive"},
        "forecast": [
            {"date": d.strftime("%Y-%m-%d"), "point": round(float(p), 3),
             "lower": round(float(max(p - w, 0)), 3), "upper": round(float(p + w), 3)}
            for d, p, w in zip(dates, point, halfwidths)
        ],
        "intervalCoverage": interval_coverage(errors),
        "economicValue": economic_value(result["actual"], errors, result["lastSeen"], horizon),
        "predictability": predictability(values),
        "lastObserved": {"date": index[-1].strftime("%Y-%m-%d"), "price": round(float(values[-1]), 3)},
        "history": [{"date": d.strftime("%Y-%m-%d"), "price": round(float(v), 3)}
                    for d, v in zip(index[-120:], values[-120:])],
        "caveats": [
            "Real AGMARKNET wholesale (mandi) prices, not the marketplace's own listings.",
            "Intervals are conformal: they reflect how wrong this model type has actually been on this series, not a guarantee.",
            "Forecasts cannot anticipate shocks (weather, policy, export bans).",
        ],
    }
