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

Provides crop recommendations using marketplace demand and supply signals.

The goal is to support intelligent agricultural decision-making rather than simply displaying raw market data.

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

## 🧠 Explainable Forecasting

AgriTrade AI includes a **Time-Series Factor Analysis** module to explain the factors behind historical price behavior.

The explanation analyzes:

* Historical Average Price
* Price Trend
* Recent Price Momentum
* Price Volatility
* Recent Price Level

Example output:

```json
{
  "cropName": "Potato",
  "explanationType": "time_series_factor_analysis",
  "factors": [
    {
      "factor": "Price Trend",
      "impact": "positive"
    }
  ]
}
```

The objective is to avoid a black-box analytics system and provide interpretable insights.

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
* Scikit-learn (Linear Regression, Isolation Forest, K-Means)

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
| `/api/analytics/buyer-segments`         | Buyer segmentation             |
| `/api/analytics/data-quality`           | Data quality audit             |
| `/api/analytics/eda-report`             | Exploratory data analysis      |
| `/api/analytics/prediction-explanation` | Explainable forecasting        |
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
* Buyer Segmentation
* Recommendation Systems
* Explainable Analytics
* Government Market Price Comparison

---

# 🔮 Future Enhancements

* ARIMA/SARIMA as an additional compared model
* Statistical (Z-score/IQR) baseline alongside the Isolation Forest anomaly detector
* Decision backtesting — evaluating the *recommendation engine's* choices against baseline strategies (sell-now, highest-price, etc.), separate from model backtesting above
* Advanced anomaly detection for suspicious bidding
* Feature-based machine learning forecasting
* SHAP explanations for feature-based models
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