# Validation report: AgriBid & AgriTrade Analytics

**Read this first.** This report says what was actually executed, what was not, and what is still weak. Nothing below is claimed to work unless it appears in the "Executed" tables with its result. Where a result was reported to me by the project owner and I could not reproduce it, it is marked **owner-reported**.

## 1. Verdict (honest)

A well-engineered, unusually honest demonstration of an agricultural marketplace with decision support. The engineering and the evaluation method are strong for a final-year project. The **substance is limited by data and by money flow**:

- About 99% of marketplace records are synthetic demo data, so every marketplace-level forecast, demand figure, segment and anomaly flag demonstrates a *method*, not a real market.
- The real price data (government AGMARKNET, via a Kaggle file) covers 4 crops and **ends on 2025-06-11**; on none of it did any forecasting model significantly beat "tomorrow's price = today's price". That is a legitimate finding, but it means the product is **decision support, not prediction**.
- Payments are not real (a manual "I have paid" route trusts the buyer unless a payment gateway is configured), sign-up OTP is returned in the API response in demo mode, and there has been **no user study**.

Overall: roughly 7.5/10 as a final-year project *if presented as what it is*; it would be misleading to present it as a production marketplace or a price-prediction system.

## 2. What could and could not be run for this audit

The audit sandbox has **no network, no MongoDB, no pytest/Jest, no FastAPI, pymongo, statsmodels or Prophet**, and cannot build the React app. Python tests were therefore run with a compatible mini-runner (supports fixtures, monkeypatch, tmp_path, parametrize, raises, approx), and JavaScript unit tests with a small Jest-compatible shim. These are *not* the real tools, so a pass here is strong but not identical evidence to a real `pytest`/`jest` run. The logs are in `validation/`.

### 2.1 Executed here, with results

| Check | Result | Evidence |
|---|---|---|
| Python test suite, 45 modules (analytics-service) | **480 passed, 0 failed** | `validation/python_test_log.txt` |
| Server unit tests (validators, security, image validation, crop photos) | **80 passed, 0 failed** | `validation/javascript_test_log.txt` |
| Frontend data/API unit tests (companion rules and evidence, states, districts, analytics client) | **88 passed, 0 failed** | same log |
| Syntax: every server JS file (`node --check`) | 17 of 17 OK | `validation/syntax_check_log.txt` |
| Syntax: every Python file compiles | 113 of 113 OK | same log |
| JSX brace/bracket balance (heuristic, NOT a compile) | 42 of 43 balanced; the 1 flag (`App.test.js`) is identical in the original upload (a brace inside a test string) | `validation/jsx_balance_check.txt` |
| **End-to-end data pipeline on a deliberately dirty SYNTHETIC file** | Caught every planted problem: 3 missing prices, 2 duplicates, 6 tenfold unit errors, the one 29-day gap (exact days), the fake 3x-priced retail market was excluded from the market spread; a report with 4 figures was produced; planted random walk correctly got "naive" as champion | `validation/e2e_synthetic_pipeline_output.txt` |
| Net-profit and market-ranking arithmetic vs an independent hand calculation | All 3 markets and the 500 kg total matched exactly (e.g. 2500 - 250 - 30 = 2220 per quintal; 5 quintals = 11,100) | `validation/net_profit_hand_check_output.txt` |

Python modules covered include: forecasting lab (rolling-origin backtests, Diebold-Mariano with Holm correction, conformal intervals), mandi import cleaning and date handling, market recommendation, decision summary, decision backtesting, provenance, segmentation, anomaly detection, privacy pseudonymisation, chatbot routing and rate limits, JWT authentication, caching, request rate limiting.

### 2.2 NOT executed here (must be run on your machine; commands are in SETUP.md)

