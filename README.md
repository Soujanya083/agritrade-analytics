# 🌾 AgriTrade AI

An agricultural marketplace (farmers list crops, buyers bid, deals are paid and delivered) with a data-science layer that turns the marketplace's own data into price/demand forecasts, "where to sell" advice and a chatbot. Final-year project combining **full-stack development, data analytics, machine learning and generative AI**.

> **Read [docs/LIMITATIONS_AND_VIVA.md](docs/LIMITATIONS_AND_VIVA.md)** for what is real, what is simulated, and what an examiner is likely to ask. This README describes what the code does today, not an aspiration.

---

## Architecture

```
 React app (agribid/)  ──REST + JWT──►  Node/Express API (server/)  ──►  MongoDB
        │                                        ▲  (users, crops, bids, transactions)
        │                                        │ same database, read-only use
        └──REST + same JWT──►  FastAPI analytics service (analytics-service/)
                                    │  pandas · Prophet · statsmodels · scikit-learn · SHAP
                                    ├──► data.gov.in AGMARKNET (live mandi prices, optional)
                                    └──► LLM provider (optional, general farming Q&A only)
```

| Part | Tech | Responsibility |
|---|---|---|
| `agribid/` | React 19 (CRA), Recharts | UI: marketplace, dashboards, analytics, companion-planting guide |
| `server/` | Express 5, Mongoose 9, JWT, bcrypt, Razorpay | Accounts, listings, bidding, deals, payments, notifications |
| `analytics-service/` | FastAPI, pandas, Prophet, ARIMA, scikit-learn, SHAP | Forecasts, backtests, segmentation, anomalies, decision summary, chatbot |

**Identity:** the Node server issues an HS256 JWT at login. The analytics service verifies the *same* token with the *same* `JWT_SECRET` — there is no second login system. The React app attaches the token to both APIs.

## Quick start (local)

```bash
# 1. MongoDB running locally (or set MONGO_URI to Atlas)
# 2. Backend
cd server && cp .env.example .env && npm install && npm start            # :5000
# 3. Analytics (Python 3.11)
cd analytics-service && cp .env.example .env
pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000   # docs at /docs
# 4. Frontend
cd agribid && npm install && npm start                                    # :3000
# Optional: demo data (SYNTHETIC - see limitations) then crop photos
python analytics-service/seed_data.py          # needs MONGO_URI
cd server && npm run backfill-images      # real crop photos (Wikipedia by default; PEXELS_API_KEY optional)
```

Without any `.env`, local development works out of the box (both services share a public dev-only JWT secret). **Deployed instances refuse to start/serve without `JWT_SECRET`.**

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `JWT_SECRET` | server + analytics | **Required when deployed**, must be identical in both |
| `MONGO_URI` | server + analytics | Database |
| `CORS_ORIGINS` | server + analytics | Comma-separated frontend origins (empty = allow all, dev only) |
| `TRUST_PROXY` | server | Proxy hops (default 1 when deployed) so rate limits are per user |
| `EXPOSE_OTP_IN_RESPONSE` | server | `true` (default) = demo mode, OTP returned by the API; set `false` once a real SMS/email sender exists |
| `PEXELS_API_KEY` | server | Optional second photo source. Without it, crop photos come from Wikipedia (turn off with `CROP_PHOTO_WIKIPEDIA=false`); hand-picked photos: [docs/CROP_PHOTOS.md](docs/CROP_PHOTOS.md) |
| `ANALYTICS_RATE_LIMIT_PER_MIN` | analytics | Requests per minute per signed-in user (default 240) |
| `DATAGOVIN_API_KEY`, `DATAGOVIN_RESOURCE_ID` | analytics | Live mandi prices from data.gov.in; without them the app uses a labelled saved snapshot |
| `RAZORPAY_KEY_ID/SECRET` | server | Online payments (otherwise manual UPI) |
| `DATAGOVIN_API_KEY/RESOURCE_ID` | analytics | Live mandi prices (otherwise a small saved snapshot is used and labelled) |
| `ANALYTICS_INTERNAL_API_KEY` | analytics | Optional key for trusted server-to-server callers (`X-Internal-Api-Key`) |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | analytics | Optional general-farming chatbot answers (see below) |
| `REACT_APP_API_BASE_URL`, `REACT_APP_ANALYTICS_BASE_URL` | frontend | API locations |
| `REACT_APP_UPI_ID`, `REACT_APP_UPI_NAME` | frontend | Receiving UPI account (no default; unset = "demo mode" notice) |

