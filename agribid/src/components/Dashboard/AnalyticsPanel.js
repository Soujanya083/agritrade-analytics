import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import ChatbotWidget from './ChatbotWidget';

// Points at your Python analytics service (FastAPI), NOT the Node server.
// Change this if you deploy the analytics service somewhere other than localhost:8000.
const ANALYTICS_BASE = process.env.REACT_APP_ANALYTICS_BASE_URL || 'http://localhost:8000/api/analytics';

const CROP_OPTIONS = ['Wheat', 'Rice', 'Tomato', 'Onion', 'Potato'];

// shortens a raw Mongo ObjectId so it's readable in a table, e.g. "64f3...a91b"
const shortId = (id) => (id && id.length > 10 ? `${id.slice(0, 4)}...${id.slice(-4)}` : id);

const cardStyle = { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '24px' };
const thStyle = { textAlign: 'left', padding: '8px', borderBottom: '2px solid #eee', fontSize: '13px', color: '#555' };
const tdStyle = { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '13px' };

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
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  };

  // Crop-specific data (price trend + forecast) reloads whenever the dropdown changes.
  useEffect(() => {
    const loadCropData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [trendRes, predictionRes, demandRes, backtestRes] = await Promise.all([
          fetchJson(`${ANALYTICS_BASE}/price-trend?cropName=${selectedCrop}`),
          fetchJson(`${ANALYTICS_BASE}/price-prediction?cropName=${selectedCrop}&daysAhead=14`),
          fetchJson(`${ANALYTICS_BASE}/demand-forecast?cropName=${selectedCrop}&daysAhead=14`),
          fetchJson(`${ANALYTICS_BASE}/backtest/price?cropName=${selectedCrop}&testDays=7`),
        ]);

        setTrendData((trendRes.data || []).map((d) => ({ date: d.date, price: d.avgCurrentBid })));

        if (predictionRes.forecast) {
          setPredictionData(predictionRes.forecast.map((f) => ({ date: f.ds, predicted: f.yhat })));
        } else {
          setPredictionData([]);
        }

        if (demandRes.forecast) {
          setDemandForecastData(demandRes.forecast.map((f) => ({ date: f.ds, predictedDemand: f.yhat })));
        } else {
          setDemandForecastData([]);
        }

        setBacktestResult(backtestRes.comparison ? backtestRes : null);
      } catch (err) {
        setError('Could not load analytics data. Is the analytics service running on port 8000?');
      } finally {
        setLoading(false);
      }
    };

    loadCropData();
  }, [selectedCrop]);

  // Marketplace-wide data (not crop-specific) loads once on mount.
  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        const [recommendRes, bestSellingRes, regionRes, farmerRes, buyerRes] = await Promise.all([
          fetchJson(`${ANALYTICS_BASE}/recommend-crops?topN=5`),
          fetchJson(`${ANALYTICS_BASE}/best-selling-crops?topN=10`),
          fetchJson(`${ANALYTICS_BASE}/region-demand`),
          fetchJson(`${ANALYTICS_BASE}/farmer-revenue`),
          fetchJson(`${ANALYTICS_BASE}/buyer-patterns`),
        ]);

        setRecommendations((recommendRes.data || []).map((r) => ({
          crop: r.cropName,
          opportunityScore: r.opportunityScore,
        })));
        setBestSelling((bestSellingRes.data || []).map((b) => ({
          crop: b.cropName,
          revenue: b.totalRevenue,
        })));
        setRegionDemand(regionRes.data || []);
        setFarmerRevenue((farmerRes.data || []).slice(0, 10));
        setBuyerPatterns((buyerRes.data || []).slice(0, 10));
      } catch (err) {
        // Overview data failing shouldn't block the crop-specific charts above.
        console.error('Failed to load overview analytics:', err);
      }
    };

    loadOverviewData();
  }, []);

  // combine trend + prediction into one continuous timeline for the chart
  const combinedChartData = [
    ...trendData.map((d) => ({ date: d.date, actual: d.price })),
    ...predictionData.map((d) => ({ date: d.date, predicted: d.predicted })),
  ];

  return (
    <section className="analytics-panel" style={{ marginTop: '24px' }}>
      <h2>Crop Price Analytics</h2>

      <div style={{ marginBottom: '24px' }}>
        <ChatbotWidget />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="crop-select" style={{ marginRight: '8px', fontWeight: 600 }}>
          Select crop:
        </label>
        <select
          id="crop-select"
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
        >
          {CROP_OPTIONS.map((crop) => (
            <option key={crop} value={crop}>{crop}</option>
          ))}
        </select>
      </div>

      {loading && <p>Loading analytics...</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {!loading && !error && (
        <div style={cardStyle}>
          <h3>{selectedCrop} — Price Trend &amp; 14-Day Forecast</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={combinedChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="actual" stroke="#2e7d32" name="Actual price" dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="predicted" stroke="#e67e22" name="Predicted price" strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && !error && (
        <div style={cardStyle}>
          <h3>{selectedCrop} — 14-Day Demand Forecast</h3>
          <p style={{ fontSize: '13px', color: '#666' }}>
            Predicted daily bid volume — a proxy for buyer demand.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={demandForecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="predictedDemand" stroke="#8e44ad" name="Predicted demand (bids/day)" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && !error && backtestResult && (
        <div style={cardStyle}>
          <h3>{selectedCrop} — Model Accuracy (Backtest)</h3>
          <p style={{ fontSize: '13px', color: '#666' }}>
            Last {backtestResult.testDays} real days were hidden, then predicted using only
            earlier data — this compares each model's guess to what actually happened.
            Lower error = more accurate.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>MAE (avg error)</th>
                <th style={thStyle}>RMSE</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(backtestResult.comparison).map(([modelName, stats]) => (
                <tr key={modelName}>
                  <td style={tdStyle}>
                    {modelName === 'prophet' ? 'Prophet' : 'Linear baseline'}
                  </td>
                  <td style={tdStyle}>{stats.error ? '—' : stats.mae}</td>
                  <td style={tdStyle}>{stats.error ? '—' : stats.rmse}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(() => {
            const entries = Object.entries(backtestResult.comparison)
              .filter(([, stats]) => !stats.error);
            if (entries.length < 2) return null;
            const winner = entries.reduce((best, cur) => (cur[1].mae < best[1].mae ? cur : best));
            const winnerLabel = winner[0] === 'prophet' ? 'Prophet' : 'the linear baseline';
            return (
              <p style={{ fontSize: '13px', color: '#2e7d32', marginTop: '8px' }}>
                {winnerLabel} was more accurate for {selectedCrop} in this backtest (MAE {winner[1].mae}).
              </p>
            );
          })()}
        </div>
      )}

      <div style={cardStyle}>
        <h3>Which Crop Has Higher Demand Right Now?</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>
          Higher score = more buyer demand relative to how much is currently listed.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={recommendations}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="crop" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="opportunityScore" fill="#2e7d32" name="Opportunity score" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <h3>Best-Selling Crops</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>Ranked by total completed-deal revenue.</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={bestSelling}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="crop" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="revenue" fill="#1565c0" name="Total revenue" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <h3>Region-Wise Demand</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>Bid activity by location and crop.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Location</th>
              <th style={thStyle}>Crop</th>
              <th style={thStyle}>Bid Count</th>
              <th style={thStyle}>Avg Bid Amount</th>
            </tr>
          </thead>
          <tbody>
            {regionDemand.slice(0, 10).map((row, i) => (
              <tr key={i}>
                <td style={tdStyle}>{row.location}</td>
                <td style={tdStyle}>{row.cropName}</td>
                <td style={tdStyle}>{row.bidCount}</td>
                <td style={tdStyle}>{Number(row.avgBidAmount).toFixed(2)}</td>
              </tr>
            ))}
            {regionDemand.length === 0 && (
              <tr><td style={tdStyle} colSpan={4}>No data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={cardStyle}>
        <h3>Top Farmer Revenue</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>Total payout from completed transactions.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Farmer ID</th>
              <th style={thStyle}>Total Payout</th>
              <th style={thStyle}>Completed Deals</th>
            </tr>
          </thead>
          <tbody>
            {farmerRevenue.map((row, i) => (
              <tr key={i}>
                <td style={tdStyle}>{shortId(row.farmerId)}</td>
                <td style={tdStyle}>{Number(row.totalPayout).toFixed(2)}</td>
                <td style={tdStyle}>{row.completedDeals}</td>
              </tr>
            ))}
            {farmerRevenue.length === 0 && (
              <tr><td style={tdStyle} colSpan={3}>No data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={cardStyle}>
        <h3>Buyer Purchasing Patterns</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>Spend and frequency per buyer.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Buyer ID</th>
              <th style={thStyle}>Total Spend</th>
              <th style={thStyle}>Purchases</th>
              <th style={thStyle}>Avg Order Value</th>
            </tr>
          </thead>
          <tbody>
            {buyerPatterns.map((row, i) => (
              <tr key={i}>
                <td style={tdStyle}>{shortId(row.buyerId)}</td>
                <td style={tdStyle}>{Number(row.totalSpend).toFixed(2)}</td>
                <td style={tdStyle}>{row.purchaseCount}</td>
                <td style={tdStyle}>{Number(row.avgOrderValue).toFixed(2)}</td>
              </tr>
            ))}
            {buyerPatterns.length === 0 && (
              <tr><td style={tdStyle} colSpan={4}>No data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AnalyticsPanel;
