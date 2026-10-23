import React, { useState } from 'react';

// Drawn fallback icons for listings without a photo. These are NEVER sent to
// the server any more: the old frontend stored one of these SVGs as every
// listing's imageUrl, which stopped the server from ever looking up a real
// photo of the crop.
const encodeSvgDataUri = (svg) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const LISTING_IMAGES = {
  Grains: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <path d="M0 220C70 190 120 180 180 200C250 225 300 175 360 182C410 188 445 198 480 186V320H0Z" fill="#fcd34d"/>
      <path d="M0 240C80 205 145 210 205 224C270 240 310 210 372 206C417 203 450 210 480 202V320H0Z" fill="#d97706"/>
      <text x="36" y="286" fill="#7c2d12" font-family="Arial" font-size="28" font-weight="700">Grains</text>
    </svg>
  `),

  Vegetables: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#dcfce7"/>
      <circle cx="145" cy="180" r="48" fill="#f97316"/>
      <circle cx="228" cy="170" r="56" fill="#ef4444"/>
      <circle cx="314" cy="184" r="50" fill="#84cc16"/>
      <path d="M0 244H480V320H0Z" fill="#86efac"/>
      <text x="36" y="286" fill="#166534" font-family="Arial" font-size="28" font-weight="700">Vegetables</text>
    </svg>
  `),

  Fruits: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#ffe4e6"/>
      <circle cx="160" cy="176" r="56" fill="#fb7185"/>
      <circle cx="245" cy="162" r="62" fill="#f97316"/>
      <circle cx="332" cy="182" r="50" fill="#eab308"/>
      <text x="36" y="286" fill="#9f1239" font-family="Arial" font-size="28" font-weight="700">Fruits</text>
    </svg>
  `),
};

// Per-crop icons for the crops most likely to be listed, so listings
// show a recognizable icon instead of just a generic category
// placeholder. Falls back to the category placeholder for any crop
// name not covered here - the marketplace accepts free-text crop
// names, so this can never be a complete fixed list, only a set of
// the most common ones worth a dedicated icon.
const CROP_IMAGES = {
  wheat: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <path d="M240 260V90" stroke="#b45309" stroke-width="6"/>
      <path d="M240 100C220 90 205 100 200 115C220 118 235 112 240 100Z" fill="#d97706"/>
      <path d="M240 100C260 90 275 100 280 115C260 118 245 112 240 100Z" fill="#d97706"/>
      <path d="M240 130C220 120 205 130 200 145C220 148 235 142 240 130Z" fill="#d97706"/>
      <path d="M240 130C260 120 275 130 280 145C260 148 245 142 240 130Z" fill="#d97706"/>
      <path d="M240 160C220 150 205 160 200 175C220 178 235 172 240 160Z" fill="#d97706"/>
      <path d="M240 160C260 150 275 160 280 175C260 178 245 172 240 160Z" fill="#d97706"/>
      <text x="36" y="286" fill="#7c2d12" font-family="Arial" font-size="28" font-weight="700">Wheat</text>
    </svg>
  `),

  rice: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#ecfccb"/>
      <ellipse cx="180" cy="150" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <ellipse cx="220" cy="140" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <ellipse cx="260" cy="150" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <ellipse cx="300" cy="142" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <text x="36" y="286" fill="#365314" font-family="Arial" font-size="28" font-weight="700">Rice</text>
    </svg>
  `),

  maize: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef9c3"/>
      <ellipse cx="240" cy="160" rx="60" ry="95" fill="#facc15"/>
      <path d="M200 90C210 70 270 70 280 90" stroke="#16a34a" stroke-width="10" fill="none"/>
      <text x="36" y="286" fill="#854d0e" font-family="Arial" font-size="28" font-weight="700">Maize</text>
    </svg>
  `),

  corn: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef9c3"/>
      <ellipse cx="240" cy="160" rx="60" ry="95" fill="#facc15"/>
      <path d="M200 90C210 70 270 70 280 90" stroke="#16a34a" stroke-width="10" fill="none"/>
      <text x="36" y="286" fill="#854d0e" font-family="Arial" font-size="28" font-weight="700">Corn</text>
    </svg>
  `),

  millet: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <path d="M240 260V100" stroke="#92400e" stroke-width="6"/>
      <circle cx="230" cy="110" r="7" fill="#a16207"/>
      <circle cx="250" cy="120" r="7" fill="#a16207"/>
      <circle cx="228" cy="132" r="7" fill="#a16207"/>
      <circle cx="252" cy="142" r="7" fill="#a16207"/>
      <circle cx="230" cy="154" r="7" fill="#a16207"/>
      <text x="36" y="286" fill="#7c2d12" font-family="Arial" font-size="28" font-weight="700">Millet</text>
    </svg>
  `),

  tomato: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fee2e2"/>
      <circle cx="240" cy="180" r="66" fill="#ef4444"/>
      <path d="M215 122C225 108 255 108 265 122" stroke="#16a34a" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#991b1b" font-family="Arial" font-size="28" font-weight="700">Tomato</text>
    </svg>
  `),

  orange: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#ffedd5"/>
      <circle cx="240" cy="175" r="68" fill="#f97316"/>
      <circle cx="240" cy="175" r="68" fill="none" stroke="#ea580c" stroke-width="3"/>
      <path d="M240 107C246 96 258 92 266 94" stroke="#4d7c0f" stroke-width="7" fill="none"/>
      <ellipse cx="252" cy="94" rx="14" ry="8" fill="#4d7c0f" transform="rotate(20 252 94)"/>
      <text x="36" y="286" fill="#9a3412" font-family="Arial" font-size="28" font-weight="700">Orange</text>
    </svg>
  `),

  carrot: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#ffedd5"/>
      <path d="M240 100L270 220C270 236 210 236 210 220Z" fill="#fb923c" stroke="#ea580c" stroke-width="3"/>
      <path d="M225 90C215 65 200 55 185 58" stroke="#16a34a" stroke-width="7" fill="none"/>
      <path d="M240 88C240 60 240 48 240 42" stroke="#16a34a" stroke-width="7" fill="none"/>
      <path d="M255 90C265 65 280 55 295 58" stroke="#16a34a" stroke-width="7" fill="none"/>
      <text x="36" y="286" fill="#9a3412" font-family="Arial" font-size="28" font-weight="700">Carrot</text>
    </svg>
  `),

  onion: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fdf2f8"/>
      <path d="M240 90C280 130 290 190 240 220C190 190 200 130 240 90Z" fill="#c026d3"/>
      <path d="M240 90V70" stroke="#4d7c0f" stroke-width="6"/>
      <text x="36" y="286" fill="#701a75" font-family="Arial" font-size="28" font-weight="700">Onion</text>
    </svg>
  `),

  potato: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <ellipse cx="240" cy="170" rx="80" ry="55" fill="#ca8a04"/>
      <circle cx="210" cy="160" r="4" fill="#78350f"/>
      <circle cx="260" cy="185" r="4" fill="#78350f"/>
      <circle cx="245" cy="150" r="4" fill="#78350f"/>
      <text x="36" y="286" fill="#78350f" font-family="Arial" font-size="28" font-weight="700">Potato</text>
    </svg>
  `),

  chili: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef2f2"/>
      <path d="M200 120C260 130 300 170 280 210C260 245 210 235 200 195C192 165 180 140 200 120Z" fill="#dc2626"/>
      <path d="M200 120C195 105 185 98 175 100" stroke="#15803d" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#7f1d1d" font-family="Arial" font-size="28" font-weight="700">Chili</text>
    </svg>
  `),

  mango: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fff7ed"/>
      <path d="M200 130C260 120 300 160 285 205C270 245 215 245 195 210C178 180 175 145 200 130Z" fill="#f97316"/>
      <path d="M245 122C250 108 262 102 272 104" stroke="#15803d" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#9a3412" font-family="Arial" font-size="28" font-weight="700">Mango</text>
    </svg>
  `),

  banana: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fefce8"/>
      <path d="M180 210C190 140 260 100 310 120C300 160 280 180 250 195C220 210 195 215 180 210Z" fill="#facc15"/>
      <path d="M180 210C175 218 178 226 188 226" stroke="#854d0e" stroke-width="6" fill="none"/>
      <text x="36" y="286" fill="#854d0e" font-family="Arial" font-size="28" font-weight="700">Banana</text>
    </svg>
  `),

  grapes: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#f5f3ff"/>
      <circle cx="220" cy="140" r="20" fill="#7c3aed"/>
      <circle cx="250" cy="150" r="20" fill="#7c3aed"/>
      <circle cx="215" cy="175" r="20" fill="#7c3aed"/>
      <circle cx="248" cy="185" r="20" fill="#7c3aed"/>
      <circle cx="235" cy="205" r="20" fill="#7c3aed"/>
      <path d="M235 118V100" stroke="#15803d" stroke-width="6"/>
      <text x="36" y="286" fill="#4c1d95" font-family="Arial" font-size="28" font-weight="700">Grapes</text>
    </svg>
  `),

  papaya: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fff7ed"/>
      <ellipse cx="240" cy="170" rx="55" ry="80" fill="#fb923c"/>
      <path d="M240 90C250 78 262 76 270 80" stroke="#15803d" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#9a3412" font-family="Arial" font-size="28" font-weight="700">Papaya</text>
    </svg>
  `),
};

