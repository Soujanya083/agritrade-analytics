"""Inter-rater agreement for the human ratings of the assistant's general answers."""
from collections import Counter


def weighted_kappa(a: list, b: list, min_rating: int = 1, max_rating: int = 5) -> float:
    """Quadratic-weighted Cohen's kappa between two raters' ordinal scores (1.0 = perfect,
    0 = chance level, <0 = worse than chance). Raises on length mismatch or empty input."""
    if len(a) != len(b) or not a:
        raise ValueError("both raters must score the same, non-empty list of items")
    levels = list(range(min_rating, max_rating + 1))
    n = len(a)
    observed = Counter(zip(a, b))
    marg_a, marg_b = Counter(a), Counter(b)
    span = (max_rating - min_rating) ** 2 or 1
    num = den = 0.0
    for i in levels:
        for j in levels:
            w = ((i - j) ** 2) / span
            num += w * observed.get((i, j), 0) / n
            den += w * (marg_a.get(i, 0) / n) * (marg_b.get(j, 0) / n)
    return 1.0 if den == 0 and num == 0 else 1 - num / den if den else 0.0


def percent_agreement(a: list, b: list, tolerance: int = 0) -> float:
    """Share of items on which the two raters are within `tolerance` points."""
    if len(a) != len(b) or not a:
        raise ValueError("both raters must score the same, non-empty list of items")
    return sum(abs(x - y) <= tolerance for x, y in zip(a, b)) / len(a)
