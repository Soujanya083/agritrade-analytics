"""
End-to-end data pipeline check on a SYNTHETIC, deliberately dirty Kaggle-style file. NOT real data.

Run from analytics-service with the venv active:   python ../validation/e2e_synthetic_pipeline.py
It builds a raw file with known planted problems (mixed date formats, 10x unit errors, missing prices, duplicates,
a 29-day gap in one crop, and a farmers' direct-sale market at 3x the price), then pushes it through
prepare -> clean -> series -> report and prints what each stage found next to what was planted.
It needs no database and no network.
"""
import sys, os, json
sys.path.insert(0, os.getcwd())   # run from analytics-service with the venv active
import numpy as np, pandas as pd

rng = np.random.default_rng(42)
days = pd.date_range("2023-06-06", "2025-06-11")
markets = [("Maharashtra", "nashik", "Lasalgaon(Niphad)"), ("Karnataka", "bangalore", "Bangalore APMC"),
           ("Tamil Nadu", "vellore", "Katpadi(Uzhavar Sandhai )"), ("Punjab", "ludhiana", "Ludhiana"), ("Gujarat", "rajkot", "Rajkot")]
# planted truth: Onion = random walk with yearly seasonality; Wheat = flat with noise
t = np.arange(len(days))
onion_level = 2000 * np.exp(np.cumsum(rng.normal(0, 0.012, len(days))) + 0.15 * np.sin(2 * np.pi * t / 365))
rows, planted = [], {"unit_errors": 0, "duplicates": 0, "missing_price": 0, "retail_markets": 0}
long_gap = (days >= "2024-06-07") & (days <= "2024-07-05")          # 29-day hole in Onion only
for i, d in enumerate(days):
    for st, dist, mk in markets:
        for crop, base in (("Onion", onion_level[i]), ("Wheat", 2300 + rng.normal(0, 20))):
            if crop == "Onion" and long_gap[i]:
                continue
            price = base * (1 + rng.normal(0, 0.03)) * (3.0 if "Uzhavar" in mk else 1.0)
            modal = round(price)
            row = [st, dist, mk, crop, "Local", "FAQ", modal - 100, modal + 100, modal,
                   f"{d.month:02d}-{d.day:02d}-{d.year}" if d.day <= 12 else f"{d.month}/{d.day}/{d.year}"]
            if rng.random() < 0.0004: row[8] = row[8] * 10; planted["unit_errors"] += 1
            if rng.random() < 0.0004: row[8] = None; planted["missing_price"] += 1
            rows.append(row)
            if rng.random() < 0.0004: rows.append(list(row)); planted["duplicates"] += 1
raw = pd.DataFrame(rows, columns=["STATE", "District Name", "Market Name", "Commodity", "Variety", "Grade", "Min_Price", "Max_Price", "Modal_Price", "Price Date"])
print(f"raw rows: {len(raw):,}; planted problems: {planted}; planted 29-day Onion gap")

from app.services.market import kaggle_prepare, mandi_import, mandi_data
from app.services.market.report import build_report
clean, rep = kaggle_prepare.prepare(raw.astype({c: str for c in raw.columns}).replace("None", ""))
print(f"1. prepare: rows {rep['rows']:,}, {rep['firstDate']} .. {rep['lastDate']}, out-of-order rows: {rep['rowsWhereFileOrderGoesBackInTime']}")
onion_gaps = next(c for c in rep["topCommodities"] if c["commodity"] == "Onion")
print(f"   Onion gaps >3d detected: {onion_gaps['gapsLongerThan3Days']} (planted 1), missing days {onion_gaps['missingDaysInGaps']} (planted 29)")
norm, dropped = mandi_import.normalize_records(clean)
print(f"2. normalise: kept {len(norm):,}; dropped {dropped}")
df = norm[norm["commodity"].str.lower() == "onion"].copy()
series, quality = mandi_data.build_series(df, "Onion", None, None)
series_l, quality_l = mandi_data.build_series(df, "Onion", None, None, segment="longest")
print(f"3. series: default (latest stretch) {len(series)} days; longest stretch {len(series_l)} days; cutAtLongGap={quality['cutAtLongGap']}")
md, figs = build_report(series_l, df, "Onion", None, quality_l, 14)
champ = [l for l in md.splitlines() if l.startswith("**Champion")]
print(f"4. report generated: {len(md.splitlines())} lines, {len(figs)} figures; {champ[0][:150] if champ else 'no champion line'}")
spread = [l for l in md.splitlines() if "Market spread" in l]
print("5.", spread[0][:200] if spread else "no spread line")
