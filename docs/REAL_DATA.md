# Real market data (AGMARKNET) - how to import it

The marketplace's own listings are demo data, so on their own they can only show that the method works. **AGMARKNET** (Government of India) publishes real wholesale ("mandi") prices. This guide gets real history into the project so the forecasts, backtests and seasonality are about real markets.

## Why a bulk file is needed
The official `data.gov.in` API returns **only the current day's** prices. History has to come from a bulk dataset, and then a daily collector keeps it growing. (Check the dataset's licence and citation requirements before you publish anything built on it.)

## Where to get real history (and what I could and could not verify)
I could not download any of these from my environment (no internet access for file downloads), and I have **not inspected their contents, column names or licences**. They are named in public project READMEs; check each one yourself before relying on it.

| Source | What it is | Notes |
|---|---|---|
| **data.gov.in API** (official) | "Current Daily Price of Various Commodities from Various Markets (Mandi)", resource `9ef84268-d588-465a-a308-a864a43d0070`, free API key | Current day only: use it for the daily collector, not history |
| **CEDA Agmarknet portal** (Ashoka University): `agmarknet.ceda.ashoka.edu.in` | Described as a cleaned academic version of Agmarknet history | Best bet for a citable history; read its terms of use |
| **Kaggle**: "Indian Agricultural Mandi Prices 2023-2025" (user `arjunyadav99`) | Bulk historical CSV | Needs a free Kaggle login; check the licence on the dataset page |
| GitHub: `Harish115-dev/mitti_se_mandi` | Maharashtra master CSV (`data/raw/maharashtra_prices.csv`), README says updated through Sept 2026 | Single state; no licence checked |
| GitHub: `herrrickshaw/agri-commodity-tracker` | Daily CSV snapshots that accumulate over time | Needs time to build history |

**Fastest path to a result you can show:** download one bulk history file (CEDA or Kaggle), import it (Step 2), run `summary`, then generate a report for one or two well-covered commodities (Onion, Tomato, Potato, Wheat usually have the most data). **Cite the source** in your project report. Do not redistribute the raw files unless the licence allows it.

If the importer says `missing required column(s): ...`, open the CSV, check its header names, and tell me - the importer already accepts the common spellings (`Arrival_Date`/`date`, `Modal_Price`/`modal_price`/`Modal_x0020_Price`, etc.).

## Step 1 - get a bulk history file
Download a public AGMARKNET history CSV (for example the "Agmarknet / Daily Wholesale Commodity Prices (India)" datasets on **Kaggle**, or an export from the **CEDA / Agmarknet** portal). Any CSV with columns like these works (case/spelling differences are handled):

`State, District, Market, Commodity, Variety, Grade, Arrival_Date, Min_Price, Max_Price, Modal_Price`

Prices must be Rs per quintal (the AGMARKNET standard). Dates may be `dd/mm/yyyy` or ISO.

## Step 2 - import it
```bash
cd analytics-service
cp .env.example .env            # MONGO_URI must point at the same database
python scripts/import_mandi_prices.py csv path/to/prices.csv
python scripts/import_mandi_prices.py csv "data/*.csv"        # several files
```
It cleans as it streams (bad dates, non-positive prices, impossible min/max, duplicates) and prints exactly how many rows it dropped and why. Re-running is safe: duplicates are skipped.

### After importing: see what you have
```bash
python scripts/import_mandi_prices.py summary
```
Lists each commodity with its days of history and what it supports, then prints the exact `generate_market_report.py` commands to run.

## Step 3 - keep it growing (daily)
```bash
DATAGOVIN_API_KEY=<free key from data.gov.in> python scripts/import_mandi_prices.py api
python scripts/import_mandi_prices.py api --state Maharashtra --commodity Onion
```
Run this once a day (cron, Render cron job, or a scheduled GitHub Action).

## Step 4 - use it
Open **Analytics** -> the *Real market data (AGMARKNET)* section appears for any crop whose name matches an imported commodity. The decision summary at the top then forecasts from real mandi history (state-level if enough data, otherwise All-India) and shows a 90% range.

API: `GET /api/analytics/real-market/{commodities,overview,forecast}` and `GET /api/analytics/data-provenance`.

## How much history is enough?
| History | What you get |
|---|---|
| < 120 days | Nothing: the API says how many days are needed |
| 120 days - 1 year | Forecast + backtest. No seasonality |
| 1 - 2 years | Seasonality shown but flagged **unreliable** |
| 2+ years | Seasonality (month-of-year price index) flagged reliable |

## What the analysis does (and does not) claim
- Models: naive, seasonal naive, drift, moving average, Ridge and gradient boosting on lagged returns, plus ARIMA and Prophet when installed.
- **Rolling-origin backtest**: every model is refit at each past date using only earlier data, then scored against what happened.
- **A model only "wins" if it beats the naive forecast significantly** (Diebold-Mariano test, Holm-corrected because several models are tested). Otherwise the forecast is "price stays near today's" and the page says so. For daily commodity prices this is a high bar and often not cleared - that is a finding, not a failure.
- **Intervals** are conformal (based on this series' real out-of-sample errors); their coverage is checked on held-out origins and shown.
- Not modelled: weather, policy, export bans, arrivals/stock data.
- Measured on synthetic series (see `tests/test_forecast_lab.py`): about **0 of 40** random walks got a false "winner" after correction (4 of 40 before), and a genuine trend was always detected. Subtle structure is detected less often - the test is deliberately conservative.

## Extra checks the real-market section now runs
- **Predictability diagnostics** (autocorrelation, Ljung-Box, variance-ratio tests): says whether the price behaves like a random walk. If it does, "no model beats naive" is the correct finding.
- **Economic value backtest**: would waiting for the forecast have beaten selling immediately, with a bootstrap confidence interval? Storage, spoilage and interest are *not* deducted.
- **Data quality**: the forecast warns when the imported history is more than 14 days old and flags (never removes) extreme one-day price jumps.

## Cleaning the importer applies to real files
- Date formats `dd/mm/yyyy`, `dd-Mon-yyyy` and ISO are all read (day-first, so 03/04 is 3 April).
- Rows dropped and counted: unparseable/future dates, missing or non-positive prices, impossible min/modal/max, duplicates.
- **Wrong-unit prices:** on a day with 5+ quotes for the same commodity, a price that is almost exactly 10x or 100x off the median is treated as a unit-entry mistake and dropped (and counted). An ordinary outlier is kept and flagged by the analysis instead.
