"""The anomaly benchmark itself, and what it reveals about the detectors."""
import pytest

from app.services import anomaly_benchmark as ab

RESULT = ab.run_benchmark(seeds=8)


def metric(magnitude, detector, field):
    return next(r[field] for r in RESULT["results"] if r["magnitude"] == magnitude and r["detector"] == detector)


def test_large_anomalies_are_always_caught():
    for detector in ("zScore", "iqr", "isolationForest", "allThree"):
        assert metric(4.0, detector, "recall") == 1.0


def test_subtle_anomalies_are_often_missed_so_the_benchmark_actually_discriminates():
    assert metric(1.1, "allThree", "recall") < 0.5
    assert metric(1.1, "allThree", "recall") < metric(1.5, "allThree", "recall")


def test_recall_does_not_fall_as_anomalies_get_bigger():
    for detector in ("zScore", "iqr", "isolationForest", "atLeastTwo", "allThree"):
        recalls = [metric(m, detector, "recall") for m in (1.1, 1.2, 1.3, 1.5, 2.0, 4.0)]
        assert all(b >= a - 0.05 for a, b in zip(recalls, recalls[1:])), detector


def test_requiring_agreement_cuts_false_alarms():
    """The confidence tiers are justified: 'all three agree' raises far fewer false alarms than any single detector."""
    assert metric(2.0, "allThree", "falsePositiveRate") < metric(2.0, "iqr", "falsePositiveRate")
    assert metric(2.0, "allThree", "falsePositiveRate") < metric(2.0, "isolationForest", "falsePositiveRate")
    assert metric(2.0, "allThree", "precision") > metric(2.0, "iqr", "precision")


def test_iqr_and_isolation_forest_alone_are_noisy():
    assert metric(2.0, "iqr", "precision") < 0.7
    assert metric(2.0, "isolationForest", "precision") < 0.8


def test_isolation_forest_false_alarm_floor_matches_its_contamination_setting():
    assert metric(2.0, "isolationForest", "falsePositiveRate") > 0.01


def test_benchmark_is_deterministic():
    assert ab.run_benchmark(seeds=3)["results"] == ab.run_benchmark(seeds=3)["results"]


def test_benchmark_states_what_it_does_and_does_not_show():
    text = " ".join(RESULT["reading"]).lower()
    assert "synthetic" in text and "does not measure" in text
    assert RESULT["setup"]["runsPerMagnitude"] == 8
