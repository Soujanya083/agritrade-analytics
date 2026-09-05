# 🌾 AgriTrade AI – Analytics & Machine Learning Service

## Intelligent Agricultural Market Analytics for Smarter Selling Decisions

AgriTrade AI is a final-year Computer Science Engineering project focused on applying **Data Analytics, Data Science, Machine Learning, and Time-Series Forecasting** to agricultural marketplace data.

The Analytics Service is the intelligence layer of the AgriTrade AI ecosystem. It transforms marketplace data into meaningful insights, forecasts, recommendations, validation results, and explainable decision support.

---

## 🎯 Problem Statement

Farmers and agricultural stakeholders often have access to market prices and transaction data, but raw data alone does not answer important questions such as:

* 📈 How are crop prices changing?
* 🔮 What might the future price be?
* 📊 Which forecasting model performs best?
* 🌾 Which crops have higher demand?
* 🗺️ Which regions show stronger demand?
* 💰 Which crops generate higher revenue?
* 👥 What are buyer purchasing patterns?
* ⚠️ Is the marketplace data reliable and clean?
* 🧠 Why is a particular price trend or forecast occurring?

AgriTrade AI addresses these questions using a data-driven analytics and machine-learning layer.

---

# 🧠 Analytics & ML Features

## 1️⃣ Price Trend Analysis

Analyzes historical crop prices to identify:

* Price movement over time
* Historical trends
* Crop-level price patterns

---

## 2️⃣ Best-Selling Crops Analysis

Identifies the most actively traded crops based on marketplace data.

Useful for understanding:

* Popular crops
* Marketplace activity
* Demand indicators

---

## 3️⃣ Region-Wise Demand Analysis

Analyzes agricultural demand across different regions.

This helps identify geographical demand patterns and potential market opportunities.

---

## 4️⃣ Farmer Revenue Analytics

Provides insights into farmer earnings and marketplace revenue patterns.

---

## 5️⃣ Buyer Purchasing Pattern Analysis

Analyzes buyer behavior and transaction activity to understand marketplace purchasing patterns.

---

## 6️⃣ Crop Price Forecasting 🔮

Predicts future crop prices using:

### Primary Model

* **Prophet**

### Fallback Model

* **Linear Regression Trend**

The system automatically uses a fallback approach when historical data is insufficient for reliable Prophet forecasting.

Forecast outputs include:

* Predicted price
* Forecast date
* Lower confidence estimate
* Upper confidence estimate

---

## 7️⃣ Demand Forecasting 📈

Forecasts future agricultural demand using historical marketplace activity.

---

## 8️⃣ Recommendation Engine 🌾

Two separate, deliberately-not-merged recommendation views, answering different questions:

* **`recommend-crops`** — *location-specific*: given a place, which crop has the best demand-vs-supply gap there right now? (`recommendation.py`)
* **`crop_recommendation_score.py`** — *market-wide*: across the whole marketplace, which crop scores best on price / listing activity / price stability?

### Market Score Methodology

`marketScore = priceScore×0.40 + listingScore×0.30 + stabilityScore×0.30`

These weights are a **documented judgment call**, not derived from data — there's no ground-truth "good outcome" label to fit them against yet. Decision backtesting (see below) is what actually validates whether this scoring correlates with good real-world outcomes.

### Sample-Size Confidence

A crop with only 1 listing has zero price variance by definition — which would otherwise score as "perfectly stable" purely from having too little data to show any variance at all. Crops with fewer than **3 listings** are labeled `"Insufficient Data"` with `dataConfidence: "low"` instead of being given a potentially misleading confident recommendation.

The goal either way is to support intelligent agricultural decision-making rather than simply displaying raw market data — while being explicit about where the confidence in that support actually comes from.

---

## 9️⃣ Model Backtesting & Validation 🧪

One of the most important features of the project.

Instead of scoring a model on a single lucky-or-unlucky train/test split, AgriTrade AI uses **walk-forward (rolling-origin) validation**: the training window slides forward through history in multiple folds, and each fold scores every candidate model on data it hasn't seen. This is much closer to how the model will actually be used in production than a one-shot split.

### Models Compared

* **Naive baseline** — tomorrow's price/demand = today's value. Any model that can't beat this on average isn't earning its complexity, so this baseline is the bar every other model has to clear.
* **Linear Regression** — simple trend extrapolation.
* **Prophet** — used for price forecasting (skipped for demand backtesting, where series are short and Prophet fell back to linear too often to be a meaningful comparison).

> ⚠️ **ARIMA is not currently implemented.** It's listed as future work below rather than as a shipped feature — an earlier draft of this README claimed it was already in place, which wasn't accurate.

### Evaluation Metrics

