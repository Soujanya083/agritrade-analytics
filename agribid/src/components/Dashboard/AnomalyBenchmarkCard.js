import React from 'react';
import { analytics, describeError } from '../../api/analyticsClient';
import { useAnalytics } from '../../api/useAnalytics';

const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#555' };
const td = { padding: '6px 8px', borderBottom: '1px solid #f3f3f3', fontSize: '13px' };
const DETECTORS = [
  ['zScore', 'Z-score'], ['iqr', 'IQR'], ['isolationForest', 'Isolation Forest'], ['atLeastTwo', '2 of 3 agree'], ['allThree', 'All 3 agree (high confidence)'],
];
const pct = (v) => (v == null ? '-' : `${Math.round(v * 100)}%`);

// "How reliable are these flags?" - the detectors scored on bids with KNOWN
// injected anomalies (the only way to validate them without real labels).
export default function AnomalyBenchmarkCard({ magnitude = 1.3 }) {
  const state = useAnalytics((signal) => analytics.get('/bid-anomalies/benchmark', null, { signal }), []);
  if (state.loading) return null;
  if (state.error) return <p style={{ fontSize: 12, color: '#c0392b' }}>⚠️ {describeError(state.error)}</p>;
  const rows = state.data.results.filter((r) => r.magnitude === magnitude);
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>How reliable are these flags? (validated on injected anomalies)</summary>
      <p style={{ fontSize: 12, color: '#666' }}>
        Known anomalies were injected into synthetic bids ({magnitude}× the asking price, {Math.round(state.data.setup.anomalyRate * 100)}% of bids,
        {' '}{state.data.setup.runsPerMagnitude} runs) and each detector was scored. Recall = anomalies caught; precision = flags that were real;
        false alarms = normal bids wrongly flagged.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Detector', 'Recall', 'Precision', 'False alarms'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {DETECTORS.map(([key, label]) => {
              const r = rows.find((x) => x.detector === key);
              return r && (
                <tr key={key}><td style={td}>{label}</td><td style={td}>{pct(r.recall)}</td><td style={td}>{pct(r.precision)}</td><td style={td}>{(r.falsePositiveRate * 100).toFixed(1)}%</td></tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul style={{ fontSize: 12, color: '#777', paddingLeft: 20 }}>{state.data.reading.map((t) => <li key={t}>{t}</li>)}</ul>
    </details>
  );
}
