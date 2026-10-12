import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CompanionPlanting.css';
import {
  CROPS, CATEGORIES, CATEGORY_META, BENEFITS, EVIDENCE, filterCrops, checkPair,
} from '../../data/companionPlanting';

const VERDICT = {
  good: { icon: '✅', title: 'Good together' },
  avoid: { icon: '⛔', title: 'Keep apart' },
  mixed: { icon: '⚠️', title: 'Sources disagree' },
  unknown: { icon: '❔', title: 'Nothing documented' },
};

// Picture of how the crops sit in the field. Generated from the data, so a
// new crop with a `layout` gets a diagram for free.
export function FieldLayout({ crop }) {
  const { layout } = crop;
  if (!layout) return null;

  if (layout.type === 'layers') {
    return (
      <figure className="cp-layout">
        <div className="cp-layers" role="img" aria-label={layout.caption}>
          {layout.pattern.map((layer, i) => (
            <div key={layer.label} className={`cp-layer cp-layer--${i}`}>
              <span className="cp-layer__emoji" aria-hidden="true">{layer.emoji}</span>
              <span>{layer.label}</span>
            </div>
          ))}
        </div>
        <figcaption>{layout.caption}</figcaption>
      </figure>
    );
  }

  const entries = layout.pattern.map((p) => (p === 'main' ? { emoji: crop.emoji, name: crop.name, main: true } : crop.friends[p]));
  const legend = [{ emoji: crop.emoji, name: crop.name }, ...[...new Set(layout.pattern.filter((p) => p !== 'main'))].map((p) => crop.friends[p])];

  return (
    <figure className="cp-layout">
      <div className="cp-field" role="img" aria-label={`${layout.caption}. ${legend.map((l) => l.name).join(', ')}`}>
        {entries.map((entry, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className={`cp-strip ${entry.main ? 'cp-strip--main' : 'cp-strip--friend'}`}>
            {[0, 1, 2, 3].map((n) => <span key={n} aria-hidden="true">{entry.emoji}</span>)}
          </div>
        ))}
      </div>
      <div className="cp-legend">
        {legend.map((l) => <span key={l.name}><span aria-hidden="true">{l.emoji}</span> {l.name}</span>)}
      </div>
      <figcaption>{layout.caption}</figcaption>
    </figure>
  );
}

function PairChecker() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const result = a && b ? checkPair(a, b) : null;
  const options = CROPS.map((c) => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>);

  return (
    <section className="cp-pair" aria-label="Pair checker">
      <h3>Can I plant these together?</h3>
      <div className="cp-pair__row">
        <select value={a} onChange={(e) => setA(e.target.value)} aria-label="First crop">
          <option value="">First crop…</option>{options}
        </select>
        <span className="cp-pair__plus" aria-hidden="true">+</span>
        <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Second crop">
          <option value="">Second crop…</option>{options}
        </select>
      </div>
      {result && (
        <div className={`cp-verdict cp-verdict--${result.verdict}`} role="status">
          <span className="cp-verdict__icon" aria-hidden="true">{VERDICT[result.verdict].icon}</span>
          <div>
            <strong>{VERDICT[result.verdict].title}</strong>
            <p>{result.message}</p>
            {result.reason && <small>{result.reason}</small>}
          </div>
        </div>
      )}
    </section>
  );
}

function CompanionTile({ item, tone, showWhy }) {
  const [open, setOpen] = useState(false);
  const expanded = showWhy || open;
  const benefit = item.benefit ? BENEFITS[item.benefit] : null;
  return (
    <button
      type="button"
      className={`cp-friend cp-friend--${tone} ${expanded ? 'is-open' : ''}`}
      onClick={() => setOpen((v) => !v)}
      aria-expanded={expanded}
    >
      <span className="cp-friend__emoji" aria-hidden="true">{item.emoji}</span>
      <span className="cp-friend__name">{item.name}</span>
      {benefit && <span className="cp-chip" title={benefit.label}><span aria-hidden="true">{benefit.icon}</span> {benefit.label}</span>}
      {expanded && <span className="cp-friend__why">{item.why}</span>}
    </button>
  );
}