* **MAE** — Mean Absolute Error
* **RMSE** — Root Mean Squared Error
* **MAPE** — Mean Absolute Percentage Error
* **sMAPE** — Symmetric MAPE (stays stable when actual values are near zero, unlike MAPE)

### Walk-Forward Validation Process

1. Historical data is collected and sorted by date.
2. Starting from a minimum training window, each fold trains on everything up to that point and tests on the next `horizon` days.
3. The training window then slides forward and the process repeats, producing several folds instead of one.
4. Naive, Linear Regression, and (for price) Prophet are each scored on every fold.
5. Metrics are averaged across folds per model, and the model with the lowest average RMSE is reported as the best — but only if it actually beats the Naive baseline (`bestModelBeatsNaiveBaseline`).
6. When there isn't enough history for multiple folds, the endpoint falls back to a single train/test split and says so explicitly (`validationMethod: "single-split"`), rather than silently degrading.

This makes the forecasting system more scientifically defensible and transparent — and gives an honest answer to "why should I trust this model?" instead of a single number that could have been a lucky split.

---

## 🔟 Decision Support: Sell Now, or Wait? 🧠

The recommendation engines above answer *which crop*. This answers a different, previously-missing question: *when should a farmer sell?*

`decision_engine.py` compares a crop's current price against a short-horizon price forecast (default 7 days) and recommends **Sell Now** or **Wait**, with a plain-language reason (e.g. *"Forecast expects only a 1.2% change - not worth the wait"*). A "Wait" recommendation requires the forecast to clear a minimum threshold (2%) — small forecast wobble doesn't flip the recommendation on noise alone.

**No transportation, storage, or holding costs are assumed anywhere** — this project doesn't have that data, and inventing plausible-looking numbers for it would misrepresent the results. This is stated explicitly in every response (`limitations` field), not buried in documentation.

```json
{
  "cropName": "Potato",
  "currentPrice": 1450.0,
  "forecastedPrice": 1520.0,
  "recommendation": "Wait",
  "reason": "Forecast expects a 4.8% price increase over the horizon."
}
```

---

## 1️⃣1️⃣ Decision Backtesting 🔬🔥

This is the project's strongest academic contribution, per the original project plan — and the piece that was actually missing until this phase.

`backtest_price_model` (above) validates the *forecasting model's* accuracy. This is a different question: **does following the recommendation actually produce a better outcome than not using it?**

For every completed historical sale, three outcomes are compared:

* **Sell Immediately** — the price of the first bid received (the naive "take the first offer" baseline)
* **Actual Historical Outcome** — what the farmer really received
* **AgriTrade Recommendation** — computed using *only data available up to the listing date* (no lookahead bias); if it recommends "Wait", the outcome used is the **real market-wide price actually observed** ~N days later — never an invented number

The response reports win rate against the naive baseline, average regret (gap to the best achievable outcome in hindsight), and worst-case downside — the same kind of evidence your plan calls "scientifically strong" backtesting, rather than just "our AI gives recommendations."

Cases without enough historical price context before/after the listing date are skipped and counted explicitly (`skippedInsufficientData`), not silently dropped — with a young marketplace dataset, expect this number to matter, and it's worth stating as a limitation rather than hiding it.

---

## 🧠 Explainable Forecasting

AgriTrade AI explains individual price predictions two ways, depending on how much listing history is available.

### Primary: SHAP on a feature-engineered RandomForest

A separate model (`feature_price_model.py`) engineers per-listing features — the crop's previous listing price, a short rolling average, day-of-week, month, the farmer's asking price, crop type, and location — and fits a `RandomForestRegressor` on them. **SHAP (TreeExplainer)** then attributes the predicted price to each feature with a signed contribution, so the explanation reflects an actual model rather than a hand-written heuristic.

Example output:

```json
{
  "cropName": "Potato",
  "method": "SHAP (TreeExplainer on RandomForestRegressor)",
  "basePredictionValue": 1450.0,
  "predictedPrice": 1620.5,
  "topFactors": [
    { "factor": "Previous Listing Price (Same Crop)", "shapContribution": 95.2, "impact": "positive" },
    { "factor": "Farmer's Asking Price", "shapContribution": 60.1, "impact": "positive" },
    { "factor": "Recent Average Price (Last 3 Listings)", "shapContribution": -12.4, "impact": "negative" }
  ]
}
```

`/api/analytics/price-model/evaluation` reports the model's own accuracy (MAE/RMSE/MAPE/sMAPE on a chronological hold-out) and feature importances, so the model's reliability is stated honestly rather than assumed.

### Fallback: rule-based Time-Series Factor Analysis

