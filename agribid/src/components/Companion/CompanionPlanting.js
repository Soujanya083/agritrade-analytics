import React, { useMemo, useRef, useState } from 'react';
import './CompanionPlanting.css';
import CropIcon from './CropIcon';
import {
  CROPS, CATEGORIES, CATEGORY_META, STATUS_META, SOURCE_TYPE_LABEL, GENERAL_PRINCIPLES,
  filterCrops, checkPair, pairsFor, alternativesFor, catalogStats, sourceList,
} from '../../data/companionPlanting';

const EVIDENCE_NOTE =
  'Recommendations here are limited to combinations that field research supports, and each one lists its sources, benefits, risks and conditions. '
  + 'Extension services caution that many popular companion-planting claims have little or inconsistent evidence, so where nothing reliable was found this page says so instead of guessing.';

function SourceLinks({ ids }) {
  const list = sourceList(ids);
  if (list.length === 0) return null;
  return (
    <details className="cp-sources">
      <summary>{list.length} source{list.length === 1 ? '' : 's'}</summary>
      <ul>
        {list.map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
            <span className={`cp-src-type cp-src-type--${s.type}`}>{SOURCE_TYPE_LABEL[s.type]}</span>
            <span className="cp-src-checked">{s.verifiedOn ? `link checked ${s.verifiedOn}` : 'link not re-checked yet'}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// How strong is the evidence behind this card, in plain terms: how many studies the rules counted, whether any of
// it comes from India, and whether the numbers shown were checked against the source.
function EvidenceLine({ evidence }) {
  if (!evidence) return null;
  const { studies, reviews, indian, verifiedClaims, pendingClaims } = evidence;
  return (
    <div className="cp-evidence">
      <span className="cp-chip">{studies} research stud{studies === 1 ? 'y' : 'ies'} counted{reviews ? ` + ${reviews} review${reviews === 1 ? '' : 's'}` : ''}</span>
      <span className={`cp-chip ${indian ? 'cp-chip--in' : 'cp-chip--out'}`}>{indian ? 'Indian evidence' : 'Not from India'}</span>
      {verifiedClaims > 0 && <span className="cp-chip">{verifiedClaims} figure{verifiedClaims === 1 ? '' : 's'} checked against the source</span>}
      {pendingClaims > 0 && <span className="cp-chip cp-chip--warn">{pendingClaims} earlier figure{pendingClaims === 1 ? '' : 's'} not shown until verified</span>}
    </div>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  return <span className={`cp-badge cp-badge--${meta.tone}`}><span aria-hidden="true">{meta.icon}</span> {meta.label}</span>;
}

function Bullets({ title, items, tone }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`cp-bullets cp-bullets--${tone}`}>
      <h5>{title}</h5>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

function PairCard({ pair, partnerName }) {
  return (
    <article className={`cp-pair-card cp-pair-card--${STATUS_META[pair.status].tone}`}>
      <header>
        <h4>{partnerName}</h4>
        <StatusBadge status={pair.status} />
      </header>
      <p className="cp-pair-summary">{pair.summary}</p>
      {pair.partner && pair.partner.external && pair.partner.note && <p className="cp-note">{pair.partner.note}</p>}
      <Bullets title="Benefits reported" items={pair.benefits} tone="good" />
      <Bullets title="Risks and limits" items={pair.risks} tone="bad" />
      <Bullets title="Conditions" items={pair.conditions} tone="info" />
      {pair.region && <p className="cp-region">Evidence from: {pair.region}</p>}
      <EvidenceLine evidence={pair.evidence} />
      <SourceLinks ids={pair.sources} />
    </article>
  );
}

function Alternatives({ crop, compact }) {
  const alt = alternativesFor(crop);
  return (
    <section className="cp-alt" aria-label={`Evidence-based options for ${crop.name}`}>
      <h4>{compact ? `What the evidence does support for ${crop.name}` : 'Evidence-based options instead'}</h4>
      {alt.verified.length > 0 ? (
        <ul className="cp-alt-list">
          {alt.verified.map((v) => (
            <li key={v.partner}><strong>{v.partner}</strong> <StatusBadge status={v.status} /></li>
          ))}
        </ul>
      ) : (
        <p className="cp-note">No crop-specific pairing for {crop.name} could be verified in the research reviewed.</p>
      )}
      {alt.principles.map((p) => (
        <div key={p.key} className="cp-principle">
          <strong>{p.key === 'family' ? `${p.title} (${crop.name} is in the ${p.family} family)` : p.title}</strong>
          <p>{p.text}</p>
          <p className="cp-strength">Basis: {p.strength}</p>
          <SourceLinks ids={p.sources} />
        </div>
      ))}
    </section>
  );
}

function PairChecker() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const result = a && b ? checkPair(a, b) : null;
  const options = Object.keys(CATEGORY_META).map((cat) => (
    <optgroup key={cat} label={CATEGORY_META[cat].label}>
      {CROPS.filter((c) => c.category === cat).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
    </optgroup>
  ));

  return (
    <section className="cp-pair" aria-label="Compatibility checker">
      <h3>Can I grow these two together?</h3>
      <div className="cp-pair__row">
        <select value={a} onChange={(e) => setA(e.target.value)} aria-label="First crop"><option value="">First crop…</option>{options}</select>
        <span className="cp-pair__plus" aria-hidden="true">+</span>
        <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Second crop"><option value="">Second crop…</option>{options}</select>
      </div>
      <div aria-live="polite">
        {result && result.verdict === 'invalid' && <p className="cp-note">{result.message}</p>}
        {result && result.verdict !== 'invalid' && (
          <div className={`cp-verdict cp-verdict--${STATUS_META[result.verdict].tone}`}>
            <div className="cp-verdict__top">
              <div className="cp-verdict__icons"><CropIcon crop={result.a} size={44} /><span aria-hidden="true">+</span><CropIcon crop={result.b} size={44} /></div>
              <StatusBadge status={result.verdict} />
            </div>
            <p className="cp-verdict__msg">{result.message}</p>
            {result.pair ? (
              <>
                <Bullets title="Benefits reported" items={result.pair.benefits} tone="good" />
                <Bullets title="Risks and limits" items={result.pair.risks} tone="bad" />
                <Bullets title="Conditions" items={result.pair.conditions} tone="info" />
                <EvidenceLine evidence={result.pair.evidence} />
                <SourceLinks ids={result.pair.sources} />
              </>
            ) : (
              <>
                <Alternatives crop={result.a} compact />
                <Alternatives crop={result.b} compact />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CropDetail({ crop }) {
  const meta = CATEGORY_META[crop.category];
  const pairs = pairsFor(crop.id);
  return (
    <article className="cp-detail">
      <header className="cp-banner" style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}>
        <CropIcon crop={crop} size={84} className="cp-banner__icon" />
        <div>
          <h2>{crop.name}</h2>
          <p>{meta.label} · {crop.family} family{crop.season ? ` · typical season: ${crop.season}` : ''}</p>
          {crop.aliases.length > 0 && <p className="cp-aliases">Also: {crop.aliases.slice(0, 4).join(', ')}</p>}
        </div>
      </header>
      <div className="cp-detail-body">
        {pairs.all.length === 0 && (
          <div className="cp-empty-verdict">
            <StatusBadge status="insufficient" />
            <p>No verified companion pairing was found for <strong>{crop.name}</strong>. That is not a finding that it grows badly with anything; it means the research reviewed did not cover it, so none is recommended.</p>
          </div>
        )}
        {['supported', 'potential', 'unsuitable'].map((status) => pairs[status].length > 0 && (
          <section key={status}>
            <h3 className="cp-h">{STATUS_META[status].icon} {STATUS_META[status].label}</h3>
            {pairs[status].map((p) => <PairCard key={p.partner.name} pair={p} partnerName={p.partner.name} />)}
          </section>
        ))}
        {pairs.supported.length === 0 && pairs.potential.length === 0 && <Alternatives crop={crop} />}
        <p className="cp-season-note">Seasons are typical for India and vary by region and variety: confirm locally.</p>
      </div>
    </article>
  );
}

export default function CompanionPlanting() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All Crops');
  const [selectedId, setSelectedId] = useState('wheat');
  const detailRef = useRef(null);

  const crops = useMemo(() => filterCrops({ query, category }), [query, category]);
  const selected = crops.find((c) => c.id === selectedId) || crops[0] || null;
  const stats = useMemo(() => catalogStats(), []);

  const choose = (id) => {
    setSelectedId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 900 && detailRef.current && detailRef.current.scrollIntoView) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="cp-root">
      <div className="cp-hero">
        <h2>Companion Planting</h2>
        <p>{stats.total} crops. Pairings shown only where research supports them.</p>
      </div>
      <p className="cp-evidence-note">{EVIDENCE_NOTE} <a href={GENERAL_PRINCIPLES.caution && sourceList(GENERAL_PRINCIPLES.caution.sources)[0].url} target="_blank" rel="noopener noreferrer">Read the extension guidance</a>.</p>

      <PairChecker />

      <div className="cp-controls">
        <input type="search" className="cp-search" placeholder="Search a crop, a local name (gehu, tamatar), a family or a partner (azolla)…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search crops" />
        <div className="cp-cats" role="group" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`cp-cat ${category === c ? 'is-active' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
              <span aria-hidden="true">{c === 'All Crops' ? '🌍' : CATEGORY_META[c].icon}</span> {c === 'All Crops' ? c : CATEGORY_META[c].label}
              <span className="cp-cat__n">{c === 'All Crops' ? stats.total : stats.byCategory[c]}</span>
            </button>
          ))}
        </div>
        <p className="cp-count">{crops.length} crop{crops.length === 1 ? '' : 's'}</p>
      </div>

      <div className="cp-layout-grid">
        <div className="cp-grid" role="group" aria-label="Crops">
          {crops.map((crop) => {
            const meta = CATEGORY_META[crop.category];
            const verified = pairsFor(crop.id).all.filter((p) => p.status !== 'unsuitable').length;
            const warned = pairsFor(crop.id).unsuitable.length;
            const isSelected = Boolean(selected && selected.id === crop.id);
            return (
              <button key={crop.id} type="button" className={`cp-tile ${isSelected ? 'is-selected' : ''}`} style={{ background: `linear-gradient(160deg, ${meta.from}, ${meta.to}33)` }} onClick={() => choose(crop.id)} aria-pressed={isSelected}>
                <CropIcon crop={crop} size={52} />
                <span className="cp-tile__name">{crop.name}</span>
                <span className="cp-tile__family">{crop.family}</span>
                {verified > 0 && <span className="cp-tile__ok" title="Verified pairings">✅ {verified}</span>}
                {warned > 0 && <span className="cp-tile__foes" title="Documented conflicts">⛔ {warned}</span>}
              </button>
            );
          })}
          {crops.length === 0 && (
            <div className="cp-none"><span aria-hidden="true">🔎</span><p>No crops match “{query}” in this category. Try another name or clear the filter.</p></div>
          )}
        </div>
        <div ref={detailRef} className="cp-detail-wrap">
          {selected ? <CropDetail crop={selected} /> : <div className="cp-none"><span aria-hidden="true">🌱</span><p>Pick a crop to see what the research says.</p></div>}
        </div>
      </div>

      <p className="cp-disclaimer">
        Decision support, not agronomic advice. Results come from specific trials and conditions; row ratios, spacing, timing and varieties differ by region.
        Confirm with your state agricultural university, Krishi Vigyan Kendra (KVK) or agriculture officer before changing what you plant.
      </p>
    </section>
  );
}