function CropDetail({ crop, showWhy }) {
  const meta = CATEGORY_META[crop.category];
  const evidence = EVIDENCE[crop.evidence];
  return (
    <article className="cp-detail">
      <header className="cp-banner" style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}>
        <span className="cp-banner__emoji" aria-hidden="true">{crop.emoji}</span>
        <div>
          <h2>{crop.name}</h2>
          <p>{crop.category} · {crop.season}</p>
          <span className="cp-evidence" title="How well supported this pairing is">
            <span aria-hidden="true">{evidence.icon}</span> {evidence.label}
          </span>
        </div>
      </header>

      <section>
        <h3 className="cp-h cp-h--good"><span aria-hidden="true">🤝</span> Grow together</h3>
        <div className="cp-friends">
          {crop.friends.map((fr) => <CompanionTile key={fr.name} item={fr} tone="good" showWhy={showWhy} />)}
        </div>
      </section>

      <section>
        <h3 className="cp-h cp-h--bad"><span aria-hidden="true">⛔</span> Keep apart</h3>
        {crop.foes.length > 0 ? (
          <div className="cp-friends">
            {crop.foes.map((fo) => <CompanionTile key={fo.name} item={fo} tone="bad" showWhy={showWhy} />)}
          </div>
        ) : (
          <p className="cp-empty-note">No widely documented conflicts for {crop.name}. (That is not a guarantee - check with your KVK.)</p>
        )}
      </section>

      {crop.next && (
        <section>
          <h3 className="cp-h"><span aria-hidden="true">🔄</span> Good to grow next season</h3>
          <div className="cp-next">{crop.next.map((n) => <span key={n} className="cp-pill">{n}</span>)}</div>
        </section>
      )}

      <FieldLayout crop={crop} />

      <p className="cp-tip"><span aria-hidden="true">💡</span> {crop.tip}</p>
    </article>
  );
}

export default function CompanionPlanting() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All Crops');
  const [selectedId, setSelectedId] = useState(null);
  const [showWhy, setShowWhy] = useState(false);
  const detailRef = useRef(null);

  const crops = useMemo(() => filterCrops({ query, category }), [query, category]);
  const selected = crops.find((c) => c.id === selectedId) || crops[0] || null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const choose = (id) => {
    setSelectedId(id);
    // On phones the detail sits below the grid - bring it into view.
    if (window.innerWidth < 900 && detailRef.current && detailRef.current.scrollIntoView) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="cp-root">
      <div className="cp-hero">
        <div>
          <h2>Companion Planting</h2>
          <p>Which crops help each other - and which to keep apart. Tap a crop to see it.</p>
        </div>
        <label className="cp-switch">
          <input type="checkbox" checked={showWhy} onChange={(e) => setShowWhy(e.target.checked)} />
          <span>Show explanations</span>
        </label>
      </div>

      <PairChecker />

      <div className="cp-controls">
        <input
          type="search"
          className="cp-search"
          placeholder="Search a crop, a local name (gehu, tamatar) or a companion (marigold)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search crops"
        />
        <div className="cp-cats" role="group" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`cp-cat ${category === c ? 'is-active' : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              <span aria-hidden="true">{c === 'All Crops' ? '🌍' : CATEGORY_META[c].icon}</span> {c}
            </button>
          ))}
        </div>
        <p className="cp-count">{crops.length} crop{crops.length === 1 ? '' : 's'}</p>
      </div>

      <div className="cp-layout-grid">
        <div className="cp-grid" role="group" aria-label="Crops">
          {crops.map((crop) => {
            const meta = CATEGORY_META[crop.category];
            return (
              <button
                key={crop.id}
                type="button"
                className={`cp-tile ${selected && selected.id === crop.id ? 'is-selected' : ''}`}
                style={{ background: `linear-gradient(160deg, ${meta.from}, ${meta.to}33)` }}
                onClick={() => choose(crop.id)}
                aria-pressed={Boolean(selected && selected.id === crop.id)}
              >
                <span className="cp-tile__emoji" aria-hidden="true">{crop.emoji}</span>
                <span className="cp-tile__name">{crop.name}</span>
                <span className="cp-tile__friends" aria-label={`${crop.friends.length} companions`}>
                  {crop.friends.slice(0, 3).map((fr) => <span key={fr.name} aria-hidden="true">{fr.emoji}</span>)}
                </span>
                {crop.foes.length > 0 && <span className="cp-tile__foes" aria-label={`${crop.foes.length} to avoid`}>⛔ {crop.foes.length}</span>}
              </button>
            );
          })}
          {crops.length === 0 && (
            <div className="cp-none">
              <span aria-hidden="true">🔎</span>
              <p>No crops match “{query}”. Try a different name or clear the category filter.</p>
            </div>
          )}
        </div>

        <div ref={detailRef} className="cp-detail-wrap">
          {selected ? <CropDetail crop={selected} showWhy={showWhy} /> : <div className="cp-none"><span aria-hidden="true">🌱</span><p>Pick a crop to see its companions.</p></div>}
        </div>
      </div>

      <p className="cp-disclaimer">
        General guidance compiled from standard companion-planting practice and published intercropping trials. Field layouts are
        illustrations - row ratios, spacing and timing vary with region, soil and variety. Confirm with your local Krishi Vigyan
        Kendra (KVK) or agriculture officer before changing what you plant.
      </p>
    </section>
  );
}
