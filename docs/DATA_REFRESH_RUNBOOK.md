# Making the data real: refresh, collect, purge

Weaknesses 1 and 2 cannot be fixed by code. They need time and real users. This runbook is the
shortest honest path.

## A. Real mandi prices (weakness 2)

Your imported AGMARKNET history ends on **2025-06-11**; the government API only shows *today's* prices.
Forecasts withhold themselves when history is older than 45 days, so the forecasting pages stay in
"history too old" mode until you collect new data.

1. **Switch the daily collector on today** (it is built and switched off): follow `docs/DAILY_COLLECTOR.md`
   (three repository secrets plus the `ENABLE_DAILY_MANDI=true` variable). Run it once by hand to test.
2. **Look for a newer bulk file** to close the gap (the Kaggle/data.gov.in route in `docs/REAL_DATA.md`).
   If a file reaching 2025 or 2026 exists:
   ```bash
   cd analytics-service
   python scripts/import_mandi_prices.py scan path/to/prices.csv
   python scripts/import_mandi_prices.py csv path/to/prices.csv --commodity Onion Tomato Potato Wheat --dry-run
   python scripts/import_mandi_prices.py csv path/to/prices.csv --commodity Onion Tomato Potato Wheat
   ```
3. **Wait.** The forecast lab needs a long *unbroken* stretch. As a rule of thumb, about 10 weeks of daily data
   gives a first rolling-origin backtest that means something; fewer than 120 days produces no forecast on purpose.
4. Check progress with the existing diagnostics endpoint / `scripts/diagnose_mandi_api.py`, and write down the
   date you switched it on (it goes in the report).

What you can truthfully claim before the data catches up: "the methodology is validated on 2+ years of real history
(to June 2025); live forecasting resumes automatically once the collector has enough unbroken days."

## B. Real marketplace activity (weakness 1)

Right now about 99% of marketplace rows belong to demo users (`seed.*` e-mails). The platform already measures and
displays this share (`syntheticPercent`), which is honest, but it is still a weakness.

Plan (2 to 4 weeks):
1. Recruit **10 to 20 real people** (farmers or traders from family and college contacts; classmates as buyers).
   This is also your user study: see `user-study/README.md`.
2. Have them create real listings and place real (not paid) bids for a fortnight.
3. Take a backup: `mongodump --uri "$MONGO_URI" --out backup-before-purge`
4. Preview what would be removed, then remove only the demo data:
   ```bash
   cd analytics-service
   python scripts/purge_seed_data.py            # dry run: prints counts, changes nothing
   python scripts/purge_seed_data.py --apply
   ```
   The script deletes only records owned by `seed.*` users. Real users' data is untouched.
5. Expect many marketplace models to answer "not enough data yet". That is the honest outcome and a good thing to
   show: nothing is invented.

If you cannot get real users in time, **keep the synthetic data and keep saying so**: label it in the report, keep the
`syntheticPercent` banner, and present the marketplace models as a demonstration of the pipeline, with the real-mandi
section as the evidence of real-world performance.
