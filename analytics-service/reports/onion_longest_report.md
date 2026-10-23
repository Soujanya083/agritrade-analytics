# Onion (All India): real-market analysis
*Generated 2026-10-23 from imported AGMARKNET data. Every figure below is produced by the project's analysis code.*

## 1. Data
- 367 daily observations, 2023-06-06 to 2024-06-06, from 1043 markets.
- Unit: INR per kg (AGMARKNET modal price per quintal / 100). Daily value = median across markets.
- Forward-filled days (gaps of up to 3 days): 0. Cut at a longer gap: True.
- Series choice: the history has gaps longer than 3 days, so the **longest** unbroken stretch is analysed; nothing is filled across those gaps and the other stretches are not used.
- Extreme one-day moves flagged (kept in the data): 2.
- Days since last observation: 869.

## 2. Is the price predictable at all?
**momentum.** Prices show statistically significant momentum over multi-day horizons (variance ratio 2.038, 3.088). That means structure exists that a model could in principle exploit; whether the models tried here actually did is what the backtest above reports.
- Ljung-Box (10 lags) p = 0.0
- Variance ratios: 5-day 1.297 (p=0.1684), 10-day 2.038 (p=0.0005), 20-day 3.088 (p=0.0)
![acf](acf.png)

## 3. Forecast (14 days)
**Champion: Naive (last price).** No model was reliably better than assuming the price stays where it is. The best challenger (Mean reversion (AR on deviation from 90-day mean)) was 5.2% better on MASE but not statistically significant (adjusted p=0.693), so the naive forecast is used.
![forecast](forecast.png)

| Day | Forecast (Rs/kg) | 90% interval |
|---|---|---|
| 2024-06-07 | 18.0 | 17.5 - 18.5 |
| 2024-06-09 | 18.0 | 16.7 - 19.3 |
| 2024-06-11 | 18.0 | 16.6 - 19.4 |
| 2024-06-13 | 18.0 | 16.6 - 19.4 |
| 2024-06-15 | 18.0 | 16.2 - 19.8 |
| 2024-06-17 | 18.0 | 15.6 - 20.4 |
| 2024-06-19 | 18.0 | 15.6 - 20.4 |

Interval check: calibrated on the older half of the test points, the 90% interval covered the real price 0.973 of the time on the newer half (8 test points).

## 4. Model comparison (rolling-origin backtest)
Rolling-origin cross-validation (expanding window, refit at every origin); 16 forecast origins over the last 119 days.
![leaderboard](leaderboard.png)

| Model | MASE | MAE (Rs/kg) | sMAPE % | Wins vs naive | p (Holm-corrected) |
|---|---|---|---|---|---|
| Mean reversion (AR on deviation from 90-day mean) | 1.146 | 0.4671 | 2.76 | 0.562 | 0.693 |
| Naive (last price) | 1.209 | 0.4929 | 2.92 | - | - |
| ARIMA(1,1,1) | 1.319 | 0.5379 | 3.21 | 0.312 | 1.0 |
| Moving average (7 days) | 1.56 | 0.636 | 3.76 | 0.188 | 1.0 |
| Seasonal naive (weekly) | 1.672 | 0.6816 | 4.03 | 0.125 | 1.0 |
| Gradient boosting on lagged returns | 1.795 | 0.7316 | 4.3 | 0.312 | 1.0 |
| Drift (last 60 days) | 1.863 | 0.7595 | 4.72 | 0.312 | 1.0 |
| Ridge on lagged returns | 2.112 | 0.8611 | 5.26 | 0.188 | 1.0 |

A model counts as better only if it beats naive on MASE and the Diebold-Mariano test is significant after Holm correction for testing several models.

## 5. Would following the forecast have paid?
The model never forecast a rise large enough to justify waiting, so the policy is identical to selling immediately.
- Per decision over 16 past test points (wait only if a rise of 3.0%+ was forecast): following the forecast 0.0% (95% interval 0.0% to 0.0%); always waiting 1.61%; selling now 0%.
- Storage cost, spoilage and interest are not deducted, so real gains would be lower. The champion model was chosen on these same test points, so this is somewhat optimistic. Test points overlap in time; the interval uses a block bootstrap to allow for that.

## 6. Seasonality, volatility and markets
- Seasonality: Only 1.01 years of history: this may reflect one year's events rather than a repeating seasonal pattern. Highest: Nov, Dec, Oct; lowest: Feb, Jan, Oct.
![seasonality](seasonality.png)
- Volatility: low (7.29% over 30 days; 12.8th percentile of its own history).
- Market spread over the last 30 days: 165.6% across 552 markets; highest Jharsuguda (Rs 25.0/kg), lowest Gondal (Rs 5.12/kg).

## 7. Limitations
- Real AGMARKNET wholesale (mandi) prices, not the marketplace's own listings.
- Intervals are conformal: they reflect how wrong this model type has actually been on this series, not a guarantee.
- Forecasts cannot anticipate shocks (weather, policy, export bans).
- Weather, policy changes and export restrictions are not modelled.
- Wholesale mandi prices are not the price a farmer receives at the farm gate.