| Not run | Why | Consequence |
|---|---|---|
| `analytics-service/tests/test_api.py` (HTTP routes via FastAPI TestClient) | FastAPI not installed | Route wiring, response models and the new rate-limit dependency are **untested here** |
| Backend Jest suites that need MongoDB: `api`, `hardening`, `bid-race-condition`, `testMongo` | No MongoDB | The **new** tests for OTP guess cap, payment-bypass guard, listing deletion and crop-name tidying are **written but never run**. Treat those server changes as unverified until `npm test` passes |
| React component tests (CompanionPlanting, CropIcon, ChatbotWidget, DecisionSummaryCard, TodayPrices, App) and `npm run build` | No React toolchain | UI changes (delete button, state/district/crop selectors, variety chips, evidence badges, scroll fix) are **unverified** |
| ARIMA and Prophet model paths | statsmodels/Prophet not installed | Tests passed here, but I cannot confirm those two models were exercised rather than skipped |
| Dependency vulnerability scans (`npm audit`, `pip-audit`) | No network | Unknown |
| Load/performance, browser/responsive, accessibility, penetration testing | Out of reach | Unknown |
| Live data.gov.in API, Atlas, Render, Vercel, GitHub CI | No access | Only what you reported (below) |

### 2.3 Owner-reported (not reproduced by me)
Real import of 727,955 AGMARKNET rows (2023-06-06 to 2025-06-11); live mandi API answering after the client-identity fix; successful merges; local `pytest` runs of 503 to 534 passes at earlier stages; screenshots of working pages. The date-format check on the real file (0 out-of-order rows month-first vs 44 day-first) was run by you. I did not see the real raw file.

## 3. Findings and fixes

### 3.1 Fixed (with the test status)

| # | Finding | Severity | Fix | Test status |
|---|---|---|---|---|
| 1 | A forecast learned from price history months old was shown as "predicted price (+7 days)" beside live prices | High (misleading output) | Withheld when history is older than 45 days; today's live median shown with its date | Run, passed |
| 2 | Decision backtest "actual outcome" computed from deal total / quantity; seeded deals made it 0.04 | High (wrong calculation) | Uses the accepted bid's per-kg amount; implausible deals excluded and counted | Run, passed |
| 3 | Best-market and today's-price views mixed farmers' direct-sale markets (e.g. Uzhavar Sandhai, near-retail) and different products ("Onion Green") into wholesale figures | High (wrong recommendation) | Flagged and excluded by a **name heuristic**; variety grouping with a clear-majority default | Run, passed |
| 4 | State names compared as raw strings ("Tamilnadu" vs "Tamil Nadu") so same-state transport cost could be wrong | Medium | Canonical state/UT list (36) with aliases; Karnataka 31 districts | Run, passed |
| 5 | Live API calls silently fell back to a snapshot on any failure; the server stalls the default Python client identity | Medium | Clear identity header, retry, explicit failure reason | Run, passed; also confirmed by your live run |
| 6 | Analytics service had no rate limit although it runs CPU-heavy forecasts | Medium (DoS) | Per-user sliding-window limiter | Limiter run, passed (6); **route wiring not run** |
| 7 | Sign-up OTP could be guessed without a per-account cap (IP limit only) | Medium | 5 wrong tries then the code is destroyed; constant-time compare | **Written, not run** |
| 8 | Manual "I have paid" route stayed active when a real payment gateway was configured | High in production | Switched off when Razorpay keys exist | **Written, not run** |
| 9 | Photo overrides accepted web pages and placeholder credits (broke images, risked false attribution/copyright) | Medium | Only direct picture files with a real credit | Run, passed |
| 10 | "rice" and "Rice" counted as two crops | Low | Canonical crop name on creation, migration script | Function run, passed; **route not run** |
| 11 | No way for a farmer to remove a mistaken listing | Low | Owner-only, open-listing-only atomic delete | **Written, not run** |
| 12 | Repository hygiene: a chat log in the repo root, missing ignore rules, no frontend env template, outdated env comments | Low | Removed/added | n/a |
| 13 | Companion planting: status was hand-assigned; numbers not traceable; two statuses overstated | Medium (scientific validity) | Status derived by rules, claim ledger, unverified figures withheld, links checked weekly | Run, passed (74) |

### 3.2 Open: real weaknesses that remain (not fixed, and why)

**Essential before any real use**
1. **Delivery OTP design flaw.** The buyer receives the delivery OTP and the buyer enters it to complete delivery. A code the buyer holds cannot prove the buyer received goods, and it does not protect the farmer. The usual pattern is the opposite (the farmer enters the code the buyer reads out on receipt). Changing it alters the business flow and UI, so it needs your decision. *This is the weakness closest to "shipment safety".*
2. **No real money movement.** There is no escrow; "payout" is a record. Without a gateway the buyer's own word marks an order paid.
3. **Demo identity.** The sign-up OTP is returned in the API response by default; there is no email/SMS sender, so accounts are not verified.
4. **Session handling.** The JWT is kept in `localStorage` (readable by any XSS), valid 7 days, with no refresh or revocation.
5. **Unrun server changes** (rows 7, 8, 10, 11 above) until you run `npm test`.

