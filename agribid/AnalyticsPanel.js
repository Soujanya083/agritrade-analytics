import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';

// Points at your Python analytics service (FastAPI), NOT the Node server.
// Change this if you deploy the analytics service somewhere other than localhost:8000.
const ANALYTICS_BASE = process.env.REACT_APP_ANALYTICS_BASE_URL || 'http://localhost:8000/api/analytics';

const CROP_OPTIONS = ['Wheat', 'Rice', 'Tomato', 'Onion', 'Potato'];

const AnalyticsPanel = () => {
  const [selectedCrop, setSelectedCrop] = useState('Wheat');
  const [trendData, setTrendData] = useState([]);
  const [predictionData, setPredictionData] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  };

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const [trendRes, predictionRes, recommendRes] = await Promise.all([
          fetchJson(`${ANALYTICS_BASE}/price-trend?cropName=${selectedCrop}`),
          fetchJson(`${ANALYTICS_BASE}/price-prediction?cropName=${selectedCrop}&daysAhead=14`),
          fetchJson(`${ANALYTICS_BASE}/recommend-crops?topN=5`),
        ]);

        setTrendData((trendRes.data || []).map((d) => ({ date: d.date, price: d.avgCurrentBid })));

        if (predictionRes.forecast) {
          setPredictionData(predictionRes.forecast.map((f) => ({ date: f.ds, predicted: f.yhat })));
        } else {
          setPredictionData([]);
        }

        setRecommendations((recommendRes.data || []).map((r) => ({
          crop: r.cropName,
          opportunityScore: r.opportunityScore,
        })));
      } catch (err) {
        setError('Could not load analytics data. Is the analytics service running on port 8000?');
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [selectedCrop]);

  // combine trend + prediction into one continuous timeline for the chart
  const combinedChartData = [
    ...trendData.map((d) => ({ date: d.date, actual: d.price })),
    ...predictionData.map((d) => ({ date: d.date, predicted: d.predicted })),
  ];

  return (
    <section className="analytics-panel" style={{ marginTop: '24px' }}>
      <h2>Crop Price Analytics</h2>

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
        <>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
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

          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px' }}>
            <h3>Which Crop Has Higher Demand Right Now?</h3>
            <p style={{ fontSize: '13px', color: '#666' }}>
              Higher score = more buyer demand relative to how much is currently listed.
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={recommendations}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="crop" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="opportunityScore" fill="#2e7d32" name="Opportunity score" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
};

export default AnalyticsPanel;