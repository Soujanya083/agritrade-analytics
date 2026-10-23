import React from 'react';

// CropIcon - a crop-specific illustration for every crop.
//   * Emoji icons are used only where Unicode has an exact emoji for the crop (Unicode 12 or older, so
//     they also render on older Windows/Android).
//   * Everything else is drawn here as an SVG built from a small set of archetypes (fruit, pod, seeds,
//     ear, leaf, root, head, gourd, tuber, flower, cane, boll, cluster). Each crop passes its own colours
//     and shape, and the catalog test fails if two crops end up with the same icon.
//   * If a crop has no usable icon the component shows a lettered badge instead of breaking.

const shade = (hex, amount) => {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amount));
  const r = c((n >> 16) & 255); const g = c((n >> 8) & 255); const b = c(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

const Leaf = ({ x, y, rot = 0, s = 1, fill }) => (
  <path transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} d="M0 0 C6 -6 14 -6 18 0 C14 6 6 6 0 0Z" fill={fill} />
);

// ---------------------------------------------------------------- fruit
const FRUIT_BODY = {
  round: 'M32 17 C47 15 53 28 50 40 C47 52 38 56 32 54 C26 56 17 52 14 40 C11 28 17 15 32 17Z',
  oval: 'M32 10 C46 12 50 30 47 42 C44 54 38 58 32 58 C26 58 20 54 17 42 C14 30 18 12 32 10Z',
  tall: 'M32 9 C44 11 47 28 44 42 C42 53 37 58 32 58 C27 58 22 53 20 42 C17 28 20 11 32 9Z',
  heart: 'M32 20 C38 12 52 16 51 30 C50 44 38 54 32 56 C26 54 14 44 13 30 C12 16 26 12 32 20Z',
  pear: 'M32 12 C39 12 40 22 42 29 C52 36 52 52 40 56 C34 58 30 58 24 56 C12 52 12 36 22 29 C24 22 25 12 32 12Z',
  bell: 'M18 22 C22 16 28 18 32 20 C36 18 42 16 46 22 C52 30 50 46 44 54 C40 58 36 52 32 54 C28 52 24 58 20 54 C14 46 12 30 18 22Z',
};