When there isn't yet enough marketplace-wide listing history to train a reliable feature model (fewer than ~20 listings with prior context), or SHAP isn't available in the environment, the system automatically falls back to a rule-based explainer analyzing:

* Historical Average Price
* Price Trend
* Recent Price Momentum
* Price Volatility
* Recent Price Level

This fallback is also available directly at `/api/analytics/prediction-explanation/rule-based`, bypassing SHAP entirely.

The objective either way is to avoid a black-box analytics system and provide interpretable insights — using SHAP where a suitable feature-based model actually exists, and a transparent heuristic where it doesn't yet.

---

# 📊 Exploratory Data Analysis (EDA)

The EDA Intelligence Module automatically analyzes marketplace datasets.

### Current Analysis Includes

* Dataset overview
* Record counts
* Column counts
* Crop distribution
* Numerical statistics
* Mean
* Median
* Minimum
* Maximum
* Standard deviation
* IQR-based outlier detection
* Seasonal patterns — average price by day-of-week and by month
* Correlation analysis — Pearson correlation between numeric crop fields (e.g. base price vs. final winning bid), reported without claiming causation

### Outlier Detection Method

The project uses the **Interquartile Range (IQR)** method:

```text
Lower Bound = Q1 - 1.5 × IQR
Upper Bound = Q3 + 1.5 × IQR
```

Values outside these boundaries are identified as potential outliers.

---

# 🧹 Data Quality Audit

Before performing analytics and machine learning, the system evaluates the quality of marketplace data.

The Data Quality module checks:

* Number of datasets
* Total records
* Missing values
* **Completeness percentage** — share of non-missing cells per dataset, and overall
* Duplicate records
* **Invalid values** — negative prices/quantities/amounts, and future-dated records (structurally present but semantically impossible data, distinct from missing values)
* Dataset status

Example:

```json
{
  "summary": {
    "datasetsChecked": 4,
    "totalRecords": 507,
    "totalMissingValues": 12,
    "totalDuplicateRecords": 0
  }
}
```

This ensures that analytics results are based on monitored and validated data.

---

# 👥 Buyer Segmentation

The system applies:

* **RFM Analysis**
* **K-Means Clustering**

to group buyers based on purchasing behavior.

RFM stands for:

* **Recency**
* **Frequency**
* **Monetary Value**

This allows the marketplace to identify different categories of buyers based on their activity.

---

# 🤖 AI Analytics Chatbot

The analytics chatbot provides responses grounded in actual analytics and ML outputs.

It is designed to answer questions related to:

* Crop trends
* Price forecasts
* Demand
* Marketplace insights

The objective is to connect users with data-driven insights instead of generating unsupported answers.

---

# 🏛️ Government Mandi Price Validation

AgriTrade AI includes a mandi price comparison feature.

The system can compare:

* Internal marketplace price predictions
* Available agricultural market/mandi price information

This adds an additional validation layer to the decision-support system.

---

# 🏗️ Technology Stack

## Backend

* Python
* FastAPI
* Uvicorn

## Data Analytics

* Pandas
* NumPy

## Machine Learning

* Prophet
* Scikit-learn (Linear Regression, Isolation Forest, K-Means, RandomForestRegressor)
* SHAP (model explainability)

## Model Evaluation

* MAE, RMSE, MAPE, sMAPE
* Walk-Forward (Rolling-Origin) Backtesting, with single-split fallback for small datasets

## Database

* MongoDB

---

# 📁 Project Structure

```text
analytics-service/
│
├── app/
│   ├── routes/
│   │   └── analytics.py
│   │
│   ├── services/
│   │   ├── data_loader.py
│   │   ├── trends.py
│   │   ├── price_prediction.py
│   │   ├── demand_forecast.py
│   │   ├── recommendation.py
│   │   ├── model_evaluation.py
│   │   ├── buyer_segmentation.py
│   │   ├── mandi_comparison.py
│   │   ├── data_quality.py
│   │   ├── eda_analysis.py
│   │   └── explainability.py
│   │
│   └── main.py
│
├── tests/
├── notebooks/
├── requirements.txt
└── README.md
```

---

# 🚀 Installation

## Clone the Repository

```bash
git clone https://github.com/Soujanya083/agritrade-analytics.git
```

## Navigate to the Project

```bash
cd agritrade-analytics/analytics-service
```

## Create Virtual Environment

```bash
python -m venv venv
```

## Activate Virtual Environment

### Windows

```powershell
.\venv\Scripts\Activate
```

### Linux / macOS

```bash
source venv/bin/activate
```

## Install Dependencies

```bash
pip install -r requirements.txt
```

---

# ▶️ Running the Analytics Service

From the `analytics-service` directory:

```bash
uvicorn app.main:app --reload
```

The API will run at:

```text
http://127.0.0.1:8000
```