## Security model

- **Auth:** JWT (HS256, 7 days, algorithm pinned on verify) on every protected Node route and **every analytics route**; analytics returns 401/403, or 503 if the server is misconfigured (never "open").
- **Authorization:** farmer/buyer identity comes from the token, never the request body; only the listing's farmer can accept a bid; only the transaction's buyer can pay/confirm delivery.
- **Privacy:** marketplace-wide analytics (farmer revenue, buyer spend, anomaly flags) return **pseudonymous labels** (`User-a1b2c3`) with an `isYou` flag instead of user IDs. Analytics loaders exclude password hashes, OTPs and photos at the database.
- **Uploads:** listing photos must be an `https` URL or a PNG/JPEG/WebP data URI ≤ 400 KB whose bytes match the claimed type; the browser shrinks photos first. Body limit 1 MB.
- **Abuse limits:** global + login/signup/OTP rate limits (correct behind a proxy), a per-account cap on signup-OTP guesses (5, then the code is destroyed), delivery-OTP attempt cap, a per-user request limit on the analytics service, per-user cap on LLM-backed chatbot questions.
- **Payments:** when Razorpay keys are configured the manual "I have paid" route is switched off; payments are then verified by signature. Without keys the manual UPI route is a **demo** that trusts the buyer.
- **Concurrency:** accepting a bid atomically claims the crop (no double transactions); placing a bid is an atomic conditional update.
- **Errors:** 500 responses never include internals; they are logged server-side.
- **Known gaps:** see the limitations document (OTP demo mode, manual-UPI trust, token in `localStorage`).

## Analytics API (all under `/api/analytics`, all require a token)

Interactive docs at `/docs`. Errors use real status codes with body `{"detail", "error", "status"}`:

| Code | Meaning |
|---|---|
| 401 / 403 | Missing/expired token / role not allowed |
| 404 | Crop or commodity has no data |
| 422 | Invalid parameter, or not enough data to compute |
| 429 | Chatbot LLM budget exceeded (`Retry-After` set) |
| 503 | Database / auth config / upstream (mandi credentials) unavailable |
| 500 | Unexpected failure (generic message) |

Main endpoints: `crops`, `price-trend`, `price-prediction`, `demand-forecast`, `backtest/{price,demand}`, `decision-summary`, `decision/sell-or-wait`, `decision/backtest`, `market-recommendation`, `mandi-prices`, `mandi-compare`, `buyer-segments`, `bid-anomalies`, `crop-recommendation-score`, `recommend-crops`, `best-selling-crops`, `region-demand`, `farmer-revenue`, `buyer-patterns`, `real-market/{commodities,overview,forecast}`, `data-provenance`, `data-quality`, `eda-report`, `prediction-explanation`, `price-model/evaluation`, `chatbot` (POST), `chatbot/status`. Public: `/api/health`, `/api/ready` (DB ping).

## Data science

