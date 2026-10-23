# Potato (All India): real-market analysis
*Generated 2026-10-23 from imported AGMARKNET data. Every figure below is produced by the project's analysis code.*

## 1. Data
- 737 daily observations, 2023-06-06 to 2025-06-11, from 970 markets.
- Unit: INR per kg (AGMARKNET modal price per quintal / 100). Daily value = median across markets.
- Forward-filled days (gaps of up to 3 days): 0. Cut at a longer gap: False.
- Extreme one-day moves flagged (kept in the data): 8.
- Days since last observation: 499.

## 2. Is the price predictable at all?
**mean reversion.** Prices show statistically significant mean reversion over multi-day horizons (variance ratio 0.409, 0.443). That means structure exists that a model could in principle exploit; whether the models tried here actually did is what the backtest above reports.
- Ljung-Box (10 lags) p = 0.0
- Variance ratios: 5-day 0.409 (p=0.0), 10-day 0.443 (p=0.0015), 20-day 0.637 (p=0.1339)
![acf](acf.png)

## 3. Forecast (14 days)
**Champion: Naive (last price).** No model was reliably better than assuming the price stays where it is. The best challenger (Ridge on lagged returns) was 7.2% better on MASE but not statistically significant (adjusted p=0.54), so the naive forecast is used.
![forecast](forecast.png)

| Day | Forecast (Rs/kg) | 90% interval |
|---|---|---|
| 2025-06-12 | 14.0 | 12.0 - 16.0 |
| 2025-06-14 | 14.0 | 12.0 - 16.0 |
| 2025-06-16 | 14.0 | 11.5 - 16.5 |
| 2025-06-18 | 14.0 | 11.5 - 16.5 |
| 2025-06-20 | 14.0 | 10.6 - 17.4 |
| 2025-06-22 | 14.0 | 10.6 - 17.4 |
| 2025-06-24 | 14.0 | 10.2 - 17.8 |

Interval check: calibrated on the older half of the test points, the 90% interval covered the real price 1.0 of the time on the newer half (17 test points).

## 4. Model comparison (rolling-origin backtest)
Rolling-origin cross-validation (expanding window, refit at every origin); 34 forecast origins over the last 245 days.
![leaderboard](leaderboard.png)

| Model | MASE | MAE (Rs/kg) | sMAPE % | Wins vs naive | p (Holm-corrected) |
|---|---|---|---|---|---|
| Ridge on lagged returns | 3.091 | 0.732 | 4.32 | 0.559 | 0.54 |
| Naive (last price) | 3.332 | 0.7893 | 4.76 | - | - |
| Gradient boosting on lagged returns | 3.363 | 0.7965 | 4.92 | 0.588 | 1.0 |
| ARIMA(1,1,1) | 3.492 | 0.827 | 5.0 | 0.471 | 1.0 |
| Mean reversion (AR on deviation from 90-day mean) | 3.728 | 0.8829 | 5.33 | 0.324 | 1.0 |
| Drift (last 60 days) | 3.8 | 0.9001 | 6.29 | 0.353 | 1.0 |
| Moving average (7 days) | 4.185 | 0.9913 | 5.98 | 0.382 | 1.0 |
| Seasonal naive (weekly) | 4.311 | 1.021 | 6.1 | 0.441 | 1.0 |
| Seasonal naive (yearly) | 29.769 | 7.0511 | 46.0 | 0.029 | 1.0 |

A model counts as better only if it beats naive on MASE and the Diebold-Mariano test is significant after Holm correction for testing several models.

## 5. Would following the forecast have paid?
The model never forecast a rise large enough to justify waiting, so the policy is identical to selling immediately.
- Per decision over 34 past test points (wait only if a rise of 3.0%+ was forecast): following the forecast 0.0% (95% interval 0.0% to 0.0%); always waiting -2.89%; selling now 0%.
- Storage cost, spoilage and interest are not deducted, so real gains would be lower. The champion model was chosen on these same test points, so this is somewhat optimistic. Test points overlap in time; the interval uses a block bootstrap to allow for that.

## 6. Seasonality, volatility and markets
- Seasonality: Averaged over 2.02 years of history. Highest: Jul, Aug, Sep; lowest: Feb, Jan, Mar.
![seasonality](seasonality.png)
- Volatility: high (28.56% over 30 days; 89.1th percentile of its own history).
- Versus a year ago: -29.0% (Rs 18.29 -> Rs 12.99 per kg).
- Market spread over the last 30 days: 158.3% across 482 markets; highest Punalur (Rs 24.0/kg), lowest Malout (Rs 5.0/kg).

## 7. Limitations
- Real AGMARKNET wholesale (mandi) prices, not the marketplace's own listings.
- Intervals are conformal: they reflect how wrong this model type has actually been on this series, not a guarantee.
- Forecasts cannot anticipate shocks (weather, policy, export bans).
- Weather, policy changes and export restrictions are not modelled.
- Wholesale mandi prices are not the price a farmer receives at the farm gate.
