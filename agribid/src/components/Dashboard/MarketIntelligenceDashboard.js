import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// Same analytics service as AnalyticsPanel.js - this dashboard is a
// different, research-facing VIEW of the same backend, not a new
// service. It deliberately covers what AnalyticsPanel does not:
// data quality, EDA (seasonal/correlation), market-wide crop scoring
// with confidence labels, multi-method anomaly detection, and
// decision backtesting.
const ANALYTICS_BASE =
  process.env.REACT_APP_ANALYTICS_BASE_URL || 'http://localhost:8000/api/analytics';

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

const noteStyle = {
  fontSize: '12px',
  color: '#888',
  marginTop: '10px',
  fontStyle: 'italic',
};

const statBoxStyle = {
  display: 'inline-block',
  minWidth: '160px',
  padding: '12px 16px',
  marginRight: '12px',
  marginBottom: '12px',
  borderRadius: '10px',
  background: '#f8f9fa',
  border: '1px solid #eee',
};

const statLabelStyle = { fontSize: '12px', color: '#777' };
const statValueStyle = { fontSize: '22px', fontWeight: 700, color: '#1b5e20' };

const StatBox = ({ label, value }) => (
  <div style={statBoxStyle}>
    <div style={statLabelStyle}>{label}</div>
    <div style={statValueStyle}>{value}</div>
  </div>
);

const confidenceColor = (confidence) => {
  if (confidence === 'high') return '#1b5e20';
  if (confidence === 'low') return '#b45309';
  return '#555';
};