**Real market data (the strongest part):** import AGMARKNET mandi history (`docs/REAL_DATA.md`) and the *Real market data* section runs a **forecast lab** - naive/seasonal/drift/moving-average/Ridge/gradient-boosting (+ ARIMA/Prophet when installed) compared by **rolling-origin backtest**, scored with MAE/RMSE/sMAPE/**MASE**, tested against naive with a **Diebold-Mariano test (Holm-corrected)**, with **conformal prediction intervals** whose coverage is checked on held-out origins. A model is only crowned if it significantly beats "price stays the same"; otherwise the page says so. It also reports seasonality (flagged unreliable under 2 years), volatility, year-on-year change and price spread across markets. The marketplace's own listings remain, but the page now states what percentage of them is synthetic and caps forecast confidence accordingly (`/api/analytics/data-provenance`).

Full methods, validation results and limits: [docs/DS_METHODOLOGY.md](docs/DS_METHODOLOGY.md). A reproducible per-commodity report (Markdown + figures): `python scripts/generate_market_report.py --commodity Onion`.

**Marketplace-listing models:**

- **Price forecast:** Prophet (linear-trend fallback when < 10 days of history) on the daily mean of listing `currentBid`. **Demand forecast** is *completed sales per day*.
- **Backtesting:** rolling-origin evaluation against a naive baseline, linear regression, ARIMA, Prophet and an ensemble; the UI states whether the best model actually beat the naive baseline.
- **Feature model:** RandomForest on lagged/rolling features with a chronological split, SHAP explanations, and **explicit baselines** ("predict the asking price", "predict the previous listing") that it must beat.
- **Segmentation:** RFM + K-Means. **Anomalies:** Z-score, IQR and Isolation Forest on *bid ÷ listing base price* (so expensive crops aren't flagged merely for being expensive).
- **Decision summary** (top of the Analytics page): predicted price, demand level, best mandi, expected revenue/cost/net profit, platform payout after the real 5 % fee, sell-or-wait timing, a confidence level **with its reasons**, and limitations. Missing parts are omitted and reported as warnings — never invented.
- **Performance:** in-process TTL cache (thread-safe, bounded, single-flight, invalidated when crop/bid/transaction counts change); one 90-day forecast per crop is fit once and sliced for shorter horizons; DataFrames are cached per data version. Redis was deliberately *not* added: one process on one instance doesn't need it. Limitation: with several workers each has its own cache.

## Chatbot (hybrid, honest about its source)

1. Entities (crop, location, state) are matched against the **crops actually in the database** (whole-word, typo-tolerant, Hindi aliases such as *tamatar*).
2. Questions about marketplace data (price, demand, sell-or-wait, where to sell, best crops) are answered by the **same analytics functions as the dashboard** — no LLM, so no hallucinated numbers. Replies are tagged `project_data`.
3. If a data question names no known crop, the bot asks which one (and lists the crops it has data for).
4. General farming questions go to an **optional LLM** (`llm_general`, with a disclaimer) under a system prompt that forbids stating prices/forecasts. Without an API key the bot says plainly that general Q&A is unavailable (`fallback`). Providers: Anthropic, or any OpenAI-compatible API (OpenAI, Groq, Gemini's OpenAI endpoint, local Ollama).

## Companion planting

`agribid/src/data/` holds a 116-crop catalog (29 fruits, 30 grains and field crops, 31 vegetables, 26 leafy crops) with botanical families and a crop-specific icon for each (drawn SVG illustrations, or an emoji where an exact one exists). Pairings are made **only** where research supports them: each of the 15 verified pairings shows its status (supported, potentially suitable, unsuitable), benefits, risks, conditions and links to its sources. Where nothing reliable was found the tab says "insufficient evidence" and shows sourced general principles instead of guessing. The full validation log (what was kept, corrected and removed) is in [docs/COMPANION_EVIDENCE.md](docs/COMPANION_EVIDENCE.md); check the links with `node agribid/scripts/checkSourceLinks.mjs`.

## Tests

| Suite | Command | Needs |
|---|---|---|
| Analytics (pytest) | `cd analytics-service && pip install -r requirements-dev.txt && pytest` | nothing external (hermetic) |
| Backend (Jest) | `cd server && npm test` | downloads an in-memory MongoDB |
| Frontend (Jest/RTL) | `cd agribid && npm test` | – |

CI (`.github/workflows/ci.yml`) runs all three plus a production build on every push/PR. A weekly job checks the companion-planting source links, and an optional daily job saves live mandi prices (see [docs/DAILY_COLLECTOR.md](docs/DAILY_COLLECTOR.md)). **What was actually run in the final audit, what could not be run, and every open weakness are in [VALIDATION_REPORT.md](VALIDATION_REPORT.md); setup steps are in [SETUP.md](SETUP.md).** If the in-memory MongoDB cannot start on your PC, run the backend tests against a local MongoDB with `TEST_MONGO_URI=mongodb://localhost:27017/agribid_test` (the name must end in `_test`).

## Honest summary of what is real

Real: auth, bidding, deals, the forecasting/backtesting/segmentation/anomaly code, SHAP, the hybrid chatbot, the mandi comparison (live with an API key). **Not real / needs setup:** OTP delivery (demo), payments verified only via Razorpay when configured (UPI is trust-based), the seeded marketplace data (synthetic), LLM answers (need a key), and the saved mandi snapshot (onion only). Details: [docs/LIMITATIONS_AND_VIVA.md](docs/LIMITATIONS_AND_VIVA.md).
