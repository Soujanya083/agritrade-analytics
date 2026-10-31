# Improvement guide: fixing the ten weaknesses

This package fixes what code can fix, and gives you tools, scripts and a plan for what only you can do
(real users, real time). Nothing here pretends a weakness is gone when it is not.

## 1. Where each weakness stands

| # | Weakness | Status | Your action |
|---|---|---|---|
| 1 | ~99% synthetic marketplace data | Tool ready, **needs real users** | Step 6 |
| 2 | Real prices end June 2025; no model beat naive | Collector exists, **needs time** | Step 5 (do first, it is slow) |
| 3 | No real money; demo OTP in the API | **Fixed with setup**: e-mail OTP, Razorpay test mode | Step 4 |
| 4 | Net profit = optimistic upper bound | **Fixed**: conservative / expected / optimistic band + robustness check. The percentages are still assumptions | Step 7 replaces them with farmer data |
| 5 | Token in localStorage for 7 days | **Fixed**: 30-min in-memory token + rotating httpOnly cookie | Step 4 (set CORS_ORIGINS) |
| 6 | No user study | Kit ready, **needs 8 to 12 people** | Step 7 |
| 7 | No end-to-end browser tests | **Fixed**: Playwright suite + CI job | Step 3 (first run) |
| 8 | `server.js` / `DashboardPage.js` too large | **Fixed**: 1022 to 52 lines, 1596 to 289 lines | none |
| 9 | Unpaginated listings with inline photos | **Fixed**: pages of 24, filters, cacheable image URLs | none |
| 10 | Chatbot general answers unevaluated | **Evaluated** (190 labelled questions, held-out split). Honest result below | Step 8 (human ratings) |

Honest result for #10: on questions the router was never tuned on, **about 69% go to the right place (95% CI 56 to 80%)**, and
11 of 29 data questions still reach the LLM. That is the true quality of a keyword router. Two safety nets limit the damage
(the LLM prompt forbids prices; any price figure in an LLM answer is withheld). See
`analytics-service/evaluation/results/chatbot_routing_report.md`.

## 2. What was and was not verified (read this)

The sandbox that produced this zip had no internet, no MongoDB and no `npm install`, so some things were checked in
stand-in ways. Run the real checks yourself (Step 2).

| Checked here | How |
|---|---|
| Server routes unchanged by the split | A stub harness loaded `server.js` before and after: same 22 routes, plus the 3 new ones. Handler bodies diffed: identical. |
| No undefined variables / syntax errors in any JS or JSX file | TypeScript compiler in checker mode over 70 files (server, React, e2e). No unused imports (CRA treats lint warnings as errors in `npm run build`). |
| Pure logic tests | 63 server unit tests and 33 React unit tests passed in a Jest-compatible runner; 417 Python tests passed (up from 372, no existing test got worse) in a pytest-compatible runner. A deliberately broken defence made a test fail, so the tests do bite. |

| NOT run here | What to do |
|---|---|
| Server Jest tests that use MongoDB (the old ones and the new `session`, `listings-api` ones) | `cd server && npm test` |
| React Testing Library tests, `npm run build` | `cd agribid && npm test -- --watchAll=false && npm run build` |
| Python tests needing FastAPI (`test_api.py`, `test_auth.py`, ...) | `cd analytics-service && python -m pytest -q` |
| Playwright e2e suite | Step 3 |
| Real e-mail (Brevo/Resend), Razorpay test mode, live LLM | Steps 4 and 8 |

If something fails, it is most likely a selector, an environment variable, or a small slip in code that could not be executed
here. Paste the error and it can be fixed quickly.

## 3. Step by step

### Step 1: put the files in your project (5 min)
Unzip over your `C:\dev\agri-clean` folder (it only adds and replaces files). Then:
```powershell
git status          # you will see many changed files: that is expected
```
New server dependency: none. New npm/pip dependency: none for the app (only `e2e/` has its own package).

### Step 2: run the test suites (15 min)
```powershell
cd server;            npm install; npm test
cd ..\agribid;        npm install; npm test -- --watchAll=false; npm run build
cd ..\analytics-service; pip install -r requirements-dev.txt; python -m pytest -q
python -m evaluation.chatbot_eval        # regenerates the routing report
```
`npm run build` is strict: any ESLint warning fails it, which is what CI does too.

### Step 3: first browser test run (20 min)
```powershell
# MongoDB running locally, then two terminals:
cd server;  npm start        # leave EMAIL_PROVIDER unset (the tests read the OTP from the response)
cd agribid; npm start
cd e2e; npm install; npx playwright install chromium; npm test
```
If a test fails, `npx playwright show-report` shows a screenshot and a trace. Selectors use visible labels and placeholders
(`e2e/helpers.js`). Fix those first.

### Step 4: real OTP e-mail, test-mode payments, secure sessions (45 min)
Follow `docs/PAYMENTS_AND_OTP.md`. For the deployed site (Vercel front end, Render API) set on Render:

| Variable | Value |
|---|---|
| `JWT_SECRET` | the long random value you already use (same one in the analytics service) |
| `CORS_ORIGINS` | your exact Vercel URL, no trailing slash, e.g. `https://your-app.vercel.app` |
| `TRUST_PROXY` | `1` |
| `EMAIL_PROVIDER`, `BREVO_API_KEY` (or `RESEND_API_KEY`), `OTP_FROM_EMAIL` | see the doc |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | **test** keys (`rzp_test_...`) |

