"""
Is a clustering real, or just K-Means dividing noise into k pieces?

K-Means always returns k clusters, whatever the data. So three checks:
  * SILHOUETTE (Kaufman & Rousseeuw): how much closer points are to their own
    cluster than to the next one. > 0.5 reasonable, 0.25-0.5 weak, < 0.25 no
    substantial structure.
  * k SCAN: silhouette for k = 2..6, so "3 segments" can be compared with
    what the data actually supports.
  * STABILITY: refit on bootstrap resamples of the buyers and compare the
    assignments with the full-data clustering (adjusted Rand index, 1 = same
    groups every time). Unstable clusters would change if a few buyers did.
"""
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

MAX_K_SCAN = 6
BOOTSTRAPS = 30


def interpret_silhouette(value: float) -> str:
    if value > 0.7:
        return "strong structure"
    if value > 0.5:
        return "reasonable structure"
    if value > 0.25:
        return "weak structure"
    return "no substantial structure"


def _fit(X, k):
    return KMeans(n_clusters=k, random_state=42, n_init=10).fit(X)


def evaluate_clustering(X: np.ndarray, k: int, bootstraps: int = BOOTSTRAPS, seed: int = 0) -> dict:
    n = len(X)
    if n <= k or n < 6:
        return {"available": False, "note": f"Need more buyers than clusters (have {n}) to validate the clustering."}

    base = _fit(X, k)
    labels = base.labels_
    sizes = np.bincount(labels, minlength=k)
    silhouette = float(silhouette_score(X, labels)) if len(set(labels)) > 1 else 0.0

    scan = []
    for kk in range(2, min(MAX_K_SCAN, n - 1) + 1):
        lab = _fit(X, kk).labels_
        if len(set(lab)) > 1:
            scan.append({"k": kk, "silhouette": round(float(silhouette_score(X, lab)), 3)})
    best = max(scan, key=lambda r: r["silhouette"]) if scan else None

    rng = np.random.default_rng(seed)
    aris = []
    for _ in range(bootstraps):
        idx = rng.integers(0, n, n)
        if len(np.unique(idx)) <= k:
            continue
        boot = _fit(X[idx], k)
        aris.append(adjusted_rand_score(labels, boot.predict(X)))
    stability = float(np.mean(aris)) if aris else None

    smallest_share = float(sizes.min() / n)
    solid = silhouette > 0.25 and (stability is not None and stability >= 0.6) and smallest_share >= 0.05
    notes = []
    if best and best["k"] != k and best["silhouette"] > silhouette + 0.05:
        notes.append(f"The data separates better into k={best['k']} groups (silhouette {best['silhouette']}) than k={k}.")
    if smallest_share < 0.05:
        notes.append("One segment holds under 5% of buyers (possibly a handful of outliers).")
    if stability is not None and stability < 0.6:
        notes.append("Assignments change a lot when the buyers are resampled: the segments are not stable.")
    return {
        "available": True,
        "buyers": n,
        "k": k,
        "silhouette": round(silhouette, 3),
        "silhouetteReading": interpret_silhouette(silhouette),
        "stabilityARI": None if stability is None else round(stability, 3),
        "kScan": scan,
        "bestKBySilhouette": None if best is None else best["k"],
        "smallestSegmentShare": round(smallest_share, 3),
        "segmentsAreSolid": bool(solid),
        "reading": ("The segments are well supported by the data." if solid else
                    "Treat these segments as a descriptive grouping, not as distinct buyer types: the data does not strongly support them."),
        "notes": notes,
    }
