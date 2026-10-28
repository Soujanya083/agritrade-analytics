# Changelog (audit and improvement rounds)

Each round built on the previous one; this package contains all of them.

## Final audit round (2026-10)

Security and correctness
- Signup OTP: at most 5 wrong guesses per code, then the code is destroyed (constant-time comparison).
- Manual "I have paid" UPI route is disabled when Razorpay is configured, so it cannot bypass real payment.
- Analytics service: per-user rate limit (`ANALYTICS_RATE_LIMIT_PER_MIN`).
- Photo overrides must be direct picture files with a real credit; shop and stock-photo pages are ignored.
- Crop names are stored in one canonical spelling ("rice" -> "Rice"); `npm run normalize-crop-names` fixes existing listings.
- A farmer can delete their own open listing (atomic: a listing with a deal can never be deleted).

Data analytics and data science
- A forecast learned from price history older than 45 days is withheld instead of being shown as today's forecast; today's live median is shown instead.
- Decision backtest: the realised price now comes from the accepted bid's per-kg amount; deals with implausible prices are excluded and counted (fixes an "actual outcome 0.04" artefact).
- Farmers' direct-sale markets (Uzhavar Sandhai, Rythu Bazar, Apni Mandi) are flagged and kept out of best-market and summary figures; different varieties are not mixed.
- Live prices: all 36 states/UTs and Karnataka's 31 districts with their old and new spellings; the government feed's own commodity names are tried; one retry and a clear failure reason (the server stalls the default Python client identity).
- Reproducible Kaggle preparation (`scripts/prepare_kaggle_mandi.py`) with date-format checks; longest-unbroken-segment option for evaluation; optional daily price collector.

Companion planting
- Status is derived from the sources by written rules; every number must be traceable to a verified claim; 8 more pairings researched and added; links checked weekly.

Documentation
- `VALIDATION_REPORT.md`, `SETUP.md`, `validation/` (logs and scripts). `chat_history.md` removed from the repository; ignore rules and configuration templates completed (`agribid/.env.example` added).

## Round 1 - audit and fixes
Analytics-service JWT auth, real HTTP status codes, caching with data-version invalidation, hybrid chatbot (project data vs optional LLM), privacy pseudonymisation, atomic bid acceptance, image validation and real crop photos (Pexels), picture-based companion planting, decision-summary page, CI, tests, docs.

## Round 2 - real-market data layer
AGMARKNET importer (CSV + daily API collector), cleaning, forecast lab (rolling-origin backtest, Diebold-Mariano with Holm correction, conformal intervals), seasonality/volatility/market-spread analytics, data provenance (synthetic share) with confidence capping, REAL_DATA guide.

## Round 3 - DA/DS rigor
Predictability diagnostics (Ljung-Box, variance ratio), economic-value backtest, data-quality checks (staleness, extreme moves), leak-free asking-price series, OLS prediction intervals (no more zero-width bands), segmentation validation (log-RFM, silhouette, stability), anomaly-detector benchmark, mean-reversion model, reproducible report generator, DS_METHODOLOGY.md.

## Round 4 - real-file readiness
Wrong-unit price detection, tests for real Agmarknet file layouts, `import_mandi_prices.py summary`, readiness tiers, source guide.

## Not done / needs you
Import real mandi data (docs/REAL_DATA.md); run CI once; real OTP provider; review companion-planting content with an agronomy source.
