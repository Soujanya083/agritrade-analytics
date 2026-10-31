import React from 'react';

// The "what does this mean for me?" card. Pure presentation: every number
// comes from GET /decision-summary, which computes it from the project's own
// models and data. A missing number is shown as "-" (never filled in), and
// the confidence rule and limitations the server returns are always shown.

const rupee = (value, suffix = '') => (value == null ? '-' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`);

const CONFIDENCE_STYLE = {
  High: { bg: '#e8f5e9', color: '#1b5e20', icon: '🟢' },
  Medium: { bg: '#fff8e1', color: '#8a6d00', icon: '🟡' },
  Low: { bg: '#fdecea', color: '#b71c1c', icon: '🔴' },
};
const DEMAND_ICON = { High: '🔥', Medium: '📈', Low: '🧊', Unknown: '❔' };

export const Stat = ({ icon, label, value, hint, tone }) => (
  <div style={{ background: tone === 'good' ? '#f1f8e9' : tone === 'bad' ? '#fdecea' : '#f8f9fa', border: '1px solid #eee', borderRadius: '12px', padding: '12px 14px', minWidth: 0 }}>
    <div style={{ fontSize: '12px', color: '#666' }}><span aria-hidden="true">{icon}</span> {label}</div>
    <div style={{ fontSize: '22px', fontWeight: 700, margin: '2px 0', overflowWrap: 'anywhere' }}>{value}</div>
    {hint && <div style={{ fontSize: '11px', color: '#888' }}>{hint}</div>}
  </div>
);

export default function DecisionSummaryCard({ summary, loading, error, crop, quantityKg }) {
  if (loading && !summary) return <div style={card}><p style={{ margin: 0 }}>Working out what this means for you…</p></div>;
  if (error && !summary) return <div style={card}><p style={{ margin: 0, color: '#8a6d00' }}>⚠️ {error}</p></div>;
  if (!summary) return null;

  const conf = CONFIDENCE_STYLE[summary.confidence?.level] || CONFIDENCE_STYLE.Low;
  const hasTotals = summary.expectedRevenue != null;
  const net = summary.expectedNetProfit;
  // Profit is shown as a RANGE (pessimistic -> best case), because the single number
  // is an estimate built from assumed costs; absent for older API responses.
  const bandQ = summary.netProfitBandPerQuintal;
  const bandTotal = summary.netProfitBandTotal;
  const bandHint = (b) => (b ? `Range ${rupee(b.conservative)} to ${rupee(b.optimistic)} (pessimistic to best case)` : undefined);

  return (
    <section style={card} aria-label="Decision summary">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>What this means for you</h3>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#666' }}>
            {crop}{quantityKg ? ` · ${Number(quantityKg).toLocaleString('en-IN')} kg` : ''} · computed from this marketplace's data and live mandi prices
          </p>
        </div>
        <span style={{ background: conf.bg, color: conf.color, borderRadius: '999px', padding: '4px 12px', fontSize: '13px', fontWeight: 600 }}>
          {conf.icon} {summary.confidence?.level || 'Low'} confidence
        </span>
      </div>

      <div style={{ background: 'linear-gradient(135deg,#2e7d32,#66bb6a)', color: '#fff', borderRadius: '14px', padding: '14px 16px', margin: '14px 0', fontWeight: 600, fontSize: '16px' }}>
        <span aria-hidden="true">👉</span> {summary.actionText}
        {summary.timing && <div style={{ fontWeight: 400, fontSize: '13px', marginTop: '4px', opacity: 0.95 }}>Timing: {summary.timing.recommendation} — {summary.timing.reason}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '10px' }}>
        <Stat
          icon="🏷️"
          label="Predicted price (+7 days)"
          value={summary.predictedPrice != null ? rupee(summary.predictedPrice, '/kg') : '-'}
          hint={summary.predictedPriceModel
            ? `${summary.predictedPriceRange ? `90% range ${rupee(summary.predictedPriceRange.lower)}–${rupee(summary.predictedPriceRange.upper)} · ` : ''}${summary.predictedPriceSource === 'agmarknet_real' ? '📈 Real mandi data · ' : ''}Model: ${summary.predictedPriceModel}`
            : (summary.forecastUnavailableReason ? 'Forecast withheld: the price history behind it is too old' : 'No price history yet')}
        />
        {summary.todayMandiPrice && (
          <Stat icon="🧺" label="Today's mandi price (median)" value={rupee(summary.todayMandiPrice.pricePerKg, '/kg')}
            hint={`${summary.todayMandiPrice.asOf ? `as of ${summary.todayMandiPrice.asOf} · ` : ''}${summary.todayMandiPrice.marketsCompared} markets${summary.todayMandiPrice.source === 'live' ? ' · live' : ''}`} />
        )}
        <Stat icon={DEMAND_ICON[summary.demandLevel] || '❔'} label="Demand" value={summary.demandLevel} hint={summary.opportunityScore != null ? `Opportunity score ${summary.opportunityScore}` : undefined} />
        <Stat icon="📍" label="Best market" value={summary.bestMarket || '-'} hint={summary.bestMarketState ? `${summary.bestMarketDistrict}, ${summary.bestMarketState} · ${rupee(summary.bestMarketModalPricePerQuintal, '/quintal')}` : undefined} />
        {hasTotals && <Stat icon="💵" label="Expected revenue" value={rupee(summary.expectedRevenue)} hint="At the best market's modal price" />}
        {hasTotals && <Stat icon="🚚" label="Expected cost" value={rupee(summary.expectedCost)} hint={bandQ ? 'Assumed transport, storage, fees, handling and shrinkage' : 'Assumed transport + storage'} />}
        {hasTotals && <Stat icon="✅" label="Expected net profit" value={rupee(net)} hint={bandHint(bandTotal)} tone={net > 0 ? 'good' : 'bad'} />}
        {!hasTotals && summary.expectedNetProfitPerQuintal != null && <Stat icon="✅" label="Net profit per quintal" value={rupee(summary.expectedNetProfitPerQuintal)} hint={bandHint(bandQ) || 'Enter a quantity for totals'} tone={summary.expectedNetProfitPerQuintal > 0 ? 'good' : 'bad'} />}
        {summary.platformForecast && <Stat icon="🛒" label="If sold on AgriTrade" value={rupee(summary.platformForecast.expectedPayout)} hint={`At forecast price, after ${summary.platformForecast.platformFeePercent}% fee`} />}
      </div>

      <details style={{ marginTop: '14px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Why this confidence level, and what to keep in mind</summary>
        {summary.forecastUnavailableReason && (
          <p style={{ fontSize: '12px', color: '#8a6d00', background: '#fff8e1', borderRadius: 8, padding: '6px 10px' }}>ℹ️ {summary.forecastUnavailableReason}</p>
        )}
        <ul style={{ fontSize: '13px', color: '#444', paddingLeft: '20px' }}>
          {(summary.confidence?.reasons || []).map((r) => <li key={r}>{r}</li>)}
        </ul>
        {summary.dataProvenance && summary.dataProvenance.syntheticPercent > 0 && summary.predictedPriceSource !== 'agmarknet_real' && (
          <p style={{ fontSize: '12px', color: '#b45309', background: '#fff3e0', borderRadius: 8, padding: '6px 10px' }}>
            ⚠️ {summary.dataProvenance.message}
          </p>
        )}
        {summary.robustness && summary.robustness.stable === false && (
          <p style={{ fontSize: '12px', color: '#8a6d00', background: '#fff8e1', borderRadius: 8, padding: '6px 10px' }}>
            ℹ️ The best market changes if costs turn out higher than assumed, so compare the top two or three before travelling.
          </p>
        )}
        {summary.marketplacePredictedPrice != null && (
          <p style={{ fontSize: '12px', color: '#555' }}>
            For comparison, the marketplace's own listing history suggests {rupee(summary.marketplacePredictedPrice, '/kg')}.
          </p>
        )}
        <p style={{ fontSize: '12px', color: '#777', marginBottom: 4 }}>Limitations</p>
        <ul style={{ fontSize: '12px', color: '#666', paddingLeft: '20px', marginTop: 0 }}>
          {(summary.limitations || []).map((l) => <li key={l}>{l}</li>)}
          {summary.mandiDataSource && <li>Mandi price source: {summary.mandiDataSource === 'cached_snapshot' ? 'a saved snapshot (no live API key configured), so it may be out of date' : summary.mandiDataSource === 'imported_agmarknet' ? `imported AGMARKNET history${summary.mandiDataAsOf ? ` up to ${summary.mandiDataAsOf}` : ''} (historical, not today's prices; a data.gov.in API key gives live prices)` : summary.mandiDataSource}.</li>}
        </ul>
        {(summary.warnings || []).length > 0 && (
          <p style={{ fontSize: '12px', color: '#8a6d00' }}>Some parts could not be calculated: {summary.warnings.join(' · ')}</p>
        )}
      </details>
    </section>
  );
}

const card = { background: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,.06)' };
