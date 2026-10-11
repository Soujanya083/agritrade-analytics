"""Prediction intervals for a simple linear trend (ordinary least squares)."""
import numpy as np
from scipy import stats


def ols_prediction_interval(y, future_x, level: float = 0.90):
    """
    Returns (point, lower, upper) arrays for x = future_x given observations y at x = 0..n-1.

    Uses the textbook OLS prediction interval, which includes both the
    residual noise and the uncertainty of the fitted line (wider the further
    ahead you look). With only 2 points there is no residual information, so
    the interval is reported as unbounded (NaN) rather than as a fake zero-width
    band. The previous fallback returned lower == upper == forecast, which
    suggested certainty the model did not have.
    """
    y = np.asarray(y, dtype=float)
    future_x = np.asarray(future_x, dtype=float)
    n = len(y)
    x = np.arange(n, dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    point = intercept + slope * future_x
    if n < 3:
        nan = np.full_like(point, np.nan)
        return point, nan, nan
    residuals = y - (intercept + slope * x)
    s = float(np.sqrt(np.sum(residuals ** 2) / (n - 2)))
    sxx = float(np.sum((x - x.mean()) ** 2))
    t = stats.t.ppf(0.5 + level / 2, df=n - 2)
    half = t * s * np.sqrt(1 + 1 / n + (future_x - x.mean()) ** 2 / sxx)
    return point, point - half, point + half
