# Setup guide

Three services: **agribid** (React frontend), **server** (Node/Express + MongoDB: accounts, listings, bids, deals) and **analytics-service** (Python/FastAPI: data, forecasts, recommendations, chatbot). All three must share the same `JWT_SECRET` when deployed.

## 1. Prerequisites
Node 20+, Python 3.11+, a MongoDB (local Community Server, or a free MongoDB Atlas cluster).

## 2. Configuration (copy each template, never commit the real file)
| Copy | To | Fill in |
|---|---|---|
| `server/.env.example` | `server/.env` | `MONGO_URI`, `JWT_SECRET` (long random; same value for the analytics service), optional photo/payment keys |
| `analytics-service/.env.example` | `analytics-service/.env` | `MONGO_URI` (same database), `JWT_SECRET`, optional `DATAGOVIN_API_KEY` + `DATAGOVIN_RESOURCE_ID`, optional `LLM_*` |
| `agribid/.env.example` | `agribid/.env.local` | the two API addresses (public values only) |

Without any `.env`, local development works with a public dev-only secret. **A deployed instance refuses to start without `JWT_SECRET`.** Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## 3. Run locally
```
# terminal 1 - backend
cd server && npm ci && npm start                      # http://localhost:5000
# terminal 2 - analytics
cd analytics-service && python -m venv venv && venv\Scripts\activate     # Windows (use source venv/bin/activate elsewhere)
pip install -r requirements.txt && uvicorn app.main:app --port 8000
# terminal 3 - frontend
cd agribid && npm ci && npm start                     # http://localhost:3000
```
Optional demo data (SYNTHETIC; it is labelled as such in the app): `python analytics-service/seed_data.py`. Real crop photos for existing listings: `cd server && npm run backfill-images`.

## 4. Real market data (AGMARKNET)
1. Get a bulk history CSV (see `docs/REAL_DATA.md`; check its licence and cite it).
2. Prepare it reproducibly: `python scripts/prepare_kaggle_mandi.py raw.csv clean.csv` (from `analytics-service`, venv active).
3. Look, then import: `python scripts/import_mandi_prices.py scan clean.csv`, then `csv clean.csv --commodity Onion Potato --dry-run`, then the same without `--dry-run`, then `summary`.
4. Live prices: put `DATAGOVIN_API_KEY` and `DATAGOVIN_RESOURCE_ID` in `analytics-service/.env`; check with `python scripts/diagnose_mandi_api.py`.
5. Keep history growing: `docs/DAILY_COLLECTOR.md`.
6. A per-crop report: `python scripts/generate_market_report.py --commodity Onion` (add `--segment longest` when the history has gaps).

## 5. Run the tests
| Suite | Command | Notes |
|---|---|---|
| Analytics | `cd analytics-service && pip install -r requirements-dev.txt && pytest` | hermetic: no database or network needed |
| Backend | `cd server && npm test` | starts an in-memory MongoDB. If that fails on your PC: `$env:TEST_MONGO_URI="mongodb://localhost:27017/agribid_test"` first (the name MUST end in `_test`; the tests empty it) |
| Frontend | `cd agribid && npm test -- --watchAll=false` | |
| Frontend build | `cd agribid && set CI=true && npm run build` | warnings count as errors, like CI |
| Synthetic data pipeline | `cd analytics-service && python ../validation/e2e_synthetic_pipeline.py` | no database; planted problems vs what the pipeline found |
| Net-profit hand check | `cd analytics-service && python ../validation/net_profit_hand_check.py` | |

## 6. Deploy (as the project was deployed)
Atlas (database, network access allowing your servers) + Render (server and analytics-service; set `JWT_SECRET` identically on both, `CORS_ORIGINS` to the frontend address, `TRUST_PROXY=1`) + Vercel (frontend; `agribid/.env.production` holds the public API addresses). Set `EXPOSE_OTP_IN_RESPONSE=false` once a real SMS/email sender exists.

## 7. Common problems
- Live prices show a "saved snapshot": the data.gov.in key is missing or the API is not answering; run `scripts/diagnose_mandi_api.py`. (The server stalls the default Python client identity; the app already sends its own.)
- `.env` saved as `.env.txt` by Notepad: check with `dir -Force .env*`.
- `MONGO_URI` set in the terminal overrides `.env`: clear it with `Remove-Item Env:MONGO_URI`.
- Forecasts unavailable: the real price history is older than 45 days; collect new data (section 4.5).
