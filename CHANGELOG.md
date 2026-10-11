# Changelog (audit and improvement rounds)

Each round built on the previous one; this package contains all of them.

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
