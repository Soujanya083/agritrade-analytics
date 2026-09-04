# 🌾 AgriTrade AI

## Intelligent Agricultural Marketplace & Data-Driven Decision Support System

AgriTrade AI is a **final-year Computer Science Engineering project** that combines **Full Stack Development, Data Analytics, Data Science, Machine Learning, and backend technologies** to build a smarter agricultural marketplace.

The platform connects farmers and buyers while transforming marketplace data into meaningful insights, forecasts, recommendations, and decision-support information.

---

# 🎯 Problem Statement

Farmers often face challenges such as:

* Limited access to suitable buyers
* Uncertainty about fair crop prices
* Difficulty understanding market demand
* Lack of data-driven selling decisions
* Price fluctuations and market volatility
* Limited visibility into historical market trends

Existing agricultural platforms may provide marketplaces or price information, but AgriTrade AI aims to combine a **digital agricultural marketplace with intelligent analytics and forecasting**.

The system is designed to help answer important questions such as:

> 🌾 What crops are in demand?
> 📈 How are crop prices changing?
> 🔮 What may happen to prices in the future?
> 💰 Which selling opportunities are more profitable?
> 📊 What does marketplace data reveal about buyers and transactions?

---

# 💡 Our Solution

AgriTrade AI provides an integrated platform consisting of:

### 🌐 Digital Agricultural Marketplace

Farmers can list crops and connect with potential buyers.

### 💰 Bidding System

Buyers can place bids on agricultural products.

### 💳 Secure Payment Workflow

The platform supports payment integration and transaction processing.

### 📊 Data Analytics

Marketplace data is analyzed to identify trends, demand patterns, revenue insights, and buyer behavior.

### 🤖 Machine Learning & Forecasting

Historical data is used for crop price prediction and demand forecasting.

### 🧠 Explainable Decision Support

The system provides understandable insights instead of only producing black-box predictions.

---

# 🚀 Key Features

## 👨‍🌾 Farmer Features

* User registration and authentication
* Crop listing
* Crop quantity and pricing information
* Bid monitoring
* Revenue insights
* Transaction tracking

## 🛒 Buyer Features

* Browse available crops
* Place bids
* View marketplace listings
* Transaction management
* Purchase tracking

## 💰 Marketplace Features

* Crop listings
* Bidding system
* Bid management
* Payment workflow
* Delivery confirmation
* Notifications

---

# 📊 Data Analytics & Data Science Features

AgriTrade AI includes an analytics intelligence layer built on actual marketplace data.

### Analytics Features

* 📈 Crop price trend analysis
* 🌾 Best-selling crop analysis
* 🗺️ Region-wise demand analysis
* 💰 Farmer revenue analysis
* 👥 Buyer purchasing pattern analysis
* 📊 Exploratory Data Analysis (EDA)
* 🧹 Data quality assessment
* 📉 Outlier detection

---

# 🤖 Machine Learning Features

## 🔮 Crop Price Forecasting

The system forecasts future crop prices using:

* Prophet
* Linear Regression Baseline
* ARIMA

---

## 🧪 Model Validation & Backtesting

Predictions are validated using historical data.

The system compares multiple forecasting models using:

* **MAE — Mean Absolute Error**
* **RMSE — Root Mean Squared Error**

Instead of blindly trusting predictions, the models are evaluated against actual historical observations.

---

## 📈 Demand Forecasting

Historical marketplace activity is analyzed to estimate future demand.

---

## 🌾 Crop Recommendation Engine

The system recommends crops based on marketplace demand and supply signals.

---

## 🧠 Explainable Analytics

Price behavior is explained using factors such as:

* Historical average price
* Price trend
* Recent price momentum
* Price volatility
* Recent price level

This helps make the analytics system more transparent and understandable.

---

## 👥 Buyer Segmentation

Buyer behavior is analyzed using:

* RFM Analysis
* K-Means Clustering

This helps identify different buyer groups based on purchasing behavior.

---

# 🏛️ Market Price Validation

AgriTrade AI includes market price comparison functionality to support validation of marketplace predictions against available mandi/agricultural market data.

