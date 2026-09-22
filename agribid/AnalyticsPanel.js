import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';

// Points at your Python analytics service (FastAPI), NOT the Node server.
// Change this if you deploy the analytics service somewhere other than localhost:8000.
const ANALYTICS_BASE = process.env.REACT_APP_ANALYTICS_BASE_URL || 'http://localhost:8000/api/analytics';

const CROP_OPTIONS = ['Wheat', 'Rice', 'Tomato', 'Onion', 'Potato'];
const STATE_OPTIONS = ['Tamil Nadu', 'Karnataka', 'Maharashtra', 'Punjab', 'Keralam'];

const AnalyticsPanel = () => {
  const [selectedCrop, setSelectedCrop] = useState('Wheat');
  const [farmerState, setFarmerState] = useState('Tamil Nadu');
  const [quantityKg, setQuantityKg] = useState(500);

  const [trendData, setTrendData] = useState([]);
  const [predictionData, setPredictionData] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [modelComparison, setModelComparison] = useState([]);
  const [mandiComparison, setMandiComparison] = useState(null);
  const [buyerSegments, setBuyerSegments] = useState([]);
  const [marketRecommendation, setMarketRecommendation] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // These three calls each depend on real government / model data that can
  // legitimately be unavailable for a given crop or state - track their
  // errors separately so one missing dataset doesn't blank out the rest
  // of the panel.
  const [mandiError, setMandiError] = useState(null);
  const [marketError, setMarketError] = useState(null);

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
        const [trendRes, predictionRes, recommendRes, backtestRes, segmentsRes] = await Promise.all([
          fetchJson(`${ANALYTICS_BASE}/price-trend?cropName=${selectedCrop}`),
          fetchJson(`${ANALYTICS_BASE}/price-prediction?cropName=${selectedCrop}&daysAhead=14`),
          fetchJson(`${ANALYTICS_BASE}/recommend-crops?topN=5`),
          fetchJson(`${ANALYTICS_BASE}/backtest/price?cropName=${selectedCrop}`),
          fetchJson(`${ANALYTICS_BASE}/buyer-segments?nClusters=3`),
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

        // modelComparison is a dict keyed by model name; a model can be
        // null if it didn't produce a usable fold (e.g. too little data),
        // so filter those out rather than plotting a broken bar.
        const comparisonDict = backtestRes.modelComparison || {};
        setModelComparison(
          Object.entries(comparisonDict)
            .filter(([, metrics]) => metrics)
            .map(([model, metrics]) => ({
              model,
              MAE: metrics.MAE,
              RMSE: metrics.RMSE,
            }))
        );

        setBuyerSegments((segmentsRes.summary || []).map((s) => ({
          segment: `Segment ${s.segment}`,
          buyerCount: s.buyerCount,
          avgMonetary: s.avgMonetary,
        })));
      } catch (err) {
        setError('Could not load analytics data. Is the analytics service running on port 8000?');
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [selectedCrop]);

  // Mandi validation and market recommendation both depend on farmerState /
  // quantityKg too, so they're fetched separately rather than in the main
  // effect above.
  useEffect(() => {
    const loadMandi = async () => {
      setMandiError(null);
      try {
        const res = await fetchJson(
          `${ANALYTICS_BASE}/mandi-compare?cropName=${selectedCrop}&state=${encodeURIComponent(farmerState)}`
        );
        if (res.error) {
          setMandiError(res.error);
          setMandiComparison(null);
        } else {
          setMandiComparison(res);
        }
      } catch (err) {
        setMandiError('Could not reach the mandi validation endpoint.');
        setMandiComparison(null);
      }
    };
    loadMandi();
  }, [selectedCrop, farmerState]);

  useEffect(() => {
    const loadMarketRecommendation = async () => {
      setMarketError(null);
      try {
        const res = await fetchJson(
          `${ANALYTICS_BASE}/market-recommendation?cropName=${selectedCrop}&farmerState=${encodeURIComponent(farmerState)}&quantityKg=${quantityKg}`
        );
        if (res.error) {
          setMarketError(res.error);
          setMarketRecommendation(null);
        } else {
          setMarketRecommendation(res);
        }
      } catch (err) {
        setMarketError('Could not reach the market recommendation endpoint.');
        setMarketRecommendation(null);
      }
    };
    loadMarketRecommendation();
  }, [selectedCrop, farmerState, quantityKg]);

  // combine trend + prediction into one continuous timeline for the chart
  const combinedChartData = [
    ...trendData.map((d) => ({ date: d.date, actual: d.price })),
    ...predictionData.map((d) => ({ date: d.date, predicted: d.predicted })),
  ];

  const mandiChartData = mandiComparison ? [
    { label: 'Our Prediction', price: mandiComparison.yourPredictedPrice },
    { label: 'Real Mandi Average', price: mandiComparison.realMandiAvgPricePerKg },
  ] : [];

  const netProfitChartData = (marketRecommendation?.rankedMarkets || []).map((m) => ({
    market: `${m.market}`.length > 18 ? `${m.market}`.slice(0, 18) + '…' : m.market,
    netProfit: m.expectedNetProfitPerQuintal,
  }));

  const cardStyle = { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '24px' };

  return (
    <section className="analytics-panel" style={{ marginTop: '24px' }}>
      <h2>Crop Price Analytics</h2>

      <div style={{ marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="crop-select" style={{ marginRight: '8px', fontWeight: 600 }}>
            Select crop:
          </label>
          <select id="crop-select" value={selectedCrop} onChange={(e) => setSelectedCrop(e.target.value)}>
            {CROP_OPTIONS.map((crop) => (
              <option key={crop} value={crop}>{crop}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="state-select" style={{ marginRight: '8px', fontWeight: 600 }}>
            Your state:
          </label>
          <select id="state-select" value={farmerState} onChange={(e) => setFarmerState(e.target.value)}>
            {STATE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="quantity-input" style={{ marginRight: '8px', fontWeight: 600 }}>
            Quantity (kg):
          </label>
          <input
            id="quantity-input"
            type="number"
            min="1"
            value={quantityKg}
            onChange={(e) => setQuantityKg(Number(e.target.value))}
            style={{ width: '90px' }}
          />
        </div>
      </div>

      {loading && <p>Loading analytics...</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {!loading && !error && (
        <>
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

          <div style={cardStyle}>
            <h3>Model Accuracy Comparison (Walk-Forward Backtest)</h3>
            <p style={{ fontSize: '13px', color: '#666' }}>
              Lower is better. Compares every forecasting model on the same held-out data.
            </p>
            {modelComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={modelComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="MAE" fill="#5478a8" name="MAE" />
                  <Bar dataKey="RMSE" fill="#c98a3c" name="RMSE" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: '13px', color: '#999' }}>
                Not enough history for {selectedCrop} yet to backtest model accuracy.
              </p>
            )}
          </div>

          <div style={cardStyle}>
            <h3>Mandi Price Validation</h3>
            <p style={{ fontSize: '13px', color: '#666' }}>
              Our prediction checked against real government AGMARKNET prices in {farmerState}.
            </p>
            {mandiError && <p style={{ fontSize: '13px', color: '#999' }}>{mandiError}</p>}
            {!mandiError && mandiComparison && (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={mandiChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="price" fill="#5a8f6b" name="Price (₹/kg)" />
                  </BarChart>
                </ResponsiveContainer>
                <p style={{ fontSize: '13px', color: '#444', marginTop: '8px' }}>
                  {mandiComparison.interpretation} (sample size: {mandiComparison.sampleSize} records)
                </p>
              </>
            )}
          </div>

          <div style={cardStyle}>
            <h3>Expected Net Profit by Market</h3>
            <p style={{ fontSize: '13px', color: '#666' }}>
              Real AGMARKNET prices minus a disclosed transport &amp; storage cost estimate, ranked highest first.
            </p>
            {marketError && <p style={{ fontSize: '13px', color: '#999' }}>{marketError}</p>}
            {!marketError && marketRecommendation && (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={netProfitChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="market" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="netProfit" fill="#8a6bb0" name="Net Profit (₹/quintal)" />
                  </BarChart>
                </ResponsiveContainer>
                <p style={{ fontSize: '13px', color: '#444', marginTop: '8px' }}>
                  Recommended: <strong>{marketRecommendation.recommendedMarket.market}</strong>
                  {' '}({marketRecommendation.recommendedMarket.district}, {marketRecommendation.recommendedMarket.state}) —
                  {' '}expected net profit ₹{marketRecommendation.recommendedMarket.expectedNetProfitPerQuintal}/quintal.
                </p>
              </>
            )}
          </div>

          <div style={cardStyle}>
            <h3>Buyer Segments (RFM + K-Means)</h3>
            <p style={{ fontSize: '13px', color: '#666' }}>
              How many buyers fall into each behavioural segment, marketplace-wide.
            </p>
            {buyerSegments.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={buyerSegments}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="segment" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="buyerCount" fill="#b0554a" name="Number of buyers" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: '13px', color: '#999' }}>Not enough transaction history yet to segment buyers.</p>
            )}
          </div>

          <div style={cardStyle}>
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