const MarketIntelligenceDashboard = () => {
  const [dataQuality, setDataQuality] = useState(null);
  const [edaReport, setEdaReport] = useState(null);
  const [cropScores, setCropScores] = useState([]);
  const [anomalies, setAnomalies] = useState(null);
  const [decisionBacktest, setDecisionBacktest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  };

  useEffect(() => {
    const loadMarketIntelligence = async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          dataQualityRes,
          edaRes,
          cropScoreRes,
          anomalyRes,
          decisionRes,
        ] = await Promise.all([
          fetchJson(`${ANALYTICS_BASE}/data-quality`),
          fetchJson(`${ANALYTICS_BASE}/eda-report`),
          fetchJson(`${ANALYTICS_BASE}/crop-recommendation-score`),
          fetchJson(`${ANALYTICS_BASE}/bid-anomalies`),
          fetchJson(`${ANALYTICS_BASE}/decision/backtest`),
        ]);

        setDataQuality(dataQualityRes);
        setEdaReport(edaRes);
        setCropScores(cropScoreRes.recommendedCrops || []);
        setAnomalies(anomalyRes);
        setDecisionBacktest(decisionRes);
      } catch (err) {
        console.error('Failed to load market intelligence data:', err);
        setError(
          'Could not load market intelligence data. Make sure the analytics service is running on port 8000.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadMarketIntelligence();
  }, []);

  const monthlySeasonalData = edaReport?.seasonalPatterns?.averagePriceByMonth
    ? Object.entries(edaReport.seasonalPatterns.averagePriceByMonth).map(
        ([month, avgPrice]) => ({ month, avgPrice })
      )
    : [];

  const correlationPairs = edaReport?.correlationAnalysis?.pairwiseCorrelations || [];

  if (loading) {
    return <p className="subheading">Loading market intelligence data...</p>;
  }

  if (error) {
    return <p style={{ color: '#c0392b' }}>{error}</p>;
  }

  return (
    <section style={{ marginTop: '16px' }}>

      {/* ========================================== */}
      {/* DATA QUALITY */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Data Quality</h3>
        {dataQuality?.summary ? (
          <>
            <div>
              <StatBox label="Datasets Checked" value={dataQuality.summary.datasetsChecked} />
              <StatBox label="Total Records" value={dataQuality.summary.totalRecords} />
              <StatBox
                label="Overall Completeness"
                value={`${dataQuality.summary.overallCompletenessPercentage}%`}
              />
              <StatBox label="Missing Values" value={dataQuality.summary.totalMissingValues} />
              <StatBox label="Duplicate Records" value={dataQuality.summary.totalDuplicateRecords} />
              <StatBox label="Invalid Values" value={dataQuality.summary.totalInvalidValues} />
            </div>
            <p style={noteStyle}>
              "Invalid values" are negative prices/quantities or future-dated records -
              structurally present but semantically impossible data, distinct from missing values.
            </p>
          </>
        ) : (
          <p>No data quality report available.</p>
        )}
      </div>

      {/* ========================================== */}
      {/* SEASONAL PATTERNS */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Seasonal Price Patterns</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>
          Average listing price by month, across all crops.
        </p>
        {monthlySeasonalData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlySeasonalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgPrice" fill="#2e7d32" name="Avg Price" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p>Not enough listing history yet to show seasonal patterns.</p>
        )}
        {edaReport?.seasonalPatterns?.note && (
          <p style={noteStyle}>{edaReport.seasonalPatterns.note}</p>
        )}
      </div>

      {/* ========================================== */}
      {/* CORRELATION ANALYSIS */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Correlation Analysis</h3>
        {correlationPairs.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Field A</th>
                <th style={thStyle}>Field B</th>
                <th style={thStyle}>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {correlationPairs.map((pair, index) => (
                <tr key={index}>
                  <td style={tdStyle}>{pair.fieldA}</td>
                  <td style={tdStyle}>{pair.fieldB}</td>
                  <td style={tdStyle}>{pair.correlation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Not enough numeric data yet for a correlation analysis.</p>
        )}
        <p style={noteStyle}>Correlation does not imply causation.</p>
      </div>

      {/* ========================================== */}
      {/* MARKET-WIDE CROP SCORE RANKING */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Market-Wide Crop Score Ranking</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>
          marketScore = priceScore×0.40 + listingScore×0.30 + stabilityScore×0.30 - a documented
          judgment call, not a data-derived optimum. Crops with fewer than 3 listings are marked
          "Insufficient Data" rather than confidently scored.
        </p>
        {cropScores.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Rank</th>
                <th style={thStyle}>Crop</th>
                <th style={thStyle}>Listings</th>
                <th style={thStyle}>Market Score</th>
                <th style={thStyle}>Confidence</th>
                <th style={thStyle}>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {cropScores.map((row, index) => (
                <tr key={index}>
                  <td style={tdStyle}>{row.rank}</td>
                  <td style={tdStyle}>{row.cropName}</td>
                  <td style={tdStyle}>{row.listings}</td>
                  <td style={tdStyle}>{row.marketScore}</td>
                  <td style={{ ...tdStyle, color: confidenceColor(row.dataConfidence), fontWeight: 600 }}>
                    {row.dataConfidence}
                  </td>
                  <td style={tdStyle}>{row.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No crop score data available yet.</p>
        )}
      </div>

      {/* ========================================== */}
      {/* ANOMALY DETECTION */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Bid Anomaly Detection</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>
          Three independent methods (Z-score, IQR, Isolation Forest) each flag unusual bids.
          Agreement across methods is stronger evidence than any single method alone.
        </p>
        {anomalies?.methodAgreement ? (
          <>
            <div>
              <StatBox label="Records Analyzed" value={anomalies.recordsAnalyzed} />
              <StatBox label="Anomalies Detected" value={anomalies.anomaliesDetected} />
              <StatBox label="Flagged By All 3" value={anomalies.methodAgreement.flaggedByAllThree} />
              <StatBox label="Flagged By 2" value={anomalies.methodAgreement.flaggedByTwo} />
              <StatBox label="Flagged By 1 Only" value={anomalies.methodAgreement.flaggedByOneOnly} />
            </div>
            {anomalies.anomalies && anomalies.anomalies.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Bid Amount</th>
                    <th style={thStyle}>Confidence</th>
                    <th style={thStyle}>Z-Score</th>
                    <th style={thStyle}>IQR</th>
                    <th style={thStyle}>Isolation Forest</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.anomalies.slice(0, 10).map((row, index) => (
                    <tr key={index}>
                      <td style={tdStyle}>{row.bidAmount}</td>
                      <td style={{ ...tdStyle, color: confidenceColor(row.confidence), fontWeight: 600 }}>
                        {row.confidence}
                      </td>
                      <td style={tdStyle}>{row.flaggedBy?.zScore ? 'Yes' : 'No'}</td>
                      <td style={tdStyle}>{row.flaggedBy?.iqr ? 'Yes' : 'No'}</td>
                      <td style={tdStyle}>{row.flaggedBy?.isolationForest ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={noteStyle}>
              Reported as "anomalous behaviour", never "fraud" - there's no labelled fraud data
              to validate a fraud claim against.
            </p>
          </>
        ) : (
          <p>{anomalies?.error || 'Not enough bidding data yet for anomaly detection.'}</p>
        )}
      </div>

      {/* ========================================== */}
      {/* DECISION BACKTESTING */}
      {/* ========================================== */}

      <div style={cardStyle}>
        <h3>Decision Backtesting: Does Following the Recommendation Help?</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>
          For every completed historical sale, compares AgriTrade's sell-now-vs-wait
          recommendation (computed with no lookahead) against the naive "sell immediately"
          baseline and the actual outcome the farmer received.
        </p>
        {decisionBacktest?.summary ? (
          <>
            <div>
              <StatBox label="Cases Evaluated" value={decisionBacktest.summary.casesEvaluated} />
              <StatBox
                label="Win Rate vs. Sell Immediately"
                value={`${decisionBacktest.summary.winRateVsSellImmediately}%`}
              />
              <StatBox label="Average Regret" value={decisionBacktest.summary.averageRegret} />
              <StatBox
                label="Worst-Case Regret"
                value={decisionBacktest.summary.downsideRisk?.worstCaseRegret}
              />
              <StatBox
                label="Skipped (Insufficient Data)"
                value={decisionBacktest.summary.skippedInsufficientData}
              />
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Strategy</th>
                  <th style={thStyle}>Average Outcome (per kg)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>Sell Immediately (first bid)</td>
                  <td style={tdStyle}>{decisionBacktest.summary.averageOutcome?.sellImmediately}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Actual Historical Outcome</td>
                  <td style={tdStyle}>
                    {decisionBacktest.summary.averageOutcome?.actualHistoricalOutcome}
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>AgriTrade Recommendation</td>
                  <td style={tdStyle}>
                    {decisionBacktest.summary.averageOutcome?.agriTradeRecommendation}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <p>
            {decisionBacktest?.error ||
              'Not enough completed transaction history yet to backtest decisions.'}
          </p>
        )}
        <p style={noteStyle}>
          No transportation, storage, or holding costs are assumed - this project doesn't have
          that data, and inventing it would misrepresent the results. Outcomes are gross price
          per kg only.
        </p>
      </div>

    </section>
  );
};

export default MarketIntelligenceDashboard;