function Fruit({ body, hi = '#ffffff66', shape = 'round', leaf, navel, blush, crown, bumps, scales, small, ridge, citrus }) {
  const g = small ? 'translate(32 36) scale(0.72) translate(-32 -36)' : undefined;
  return (
    <g transform={g}>
      <path d={FRUIT_BODY[shape] || FRUIT_BODY.round} fill={body} stroke={shade(body, -35)} strokeWidth="1.2" />
      {blush && <ellipse cx="42" cy="38" rx="9" ry="12" fill={blush} opacity="0.55" />}
      {ridge && [24, 32, 40].map((x) => <path key={x} d={`M${x} 22 Q${x + (x < 32 ? -3 : x > 32 ? 3 : 0)} 38 ${x} 52`} stroke={shade(body, -30)} strokeWidth="1" fill="none" />)}
      {bumps && [[22, 28], [32, 24], [42, 28], [26, 38], [38, 38], [20, 46], [32, 44], [44, 46], [28, 52], [38, 52]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill={bumps} />)}
      {scales && [[22, 24], [34, 20], [44, 28], [18, 38], [30, 34], [42, 40], [24, 50], [36, 50]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y} l5 -8 l4 8z`} fill={scales} />)}
      {navel && <circle cx="32" cy="52" r="2.6" fill={shade(body, -45)} />}
      {crown && <path d="M26 17 L29 10 L32 15 L35 10 L38 17Z" fill={crown} />}
      <ellipse cx="25" cy="30" rx="5" ry="8" fill={hi} transform="rotate(-18 25 30)" />
      {citrus && [[24, 30], [34, 26], [42, 34], [28, 40], [38, 44], [22, 44], [32, 34]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.9" fill={shade(body, -45)} />)}
      {!crown && !citrus && <path d="M32 18 Q33 11 36 8" stroke="#6d4c41" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {leaf && <Leaf x={34} y={14} rot={-30} s={1.1} fill={leaf} />}
    </g>
  );
}

// ---------------------------------------------------------------- pods and seeds
function Pod({ pod, seed, n = 4, hairy, shape = 'long' }) {
  const len = { long: 50, fat: 42, flat: 40, short: 30 }[shape] || 44;
  const thick = { long: 7, fat: 12, flat: 9, short: 12 }[shape] || 9;
  const xs = Array.from({ length: n }, (_, i) => -len / 2 + 6 + (i * (len - 12)) / Math.max(n - 1, 1));
  return (
    <g transform="translate(32 34) rotate(-32)">
      <rect x={-len / 2} y={-thick / 2} width={len} height={thick} rx={thick / 2} fill={pod} stroke={shade(pod, -35)} strokeWidth="1.2" />
      {xs.map((x) => <ellipse key={x} cx={x} cy="0" rx={shape === 'fat' ? 3.8 : 2.8} ry={shape === 'fat' ? 4.2 : 2.6} fill={seed} stroke={shade(seed, -30)} strokeWidth="0.6" />)}
      {hairy && xs.slice(0, -1).map((x) => <path key={`h${x}`} d={`M${x + 4} ${-thick / 2} l1 -3 M${x + 7} ${thick / 2} l1 3`} stroke={shade(pod, -30)} strokeWidth="0.8" />)}
      <path d={`M${len / 2 - 2} 0 l7 -2`} stroke={shade(pod, -40)} strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

const SEED_POS = [[16, 44], [26, 48], [36, 49], [46, 45], [22, 38], [32, 40], [42, 37], [52, 40], [18, 30], [28, 31], [38, 28], [48, 30], [24, 22], [34, 20], [44, 22], [30, 12]];
function Seeds({ c, shape = 'round', eye }) {
  const size = { round: [5, 5], tiny: [2.8, 2.8], oval: [5.2, 3.4], flat: [5.4, 4.6], kidney: [5.4, 3.6], tri: [5, 5] }[shape] || [5, 5];
  const pts = shape === 'tiny' ? SEED_POS.flatMap(([x, y]) => [[x, y], [x + 3, y - 3], [x - 3, y + 3]]) : SEED_POS;
  return (
    <g>
      {pts.map(([x, y], i) => {
        const fill = c[i % c.length];
        const common = { fill, stroke: shade(fill, -40), strokeWidth: 0.7 };
        if (shape === 'tri') return <path key={i} d={`M${x} ${y - 5} L${x + 5} ${y + 4} L${x - 5} ${y + 4}Z`} {...common} />;
        if (shape === 'kidney') return <path key={i} transform={`rotate(${(i % 3) * 30 - 30} ${x} ${y})`} d={`M${x - 5} ${y} C${x - 5} ${y - 5} ${x + 5} ${y - 5} ${x + 5} ${y} C${x + 3} ${y + 3} ${x - 3} ${y + 3} ${x - 5} ${y}Z`} {...common} />;
        return (
          <g key={i}>
            <ellipse cx={x} cy={y} rx={size[0]} ry={size[1]} transform={`rotate(${(i % 4) * 25} ${x} ${y})`} {...common} />
            {eye && <ellipse cx={x} cy={y} rx="1.6" ry="1.1" fill={eye} />}
            {shape === 'round' && <path d={`M${x - 2} ${y - 3} q2 -2 4 0`} stroke={shade(fill, 25)} strokeWidth="0.8" fill="none" />}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------- cereal ears
function Ear({ grain, stalk = '#8d9a3a', style = 'wheat' }) {
  const darker = shade(grain, -40);
  const stem = <path d="M32 62 C32 50 32 40 32 30" stroke={stalk} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
  if (style === 'wheat' || style === 'barley') {
    const rows = Array.from({ length: 7 }, (_, i) => 12 + i * 5.4);
    return (
      <g>{stem}
        {rows.map((y) => (
          <g key={y}>
            <ellipse cx="27" cy={y + 4} rx="3.2" ry="5" transform={`rotate(-25 27 ${y + 4})`} fill={grain} stroke={darker} strokeWidth="0.7" />
            <ellipse cx="37" cy={y + 4} rx="3.2" ry="5" transform={`rotate(25 37 ${y + 4})`} fill={grain} stroke={darker} strokeWidth="0.7" />
            {style === 'barley' && <path d={`M26 ${y} L18 ${y - 8} M38 ${y} L46 ${y - 8}`} stroke={darker} strokeWidth="0.8" />}
          </g>
        ))}
        <ellipse cx="32" cy="9" rx="3" ry="5" fill={grain} stroke={darker} strokeWidth="0.7" />
        {style === 'wheat' && <path d="M32 5 L32 0" stroke={darker} strokeWidth="0.8" />}
      </g>
    );
  }
  if (style === 'oat' || style === 'panicle' || style === 'foxtail') {
    const spikelets = style === 'foxtail'
      ? Array.from({ length: 11 }, (_, i) => [34 + i * 1.2, 14 + i * 4.2])
      : [[30, 14], [38, 18], [26, 24], [40, 28], [30, 32], [36, 38], [24, 36], [42, 20]];
    return (
      <g>
        <path d="M32 62 C32 44 30 28 36 14 C40 8 48 10 50 18" stroke={stalk} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {spikelets.map(([x, y], i) => (style === 'oat'
          ? <g key={i}><path d={`M${x} ${y} l0 -4`} stroke={stalk} strokeWidth="0.8" /><ellipse cx={x} cy={y + 3} rx="2.6" ry="4.2" fill={grain} stroke={darker} strokeWidth="0.6" /></g>
          : <ellipse key={i} cx={x} cy={y} rx={style === 'foxtail' ? 4 : 2.4} ry={style === 'foxtail' ? 3 : 2.4} transform={`rotate(${i * 20} ${x} ${y})`} fill={grain} stroke={darker} strokeWidth="0.5" />))}
      </g>
    );
  }
  if (style === 'head') {
    return (<g>{stem}<ellipse cx="32" cy="18" rx="11" ry="15" fill={grain} stroke={darker} strokeWidth="1.2" />{[[26, 10], [36, 10], [24, 20], [34, 20], [42, 20], [28, 28], [38, 28]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill={shade(grain, 25)} />)}</g>);
  }
  if (style === 'spike') {
    return (<g>{stem}<rect x="26" y="4" width="12" height="34" rx="6" fill={grain} stroke={darker} strokeWidth="1.2" />{Array.from({ length: 8 }, (_, i) => <path key={i} d={`M27 ${10 + i * 4} q5 3 10 0`} stroke={shade(grain, -25)} strokeWidth="0.9" fill="none" />)}</g>);
  }
  // fingers (finger millet / kodo millet)
  return (
    <g>{stem}
      {[-34, -17, 0, 17, 34].map((a) => (
        <g key={a} transform={`rotate(${a} 32 36)`}><path d="M32 36 C31 24 33 14 32 6" stroke={grain} strokeWidth="5" strokeLinecap="round" fill="none" /><path d="M32 34 C31 24 33 14 32 8" stroke={darker} strokeWidth="1" strokeDasharray="1.6 2.4" fill="none" /></g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------- leaves and herbs
function LeafPlant({ c1, c2, shape = 'oval' }) {
  const stem = '#558b2f';
  switch (shape) {
    case 'trifoliate':
      return (<g>{[[-28, 40], [0, 46], [28, 40]].map(([a, h]) => (<g key={a} transform={`rotate(${a} 32 60)`}><path d={`M32 60 L32 ${60 - h}`} stroke={stem} strokeWidth="1.6" />{[[32, 60 - h - 4, 0], [25, 60 - h + 6, 0], [39, 60 - h + 6, 0]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="6" ry="8" fill={i ? c2 : c1} stroke={shade(c1, -30)} strokeWidth="0.6" />)}</g>))}</g>);
    case 'lobed':
      return (<g transform="translate(32 40) scale(1.4) translate(-32 -40)"><path d="M32 60 L32 34" stroke={stem} strokeWidth="2" />{[[0, 0], [-35, 0], [35, 0]].map(([a]) => (<path key={a} transform={`rotate(${a} 32 40)`} d="M32 40 C24 38 22 30 27 26 C24 20 30 16 32 20 C34 16 40 20 37 26 C42 30 40 38 32 40Z" fill={a ? c2 : c1} stroke={shade(c1, -30)} strokeWidth="0.8" />))}</g>);
    case 'serrated':
      return (<g transform="translate(32 40) scale(1.3) translate(-32 -40)"><path d="M32 60 L32 40" stroke={stem} strokeWidth="2" />{[-30, 30, 0].map((a, i) => (<path key={a} transform={`rotate(${a} 32 44)`} d="M32 44 L26 38 L28 33 L25 28 L29 25 L32 14 L35 25 L39 28 L36 33 L38 38Z" fill={i === 2 ? c1 : c2} stroke={shade(c1, -30)} strokeWidth="0.8" />))}</g>);
    case 'frilly':
      return (<g>{[[32, 40, 17], [20, 34, 13], [44, 34, 13], [26, 22, 12], [38, 22, 12], [32, 30, 11]].map(([x, y, r], i) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill={i % 2 ? c2 : c1} stroke={shade(c1, -30)} strokeWidth="0.8" strokeDasharray="2 1.6" />)}<path d="M32 52 Q30 44 32 36" stroke={shade(c1, -30)} strokeWidth="1.2" fill="none" /></g>);
    case 'pinnate':
      return (<g><path d="M32 62 C30 44 34 26 32 8" stroke={stem} strokeWidth="1.8" fill="none" />{Array.from({ length: 6 }, (_, i) => 52 - i * 8).map((y) => (<g key={y}><ellipse cx="24" cy={y} rx="7" ry="3.6" transform={`rotate(-20 24 ${y})`} fill={c1} stroke={shade(c1, -25)} strokeWidth="0.6" /><ellipse cx="40" cy={y - 3} rx="7" ry="3.6" transform={`rotate(20 40 ${y - 3})`} fill={c2} stroke={shade(c1, -25)} strokeWidth="0.6" /></g>))}</g>);
    case 'feathery':
      return (<g><path d="M32 62 L32 12" stroke={stem} strokeWidth="1.6" />{Array.from({ length: 7 }, (_, i) => 52 - i * 7).map((y, i) => (<g key={y} stroke={i % 2 ? c1 : shade(c1, -30)} strokeWidth="1.6" strokeLinecap="round"><path d={`M32 ${y} L${20 - i} ${y - 8}`} /><path d={`M32 ${y} L${44 + i} ${y - 8}`} /><path d={`M32 ${y - 4} L${24 - i} ${y - 10}`} /><path d={`M32 ${y - 4} L${40 + i} ${y - 10}`} /></g>))}</g>);
    case 'stalks':
      return (<g>{[-18, -6, 6, 18].map((x, i) => (<g key={x}><rect x={32 + x - 3.5} y="26" width="7" height="34" rx="3" fill={c2} stroke={shade(c2, -35)} strokeWidth="0.8" /><ellipse cx={32 + x * 1.4} cy="20" rx="8" ry="13" transform={`rotate(${x} ${32 + x * 1.4} 20)`} fill={i % 2 ? c1 : shade(c1, 14)} stroke={shade(c1, -30)} strokeWidth="0.6" /></g>))}</g>);
    case 'curly':
      return (<g>{[[32, 44, 10], [22, 36, 8], [42, 36, 8], [28, 26, 8], [38, 26, 8], [32, 18, 7], [20, 48, 7], [44, 48, 7]].map(([x, y, r], i) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill={i % 2 ? c2 : c1} stroke={shade(c1, -30)} strokeWidth="1" strokeDasharray="1.5 1.5" />)}<path d="M32 60 L32 50" stroke={stem} strokeWidth="2" /></g>);
    case 'blade':
      return (<g>{[-14, -5, 5, 14].map((x, i) => (<path key={x} d={`M${32 + x * 0.3} 60 C${32 + x} 40 ${32 + x * 1.6} 22 ${32 + x * 2} 6`} stroke={i % 2 ? c1 : shade(c1, -22)} strokeWidth="4" strokeLinecap="round" fill="none" />))}<ellipse cx="32" cy="58" rx="9" ry="5" fill={c2} stroke={shade(c2, -40)} strokeWidth="0.8" /></g>);
    case 'arrow':
      return (<g><path d="M32 62 L32 22" stroke={stem} strokeWidth="2" />{[[0, 1], [-28, 0.8], [28, 0.8]].map(([a, s], i) => (<path key={a} transform={`rotate(${a} 32 40) translate(32 40) scale(${s}) translate(-32 -40)`} d="M32 40 L22 36 L26 30 L24 24 L32 6 L40 24 L38 30 L42 36Z" fill={i ? c2 : c1} stroke={shade(c1, -30)} strokeWidth="0.8" />))}</g>);
    case 'star':
      return (<g><path d="M32 62 L32 36" stroke={c2} strokeWidth="3" strokeLinecap="round" /><path d="M32 8 L38 22 L52 20 L42 30 L48 44 L32 36 L16 44 L22 30 L12 20 L26 22Z" fill={c1} stroke={shade(c1, -30)} strokeWidth="1" /><path d="M32 36 L32 14 M32 36 L46 22 M32 36 L18 22" stroke={c2} strokeWidth="1.2" /></g>);
    case 'heart':
      return (<g><path d="M32 62 L32 40" stroke={stem} strokeWidth="2" />{[[0, 1, c1], [-30, 0.8, c2], [30, 0.8, c2]].map(([a, s, f]) => (<path key={a} transform={`rotate(${a} 32 44) translate(32 44) scale(${s}) translate(-32 -44)`} d="M32 44 C18 36 14 20 24 14 C28 12 32 16 32 20 C32 16 36 12 40 14 C50 20 46 36 32 44Z" fill={f} stroke={shade(c1, -30)} strokeWidth="0.8" />))}</g>);
    case 'round':
      return (<g><path d="M32 62 C28 46 36 34 30 18" stroke={c2} strokeWidth="2" fill="none" />{[[24, 50], [38, 44], [26, 36], [40, 30], [30, 24], [36, 14]].map(([x, y], i) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" fill={i % 2 ? c1 : shade(c1, 12)} stroke={shade(c1, -30)} strokeWidth="0.7" />)}</g>);
    case 'oval':
    default:
      return (<g><path d="M32 62 L32 36" stroke={stem} strokeWidth="2" />{[[0, 1, c1], [-32, 0.85, c2], [32, 0.85, c2]].map(([a, s, f]) => (<path key={a} transform={`rotate(${a} 32 42) translate(32 42) scale(${s}) translate(-32 -42)`} d="M32 42 C20 34 20 16 32 8 C44 16 44 34 32 42Z" fill={f} stroke={shade(c1, -30)} strokeWidth="0.9" />))}<path d="M32 40 L32 12" stroke={shade(c1, -35)} strokeWidth="1" /></g>);
  }
}

// ---------------------------------------------------------------- roots, heads, gourds, tubers
function Root({ body, top, shape = 'round', blush }) {
  return (
    <g>
      {[-14, 0, 14].map((a) => <path key={a} d={`M32 24 C${32 + a * 0.5} 14 ${32 + a} 8 ${32 + a * 1.2} 4`} stroke={top} strokeWidth="5" strokeLinecap="round" fill="none" />)}
      {shape === 'turnip'
        ? (<g><path d="M32 22 C50 22 56 36 48 46 C44 52 38 56 32 62 C26 56 20 52 16 46 C8 36 14 22 32 22Z" fill={body} stroke={shade(body, -40)} strokeWidth="1.2" /><path d="M16 30 C24 22 40 22 48 30 C44 26 20 26 16 30Z" fill={blush} opacity="0.8" /></g>)
        : (<g><path d="M32 24 C48 24 54 36 48 46 C44 54 36 56 32 58 C28 56 20 54 16 46 C10 36 16 24 32 24Z" fill={body} stroke={shade(body, -40)} strokeWidth="1.2" /><path d="M32 58 L32 63" stroke={shade(body, -30)} strokeWidth="2" strokeLinecap="round" /></g>)}
      <ellipse cx="25" cy="36" rx="3.5" ry="7" fill="#ffffff55" transform="rotate(-15 25 36)" />
    </g>
  );
}

function Head({ outer, inner, shape = 'cabbage' }) {
  if (shape === 'cauli') {
    return (<g><path d="M10 40 C6 30 14 22 22 26 C24 14 40 14 42 26 C50 22 58 30 54 40 C52 52 12 52 10 40Z" fill={inner} stroke={shade(inner, -45)} strokeWidth="1.2" />
      {[[22, 32], [32, 24], [42, 32], [28, 40], [38, 40]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" fill={shade(inner, -8)} stroke={shade(inner, -40)} strokeWidth="0.6" />)}
      <path d="M8 46 C10 58 54 58 56 46 C48 52 16 52 8 46Z" fill={outer} stroke={shade(outer, -35)} strokeWidth="1" /></g>);
  }
  if (shape === 'kohl') {
    return (<g>{[-20, -8, 8, 20].map((a) => <path key={a} d={`M32 28 C${32 + a} 18 ${32 + a * 1.4} 10 ${32 + a * 1.6} 4`} stroke={outer} strokeWidth="4" strokeLinecap="round" fill="none" />)}<circle cx="32" cy="42" r="19" fill={outer} stroke={shade(outer, -40)} strokeWidth="1.2" /><ellipse cx="25" cy="36" rx="5" ry="8" fill="#ffffff55" /><path d="M32 62 l0 -4" stroke={shade(outer, -40)} strokeWidth="2" /></g>);
  }
  return (<g><circle cx="32" cy="36" r="24" fill={outer} stroke={shade(outer, -40)} strokeWidth="1.2" /><path d="M32 12 C20 22 20 50 32 60 C44 50 44 22 32 12Z" fill={inner} opacity="0.75" /><path d="M10 34 C20 40 44 40 54 34 M14 22 C24 30 40 30 50 22" stroke={shade(outer, -35)} strokeWidth="1.2" fill="none" /><path d="M32 12 L32 60" stroke={shade(outer, -35)} strokeWidth="1" /></g>);
}

function Gourd({ body, stripe, shape = 'long' }) {
  const stroke = shade(body, -40);
  switch (shape) {
    case 'bottle': return (<g><path d="M30 6 C34 6 35 10 35 14 C35 22 46 26 48 40 C50 54 42 60 32 60 C22 60 14 54 16 40 C18 26 29 22 29 14 C29 10 30 6 30 6Z" fill={body} stroke={stroke} strokeWidth="1.2" /><ellipse cx="25" cy="42" rx="4" ry="9" fill="#ffffff55" /></g>);
    case 'okra': return (<g transform="rotate(-25 32 32)"><path d="M32 4 C40 12 42 40 36 58 L32 62 L28 58 C22 40 24 12 32 4Z" fill={body} stroke={stroke} strokeWidth="1.2" />{[-5, 0, 5].map((x) => <path key={x} d={`M${32 + x} 12 C${32 + x * 1.3} 30 ${32 + x * 1.2} 46 ${32 + x * 0.5} 58`} stroke={shade(body, -35)} strokeWidth="0.9" fill="none" />)}<path d="M32 4 L32 0" stroke="#6d4c41" strokeWidth="2.4" /></g>);
    case 'bitter': return (<g transform="rotate(-20 32 32)"><path d="M32 4 C44 14 44 44 34 60 C30 62 28 60 28 56 C20 44 20 14 32 4Z" fill={body} stroke={stroke} strokeWidth="1.2" />{Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${27 + (i % 2) * 8} ${14 + i * 6} q3 -2 5 0`} stroke={shade(body, 40)} strokeWidth="2" strokeLinecap="round" fill="none" />)}</g>);
    case 'ridged': return (<g transform="rotate(-18 32 32)"><path d="M32 4 C42 12 42 46 36 60 C33 62 31 62 28 60 C22 46 22 12 32 4Z" fill={body} stroke={stroke} strokeWidth="1.2" />{[-6, -2, 2, 6].map((x) => <path key={x} d={`M${32 + x * 0.5} 10 C${32 + x * 1.8} 28 ${32 + x * 1.6} 44 ${32 + x * 0.7} 58`} stroke={shade(body, -45)} strokeWidth="1.1" fill="none" />)}</g>);
    case 'ash': return (<g><ellipse cx="32" cy="36" rx="22" ry="25" fill={body} stroke={stroke} strokeWidth="1.2" /><ellipse cx="32" cy="36" rx="22" ry="25" fill="#ffffff44" /><path d="M32 12 L32 6" stroke="#6d4c41" strokeWidth="3" strokeLinecap="round" /><ellipse cx="24" cy="28" rx="5" ry="9" fill="#ffffff66" /></g>);
    case 'drumstick': return (<g transform="rotate(-35 32 32)"><rect x="29" y="-4" width="6" height="70" rx="3" fill={body} stroke={stroke} strokeWidth="1" />{Array.from({ length: 10 }, (_, i) => <path key={i} d={`M29 ${2 + i * 6} l6 3`} stroke={shade(body, -40)} strokeWidth="0.8" />)}</g>);
    case 'round':
    default: return (<g><path d="M32 16 C54 12 58 36 52 48 C46 60 18 60 12 48 C6 36 10 12 32 16Z" fill={body} stroke={stroke} strokeWidth="1.2" />{[-14, -6, 6, 14].map((x) => <path key={x} d={`M${32 + x * 0.3} 17 C${32 + x * 2} 30 ${32 + x * 2} 46 ${32 + x * 0.5} 58`} stroke={stripe || shade(body, -40)} strokeWidth="1.4" fill="none" />)}<path d="M32 16 L32 8 L38 6" stroke="#6d5a2a" strokeWidth="3" strokeLinecap="round" fill="none" /></g>);
  }
}

