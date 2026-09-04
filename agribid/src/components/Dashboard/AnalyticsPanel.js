import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

import ChatbotWidget from './ChatbotWidget';

// Analytics FastAPI service
const ANALYTICS_BASE =
  process.env.REACT_APP_ANALYTICS_BASE_URL ||
  'http://localhost:8000/api/analytics';

const CROP_OPTIONS = ['Wheat', 'Rice', 'Tomato', 'Onion', 'Potato'];

const shortId = (id) =>
  id && id.length > 10
    ? `${id.slice(0, 4)}...${id.slice(-4)}`
    : id;

const cardStyle = {
  background: '#fff',
  borderRadius: '12px',
  padding: '16px',
  marginBottom: '24px',
};

const thStyle = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '2px solid #eee',
  fontSize: '13px',
  color: '#555',
};

const tdStyle = {
  padding: '8px',
  borderBottom: '1px solid #f0f0f0',
  fontSize: '13px',
};

const AnalyticsPanel = () => {
  const [selectedCrop, setSelectedCrop] = useState('Wheat');

  const [trendData, setTrendData] = useState([]);
  const [predictionData, setPredictionData] = useState([]);
  const [demandForecastData, setDemandForecastData] = useState([]);
  const [backtestResult, setBacktestResult] = useState(null);

  const [recommendations, setRecommendations] = useState([]);

  const [bestSelling, setBestSelling] = useState([]);
  const [regionDemand, setRegionDemand] = useState([]);
  const [farmerRevenue, setFarmerRevenue] = useState([]);
  const [buyerPatterns, setBuyerPatterns] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchJson = async (url) => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  };

  // ==========================================
  // CROP-SPECIFIC ANALYTICS
  // ==========================================

  useEffect(() => {
    const loadCropData = async () => {
      setLoading(true);
      setError(null);

      try {
        const cropName = selectedCrop.toLowerCase();

        const [
          trendRes,
          predictionRes,
          demandRes,
          backtestRes,
        ] = await Promise.all([
          fetchJson(
            `${ANALYTICS_BASE}/price-trend?cropName=${cropName}`
          ),

          fetchJson(
            `${ANALYTICS_BASE}/price-prediction?cropName=${cropName}&daysAhead=14`
          ),

          fetchJson(
            `${ANALYTICS_BASE}/demand-forecast?cropName=${cropName}&daysAhead=14`
          ),

          fetchJson(
            `${ANALYTICS_BASE}/backtest/price?cropName=${cropName}&testDays=7`
          ),
        ]);

        // PRICE TREND
        setTrendData(
          (trendRes.data || []).map((item) => ({
            date: item.date,
            price: item.avgCurrentBid,
          }))
        );

        // PRICE FORECAST
        setPredictionData(
          (predictionRes.forecast || []).map((item) => ({
            date: item.ds,
            predicted: item.yhat,
          }))
        );

        // DEMAND FORECAST
        setDemandForecastData(
          (demandRes.forecast || []).map((item) => ({
            date: item.ds,
            predictedDemand: item.yhat,
          }))
        );

        // BACKTEST
        if (backtestRes.metrics) {
          setBacktestResult(backtestRes);
        } else {
          setBacktestResult(null);
        }
      } catch (err) {
        console.error(err);

        setError(
          'Could not load analytics data. Make sure the analytics service is running on port 8000.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadCropData();
  }, [selectedCrop]);

  // ==========================================
  // MARKETPLACE-WIDE ANALYTICS
  // ==========================================

  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        const [
          recommendRes,
          bestSellingRes,
          regionRes,
          farmerRes,
          buyerRes,
        ] = await Promise.all([
          fetchJson(
            `${ANALYTICS_BASE}/recommend-crops?topN=5`
          ),

          fetchJson(
            `${ANALYTICS_BASE}/best-selling-crops?topN=10`
          ),

          fetchJson(
            `${ANALYTICS_BASE}/region-demand`
          ),

          fetchJson(
            `${ANALYTICS_BASE}/farmer-revenue`
          ),

          fetchJson(
            `${ANALYTICS_BASE}/buyer-patterns`
          ),
        ]);

        // CROP RECOMMENDATIONS
        setRecommendations(
          (recommendRes.recommendedCrops || []).map((item) => ({
            crop: item.cropName,
            opportunityScore: item.marketScore,
          }))
        );

        // BEST SELLING CROPS
        setBestSelling(
          (bestSellingRes.data || bestSellingRes.bestSellingCrops || []).map(
            (item) => ({
              crop: item.cropName,
              revenue: item.totalRevenue || item.revenue || 0,
            })
          )
        );

        // REGION DEMAND
        setRegionDemand(regionRes.data || []);

        // FARMER REVENUE
        setFarmerRevenue(
          (farmerRes.data || []).slice(0, 10)
        );

        // BUYER PATTERNS
        setBuyerPatterns(
          (buyerRes.data || []).slice(0, 10)
        );
      } catch (err) {
        console.error(
          'Failed to load overview analytics:',
          err
        );
      }
    };

    loadOverviewData();
  }, []);

  // ==========================================
  // COMBINE ACTUAL PRICE + PREDICTION
  // ==========================================

  const combinedChartData = [
    ...trendData.map((item) => ({
      date: item.date,
      actual: item.price,
    })),

    ...predictionData.map((item) => ({
      date: item.date,
      predicted: item.predicted,
    })),
  ];

  return (
    <section
      className="analytics-panel"
      style={{ marginTop: '24px' }}
    >
      <h2>Crop Price Analytics</h2>

      {/* CHATBOT */}

      <div style={{ marginBottom: '24px' }}>
        <ChatbotWidget />
      </div>

      {/* CROP SELECTOR */}

      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="crop-select"
          style={{
            marginRight: '8px',
            fontWeight: 600,
          }}
        >
          Select crop:
        </label>

        <select
          id="crop-select"
          value={selectedCrop}
          onChange={(e) =>
            setSelectedCrop(e.target.value)
          }
        >
          {CROP_OPTIONS.map((crop) => (
            <option
              key={crop}
              value={crop}
            >
              {crop}
            </option>
          ))}
        </select>
      </div>

      {/* LOADING */}

      {loading && <p>Loading analytics...</p>}

      {/* ERROR */}

      {error && (
        <p style={{ color: '#c0392b' }}>
          {error}
        </p>
      )}

      {/* ========================================== */}
      {/* PRICE TREND + FORECAST */}
      {/* ========================================== */}

      {!loading && !error && (
        <div style={cardStyle}>
          <h3>
            {selectedCrop} — Price Trend &amp; 14-Day
            Forecast
          </h3>

          <ResponsiveContainer
            width="100%"
            height={320}
          >
            <LineChart data={combinedChartData}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
              />

              <YAxis tick={{ fontSize: 11 }} />

              <Tooltip />

              <Legend />

              <Line
                type="monotone"
                dataKey="actual"
                stroke="#2e7d32"
                name="Actual price"
                dot={{ r: 3 }}
                connectNulls
              />

              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#e67e22"
                name="Predicted price"
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ========================================== */}
      {/* DEMAND FORECAST */}
      {/* ========================================== */}

      {!loading && !error && (
        <div style={cardStyle}>
          <h3>
            {selectedCrop} — 14-Day Demand Forecast
          </h3>

          <p
            style={{
              fontSize: '13px',
              color: '#666',
            }}
          >
            Predicted daily bid volume — a proxy for
            buyer demand.
          </p>

          <ResponsiveContainer
            width="100%"
            height={260}
          >
            <LineChart data={demandForecastData}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
              />

              <YAxis tick={{ fontSize: 11 }} />

              <Tooltip />

              <Legend />

              <Line
                type="monotone"
                dataKey="predictedDemand"
                stroke="#8e44ad"
                name="Predicted demand (bids/day)"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ========================================== */}
      {/* MODEL BACKTEST */}
      {/* ========================================== */}

      {!loading &&
        !error &&
        backtestResult && (
          <div style={cardStyle}>
            <h3>
              {selectedCrop} — Model Accuracy
              (Backtest)
            </h3>

            <p
              style={{
                fontSize: '13px',
                color: '#666',
              }}
            >
              Lower error means better prediction
              accuracy.
            </p>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginTop: '8px',
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>Model</th>
                  <th style={thStyle}>MAE</th>
                  <th style={thStyle}>RMSE</th>
                  <th style={thStyle}>MAPE (%)</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td style={tdStyle}>
                    {backtestResult.model}
                  </td>

                  <td style={tdStyle}>
                    {backtestResult.metrics.MAE}
                  </td>

                  <td style={tdStyle}>
                    {backtestResult.metrics.RMSE}
                  </td>

                  <td style={tdStyle}>
                    {backtestResult.metrics.MAPE}
                  </td>
                </tr>
              </tbody>
            </table>

            <p
              style={{
                fontSize: '13px',
                color: '#666',
                marginTop: '12px',
              }}
            >
              Training points:{' '}
              {backtestResult.trainingPoints} | Testing
              points: {backtestResult.testingPoints}
            </p>
          </div>
        )}

      {/* ========================================== */}
      {/* CROP OPPORTUNITY */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>
          Recommended Crops / Market Opportunity
        </h3>

        <p
          style={{
            fontSize: '13px',
            color: '#666',
          }}
        >
          Higher score indicates better market
          opportunity based on price, listings, and
          stability.
        </p>

        <ResponsiveContainer
          width="100%"
          height={260}
        >
          <BarChart data={recommendations}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="crop"
              tick={{ fontSize: 12 }}
            />

            <YAxis tick={{ fontSize: 11 }} />

            <Tooltip />

            <Bar
              dataKey="opportunityScore"
              fill="#2e7d32"
              name="Market Score"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ========================================== */}
      {/* BEST SELLING CROPS */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Best-Selling Crops</h3>

        <p
          style={{
            fontSize: '13px',
            color: '#666',
          }}
        >
          Ranked by marketplace transaction activity
          and revenue.
        </p>

        <ResponsiveContainer
          width="100%"
          height={260}
        >
          <BarChart data={bestSelling}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="crop"
              tick={{ fontSize: 12 }}
            />

            <YAxis tick={{ fontSize: 11 }} />

            <Tooltip />

            <Bar
              dataKey="revenue"
              fill="#1565c0"
              name="Total Revenue"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ========================================== */}
      {/* REGION DEMAND */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Region-Wise Demand</h3>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Location</th>
              <th style={thStyle}>Crop</th>
              <th style={thStyle}>Bid Count</th>
              <th style={thStyle}>
                Avg Bid Amount
              </th>
            </tr>
          </thead>

          <tbody>
            {regionDemand.slice(0, 10).map(
              (row, index) => (
                <tr key={index}>
                  <td style={tdStyle}>
                    {row.location}
                  </td>

                  <td style={tdStyle}>
                    {row.cropName}
                  </td>

                  <td style={tdStyle}>
                    {row.bidCount}
                  </td>

                  <td style={tdStyle}>
                    {Number(
                      row.avgBidAmount || 0
                    ).toFixed(2)}
                  </td>
                </tr>
              )
            )}

            {regionDemand.length === 0 && (
              <tr>
                <td
                  style={tdStyle}
                  colSpan={4}
                >
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================== */}
      {/* FARMER REVENUE */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Top Farmer Revenue</h3>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Farmer ID</th>
              <th style={thStyle}>
                Total Payout
              </th>
              <th style={thStyle}>
                Completed Deals
              </th>
            </tr>
          </thead>

          <tbody>
            {farmerRevenue.map((row, index) => (
              <tr key={index}>
                <td style={tdStyle}>
                  {shortId(row.farmerId)}
                </td>

                <td style={tdStyle}>
                  {Number(
                    row.totalPayout || 0
                  ).toFixed(2)}
                </td>

                <td style={tdStyle}>
                  {row.completedDeals}
                </td>
              </tr>
            ))}

            {farmerRevenue.length === 0 && (
              <tr>
                <td
                  style={tdStyle}
                  colSpan={3}
                >
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================== */}
      {/* BUYER PATTERNS */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Buyer Purchasing Patterns</h3>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Buyer ID</th>
              <th style={thStyle}>
                Total Spend
              </th>
              <th style={thStyle}>
                Purchases
              </th>
              <th style={thStyle}>
                Avg Order Value
              </th>
            </tr>
          </thead>

          <tbody>
            {buyerPatterns.map((row, index) => (
              <tr key={index}>
                <td style={tdStyle}>
                  {shortId(row.buyerId)}
                </td>

                <td style={tdStyle}>
                  {Number(
                    row.totalSpend || 0
                  ).toFixed(2)}
                </td>

                <td style={tdStyle}>
                  {row.purchaseCount}
                </td>

                <td style={tdStyle}>
                  {Number(
                    row.avgOrderValue || 0
                  ).toFixed(2)}
                </td>
              </tr>
            ))}

            {buyerPatterns.length === 0 && (
              <tr>
                <td
                  style={tdStyle}
                  colSpan={4}
                >
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AnalyticsPanel;