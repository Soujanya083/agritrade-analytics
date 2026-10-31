"""SUS scoring, task statistics, cost calibration and the (dry-run by default) seed-data purge."""
import importlib.util
import os

import pytest

from evaluation import study_tools
from evaluation.stats import mean_ci95, percentile


# ------------------------------------------------------------------ SUS
def test_sus_score_known_values():
    assert study_tools.sus_score([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]) == 100.0     # best possible
    assert study_tools.sus_score([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]) == 0.0       # worst possible
    assert study_tools.sus_score([3] * 10) == 50.0                            # all neutral
    # hand calculation: odd items 4,4,4,4,4 -> 3 each = 15; even items 2,2,2,2,2 -> 3 each = 15; (30) * 2.5 = 75
    assert study_tools.sus_score([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]) == 75.0


def test_sus_rejects_bad_input():
    with pytest.raises(ValueError):
        study_tools.sus_score([3] * 9)
    with pytest.raises(ValueError):
        study_tools.sus_score([6] + [3] * 9)
    with pytest.raises(ValueError):
        study_tools.sus_score([0] + [3] * 9)


def _row(answers):
    return {f"q{i + 1}": str(a) for i, a in enumerate(answers)}


def test_summarise_sus_reports_mean_interval_and_small_sample_warning():
    rows = [_row([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]), _row([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), _row([3] * 10)]
    s = study_tools.summarise_sus(rows)
    assert s["n"] == 3 and s["scores"] == [75.0, 100.0, 50.0]
    assert s["mean"] == 75.0
    assert s["ci95"][0] < 75.0 < s["ci95"][1]
    assert "fewer than 8" in s["note"]
    assert s["aboveBenchmark"] is True


def test_a_single_participant_gives_a_score_but_no_interval():
    s = study_tools.summarise_sus([_row([3] * 10)])
    assert s["scores"] == [50.0] and "mean" not in s


# ------------------------------------------------------------------ statistics helpers
def test_mean_ci_and_percentile_match_known_values():
    mean, lo, hi = mean_ci95([10, 12, 14, 16, 18])
    assert mean == 14 and round(lo, 2) == 10.07 and round(hi, 2) == 17.93      # sd = sqrt(10) = 3.162, t(4) = 2.776, half-width = 2.776 * 3.162 / sqrt(5) = 3.93
    assert percentile([1, 2, 3, 4, 5], 50) == 3
    assert percentile([1, 2, 3, 4], 25) == 1.75
    with pytest.raises(ValueError):
        mean_ci95([1])
    with pytest.raises(ValueError):
        percentile([], 50)


# ------------------------------------------------------------------ tasks
def test_task_summary_counts_successes_and_times():
    rows = [
        {"task": "list a crop", "success": "yes", "seconds": "60"},
        {"task": "list a crop", "success": "no", "seconds": "120"},
        {"task": "list a crop", "success": "1", "seconds": "90"},
        {"task": "place a bid", "success": "true", "seconds": ""},
    ]
    t = study_tools.summarise_tasks(rows)
    assert t["list a crop"]["n"] == 3 and t["list a crop"]["successRate"] == 0.667
    assert t["list a crop"]["medianSeconds"] == 90.0
    assert t["place a bid"]["successRate"] == 1.0 and t["place a bid"]["medianSeconds"] is None
    assert t["place a bid"]["ci95"][0] < 1.0       # one success is not proof of 100%


# ------------------------------------------------------------------ cost calibration
def test_cost_calibration_uses_quartiles_and_warns_when_few_answers():
    rows = [{"commission_pct": str(v), "transport_per_quintal": str(v * 20), "handling_per_quintal": "", "shrinkage_pct": "",
             "price_haircut_pct": ""} for v in (2, 3, 4, 5, 6)]
    c = study_tools.calibrate_costs(rows)
    assert c["fields"]["commissionPct"] == {"label": study_tools.COST_FIELDS["commission_pct"][1], "answers": 5,
                                            "optimistic": 3.0, "expected": 4.0, "conservative": 5.0}
    assert c["fields"]["transportPerQuintal"]["expected"] == 80.0
    assert "handlingPerQuintal" not in c["fields"]         # nobody answered: nothing invented
    assert any("fewer than 8" in w for w in c["warnings"])


# ------------------------------------------------------------------ purge script
_spec = importlib.util.spec_from_file_location("purge_seed_data", os.path.join(os.path.dirname(__file__), "..", "scripts", "purge_seed_data.py"))
purge_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(purge_mod)


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    def _match(self, doc, flt):
        for key, cond in flt.items():
            if key == "$or":
                if not any(self._match(doc, sub) for sub in cond):
                    return False
            elif isinstance(cond, dict) and "$in" in cond:
                if doc.get(key) not in cond["$in"]:
                    return False
            elif isinstance(cond, dict) and "$regex" in cond:
                import re
                if not re.search(cond["$regex"], str(doc.get(key, "")), re.I):
                    return False
            elif doc.get(key) != cond:
                return False
        return True

    def find(self, flt, projection=None):
        return [d for d in self.docs if self._match(d, flt)]

    def count_documents(self, flt):
        return len(self.find(flt))

    def delete_many(self, flt):
        self.docs[:] = [d for d in self.docs if not self._match(d, flt)]


def make_db():
    return {
        "users": FakeCollection([
            {"_id": "s1", "email": "seed.farmer1@test.com"}, {"_id": "s2", "email": "seed.buyer1@test.com"},
            {"_id": "r1", "email": "real.farmer@gmail.com"}, {"_id": "r2", "email": "real.buyer@gmail.com"}]),
        "crops": FakeCollection([{"_id": "c1", "farmerId": "s1"}, {"_id": "c2", "farmerId": "r1"}]),
        "bids": FakeCollection([
            {"_id": "b1", "cropId": "c1", "buyerId": "s2"},     # seed bid on a seed crop
            {"_id": "b2", "cropId": "c1", "buyerId": "r2"},     # REAL buyer bidding on a seed crop: goes with the crop
            {"_id": "b3", "cropId": "c2", "buyerId": "s2"},     # seed buyer on a REAL crop
            {"_id": "b4", "cropId": "c2", "buyerId": "r2"}]),   # fully real
        "transactions": FakeCollection([{"_id": "t1", "cropId": "c1", "farmerId": "s1", "buyerId": "s2"},
                                        {"_id": "t2", "cropId": "c2", "farmerId": "r1", "buyerId": "r2"}]),
        "notifications": FakeCollection([{"_id": "n1", "userId": "s1"}, {"_id": "n2", "userId": "r1"}]),
    }


def test_purge_is_a_dry_run_by_default():
    db = make_db()
    counts = purge_mod.purge(db)
    assert counts["users"] == 2 and counts["crops"] == 1 and counts["bids"] == 3 and counts["transactions"] == 1
    assert len(db["users"].docs) == 4 and len(db["bids"].docs) == 4         # nothing deleted


def test_apply_removes_only_seed_owned_records_and_keeps_real_data():
    db = make_db()
    purge_mod.purge(db, apply=True)
    assert [u["_id"] for u in db["users"].docs] == ["r1", "r2"]
    assert [c["_id"] for c in db["crops"].docs] == ["c2"]
    assert [b["_id"] for b in db["bids"].docs] == ["b4"]
    assert [t["_id"] for t in db["transactions"].docs] == ["t2"]
    assert [n["_id"] for n in db["notifications"].docs] == ["n2"]


def test_purge_with_no_seed_users_deletes_nothing():
    db = make_db()
    db["users"].docs[:] = [u for u in db["users"].docs if not u["email"].startswith("seed.")]
    assert purge_mod.purge(db, apply=True) == {name: 0 for name in purge_mod.COLLECTIONS}
    assert len(db["crops"].docs) == 2
