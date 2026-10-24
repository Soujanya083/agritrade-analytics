import React from 'react';
import { analytics, describeError } from '../../api/analyticsClient';
import { useAnalytics } from '../../api/useAnalytics';

const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#555' };
const td = { padding: '6px 8px', borderBottom: '1px solid #f3f3f3', fontSize: '13px' };
const chip = { background: '#f3f4f6', borderRadius: 999, padding: '4px 12px', fontSize: 13 };
const note = { fontSize: 12, color: '#777', marginTop: 8 };
const rupees = (v) => (v == null ? '-' : `₹${v}`);

// Presentational part (easy to test): shows the date and source of every price, and says so
// plainly when the data is not from today.
export function TodayPricesView({ data, maxRows = 10 }) {
  const s = data.summary;
  const rows = data.rows.slice(0, maxRows);
  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: data.isCurrent ? '#2e7d32' : '#b26a00' }}>
        {data.isCurrent
          ? `✅ Prices reported ${data.asOf}`
          : `⚠️ Not today's prices: the latest records are from ${data.asOf} (${data.ageDays} days old)`}
        {' · '}Source: {data.source === 'live' ? 'AGMARKNET (data.gov.in), live' : 'saved snapshot of AGMARKNET data'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={chip}>Median <strong>{rupees(s.medianPerKg)}/kg</strong></span>
        <span style={chip}>Lowest <strong>{rupees(s.lowPerKg)}/kg</strong></span>
        <span style={chip}>Highest <strong>{rupees(s.highPerKg)}/kg</strong></span>
        <span style={chip}>{s.marketsReported} markets</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={th}>Market</th><th style={th}>Variety</th><th style={th}>Modal ₹/kg</th><th style={th}>Range ₹/kg</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.market}-${r.variety}-${r.grade}`}>
                <td style={td}>{r.market}<br /><span style={{ color: '#888', fontSize: 11 }}>{[r.district, r.state].filter(Boolean).join(', ')}</span></td>
                <td style={td}>{r.variety || '-'}</td>
                <td style={td}><strong>{rupees(r.modalPricePerKg)}</strong>{r.unusual ? ' ⚠ unusual' : ''}</td>
                <td style={td}>{rupees(r.minPricePerKg)} - {rupees(r.maxPricePerKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={note}>{data.note}{data.unusualMarkets > 0 ? ` ${data.unusualMarkets} market(s) with unusual prices are marked and left out of the summary.` : ''}</p>
    </div>
  );
}

export default function TodayPrices({ crop, state }) {
  const result = useAnalytics((signal) => analytics.get('/today-prices', { commodity: crop, state }, { signal }), [crop, state], { enabled: Boolean(crop) });
  if (result.loading && !result.data) return <p style={note}>Loading today's prices…</p>;
  if (result.error && !result.data) return <p style={{ ...note, color: '#b26a00' }}>⚠️ {describeError(result.error)}</p>;
  if (!result.data) return null;
  return <TodayPricesView data={result.data} />;
}
