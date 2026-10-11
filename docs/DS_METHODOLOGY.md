# Data analytics & data science: methodology and validation

Every method here was checked, not just implemented. This document lists what each part does, how it was validated, the **measured** results, and what it cannot do. Numbers marked *(synthetic)* come from simulated series with known properties, so they validate the **method**; they are not claims about your real data. Reproduce them with the tests in `analytics-service/tests/`.

## 1. Data
| Source | Used for | Notes |
|---|---|---|
| Imported AGMARKNET mandi history (`docs/REAL_DATA.md`) | Real forecasts, seasonality, volatility, market spread | The only real-price source. Empty until you import it |
| Marketplace listings / bids / sales | Demand, segmentation, anomalies, listing-based forecasts | Partly synthetic in the demo; the share is measured and shown (`/data-provenance`) and caps forecast confidence |

Cleaning (`mandi_data.py`): drops unparseable/future dates, non-positive or incoherent prices, de-duplicates; gaps up to 3 days are forward-filled, longer gaps cut the series (never bridged); one-day price jumps beyond a robust threshold are **flagged, never removed**; staleness is reported.

## 2. Forecast lab (real prices) - `forecast_lab.py`
- **Models:** naive, seasonal naive (weekly, yearly), drift, moving average, mean reversion (AR on deviation from the 90-day mean), Ridge and gradient boosting on lagged log-returns, plus ARIMA(1,1,1) and Prophet when installed.
- **Evaluation:** rolling-origin cross-validation, expanding window, every model refit at every origin using only earlier data (leakage guarded by a test that hands each model exactly `values[:origin]`).
- **Metrics:** MAE, RMSE, sMAPE, **MASE** (scaled by the training naive one-day error), bias, directional accuracy, win-rate vs naive.
- **Significance:** Diebold-Mariano test (Newey-West variance for overlapping windows) vs naive, **Holm-corrected** across all challengers. A model is only "better" if it beats naive on MASE *and* is significant after correction.
- **Intervals:** split-conformal prediction intervals from the champion's out-of-sample errors per forecast day, non-decreasing in the horizon; coverage is measured on held-out origins.
- **Economic value:** would "wait if the model forecasts a rise of 3%+, otherwise sell now" have beaten selling immediately? Block-bootstrap 95% interval; storage/spoilage/interest not deducted.

Measured *(synthetic)*:
| Check | Result |
|---|---|
| Random walks (no structure) falsely given a winner, **before** Holm correction | 4 of 40 |
| Same, **after** Holm correction (n=300) | 0 of 40 |
| Same, longer series (n=1000) | 1 of 20 (5%, the nominal level) |
| Real linear trend detected as significant | yes |
| Mean-reverting series with a significant winner (n=700 / n=1500) | 2 of 6 / 3 of 6 |
| "Follow the forecast" showed a reliable gain on random walks | 0 of 15 |
| "Follow the forecast" on a genuine trend | mean gain +2.2% per decision, 95% interval +1.2% to +3.2% |

Reading: the test is deliberately conservative, so it rarely invents a winner, and it needs more history to confirm subtle structure. For daily commodity prices, "no model beats naive" is often the correct finding, and the page says so.

## 3. Predictability diagnostics - `diagnostics.py`
Autocorrelation (lags 1-10), Ljung-Box test, and the heteroskedasticity-robust Lo-MacKinlay **variance-ratio** test at 5/10/20 days. They explain *why* a model does or does not beat naive.

Measured *(synthetic)*: Ljung-Box falsely rejected 4.3% of 300 random walks (nominal 5%); any of the three variance-ratio tests falsely rejected 11.7% (three correlated tests); momentum series classified as structured in 49 of 50 cases.

## 4. Descriptive analytics - `market_overview.py`
Seasonal index (ratio to a centred 365-day moving average, flagged **unreliable under 2 years**), volatility (30-day, as a percentile of its own history), year-on-year change, price spread across markets. Tested on series with a known seasonal peak and on a pure trend (which must *not* produce seasonality).

## 5. Marketplace models
| Model | Validation / fix |
|---|---|
| Price forecast (listings) | **Look-ahead removed:** the series now uses the asking price (`basePrice`, fixed at listing time) instead of `currentBid` (which keeps rising afterwards). Tested: later bids cannot change the series. The forecast states its price basis |
| Linear fallback intervals | Previously `lower == upper == forecast` (a fake claim of certainty). Now a proper OLS prediction interval; tested at about 90% coverage (86-94% over 1500 simulations) |
| Demand forecast | Completed sales per day; same interval fix |
| RandomForest + SHAP | Evaluated against two naive baselines it must beat; SHAP explains an in-sample prediction and says so |
| Buyer segmentation | **Frequency and spend are log-transformed** before standardising (one very large buyer used to capture a cluster alone: sizes 1/20/40 before, 20/20/21 after on a test with three true groups). Silhouette, a k = 2..6 scan and bootstrap stability (adjusted Rand index) are reported with a plain-language verdict |
| Bid anomalies | Features are bid ÷ asking price (so dear crops aren't flagged for being dear). **Benchmarked with injected anomalies** (below) |
| Crop recommendation score | Price term is now the **buyer premium over the asking price**, not the rupee price level (which favoured expensive crops) |

Anomaly benchmark *(synthetic, 400 bids, 3% injected, 15 runs, `/bid-anomalies/benchmark`)*:
| Anomaly size | Detector | Recall | Precision | False alarms |
|---|---|---|---|---|
| bid 1.1x asking | all 3 agree | 17% | 31% | 1.2% |
| bid 1.2x asking | all 3 agree | 76% | 79% | 0.6% |
| bid 1.2x asking | IQR alone | 100% | 46% | 3.6% |
| bid 1.2x asking | Isolation Forest alone | 96% | 57% | 2.2% |
| bid 1.3x asking | all 3 agree | 98% | 93% | 0.2% |

Reading: single detectors raise many false alarms; requiring agreement (the "high confidence" tier) is what makes flags trustworthy. Very subtle anomalies (about 10% above asking) are mostly missed.

## 6. Honest limitations
- The synthetic demo data cannot show real-market performance. Import real data to get real results.
- The forecast lab can only confirm what the history supports; with under ~2 years, seasonality is flagged unreliable, and subtle structure may not reach significance.
- Wholesale mandi prices are not farm-gate prices. Weather, policy and export shocks are not modelled.
- Economic-value results exclude storage, spoilage and interest, and the champion was chosen on the same test points (optimistic).
- K-Means segmentation validity depends on the buyer base; with few buyers the check reports that it cannot validate.
- The anomaly benchmark validates the method on injected anomalies, not how many real anomalies exist.