---

# 📚 API Documentation

FastAPI automatically provides interactive API documentation:

```text
http://127.0.0.1:8000/docs
```

---

# 🚨 Market & Bidding Anomaly Detection

Rather than claiming "fraud detection" - which would require labelled fraud data this project doesn't have - AgriTrade AI detects and reports **unusual bidding behaviour**, using three independent methods on bid amounts:

* **Z-score** — flags bids more than 3 standard deviations from the mean
* **IQR (interquartile range)** — flags bids outside `[Q1 - 1.5×IQR, Q3 + 1.5×IQR]`
* **Isolation Forest** — an unsupervised ML model trained to isolate outliers

Each bid is scored by all three, and the response reports **method agreement**: a bid flagged by all three is much stronger evidence of genuinely unusual behaviour than one flagged by only one method. This comparison is itself the scientific contribution here — a single method's opinion is an assumption; agreement across independently-reasoned methods is evidence.

```json
{
  "methodAgreement": {
    "flaggedByAllThree": 2,
    "flaggedByTwo": 5,
    "flaggedByOneOnly": 11
  },
  "anomalies": [
    {
      "bidAmount": 45000,
      "flaggedBy": { "zScore": true, "iqr": true, "isolationForest": true },
      "confidence": "high"
    }
  ]
}
```

The system always reports "anomalous behaviour" or "unusual bidding pattern" — never "fraud" — since that claim isn't scientifically justified without labelled fraud events to validate against.

---

# 🔗 Major API Endpoints

| Endpoint                                | Description                    |
| --------------------------------------- | ------------------------------ |
| `/api/analytics/price-trend`            | Crop price trend analysis      |
| `/api/analytics/best-selling-crops`     | Best-selling crop analysis     |
| `/api/analytics/region-demand`          | Region-wise demand             |
| `/api/analytics/farmer-revenue`         | Farmer revenue analysis        |
| `/api/analytics/buyer-patterns`         | Buyer purchasing patterns      |
| `/api/analytics/price-prediction`       | Crop price forecasting         |
| `/api/analytics/demand-forecast`        | Demand forecasting             |
| `/api/analytics/recommend-crops`        | Crop recommendations           |
| `/api/analytics/backtest/price`         | Price model comparison         |
| `/api/analytics/backtest/demand`        | Demand model comparison        |
| `/api/analytics/decision/sell-or-wait`  | Live sell-now-vs-wait recommendation |
| `/api/analytics/decision/backtest`      | Decision backtesting vs. baseline strategies |
| `/api/analytics/buyer-segments`         | Buyer segmentation             |
| `/api/analytics/data-quality`           | Data quality audit             |
| `/api/analytics/eda-report`             | Exploratory data analysis      |
| `/api/analytics/bid-anomalies`          | Bidding anomaly detection (Z-score + IQR + Isolation Forest) |
| `/api/analytics/prediction-explanation` | Explainable forecasting (SHAP, falls back to rule-based) |
| `/api/analytics/prediction-explanation/rule-based` | Rule-based explanation, bypassing SHAP |
| `/api/analytics/price-model/evaluation` | Feature-engineered RandomForest accuracy + feature importances |
| `/api/analytics/mandi-prices`           | Mandi price information        |
| `/api/analytics/mandi-compare`          | Prediction vs mandi comparison |

---

# 🧪 Testing

The project includes automated tests using:

* **pytest**

Run tests using:

```bash
pytest
```

---

# 🎓 Academic Value

This project is designed as a **Data Analytics and Data Science-focused final-year CSE project**.

Key academic components include:

* Exploratory Data Analysis
* Data Quality Assessment
* Time-Series Forecasting (Prophet, Linear Regression, Naive baseline)
* Walk-Forward (Rolling-Origin) Model Validation
* Model Comparison
* Backtesting
* MAE, RMSE, MAPE, sMAPE Evaluation
* Outlier Detection
* Multi-Method Anomaly Detection (Z-score + IQR + Isolation Forest, with method-agreement reporting)
* Buyer Segmentation
* Recommendation Systems
* Decision Support (sell-now-vs-wait) with Decision Backtesting against baseline strategies
* Explainable Analytics (SHAP on a feature-engineered RandomForest, with a rule-based fallback)
* Government Market Price Comparison

---

# 🔮 Future Enhancements

* ARIMA/SARIMA as an additional compared model
* Power BI dashboard
* Larger crop catalog
* Real-time analytics
* Market volatility alerts
* External agricultural data integration

---

# 👩‍💻 Project

**AgriTrade AI**

Final Year Project — Computer Science Engineering

**Domain:** Data Analytics | Data Science | Machine Learning

---

⭐ If you find this project interesting, consider starring the repository.