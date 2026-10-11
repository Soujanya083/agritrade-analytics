import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import ChatbotWidget from './ChatbotWidget';
import DecisionSummaryCard from './DecisionSummaryCard';
import { analytics, describeError, isNoDataError } from '../../api/analyticsClient';
import { useAnalytics } from '../../api/useAnalytics';
import RealMarketSection, { ProvenanceBanner } from './RealMarketSection';

// Page layout (top to bottom): 1) pick crop/state/quantity, 2) "What this
// means for you" summary, 3) detail sections collapsed by default, 4) assistant.
// Previously ~11 charts/tables rendered at once with the chatbot first.

const FALLBACK_CROPS = ['Wheat', 'Rice', 'Tomato', 'Onion', 'Potato'];
const STATE_OPTIONS = ['Tamil Nadu', 'Karnataka', 'Maharashtra', 'Punjab', 'Keralam'];

const cardStyle = { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '16px' };
const thStyle = { textAlign: 'left', padding: '8px', borderBottom: '2px solid #eee', fontSize: '13px', color: '#555' };
const tdStyle = { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '13px' };
const noteStyle = { fontSize: '12px', color: '#888', marginTop: '8px' };

// Debounce so typing "500" doesn't fire three expensive requests (1, 15, 150).
function useDebounced(value, delay = 600) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}

const Section = ({ title, subtitle, children, defaultOpen = false }) => (
  <details open={defaultOpen} style={{ ...cardStyle, padding: 0 }}>
    <summary style={{ cursor: 'pointer', padding: '14px 16px', fontWeight: 700, fontSize: '16px', listStyle: 'none' }}>
      ▸ {title}
      {subtitle && <span style={{ fontWeight: 400, fontSize: '12px', color: '#777', marginLeft: '8px' }}>{subtitle}</span>}
    </summary>
    <div style={{ padding: '0 16px 16px' }}>{children}</div>
  </details>
);

// Shows loading / "no data yet" / real error in one consistent way.
const Async = ({ state, children, empty }) => {
  if (state.loading) return <p style={noteStyle}>Loading…</p>;
  if (state.error) {
    return <p style={{ fontSize: '13px', color: isNoDataError(state.error) ? '#8a6d00' : '#c0392b' }}>
      {isNoDataError(state.error) ? 'ℹ️ ' : '⚠️ '}{describeError(state.error)}
    </p>;
  }
  if (empty) return <p style={noteStyle}>{empty}</p>;
  return children;
};

