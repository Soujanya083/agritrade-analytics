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
const STATE_OPTIONS = ['Tamil Nadu', 'Karnataka', 'Maharashtra', 'Punjab', 'Keralam'];

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
  const [farmerState, setFarmerState] = useState('Tamil Nadu');
  const [quantityKg, setQuantityKg] = useState(500);

  const [trendData, setTrendData] = useState([]);
  const [predictionData, setPredictionData] = useState([]);
  const [demandForecastData, setDemandForecastData] = useState([]);
  const [modelComparison, setModelComparison] = useState([]);

  const [recommendations, setRecommendations] = useState([]);

  const [bestSelling, setBestSelling] = useState([]);
  const [regionDemand, setRegionDemand] = useState([]);
  const [farmerRevenue, setFarmerRevenue] = useState([]);
  const [buyerPatterns, setBuyerPatterns] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // New, independently-fetched pieces: each has its own error state so a
  // failure in one never hides an unrelated one - see the note further
  // down about why these are NOT nested inside the loading/error block
  // above, which only reflects the crop-specific Promise.all below.
  const [decisionSummary, setDecisionSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [mandiComparison, setMandiComparison] = useState(null);
  const [mandiError, setMandiError] = useState(null);
  const [marketRecommendation, setMarketRecommendation] = useState(null);
  const [marketError, setMarketError] = useState(null);
  const [buyerSegments, setBuyerSegments] = useState([]);

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

        // MODEL BACKTEST
        // NOTE: the backend's real response shape here is a
        // `modelComparison` dict keyed by model name (Naive, Linear
        // Regression, Prophet, ARIMA, Ensemble), each either a metrics
        // object or null if that model didn't produce a usable fold -
        // there has never been a top-level `metrics`/`model` singular
        // field. Building against that dict instead, as a multi-model
        // comparison rather than a single-row table.
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
          // Was /recommend-crops, which returns { data: [...] } with an
          // `opportunityScore` field - but the mapping below reads
          // `recommendedCrops` / `marketScore`, which only exist on
          // /crop-recommendation-score (the price + listings + stability
          // weighted score this chart's own description refers to). The
          // mismatch meant this chart was always empty.
          fetchJson(
            `${ANALYTICS_BASE}/crop-recommendation-score`
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
          (recommendRes.recommendedCrops || []).slice(0, 5).map((item) => ({
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
  // DECISION SUMMARY ("At a Glance" card)
  // Fetched independently of the crop-specific Promise.all above, on
  // purpose: it also depends on farmerState/quantityKg, which the
  // price-trend/demand/backtest group above does not need.
  // ==========================================

  useEffect(() => {
    const loadDecisionSummary = async () => {
      setSummaryError(null);

      try {
        const cropName = selectedCrop.toLowerCase();
        const res = await fetchJson(
          `${ANALYTICS_BASE}/decision-summary?cropName=${cropName}&farmerState=${encodeURIComponent(
            farmerState
          )}&quantityKg=${quantityKg}`
        );
        setDecisionSummary(res);
      } catch (err) {
        setSummaryError(
          'Could not load the summary. The detailed charts below may still work.'
        );
        setDecisionSummary(null);
      }
    };

    loadDecisionSummary();
  }, [selectedCrop, farmerState, quantityKg]);

  // ==========================================
  // MANDI PRICE VALIDATION
  // ==========================================

  useEffect(() => {
    const loadMandi = async () => {
      setMandiError(null);

      try {
        const cropName = selectedCrop.toLowerCase();
        const res = await fetchJson(
          `${ANALYTICS_BASE}/mandi-compare?cropName=${cropName}&state=${encodeURIComponent(
            farmerState
          )}`
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

  // ==========================================
  // NET PROFIT MARKET RECOMMENDATION
  // ==========================================

  useEffect(() => {
    const loadMarketRecommendation = async () => {
      setMarketError(null);

      try {
        const cropName = selectedCrop.toLowerCase();
        const res = await fetchJson(
          `${ANALYTICS_BASE}/market-recommendation?cropName=${cropName}&farmerState=${encodeURIComponent(
            farmerState
          )}&quantityKg=${quantityKg}`
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

  // ==========================================
  // BUYER SEGMENTS (RFM + K-Means)
  // Marketplace-wide, not crop-specific - fetched once, like the
  // overview analytics above.
  // ==========================================

  useEffect(() => {
    const loadBuyerSegments = async () => {
      try {
        const res = await fetchJson(
          `${ANALYTICS_BASE}/buyer-segments?nClusters=3`
        );
        setBuyerSegments(
          (res.summary || []).map((s) => ({
            segment: `Segment ${s.segment}`,
            buyerCount: s.buyerCount,
          }))
        );
      } catch (err) {
        console.error('Failed to load buyer segments:', err);
      }
    };

    loadBuyerSegments();
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

  const mandiChartData = mandiComparison
    ? [
        { label: 'Our Prediction', price: mandiComparison.yourPredictedPrice },
        { label: 'Real Mandi Average', price: mandiComparison.realMandiAvgPricePerKg },
      ]
    : [];

  const netProfitChartData = (marketRecommendation?.rankedMarkets || []).map(
    (m) => ({
      market:
        `${m.market}`.length > 18
          ? `${m.market}`.slice(0, 18) + '…'
          : m.market,
      netProfit: m.expectedNetProfitPerQuintal,
    })
  );

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

      {/* CROP / STATE / QUANTITY SELECTORS */}

      <div style={{ marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div>
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

      {/* LOADING */}

      {loading && <p>Loading analytics...</p>}

      {/* ERROR */}

      {error && (
        <p style={{ color: '#c0392b' }}>
          {error}
        </p>
      )}

      {/* ========================================== */}
      {/* DECISION SUMMARY ("At a Glance" card)       */}
      {/* Deliberately NOT gated behind the loading/  */}
      {/* error above - that only reflects the crop-  */}
      {/* specific Promise.all, and nesting unrelated */}
      {/* independent sections there means one failure*/}
      {/* hides everything else too.                  */}
      {/* ========================================== */}

      {summaryError && (
        <p style={{ fontSize: '13px', color: '#999' }}>{summaryError}</p>
      )}

      {decisionSummary && (
        <div
          style={{
            background: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
            color: 'white',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <p
            style={{
              fontSize: '13px',
              opacity: 0.85,
              margin: '0 0 8px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {selectedCrop} — At a Glance
          </p>

          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>Predicted Price</div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>
                {decisionSummary.predictedPrice != null
                  ? `₹${decisionSummary.predictedPrice}/kg`
                  : 'Not enough data'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>Demand</div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{decisionSummary.demandLevel}</div>
            </div>

            {decisionSummary.bestMarket && (
              <>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>Best Market</div>
                  <div style={{ fontSize: '22px', fontWeight: 700 }}>{decisionSummary.bestMarket}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>Expected Net Profit</div>
                  <div style={{ fontSize: '22px', fontWeight: 700 }}>
                    ₹{decisionSummary.expectedNetProfitPerQuintal}/quintal
                  </div>
                </div>
              </>
            )}
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '16px',
              fontWeight: 700,
              display: 'inline-block',
            }}
          >
            {decisionSummary.actionText}
          </div>

          <p style={{ fontSize: '11px', opacity: 0.75, marginTop: '12px', marginBottom: 0 }}>
            The charts below show exactly how this was calculated — this card is a summary, not a separate number.
          </p>
        </div>
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
      {/* MODEL BACKTEST (fixed: multi-model comparison, matching what */}
      {/* the backend actually returns, instead of the old single-row  */}
      {/* table that expected fields the API has never sent)           */}
      {/* ========================================== */}

      {!loading && !error && (
        <div style={cardStyle}>
          <h3>
            {selectedCrop} — Model Accuracy Comparison (Walk-Forward Backtest)
          </h3>

          <p
            style={{
              fontSize: '13px',
              color: '#666',
            }}
          >
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
      )}

      {/* ========================================== */}
      {/* MANDI PRICE VALIDATION                      */}
      {/* Independent fetch/error state, rendered     */}
      {/* unconditionally for the same reason as the  */}
      {/* summary card above.                         */}
      {/* ========================================== */}

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

      {/* ========================================== */}
      {/* EXPECTED NET PROFIT BY MARKET               */}
      {/* ========================================== */}

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

      {/* ========================================== */}
      {/* BUYER SEGMENTS (RFM + K-Means)              */}
      {/* ========================================== */}

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