import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';
import { analytics, describeError, isNoDataError } from '../../api/analyticsClient';
import { useAnalytics } from '../../api/useAnalytics';

const box = { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '16px' };
const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#555' };
const td = { padding: '6px 8px', borderBottom: '1px solid #f3f3f3', fontSize: '13px' };
const note = { fontSize: '12px', color: '#777', marginTop: 6 };

// Tells the viewer, on every Analytics page load, how much of the marketplace
// data is synthetic demo data and whether real mandi history is imported.
export function ProvenanceBanner() {
  const state = useAnalytics((signal) => analytics.get('/data-provenance', null, { signal }), []);
  const p = state.data;
  if (!p) return null;
  const real = p.realMandiHistory || {};
  const hasReal = real.rows > 0;
  const tone = p.mostlySynthetic && !hasReal ? { bg: '#fff3e0', border: '#ffcc80', icon: '⚠️' } : { bg: '#e8f5e9', border: '#a5d6a7', icon: 'ℹ️' };
  return (
    <div role="note" style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
      <strong>{tone.icon} Data sources:</strong>{' '}
      {p.syntheticPercent > 0
        ? `${p.syntheticPercent}% of marketplace records are synthetic demo data. `
        : 'No synthetic demo records detected in the marketplace. '}
      {hasReal
        ? `Real market analysis uses ${real.rows.toLocaleString('en-IN')} imported AGMARKNET price records (${real.firstDate} to ${real.lastDate}) across ${real.commodities} commodities.${real.stale ? ` ⚠️ The newest record is ${real.daysSinceLastRecord} days old - run the daily collector so forecasts start from today.` : ''}`
        : 'No real mandi history has been imported yet, so the "Real market data" section is empty (see docs/REAL_DATA.md).'}
    </div>
  );
}

const pct = (v) => (v == null ? '-' : `${(v * 100).toFixed(0)}%`);