**Data analytics and data science**
6. **Real data is thin and old.** 4 crops, ends 2025-06-11, one Kaggle source whose licence and provenance you must still cite and check; Wheat (246 days) and Tomato (154 days) are short; Onion has a 29-day and a 61-day gap, so the default analysis uses only a 126-day tail unless `--segment longest` is used.
7. **No model beats the naive forecast** on real data (Potato, 34 test origins: best challenger 7.2% better on MASE, corrected p = 0.54). The marketplace Prophet/linear models are fitted to synthetic data and demonstrate method only. An evaluation set and cross-checks exist, but the predictive value is small.
8. **Net profit is a simplified model**: flat transport (80/250 per quintal) and storage (30) assumptions, one day's modal price, no mandi fees, spoilage, lot-size price effects or real distances. The arithmetic is correct (verified), but the result is an **optimistic upper bound**, and the assumptions are disclosed, not measured.
9. **Best market is ranked from one day's quotes** from a few markets, so it is noisy.
10. The retail-market filter is a **name heuristic** and the government commodity-name map was written from memory; both can miss cases.
11. The 45-day staleness threshold and the price-band limits (0.4x to 2.0x median) are judgement calls, not fitted values.

**Generative AI**
12. The chatbot is hybrid: project questions are answered by deterministic code from project data (tested); general farming questions go to an optional external LLM and are labelled as such. **There is no evaluation set, no retrieval grounding or citation for the general answers, and no adversarial (prompt-injection) testing.** Treat general answers as unverified advice.

**Software quality**
13. **No end-to-end browser tests** and thin React component coverage (5 component test files). `server.js` (1,022 lines) and `DashboardPage.js` (1,596 lines) are too large and should be split; I did not rewrite working code.
14. **No usability study.** `USABILITY_FEEDBACK.md` is a protocol; no feedback has been collected.
15. Companion planting: 23 researched pairings out of ~116 crops; verification is at abstract level; journal standing is not assessed; much of the evidence is not from India (each card says so).
16. **Scalability:** `GET /api/crops` is public and returns **every** listing in one response, including uploaded photos stored inline as data URIs; there is no pagination on listings, bids or transactions. Fine for a demo with hundreds of listings, a real bottleneck beyond that (large responses, slow page loads). It also exposes each listing's owner id. Fixing it changes the API contract and the dashboard, so it is reported rather than changed.
17. Minor: no internationalisation; mobile layout checked only through your screenshots; session tokens last 7 days (`expiresIn: '7d'`).

## 4. Essential vs optional vs new

- **Essential corrections** (before anyone relies on it): items 1 to 5 above, plus running every test marked "not run".
- **Strongly recommended for a final-year evaluation:** a small real user test (5 to 10 people) to replace the empty usability protocol; cite the dataset licence; start the daily collector so real history grows; split the two oversized files only if time allows.
- **Optional:** more companion pairings; Kannada/Hindi labels; price alerts; shared rate-limit store.
- **New features (not added here, deliberately):** escrow/real payments, SMS/email identity, a chatbot evaluation set.

## 5. How to reproduce and finish verification
See `SETUP.md`. In order: `pytest` (analytics), `npm test` (server; use `TEST_MONGO_URI` if the in-memory database will not start), `npm test -- --watchAll=false` and `npm run build` (frontend), then the two scripts in `validation/`. Please send me any failure and I will fix it.

## 6. Package contents
The full corrected project (three services, tests, CI workflows, documentation), configuration templates (`*/.env.example`), `SETUP.md`, this report, and `validation/` (logs, the two verification scripts, and `CHANGED_FILES_since_original_upload.txt`, the 99 files that differ from the original upload). Excluded: `node_modules`, caches, secrets, raw datasets, generated reports. Built from the original repository snapshot plus the changes made in this engagement; if your own repository has edits made outside this work, compare against the changed-files list before replacing anything.