function Tuber({ body, eye, shape = 'rhizome' }) {
  const stroke = shade(body, -40);
  if (shape === 'corm') {
    return (<g><ellipse cx="32" cy="38" rx="20" ry="18" fill={body} stroke={stroke} strokeWidth="1.2" />{[26, 34, 42, 50].map((y) => <path key={y} d={`M${14 + (y - 26) / 4} ${y - 4} q18 6 ${36 - (y - 26) / 2} 0`} stroke={eye} strokeWidth="1" fill="none" />)}<path d="M28 20 C26 12 30 8 32 4 M36 20 C38 12 34 8 32 4" stroke="#8bc34a" strokeWidth="2.4" fill="none" strokeLinecap="round" /></g>);
  }
  if (shape === 'long') {
    return (<g transform="rotate(-30 32 32)"><path d="M32 2 C44 6 46 30 44 46 C42 62 22 62 20 46 C18 30 20 6 32 2Z" fill={body} stroke={stroke} strokeWidth="1.2" />{[[26, 16], [38, 24], [28, 34], [36, 44], [27, 52]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y} q3 -2 6 0`} stroke={eye} strokeWidth="1.2" fill="none" />)}</g>);
  }
  return (<g><path d="M8 40 C6 32 14 28 20 30 L26 22 C28 14 38 14 38 22 L44 20 C52 18 58 26 54 32 L56 38 C58 46 50 50 44 48 C42 54 34 56 30 52 C24 56 14 52 14 46 C10 46 8 44 8 40Z" fill={body} stroke={stroke} strokeWidth="1.2" />{[[22, 40], [34, 36], [44, 40], [30, 28], [46, 30]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x - 4} ${y} q4 -3 8 0`} stroke={eye} strokeWidth="1.3" fill="none" />)}<path d="M26 22 L24 14 M38 22 L40 14" stroke={shade(body, 30)} strokeWidth="3" strokeLinecap="round" /></g>);
}