Cookie sessions across two domains need HTTPS and `CORS_ORIGINS`; without `CORS_ORIGINS` in production the server
deliberately disables cookie sessions (users must log in again after about 30 minutes) rather than allow every website to use them.
Check after deploying: log in, reload the page, you stay logged in; in the browser's storage there is no `token`.

### Step 5: start collecting real prices today (10 min, then wait)
Follow `docs/DAILY_COLLECTOR.md` (3 secrets + one variable), run it once manually. Forecast backtests become meaningful after
roughly 10 weeks of unbroken data. Details and what to claim in the meantime: `docs/DATA_REFRESH_RUNBOOK.md`.

### Step 6: real users, then remove the demo data (2 to 4 weeks)
Combine with the user study (Step 7). When real activity exists:
```powershell
mongodump --uri "<your MONGO_URI>" --out backup-before-purge
cd analytics-service
python scripts/purge_seed_data.py            # dry run
python scripts/purge_seed_data.py --apply    # only demo (seed.*) users' data is deleted
```
If you cannot get real users, keep the synthetic data and keep the banner that says so. Do not hide it.

### Step 7: user study and cost survey (1 afternoon + analysis)
Everything is in `user-study/`: protocol, consent text, tasks, SUS questionnaire, farmer cost survey, CSV templates.
Analyse with `python -m evaluation.study_tools sus|tasks|costs <file.csv>` (from `analytics-service/`). Put the cost
results into `PROFIT_SCENARIOS` in `app/services/market_recommendation.py` and cite the survey. Participant data in
`user-study/data/` is ignored by git on purpose.

### Step 8: rate the assistant's general answers (2 hours with a friend)
`evaluation/README.md`: run `--live`, both of you rate the CSV separately, compute kappa, report means and the share of
answers with made-up facts. Never delete bad questions to improve the score; add new held-out questions instead.

### Step 9: commit and push
`git add .` is fine; these folders are safe: `e2e/` and `user-study/data/` have their own ignore files. Suggested commits:
```powershell
git add server/ ; git commit -m "Server: split into routes/models/lib, paginated listings, refresh-token sessions, e-mail OTP"
git add agribid/ ; git commit -m "Frontend: in-memory session with silent refresh, paginated listings, split dashboard"
git add analytics-service/ ; git commit -m "Analytics: profit scenarios, chatbot routing + evaluation harness, study tools"
git add e2e/ user-study/ docs/ .github/ *.md ; git commit -m "Add e2e tests, user-study kit, runbooks, CI jobs"
git push
```
Also consider `git rm --cached chat_history.md` (it is an AI chat transcript with your local paths, and it is not in `.gitignore`).
In your `.gitignore` (when you decide to push it) you may want to add: `e2e/node_modules`, `e2e/playwright-report`, `e2e/test-results`.

## 4. What changed, file by file (short)
- **Server**: `server.js` is only app setup. `models/`, `lib/` (auth, refresh tokens, listings, limiters), `routes/` (health, auth, session, crops, bids, transactions, notifications), `services/otpSender.js`.
- **React**: `api/session.js` (token in memory + silent refresh), `Dashboard/useDashboardData.js` (state and actions), `Dashboard/sections/*` (12 screens), `DashboardPage.js` (shell), "Load more" pagination, profit range in the summary card.
- **Analytics**: `market_recommendation.py` (profit band + robustness), `dashboard_summary.py`, `chatbot.py` (`route_message`, clarify route, price guard), `evaluation/`, `scripts/purge_seed_data.py`.
- **Tests and CI**: new unit/integration tests, `e2e/`, CI jobs for evaluation and Playwright.

## 5. Viva answers in one line each
1. *Synthetic data?* "Measured and shown (syntheticPercent). Real-world evidence comes from 2+ years of real AGMARKNET data; a real-user pilot of N people replaced the demo data on <date>." (only say the second part if true)
2. *No model beat naive?* "That is the finding: we built the evaluation (rolling-origin, Diebold-Mariano, Holm) and report it. The daily collector extends the history."
3. *Payments?* "Razorpay test mode with signature verification; live money needs a registered business."
4. *Profit?* "A range, not a number: conservative / expected / optimistic, with the assumptions disclosed and calibrated from N farmer interviews."
5. *Sessions?* "30-minute in-memory token plus a rotating httpOnly cookie; replaying a stolen cookie revokes the whole login chain."
6. *User study?* "SUS = X (95% CI a to b) with N participants; task success Y%; we fixed the top problem and re-tested."
7. *E2E?* "Playwright runs the real browser against real MongoDB in CI."
8. *Structure?* "server.js is app setup only; each route group and screen is its own module."
9. *Scalability?* "Pagination, filters, cacheable images."
10. *Chatbot quality?* "Data questions never use the LLM; routing measured at about 69% on unseen paraphrases (CI 56 to 80%), the LLM can't invent prices because of a guard, and human ratings of its general answers gave mean X with kappa K."

## 6. If something breaks
- **Login works but you are logged out after 30 minutes**: `CORS_ORIGINS` missing or wrong on the API, or the site is not on HTTPS.
- **`/api/auth/refresh` returns 403**: the request lacks the `X-Requested-With` header (an old front-end build).
- **Brevo/Resend returns 401/403**: wrong key, or the sender address is not verified.
- **No OTP in the signup response and no e-mail**: a provider is configured but failing; press "Resend OTP" and check the server log for `provider-http-<status>`.
- **Jest cannot start MongoDB**: the first run downloads a MongoDB binary (needs internet).
- **Playwright cannot find a button**: a label changed; update `e2e/helpers.js`.
