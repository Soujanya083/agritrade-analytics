# Wheat (All India): real-market analysis
*Generated 2026-10-23 from imported AGMARKNET data. Every figure below is produced by the project's analysis code.*

## 1. Data
- 246 daily observations, 2023-06-06 to 2024-02-06, from 737 markets.
- Unit: INR per kg (AGMARKNET modal price per quintal / 100). Daily value = median across markets.
- Forward-filled days (gaps of up to 3 days): 0. Cut at a longer gap: False.
- Extreme one-day moves flagged (kept in the data): 0.
- Days since last observation: 990.

## 2. Is the price predictable at all?
**mean reversion.** Prices show statistically significant mean reversion over multi-day horizons (variance ratio 0.344, 0.254, 0.198). That means structure exists that a model could in principle exploit; whether the models tried here actually did is what the backtest above reports.
- Ljung-Box (10 lags) p = 0.0
- Variance ratios: 5-day 0.344 (p=0.0001), 10-day 0.254 (p=0.0025), 20-day 0.198 (p=0.0241)
![acf](acf.png)

## 3. Forecast (14 days)
**Champion: Naive (last price).** No model was reliably better than assuming the price stays where it is. The best challenger (Mean reversion (AR on deviation from 90-day mean)) was 9.5% better on MASE but not statistically significant (adjusted p=1.0), so the naive forecast is used.
![forecast](forecast.png)

| Day | Forecast (Rs/kg) | 90% interval |
|---|---|---|
| 2024-02-07 | 24.8 | 24.58 - 25.02 |
| 2024-02-09 | 24.8 | 24.5 - 25.1 |
| 2024-02-11 | 24.8 | 23.9 - 25.7 |
| 2024-02-13 | 24.8 | 23.9 - 25.7 |
| 2024-02-15 | 24.8 | 23.9 - 25.7 |
| 2024-02-17 | 24.8 | 23.9 - 25.7 |
| 2024-02-19 | 24.8 | 23.7 - 25.9 |

Interval check: calibrated on the older half of the test points, the 90% interval covered the real price 0.971 of the time on the newer half (5 test points).

## 4. Model comparison (rolling-origin backtest)
Rolling-origin cross-validation (expanding window, refit at every origin); 10 forecast origins over the last 77 days.
![leaderboard](leaderboard.png)

| Model | MASE | MAE (Rs/kg) | sMAPE % | Wins vs naive | p (Holm-corrected) |
|---|---|---|---|---|---|
| Mean reversion (AR on deviation from 90-day mean) | 1.226 | 0.2162 | 0.87 | 0.6 | 1.0 |
| Naive (last price) | 1.355 | 0.2389 | 0.96 | - | - |
| Seasonal naive (weekly) | 1.469 | 0.259 | 1.05 | 0.4 | 1.0 |
| ARIMA(1,1,1) | 1.487 | 0.2623 | 1.06 | 0.5 | 1.0 |
| Gradient boosting on lagged returns | 1.539 | 0.2715 | 1.1 | 0.5 | 1.0 |
| Moving average (7 days) | 1.592 | 0.2807 | 1.13 | 0.5 | 1.0 |
| Drift (last 60 days) | 1.809 | 0.319 | 1.28 | 0.0 | 1.0 |
| Ridge on lagged returns | 1.919 | 0.3384 | 1.37 | 0.6 | 1.0 |

A model counts as better only if it beats naive on MASE and the Diebold-Mariano test is significant after Holm correction for testing several models.

## 5. Would following the forecast have paid?
The model never forecast a rise large enough to justify waiting, so the policy is identical to selling immediately.
- Per decision over 10 past test points (wait only if a rise of 3.0%+ was forecast): following the forecast 0.0% (95% interval 0.0% to 0.0%); always waiting -0.18%; selling now 0%.
- Storage cost, spoilage and interest are not deducted, so real gains would be lower. The champion model was chosen on these same test points, so this is somewhat optimistic. Test points overlap in time; the interval uses a block bootstrap to allow for that.

## 6. Seasonality, volatility and markets
- Seasonality: Less than one year of history - no seasonal pattern can be measured.

- Volatility: normal (4.96% over 30 days; 31.9th percentile of its own history).
- Market spread over the last 30 days: 75.7% across 384 markets; highest Shimoga (Rs 40.0/kg), lowest Bichhiya (Rs 21.0/kg).

## 7. Limitations
- Real AGMARKNET wholesale (mandi) prices, not the marketplace's own listings.
- Intervals are conformal: they reflect how wrong this model type has actually been on this series, not a guarantee.
- Forecasts cannot anticipate shocks (weather, policy, export bans).
- Weather, policy changes and export restrictions are not modelled.
- Wholesale mandi prices are not the price a farmer receives at the farm gate.
