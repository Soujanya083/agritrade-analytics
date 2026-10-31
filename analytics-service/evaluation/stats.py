"""Small statistics helpers shared by the evaluation tools (no third-party dependencies)."""
import math


def wilson_interval(successes: int, n: int, z: float = 1.96) -> tuple:
    """95% Wilson score interval for a proportion (honest about small samples)."""
    if n == 0:
        return (0.0, 0.0)
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


# two-sided 95% critical values of Student's t for 1..30 degrees of freedom
_T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
        2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042]


def mean_ci95(values: list) -> tuple:
    """(mean, lower, upper) with a t-based 95% confidence interval. Needs at least 2 values."""
    n = len(values)
    if n < 2:
        raise ValueError("a confidence interval needs at least 2 values")
    mean = sum(values) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in values) / (n - 1))
    t = _T95[n - 2] if n - 1 <= 30 else 1.96
    half = t * sd / math.sqrt(n)
    return mean, mean - half, mean + half


def percentile(values: list, q: float) -> float:
    """q in [0, 100], linear interpolation between closest ranks (same as numpy's default)."""
    if not values:
        raise ValueError("no values")
    xs = sorted(values)
    pos = (len(xs) - 1) * q / 100
    lo, hi = math.floor(pos), math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)