// ---------------------------------------------------------------- flowers, cane, cotton, berry clusters
function Flower({ petal, center, shape = 'daisy' }) {
  if (shape === 'cluster') {
    return (<g><path d="M32 62 L32 30 M32 44 L18 28 M32 40 L46 24" stroke="#689f38" strokeWidth="2" />{[[32, 22], [20, 24], [44, 18], [26, 34], [38, 32], [18, 38]].map(([x, y]) => <g key={`${x}${y}`}>{[0, 90, 180, 270].map((a) => <ellipse key={a} cx={x} cy={y - 4} rx="2.6" ry="4" transform={`rotate(${a} ${x} ${y})`} fill={petal} stroke={shade(petal, -40)} strokeWidth="0.4" />)}<circle cx={x} cy={y} r="1.8" fill={center} /></g>)}</g>);
  }
  if (shape === 'plume') {
    return (<g><path d="M32 62 L32 30" stroke="#689f38" strokeWidth="2.4" />{[[32, 12], [24, 20], [40, 20], [20, 30], [44, 30], [28, 36], [36, 36]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y} c-3 6 -3 12 0 16`} stroke={petal} strokeWidth="6" strokeLinecap="round" fill="none" />)}</g>);
  }
  const count = shape === 'five' ? 5 : shape === 'thistle' ? 14 : 16;
  return (
    <g>
      <path d="M32 62 L32 40" stroke="#689f38" strokeWidth="2.6" />
      {Array.from({ length: count }, (_, i) => i * (360 / count)).map((a) => (shape === 'thistle'
        ? <path key={a} transform={`rotate(${a} 32 28)`} d="M32 28 L30 8 L34 8Z" fill={petal} stroke={shade(petal, -35)} strokeWidth="0.5" />
        : <ellipse key={a} cx="32" cy={shape === 'five' ? 14 : 12} rx={shape === 'five' ? 7 : 3.4} ry={shape === 'five' ? 11 : 9} transform={`rotate(${a} 32 28)`} fill={petal} stroke={shade(petal, -35)} strokeWidth="0.6" />))}
      <circle cx="32" cy="28" r={shape === 'daisy' ? 11 : shape === 'thistle' ? 8 : 4.5} fill={center} stroke={shade(center, -35)} strokeWidth="0.8" />
      {shape === 'daisy' && [[28, 25], [34, 24], [31, 30], [37, 29], [26, 31]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" fill={shade(center, 40)} />)}
    </g>
  );
}

function Cane({ stalk, node }) {
  return (<g>{[-6, 8].map((o, k) => (<g key={o} transform={`rotate(${k ? 8 : -8} 32 60)`}><rect x={26 + o} y="6" width="10" height="54" rx="3" fill={stalk} stroke={shade(stalk, -35)} strokeWidth="1" />{[16, 28, 40, 52].map((y) => <rect key={y} x={25 + o} y={y} width="12" height="3" rx="1.5" fill={node} />)}</g>))}<path d="M30 8 C20 4 12 6 8 12 M36 10 C46 4 54 6 58 12" stroke="#7cb342" strokeWidth="3" strokeLinecap="round" fill="none" /></g>);
}

function Boll({ fiber, shell }) {
  return (<g><path d="M14 40 L20 56 L32 60 L44 56 L50 40 C44 48 20 48 14 40Z" fill={shell} stroke={shade(shell, -30)} strokeWidth="1" />{[[20, 32, 11], [32, 26, 13], [44, 32, 11], [26, 40, 10], [38, 40, 10]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill={fiber} stroke="#cfd8dc" strokeWidth="1" />)}<path d="M14 40 L8 30 M50 40 L56 30 M32 60 L32 64" stroke={shell} strokeWidth="2.4" strokeLinecap="round" /></g>);
}

function Cluster({ berry, stem, shape = 'grape' }) {
  const pts = [[22, 24], [32, 20], [42, 24], [18, 36], [28, 34], [38, 34], [46, 36], [24, 46], [34, 46], [42, 48], [32, 56]];
  return (<g><path d="M32 4 C32 10 30 14 32 20" stroke={stem} strokeWidth="2.4" fill="none" />{pts.map(([x, y], i) => (<g key={`${x}${y}`}><ellipse cx={x} cy={y} rx={shape === 'jamun' ? 6.4 : 6} ry={shape === 'jamun' ? 7.6 : 6} fill={berry} stroke={shade(berry, -40)} strokeWidth="0.8" />{shape === 'litchi' && [[-2, -2], [2, 1], [-1, 3]].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={x + dx} cy={y + dy} r="0.9" fill={shade(berry, 55)} />)}<ellipse cx={x - 2} cy={y - 2.4} rx="1.8" ry="1.4" fill="#ffffff66" /></g>))}</g>);
}

export const DRAWERS = {
  fruit: Fruit, pod: Pod, seeds: Seeds, ear: Ear, leaf: LeafPlant, root: Root, head: Head,
  gourd: Gourd, tuber: Tuber, flower: Flower, cane: Cane, boll: Boll, cluster: Cluster,
};
export const ICON_KINDS = Object.keys(DRAWERS);

export default function CropIcon({ crop, size = 56, className = '' }) {
  const icon = crop && crop.icon;
  const letter = (
    <span className={`cp-icon cp-icon--letter ${className}`} style={{ width: size, height: size, fontSize: size * 0.5, lineHeight: `${size}px` }} role="img" aria-label={crop ? crop.name : 'Unknown crop'}>
      {crop && crop.name ? crop.name.charAt(0).toUpperCase() : '?'}
    </span>
  );
  if (!icon) return letter;
  if (icon.type === 'emoji' && icon.value) {
    return <span className={`cp-icon cp-icon--emoji ${className}`} style={{ width: size, height: size, fontSize: size * 0.78, lineHeight: `${size}px` }} role="img" aria-label={crop.name}>{icon.value}</span>;
  }
  const Draw = DRAWERS[icon.kind];
  if (icon.type !== 'svg' || !Draw) return letter;
  const { type, kind, ...params } = icon;
  return (
    <svg className={`cp-icon cp-icon--svg ${className}`} viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`${crop.name} illustration`}>
      <Draw {...params} />
    </svg>
  );
}