This helps strengthen the reliability of the decision-support system.

---

# 🏗️ System Architecture

```text
                         ┌─────────────────────┐
                         │     React Frontend   │
                         │   User Interface     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Backend API      │
                         │ Authentication      │
                         │ Marketplace Logic   │
                         │ Bidding & Payments  │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┼──────────────┐
                     ▼                             ▼
          ┌────────────────────┐       ┌─────────────────────┐
          │    MongoDB         │       │ Analytics Service   │
          │ Marketplace Data   │       │ FastAPI + Python    │
          └────────────────────┘       └──────────┬──────────┘
                                                   │
                                                   ▼
                                      ┌─────────────────────┐
                                      │ Data Analytics & ML │
                                      │ Forecasting         │
                                      │ Recommendations     │
                                      │ Model Validation    │
                                      └─────────────────────┘
```

---

# 🛠️ Technology Stack

## 🌐 Frontend

* React
* JavaScript
* HTML
* CSS

## ⚙️ Backend

* Node.js
* Express.js

## 🗄️ Database

* MongoDB
* MongoDB Atlas

## 📊 Data Analytics & Data Science

* Python
* Pandas
* NumPy
* Jupyter Notebook

## 🤖 Machine Learning

* Prophet
* ARIMA
* Scikit-learn
* K-Means Clustering

## 🚀 Analytics API

* FastAPI
* Uvicorn

## 💳 Payment Integration

* Razorpay

## ☁️ Deployment

* Vercel
* Render
* MongoDB Atlas

---

# 📁 Project Structure

```text
Farmers/
│
├── agribid/                 # Frontend Application
│
├── server/                  # Backend Application
│
├── analytics-service/       # Data Analytics & ML Service
│
├── README.md
├── .gitignore
│
└── documentation/
```

---

# 📊 Analytics Service

The analytics and machine-learning implementation is maintained separately inside:

```text
analytics-service/
```

It includes:

* Price forecasting
* Demand forecasting
* Model backtesting
* ARIMA comparison
* EDA
* Data quality auditing
* Buyer segmentation
* Recommendation engine
* Explainable analytics
* Market price comparison

See the Analytics Service documentation for detailed information.

---

# 🧪 Testing

The project includes automated testing across different components.

Testing covers:

* API functionality
* Input validation
* Analytics services
* Machine learning endpoints

---

# 🎓 Academic Focus

AgriTrade AI is designed as a multidisciplinary final-year project combining:

| Domain                 | Contribution                             |
| ---------------------- | ---------------------------------------- |
| Full Stack Development | Marketplace platform and user experience |
| Backend Development    | APIs, business logic and integrations    |
| Data Analytics         | Trends, EDA and business insights        |
| Data Science           | Data processing and statistical analysis |
| Machine Learning       | Forecasting and recommendations          |
| Software Engineering   | Testing, validation and deployment       |

---

# 🔬 Project Strength

A major objective of AgriTrade AI is to ensure that analytics outputs are **validated and explainable**.

The project does not treat machine-learning predictions as automatically correct.

Instead, it focuses on:

* Data quality checks
* Historical data analysis
* Model comparison
* Backtesting
* Error metrics
* Explainable insights
* External market price comparison where data is available

---

# 🔮 Future Enhancements

* Real-time bidding using WebSockets
* Advanced anomaly detection
* Market volatility alerts
* Automated model selection
* Rolling-window backtesting
* Power BI business intelligence dashboard
* Larger crop catalog
* Crop quality grading using Computer Vision
* Additional agricultural data sources
* Advanced farmer decision-support recommendations

---

# 👩‍💻 Team Project

**AgriTrade AI**

Final Year Project
**Computer Science Engineering**

### Domains Covered

🌐 Full Stack Development
📊 Data Analytics
🤖 Data Science & Machine Learning
⚙️ Backend Development
🗄️ Database Systems
☁️ Cloud Deployment

---

## ⭐ Vision

> **To build a transparent, data-driven agricultural marketplace that combines digital trading with intelligent analytics and decision support.**
