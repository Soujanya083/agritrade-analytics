"""
Tools for the user study (see user-study/README.md).

  python -m evaluation.study_tools sus   user-study/data/sus_responses.csv
  python -m evaluation.study_tools tasks user-study/data/task_results.csv
  python -m evaluation.study_tools costs user-study/data/cost_survey.csv

sus    : System Usability Scale score per participant and overall, with a 95% confidence interval.
tasks  : task success rate (with Wilson interval) and median time on task.
costs  : real transport / storage / commission / handling / shrinkage costs reported by farmers ->
         suggested values for PROFIT_SCENARIOS in app/services/market_recommendation.py.
"""
import csv
import sys
from statistics import median

from evaluation.stats import mean_ci95, percentile, wilson_interval

SUS_BENCHMARK = 68.0     # widely used average SUS score (Sauro & Lewis)


# ------------------------------------------------------------------------------------- SUS
def sus_score(answers: list) -> float:
    """One participant's SUS score (0-100) from their 10 answers (1 = strongly disagree ... 5 = strongly agree).
    Odd-numbered items are positively worded (score = answer - 1), even-numbered items negatively worded
    (score = 5 - answer); the total is multiplied by 2.5."""
    if len(answers) != 10:
        raise ValueError("SUS has exactly 10 items")
    if any(not isinstance(a, (int, float)) or a < 1 or a > 5 for a in answers):
        raise ValueError("every SUS answer must be between 1 and 5")
    total = sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))   # i = 0 is item 1 (odd)
    return total * 2.5


def summarise_sus(rows: list) -> dict:
    """rows: dicts with q1..q10 (and optionally participant, role)."""
    scores = []
    for r in rows:
        scores.append(sus_score([float(r[f"q{i}"]) for i in range(1, 11)]))
    out = {"n": len(scores), "scores": scores}
    if len(scores) >= 2:
        mean, lo, hi = mean_ci95(scores)
        out.update({"mean": round(mean, 1), "ci95": (round(lo, 1), round(hi, 1)), "median": round(median(scores), 1),
                    "aboveBenchmark": mean >= SUS_BENCHMARK, "benchmark": SUS_BENCHMARK,
                    "note": "" if len(scores) >= 8 else "fewer than 8 participants: the interval is very wide"})
    return out


# ---------------------------------------------------------------------------------- tasks
def summarise_tasks(rows: list) -> dict:
    """rows: dicts with task, success (1/0/yes/no/true/false) and optional seconds."""
    truthy = {"1", "yes", "y", "true", "t"}
    by_task = {}
    for r in rows:
        t = by_task.setdefault(r["task"], {"ok": 0, "n": 0, "seconds": []})
        t["n"] += 1
        t["ok"] += str(r["success"]).strip().lower() in truthy
        if str(r.get("seconds", "")).strip():
            t["seconds"].append(float(r["seconds"]))
    result = {}
    for task, t in by_task.items():
        lo, hi = wilson_interval(t["ok"], t["n"])
        result[task] = {"n": t["n"], "successRate": round(t["ok"] / t["n"], 3), "ci95": (round(lo, 3), round(hi, 3)),
                        "medianSeconds": round(median(t["seconds"]), 1) if t["seconds"] else None}
    return result


# ----------------------------------------------------------------------------------- costs
COST_FIELDS = {
    "commission_pct": ("commissionPct", "Commission / market fee as % of the sale price"),
    "handling_per_quintal": ("handlingPerQuintal", "Loading, unloading, packing (Rs per quintal)"),
    "shrinkage_pct": ("shrinkagePct", "Weight or quality lost before the sale (%)"),
    "transport_per_quintal": ("transportPerQuintal", "Transport to the mandi (Rs per quintal)"),
    "price_haircut_pct": ("priceHaircutPct", "How far below the quoted modal price the farmer actually sold (%)"),
}


def calibrate_costs(rows: list) -> dict:
    """Optimistic = 25th percentile (a good day), expected = median, conservative = 75th percentile (a bad day)
    of what farmers actually reported. Costs only: a higher value is worse for the farmer."""
    out = {"n": len(rows), "fields": {}, "warnings": []}
    if len(rows) < 8:
        out["warnings"].append("fewer than 8 farmers answered: treat these as rough ranges, not calibrated values")
    for col, (key, label) in COST_FIELDS.items():
        values = [float(r[col]) for r in rows if str(r.get(col, "")).strip() != ""]
        if not values:
            continue
        out["fields"][key] = {"label": label, "answers": len(values), "optimistic": round(percentile(values, 25), 2),
                              "expected": round(percentile(values, 50), 2), "conservative": round(percentile(values, 75), 2)}
    return out


# -------------------------------------------------------------------------------------- CLI
def _read_csv(path: str) -> list:
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 2 or argv[0] not in ("sus", "tasks", "costs"):
        print(__doc__)
        return 2
    kind, path = argv
    rows = _read_csv(path)
    if kind == "sus":
        s = summarise_sus(rows)
        print(f"Participants: {s['n']}")
        for i, v in enumerate(s["scores"], 1):
            print(f"  participant {i}: {v}")
        if "mean" in s:
            print(f"Mean SUS {s['mean']} (95% CI {s['ci95'][0]} to {s['ci95'][1]}); benchmark {s['benchmark']}: "
                  f"{'at or above' if s['aboveBenchmark'] else 'below'} average. {s['note']}")
    elif kind == "tasks":
        for task, v in summarise_tasks(rows).items():
            print(f"{task}: {v['successRate'] * 100:.0f}% success (n={v['n']}, 95% CI {v['ci95'][0] * 100:.0f}% to {v['ci95'][1] * 100:.0f}%), median {v['medianSeconds']} s")
    else:
        c = calibrate_costs(rows)
        print(f"Farmers: {c['n']}")
        for w in c["warnings"]:
            print("WARNING:", w)
        for key, v in c["fields"].items():
            print(f"  {key}: optimistic {v['optimistic']}, expected {v['expected']}, conservative {v['conservative']}  ({v['label']}, {v['answers']} answers)")
        print("Copy these into PROFIT_SCENARIOS (app/services/market_recommendation.py) and cite the survey in your report.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