const MoneyTable = ({ rows, columns }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{columns.map((c) => <th key={c.label} style={thStyle}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <tr key={i} style={row.isYou ? { background: '#f1f8e9', fontWeight: 600 } : undefined}>
            {columns.map((c) => <td key={c.label} style={tdStyle}>{c.render(row)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const who = (row) => (row.isYou ? 'You' : (row.farmerId || row.buyerId));
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const AnalyticsPanel = () => {
  const [selectedCrop, setSelectedCrop] = useState('');
  const [farmerState, setFarmerState] = useState('Maharashtra');
  const [quantityInput, setQuantityInput] = useState(500);
  const quantityKg = useDebounced(Number(quantityInput) > 0 ? Number(quantityInput) : null);

  // Crops come from the marketplace's real listings, not a hardcoded five.
  const catalog = useAnalytics((signal) => analytics.get('/crops', null, { signal }), []);
  const cropOptions = useMemo(() => {
    const names = (catalog.data?.data || []).map((c) => c.cropName);
    return names.length ? names : (catalog.loading ? [] : FALLBACK_CROPS);
  }, [catalog.data, catalog.loading]);
  useEffect(() => {
    if (!selectedCrop && cropOptions.length) setSelectedCrop(cropOptions[0]);
  }, [cropOptions, selectedCrop]);
  const ready = Boolean(selectedCrop);

  const summary = useAnalytics((signal) => analytics.get('/decision-summary', { cropName: selectedCrop, farmerState, quantityKg }, { signal }), [selectedCrop, farmerState, quantityKg], { enabled: ready });
  const trend = useAnalytics((signal) => analytics.get('/price-trend', { cropName: selectedCrop }, { signal }), [selectedCrop], { enabled: ready });
  const price = useAnalytics((signal) => analytics.get('/price-prediction', { cropName: selectedCrop, daysAhead: 14 }, { signal }), [selectedCrop], { enabled: ready });
  const demand = useAnalytics((signal) => analytics.get('/demand-forecast', { cropName: selectedCrop, daysAhead: 14 }, { signal }), [selectedCrop], { enabled: ready });
  const backtest = useAnalytics((signal) => analytics.get('/backtest/price', { cropName: selectedCrop, testDays: 7 }, { signal }), [selectedCrop], { enabled: ready });
  const mandi = useAnalytics((signal) => analytics.get('/mandi-compare', { cropName: selectedCrop, state: farmerState }, { signal }), [selectedCrop, farmerState], { enabled: ready });
  const market = useAnalytics((signal) => analytics.get('/market-recommendation', { cropName: selectedCrop, farmerState, quantityKg }, { signal }), [selectedCrop, farmerState, quantityKg], { enabled: ready });

  const overview = (path, params) => useAnalytics((signal) => analytics.get(path, params, { signal }), []); // eslint-disable-line react-hooks/rules-of-hooks
  const scores = overview('/crop-recommendation-score');
  const bestSelling = overview('/best-selling-crops', { topN: 10 });
  const regions = overview('/region-demand');
  const segments = overview('/buyer-segments', { nClusters: 3 });
  const farmers = overview('/farmer-revenue');
  const buyers = overview('/buyer-patterns');

  const priceChart = useMemo(() => [
    ...(trend.data?.data || []).map((p) => ({ date: p.date, actual: p.avgBasePrice ?? p.avgCurrentBid })),
    ...(price.data?.forecast || []).map((p) => ({ date: p.ds, predicted: p.yhat })),
  ], [trend.data, price.data]);
  const demandChart = useMemo(() => (demand.data?.forecast || []).map((p) => ({ date: p.ds, predictedDemand: p.yhat })), [demand.data]);
  const modelChart = useMemo(() => Object.entries(backtest.data?.modelComparison || {}).filter(([, m]) => m).map(([model, m]) => ({ model, MAE: m.MAE, RMSE: m.RMSE })), [backtest.data]);
  const profitChart = useMemo(() => (market.data?.rankedMarkets || []).map((m) => ({ market: `${m.market}`.length > 18 ? `${`${m.market}`.slice(0, 18)}…` : m.market, netProfit: m.expectedNetProfitPerQuintal })), [market.data]);
  const mandiChart = mandi.data ? [{ label: 'Our prediction', price: mandi.data.yourPredictedPrice }, { label: 'Real mandi average', price: mandi.data.realMandiAvgPricePerKg }] : [];
  const segmentChart = useMemo(() => (segments.data?.summary || []).map((s) => ({ segment: String(s.segment), buyerCount: s.buyerCount })), [segments.data]);
  const scoreChart = useMemo(() => (scores.data?.recommendedCrops || []).slice(0, 5).map((c) => ({ crop: c.cropName, score: c.marketScore })), [scores.data]);
  const sellingChart = useMemo(() => (bestSelling.data?.data || []).map((c) => ({ crop: c.cropName, revenue: c.totalRevenue || c.revenue || 0 })), [bestSelling.data]);

  const retryAll = useCallback(() => { analytics.clear(); window.location.reload(); }, []);

  if (catalog.error && !catalog.data && !isNoDataError(catalog.error)) {
    return (
      <section style={cardStyle}>
        <h2>Crop Price Analytics</h2>
        <p style={{ color: '#c0392b' }}>⚠️ {describeError(catalog.error)}</p>
        <button type="button" onClick={retryAll}>Try again</button>
      </section>
    );
  }

  return (
    <section className="analytics-panel" style={{ marginTop: '24px' }}>
      <h2 style={{ marginBottom: '4px' }}>Crop Price Analytics</h2>
      <p style={{ color: '#666', marginTop: 0, fontSize: '14px' }}>Choose a crop and see what the data suggests. Detailed charts are below the summary.</p>

      <ProvenanceBanner />

      <div style={{ ...cardStyle, display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', gap: '4px' }}>Crop
          <select value={selectedCrop} onChange={(e) => setSelectedCrop(e.target.value)} disabled={!cropOptions.length}>
            {cropOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', gap: '4px' }}>Your state
          <select value={farmerState} onChange={(e) => setFarmerState(e.target.value)}>
            {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', gap: '4px' }}>Quantity (kg)
          <input type="number" min="1" max="1000000" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} style={{ width: '110px' }} />
        </label>
      </div>
      {!catalog.loading && catalog.data && cropOptions.length === 0 && <p style={noteStyle}>No crop listings yet - analytics appear once farmers list crops.</p>}

      {ready && (
        <DecisionSummaryCard
          summary={summary.data}
          loading={summary.loading}
          error={summary.error ? describeError(summary.error) : null}
          crop={selectedCrop}
          quantityKg={quantityKg}
        />
      )}

      <RealMarketSection crop={selectedCrop} state={farmerState} />

      <Section title="Price & demand forecast (marketplace listings)" subtitle="Where the price and demand are heading" defaultOpen>
        <Async state={price} empty={priceChart.length === 0 ? 'No price history for this crop yet.' : null}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={priceChart}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="actual" name="Asking price (₹/kg)" stroke="#2e7d32" dot={false} connectNulls />
              <Line type="monotone" dataKey="predicted" name="Forecast (₹/kg)" stroke="#ef6c00" strokeDasharray="5 5" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          {price.data?.note && <p style={noteStyle}>{price.data.note}</p>}
          <p style={noteStyle}>Model: {price.data?.model} · {price.data?.historyPoints} days of history. {price.data?.priceBasis ? `Basis: ${price.data.priceBasis}. ` : ''}</p>
        </Async>
        <h4 style={{ marginBottom: 4 }}>Demand (completed sales per day)</h4>
        <Async state={demand} empty={demandChart.length === 0 ? 'No completed sales for this crop yet.' : null}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={demandChart}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip />
              <Line type="monotone" dataKey="predictedDemand" name="Predicted sales/day" stroke="#1565c0" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Async>
      </Section>

      <Section title="How accurate is the price model?" subtitle="Backtest against simple baselines">
        <Async state={backtest} empty={modelChart.length === 0 ? 'Not enough history to test the model.' : null}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={modelChart}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="model" /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="MAE" fill="#43a047" /><Bar dataKey="RMSE" fill="#fb8c00" />
            </BarChart>
          </ResponsiveContainer>
          <p style={noteStyle}>
            Lower is better (₹/kg). Best model: {backtest.data?.bestModel}.{' '}
            {backtest.data?.bestModelBeatsNaiveBaseline === false ? 'It did NOT beat the naive baseline, so treat forecasts with caution.' : backtest.data?.bestModelBeatsNaiveBaseline ? 'It beat the naive baseline.' : ''}
          </p>
        </Async>
      </Section>

      <Section title="Where to sell" subtitle="Real mandi prices vs our forecast, and net profit by market">
        <h4 style={{ marginTop: 0 }}>Our forecast vs real mandi price</h4>
        <Async state={mandi}>
          {mandi.data && (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={mandiChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip /><Bar dataKey="price" fill="#6a1b9a" /></BarChart>
              </ResponsiveContainer>
              {mandi.data.interpretation && <p style={noteStyle}>{mandi.data.interpretation}</p>}
            </>
          )}
        </Async>
        <h4>Expected net profit per quintal, by market</h4>
        <Async state={market} empty={profitChart.length === 0 ? 'No market data for this crop.' : null}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={profitChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="market" /><YAxis /><Tooltip /><Bar dataKey="netProfit" fill="#00897b" /></BarChart>
          </ResponsiveContainer>
          <p style={noteStyle}>{market.data?.assumptions?.note}</p>
        </Async>
      </Section>

      <Section title="Marketplace overview" subtitle="Top crops, regions and buyer groups">
        <h4 style={{ marginTop: 0 }}>Best-selling crops (revenue)</h4>
        <Async state={bestSelling} empty={sellingChart.length === 0 ? 'No completed sales yet.' : null}>
          <ResponsiveContainer width="100%" height={240}><BarChart data={sellingChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="crop" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#3949ab" /></BarChart></ResponsiveContainer>
        </Async>
        <h4>Top crops by market score</h4>
        <Async state={scores} empty={scoreChart.length === 0 ? 'Not enough data to score crops yet.' : null}>
          <ResponsiveContainer width="100%" height={240}><BarChart data={scoreChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="crop" /><YAxis /><Tooltip /><Bar dataKey="score" fill="#7cb342" /></BarChart></ResponsiveContainer>
          <p style={noteStyle}>A simple weighted heuristic (price, listings, stability) - not a profit forecast. It favours higher-priced crops.</p>
        </Async>
        <h4>Buyer segments (RFM + K-Means)</h4>
        <Async state={segments} empty={segmentChart.length === 0 ? 'Not enough buyers with completed purchases to form segments.' : null}>
          <ResponsiveContainer width="100%" height={220}><BarChart data={segmentChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="segment" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="buyerCount" fill="#c2185b" /></BarChart></ResponsiveContainer>
          {segments.data?.clusterQuality?.available && (
            <p style={{ ...noteStyle, color: segments.data.clusterQuality.segmentsAreSolid ? '#2e7d32' : '#b45309' }}>
              Cluster check: silhouette {segments.data.clusterQuality.silhouette} ({segments.data.clusterQuality.silhouetteReading}),
              stability {segments.data.clusterQuality.stabilityARI ?? '-'}. {segments.data.clusterQuality.reading}
              {segments.data.clusterQuality.notes.map((n) => ` ${n}`).join('')}
            </p>
          )}
        </Async>
        <h4>Region-wise demand</h4>
        <Async state={regions} empty={(regions.data?.data || []).length === 0 ? 'No bids recorded yet.' : null}>
          <MoneyTable rows={(regions.data?.data || []).slice(0, 15)} columns={[
            { label: 'Location', render: (r) => r.location }, { label: 'Crop', render: (r) => r.cropName },
            { label: 'Bid count', render: (r) => r.bidCount }, { label: 'Avg bid (₹)', render: (r) => inr(r.avgBidAmount) },
          ]} />
        </Async>
      </Section>

      <Section title="Farmers & buyers benchmark" subtitle="Anonymised - other users' identities are hidden">
        <h4 style={{ marginTop: 0 }}>Top farmer revenue</h4>
        <Async state={farmers} empty={(farmers.data?.data || []).length === 0 ? 'No completed deals yet.' : null}>
          <MoneyTable rows={(farmers.data?.data || []).slice(0, 10)} columns={[
            { label: 'Farmer', render: who }, { label: 'Total payout', render: (r) => inr(r.totalPayout) }, { label: 'Deals', render: (r) => r.completedDeals },
          ]} />
        </Async>
        <h4>Buyer purchasing patterns</h4>
        <Async state={buyers} empty={(buyers.data?.data || []).length === 0 ? 'No purchases yet.' : null}>
          <MoneyTable rows={(buyers.data?.data || []).slice(0, 10)} columns={[
            { label: 'Buyer', render: who }, { label: 'Total spend', render: (r) => inr(r.totalSpend) },
            { label: 'Purchases', render: (r) => r.purchaseCount }, { label: 'Avg order', render: (r) => inr(r.avgOrderValue) },
          ]} />
        </Async>
      </Section>

      <Section title="Ask the assistant" subtitle="Prices, demand, where to sell - or a general farming question">
        <ChatbotWidget />
      </Section>
    </section>
  );
};

export default AnalyticsPanel;