export default function RealMarketSection({ crop, state }) {
  const [scope, setScope] = useState('state');          // 'state' | 'all'
  const commodities = useAnalytics((signal) => analytics.get('/real-market/commodities', null, { signal }), []);
  const list = useMemo(() => commodities.data?.data || [], [commodities.data]);

  // Same name-matching idea as the server: exact, then whole-word containment.
  const commodity = useMemo(() => {
    const name = (crop || '').trim().toLowerCase();
    return (list.find((c) => c.commodity.toLowerCase() === name)
      || list.find((c) => new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(c.commodity.toLowerCase())))?.commodity || null;
  }, [list, crop]);

  const stateParam = scope === 'state' ? state : undefined;
  const enabled = Boolean(commodity);
  const forecast = useAnalytics((signal) => analytics.get('/real-market/forecast', { commodity, state: stateParam, horizon: 14 }, { signal }), [commodity, stateParam], { enabled });
  const overview = useAnalytics((signal) => analytics.get('/real-market/overview', { commodity, state: stateParam }, { signal }), [commodity, stateParam], { enabled });

  const chart = useMemo(() => {
    const f = forecast.data;
    if (!f) return [];
    const history = f.history.slice(-60).map((h) => ({ date: h.date, price: h.price }));
    const future = f.forecast.map((p) => ({ date: p.date, point: p.point, lower: p.lower, upper: p.upper }));
    const bridge = history.length ? [{ ...history[history.length - 1], point: history[history.length - 1].price, lower: history[history.length - 1].price, upper: history[history.length - 1].price }] : [];
    return [...history.slice(0, -1), ...bridge, ...future];
  }, [forecast.data]);

  const seasonality = overview.data?.seasonality;

  return (
    <details open style={{ ...box, padding: 0 }}>
      <summary style={{ cursor: 'pointer', padding: '14px 16px', fontWeight: 700, fontSize: 16, listStyle: 'none' }}>
        ▸ Real market data (AGMARKNET)
        <span style={{ fontWeight: 400, fontSize: 12, color: '#777', marginLeft: 8 }}>Forecast, honest backtest and seasonality from real mandi prices</span>
      </summary>
      <div style={{ padding: '0 16px 16px' }}>
        {commodities.loading && <p style={note}>Loading…</p>}
        {commodities.error && <p style={{ fontSize: 13, color: '#c0392b' }}>⚠️ {describeError(commodities.error)}</p>}
        {!commodities.loading && !commodities.error && list.length === 0 && (
          <p style={note}>No real mandi history imported yet. Import AGMARKNET data to enable this section: see <code>docs/REAL_DATA.md</code>.</p>
        )}
        {!commodities.loading && list.length > 0 && !commodity && (
          <p style={note}>No imported AGMARKNET history matches “{crop}”. Imported commodities: {list.slice(0, 8).map((c) => c.commodity).join(', ')}{list.length > 8 ? '…' : ''}.</p>
        )}

        {commodity && (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <strong>{commodity}</strong>
              <label style={{ fontSize: 13 }}>Scope:{' '}
                <select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="state">{state}</option>
                  <option value="all">All India</option>
                </select>
              </label>
            </div>

            {forecast.loading && <p style={note}>Running the model comparison (this takes a few seconds the first time)…</p>}
            {forecast.error && (
              <p style={{ fontSize: 13, color: isNoDataError(forecast.error) ? '#8a6d00' : '#c0392b' }}>
                {isNoDataError(forecast.error) ? 'ℹ️ ' : '⚠️ '}{describeError(forecast.error)}
                {scope === 'state' && ' Try “All India”.'}
              </p>
            )}

            {forecast.data && (
              <>
                <div style={{ background: forecast.data.champion.beatsNaive ? '#e8f5e9' : '#fff8e1', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>
                  <strong>{forecast.data.champion.beatsNaive ? '✅ A model beat the baseline' : '⚖️ No model beat “price stays the same”'}</strong>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{forecast.data.champion.reason}</div>
                </div>

                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={['auto', 'auto']} /><Tooltip /><Legend />
                    <Line type="monotone" dataKey="price" name="Real price (₹/kg)" stroke="#2e7d32" dot={false} connectNulls />
                    <Line type="monotone" dataKey="point" name={`Forecast: ${forecast.data.champion.label}`} stroke="#ef6c00" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="upper" name="90% range (upper)" stroke="#ffb74d" strokeDasharray="4 4" dot={false} connectNulls />
                    <Line type="monotone" dataKey="lower" name="90% range (lower)" stroke="#ffb74d" strokeDasharray="4 4" dot={false} connectNulls />
                    <ReferenceLine x={forecast.data.lastObserved.date} stroke="#999" strokeDasharray="2 2" />
                  </LineChart>
                </ResponsiveContainer>
                <p style={note}>
                  Last real price ₹{forecast.data.lastObserved.price}/kg on {forecast.data.lastObserved.date}. The 90% range contained the real price{' '}
                  {pct(forecast.data.intervalCoverage.empirical)} of the time in out-of-sample testing (target 90%).
                  History: {forecast.data.dataQuality.daysInSeries} days from {forecast.data.dataQuality.marketsContributing} markets.
                </p>

                <h4 style={{ marginBottom: 6 }}>Model comparison (rolling-origin backtest, {forecast.data.evaluation.origins} test points)</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Model', 'MASE', 'MAE ₹/kg', 'Wins vs naive', 'p (corrected)', 'Verdict'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {forecast.data.leaderboard.map((r) => (
                        <tr key={r.model} style={r.model === forecast.data.champion.model ? { background: '#f1f8e9', fontWeight: 600 } : undefined}>
                          <td style={td}>{r.label}</td><td style={td}>{r.MASE}</td><td style={td}>{r.MAE}</td>
                          <td style={td}>{pct(r.winRateVsNaive)}</td><td style={td}>{r.dmPValueAdjusted ?? '-'}</td>
                          <td style={td}>{r.model === 'naive' ? 'baseline' : r.beatsNaive ? '✅ significantly better' : 'not better'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={note}>
                  MASE below 1 means better than the naive one-day change on the training data; lower is better. A model counts as “better” only if it beats naive
                  AND the Diebold-Mariano test is significant after correcting for testing several models at once.
                </p>
              </>
            )}

            {forecast.data && forecast.data.predictability?.available && (
              <div style={{ background: '#f5f7ff', borderRadius: 10, padding: '10px 14px', margin: '14px 0', fontSize: 13 }}>
                <strong>🔎 Is this price predictable at all?</strong>{' '}
                <span style={{ background: '#e8eaf6', borderRadius: 999, padding: '2px 10px', fontSize: 12 }}>{forecast.data.predictability.classification}</span>
                <div style={{ marginTop: 4 }}>{forecast.data.predictability.reading}</div>
                <div style={{ marginTop: 4, color: '#666' }}>
                  Ljung-Box p = {forecast.data.predictability.ljungBox.pValue ?? '-'} (small = daily changes have memory) · variance ratios:{' '}
                  {forecast.data.predictability.varianceRatios.map((v) => `${v.q}d: ${v.vr ?? '-'}`).join(', ')} (1.00 = random walk, above = momentum, below = mean reversion)
                </div>
              </div>
            )}

            {forecast.data && forecast.data.economicValue && (
              <div style={{ background: '#fffaf0', borderRadius: 10, padding: '10px 14px', margin: '14px 0', fontSize: 13 }}>
                <strong>💰 Would following this forecast have paid?</strong>
                <div style={{ marginTop: 4 }}>{forecast.data.economicValue.verdict}</div>
                <div style={{ marginTop: 4 }}>
                  Per decision ({forecast.data.economicValue.decisions} past test points, wait only if a rise of{' '}
                  {forecast.data.economicValue.waitThresholdPct}%+ was forecast): following the forecast{' '}
                  <strong>{forecast.data.economicValue.followForecast.meanGainPct}%</strong> (95% range{' '}
                  {forecast.data.economicValue.followForecast.ci95[0]}% to {forecast.data.economicValue.followForecast.ci95[1]}%), always waiting{' '}
                  {forecast.data.economicValue.alwaysWait.meanGainPct}%, selling now 0%.
                  {forecast.data.economicValue.hitRateWhenWait != null && ` When it said wait, prices rose ${pct(forecast.data.economicValue.hitRateWhenWait)} of the time.`}
                </div>
                <div style={{ marginTop: 4, color: '#888' }}>{forecast.data.economicValue.caveats.join(' ')}</div>
              </div>
            )}

            {forecast.data && forecast.data.caveats?.length > 0 && (
              <ul style={{ fontSize: 12, color: '#777', paddingLeft: 20 }}>
                {forecast.data.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}

            {overview.data && (
              <>
                <h4 style={{ marginBottom: 6 }}>When do prices peak?</h4>
                {seasonality?.index?.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={seasonality.index}>
                        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis domain={[0.7, 1.3]} /><Tooltip />
                        <ReferenceLine y={1} stroke="#999" /><Bar dataKey="index" name="Price index (1.00 = typical)" fill="#5c6bc0" />
                      </BarChart>
                    </ResponsiveContainer>
                    <p style={note}>
                      {seasonality.reliable ? `Usually highest in ${seasonality.highestMonths.join(', ')}; lowest in ${seasonality.lowestMonths.join(', ')}. ` : '⚠️ '}{seasonality.note}
                    </p>
                  </>
                ) : <p style={note}>{seasonality?.note}</p>}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
                  {overview.data.volatility?.available && <span style={{ background: '#f3f4f6', borderRadius: 999, padding: '4px 12px', fontSize: 13 }}>Volatility: <strong>{overview.data.volatility.level}</strong> ({overview.data.volatility.latestVolatilityPct}% / 30 days)</span>}
                  {overview.data.yearOnYear?.available && <span style={{ background: '#f3f4f6', borderRadius: 999, padding: '4px 12px', fontSize: 13 }}>vs last year: <strong>{overview.data.yearOnYear.changePct > 0 ? '+' : ''}{overview.data.yearOnYear.changePct}%</strong></span>}
                </div>

                {overview.data.marketSpread?.available && (
                  <>
                    <h4 style={{ marginBottom: 6 }}>Where it sells higher (last {overview.data.marketSpread.windowDays} days)</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Market', 'State', 'Median ₹/kg'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>{overview.data.marketSpread.highest.map((m) => <tr key={`${m.state}${m.market}`}><td style={td}>{m.market}</td><td style={td}>{m.state}</td><td style={td}>₹{m.medianPerKg}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <p style={note}>Prices differ by {overview.data.marketSpread.spreadPct}% across {overview.data.marketSpread.marketsCompared} markets. {overview.data.marketSpread.note}</p>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </details>
  );
}