// Icon used ONLY when a listing has no real photo (or its photo fails to
// load). It is a drawn icon, not a photo - the UI labels it as such.
export const getFallbackIcon = (item) => {
  const key = (item.cropName || '').trim().toLowerCase();
  // Leafy crops use the vegetable illustration until they get their own.
  const category = item.category === 'Leafy' ? 'Vegetables' : item.category;
  return (
    CROP_IMAGES[key] ||
    LISTING_IMAGES[category] ||
    LISTING_IMAGES.Vegetables
  );
};

// <img> that never shows a broken-image box: real photo -> (if it fails to
// load) drawn icon. Photographer credit is shown when we have one (Pexels asks
// for it). `isPlaceholder` lets the card say "no photo yet" honestly.
export function ListingImage({ item, className }) {
  const [failed, setFailed] = useState(false);
  const hasPhoto = Boolean(item.imageUrl) && !failed && !/^data:image\/svg/i.test(item.imageUrl);
  return (
    <div className="listing-image-wrap" style={{ position: 'relative' }}>
      <img
        className={className}
        src={hasPhoto ? item.imageUrl : getFallbackIcon(item)}
        alt={hasPhoto ? `${item.cropName} ${item.variety || ''}`.trim() : `${item.cropName} (illustration - no photo yet)`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {hasPhoto && item.imageCredit && (
        <span style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 10, background: 'rgba(0,0,0,.55)', color: '#fff', padding: '1px 6px', borderRadius: 6 }}>
          {item.imageCredit}
        </span>
      )}
    </div>
  );
}
