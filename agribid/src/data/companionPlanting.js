// companionPlanting.js - crop catalog + compatibility checker for the Companion Planting tab.
//
// TWO separate things live here and must not be confused:
//   1. the CATALOG: crop facts (name, category, botanical family, typical season, icon).
//   2. COMPATIBILITY: only what companionPairs.js can back with sources. A crop with no documented
//      pairing is shown as "insufficient evidence" with sourced general principles, never a guess.
//      See docs/COMPANION_EVIDENCE.md for what was validated, corrected and removed.
//
// ADD A CROP: add one row() to CROPS.  ADD A PAIRING: add an entry to PAIRS (companionPairs.js) with
// at least one source from companionSources.js. companionPlanting.test.js fails if a record is
// malformed, a name/alias collides, an icon is duplicated or a pair has no source.

import { PAIRS, GENERAL_PRINCIPLES, STATUS_META } from './companionPairs';
import { SOURCES, SOURCE_TYPE_LABEL, sourceList } from './companionSources';
import { evidenceBadges, deriveStatus, pairKey } from './companionEvidence';

export { STATUS_META, SOURCES, SOURCE_TYPE_LABEL, sourceList, PAIRS, GENERAL_PRINCIPLES, evidenceBadges, deriveStatus, pairKey };

export const CATEGORY_META = {
  Fruits: { label: 'Fruits', icon: '🍎', from: '#ffedd5', to: '#f97316' },
  Grains: { label: 'Grains & field crops', icon: '🌾', from: '#fef3c7', to: '#f59e0b' },
  Vegetables: { label: 'Vegetables', icon: '🥕', from: '#dcfce7', to: '#22c55e' },
  Leafy: { label: 'Leafy crops & herbs', icon: '🥬', from: '#ecfccb', to: '#65a30d' },
};
export const CATEGORY_KEYS = Object.keys(CATEGORY_META);
export const CATEGORIES = ['All Crops', ...CATEGORY_KEYS];

// Icons: a real emoji only where a crop-specific emoji exists in Unicode 12 or older (so it renders on
// older Windows/Android too); otherwise a drawn SVG illustration (see components/Companion/CropIcon.js).
const E = (value) => ({ type: 'emoji', value });
const S = (kind, params) => ({ type: 'svg', kind, ...params });

export const slug = (text) => String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

// row(name, category, family, icon, aliases, season). `season` = typical Indian season, given only where
// well established; it varies by region and variety and is shown with that caveat.
const row = (name, category, family, icon, aliases = [], season = '') => ({
  id: slug(name), name, category, family, icon, aliases, season,
});

export const CROPS = [
  // ============================================================ GRAINS & FIELD CROPS (30)
  row('Wheat', 'Grains', 'Poaceae', S('ear', { grain: '#d9a441', style: 'wheat' }), ['gehu', 'gehun'], 'Rabi'),
  row('Rice', 'Grains', 'Poaceae', S('ear', { grain: '#c8c36a', style: 'panicle' }), ['paddy', 'chawal', 'dhan'], 'Kharif'),
  row('Maize', 'Grains', 'Poaceae', E('🌽'), ['corn', 'makka', 'bhutta'], 'Kharif'),
  row('Barley', 'Grains', 'Poaceae', S('ear', { grain: '#e0c060', style: 'barley' }), ['jau'], 'Rabi'),
  row('Oats', 'Grains', 'Poaceae', S('ear', { grain: '#e6d9a8', style: 'oat' }), ['jai']),
  row('Sorghum', 'Grains', 'Poaceae', S('ear', { grain: '#b5651d', style: 'head' }), ['jowar'], 'Kharif and rabi'),
  row('Pearl Millet', 'Grains', 'Poaceae', S('ear', { grain: '#9e9e7a', style: 'spike' }), ['bajra'], 'Kharif'),
  row('Finger Millet', 'Grains', 'Poaceae', S('ear', { grain: '#7b5e3b', style: 'fingers' }), ['ragi', 'nachni', 'mandua'], 'Kharif'),
  row('Foxtail Millet', 'Grains', 'Poaceae', S('ear', { grain: '#e6b422', style: 'foxtail' }), ['kangni', 'kakum']),
  row('Little Millet', 'Grains', 'Poaceae', S('ear', { grain: '#d8c690', style: 'panicle' }), ['kutki', 'sama']),
  row('Kodo Millet', 'Grains', 'Poaceae', S('ear', { grain: '#6d5a3a', style: 'fingers' }), ['kodo', 'kodra']),
  row('Barnyard Millet', 'Grains', 'Poaceae', S('ear', { grain: '#8fae5a', style: 'panicle' }), ['sanwa', 'jhangora']),
  row('Buckwheat', 'Grains', 'Polygonaceae', S('seeds', { c: ['#5d4037', '#795548'], shape: 'tri' }), ['kuttu']),
  row('Amaranth Grain', 'Grains', 'Amaranthaceae', S('flower', { petal: '#c2185b', center: '#880e4f', shape: 'plume' }), ['rajgira', 'ramdana']),
  row('Chickpea', 'Grains', 'Fabaceae', S('seeds', { c: ['#d7b377', '#e6c88f'], shape: 'round' }), ['chana', 'gram', 'bengal gram'], 'Rabi'),
  row('Pigeon Pea', 'Grains', 'Fabaceae', S('pod', { pod: '#b08d57', seed: '#8d6e63', n: 4, shape: 'flat' }), ['toor', 'tur', 'arhar', 'toor dal'], 'Kharif'),
  row('Green Gram', 'Grains', 'Fabaceae', S('seeds', { c: ['#689f38', '#7cb342'], shape: 'tiny' }), ['moong', 'mung bean'], 'Kharif and summer'),
  row('Black Gram', 'Grains', 'Fabaceae', S('seeds', { c: ['#212121', '#424242'], shape: 'oval' }), ['urad', 'urd'], 'Kharif'),
  row('Lentil', 'Grains', 'Fabaceae', S('seeds', { c: ['#d2691e', '#e08a3c'], shape: 'flat' }), ['masoor'], 'Rabi'),
  row('Horse Gram', 'Grains', 'Fabaceae', S('seeds', { c: ['#795548', '#8d6e63'], shape: 'kidney' }), ['kulthi', 'kulattha']),
  row('Cowpea', 'Grains', 'Fabaceae', S('seeds', { c: ['#efe3c8', '#f5ecd7'], shape: 'kidney', eye: '#212121' }), ['lobia', 'chawli']),
  row('Soybean', 'Grains', 'Fabaceae', S('pod', { pod: '#a1a15a', seed: '#d9cf9a', n: 3, hairy: true, shape: 'short' }), ['soya'], 'Kharif'),
  row('Groundnut', 'Grains', 'Fabaceae', E('🥜'), ['peanut', 'moongphali'], 'Kharif'),
  row('Mustard', 'Grains', 'Brassicaceae', S('flower', { petal: '#fdd835', center: '#f9a825', shape: 'cluster' }), ['sarson', 'rapeseed', 'rai'], 'Rabi'),
  row('Sesame', 'Grains', 'Pedaliaceae', S('seeds', { c: ['#f5f0e1', '#eee3c8'], shape: 'tiny' }), ['til', 'gingelly']),
  row('Sunflower', 'Grains', 'Asteraceae', S('flower', { petal: '#fbc02d', center: '#5d4037', shape: 'daisy' }), ['surajmukhi']),
  row('Safflower', 'Grains', 'Asteraceae', S('flower', { petal: '#ef6c00', center: '#e65100', shape: 'thistle' }), ['kusum', 'kardi'], 'Rabi'),
  row('Linseed', 'Grains', 'Linaceae', S('flower', { petal: '#42a5f5', center: '#fff59d', shape: 'five' }), ['flax', 'alsi'], 'Rabi'),
  row('Cotton', 'Grains', 'Malvaceae', S('boll', { fiber: '#fafafa', shell: '#6d4c41' }), ['kapas'], 'Kharif'),
  row('Sugarcane', 'Grains', 'Poaceae', S('cane', { stalk: '#7b3f98', node: '#4a2160' }), ['ganna', 'cane']),

  // ============================================================ VEGETABLES (31)
  row('Tomato', 'Vegetables', 'Solanaceae', E('🍅'), ['tamatar']),
  row('Potato', 'Vegetables', 'Solanaceae', E('🥔'), ['aloo', 'alu']),
  row('Brinjal', 'Vegetables', 'Solanaceae', E('🍆'), ['eggplant', 'baingan', 'aubergine']),
  row('Chilli', 'Vegetables', 'Solanaceae', E('🌶️'), ['mirch', 'green chilli', 'hot pepper']),
  row('Capsicum', 'Vegetables', 'Solanaceae', S('fruit', { body: '#43a047', hi: '#81c784', shape: 'bell', leaf: '#2e7d32' }), ['bell pepper', 'shimla mirch']),
  row('Onion', 'Vegetables', 'Amaryllidaceae', E('🧅'), ['pyaz', 'pyaaz']),
  row('Garlic', 'Vegetables', 'Amaryllidaceae', E('🧄'), ['lahsun', 'lehsun']),
  row('Carrot', 'Vegetables', 'Apiaceae', E('🥕'), ['gajar']),
  row('Radish', 'Vegetables', 'Brassicaceae', S('root', { body: '#f8bbd0', top: '#43a047', shape: 'round' }), ['mooli']),
  row('Turnip', 'Vegetables', 'Brassicaceae', S('root', { body: '#ede7f6', top: '#66bb6a', shape: 'turnip', blush: '#ab47bc' }), ['shalgam']),
  row('Beetroot', 'Vegetables', 'Amaranthaceae', S('root', { body: '#8e1b4b', top: '#2e7d32', shape: 'round' }), ['beet', 'chukandar']),
  row('Cabbage', 'Vegetables', 'Brassicaceae', S('head', { outer: '#7cb342', inner: '#c5e1a5', shape: 'cabbage' }), ['patta gobi', 'band gobi']),
  row('Cauliflower', 'Vegetables', 'Brassicaceae', S('head', { outer: '#9ccc65', inner: '#fffde7', shape: 'cauli' }), ['phool gobi', 'gobi']),
  row('Broccoli', 'Vegetables', 'Brassicaceae', E('🥦'), []),
  row('Kohlrabi', 'Vegetables', 'Brassicaceae', S('head', { outer: '#aed581', inner: '#dcedc8', shape: 'kohl' }), ['knol khol', 'ganth gobi']),
  row('Okra', 'Vegetables', 'Malvaceae', S('gourd', { body: '#7cb342', shape: 'okra' }), ['bhindi', 'ladies finger']),
  row('Cucumber', 'Vegetables', 'Cucurbitaceae', E('🥒'), ['kheera', 'kakdi']),
  row('Bottle Gourd', 'Vegetables', 'Cucurbitaceae', S('gourd', { body: '#c5e1a5', shape: 'bottle' }), ['lauki', 'doodhi', 'ghia']),
  row('Bitter Gourd', 'Vegetables', 'Cucurbitaceae', S('gourd', { body: '#2e7d32', shape: 'bitter' }), ['karela', 'bitter melon']),
  row('Ridge Gourd', 'Vegetables', 'Cucurbitaceae', S('gourd', { body: '#558b2f', shape: 'ridged' }), ['turai', 'tori', 'luffa']),
  row('Pumpkin', 'Vegetables', 'Cucurbitaceae', S('gourd', { body: '#fb8c00', shape: 'round', stripe: '#e65100' }), ['kaddu']),
  row('Ash Gourd', 'Vegetables', 'Cucurbitaceae', S('gourd', { body: '#a5d6a7', shape: 'ash' }), ['petha', 'winter melon']),
  row('Beans', 'Vegetables', 'Fabaceae', S('pod', { pod: '#66bb6a', seed: '#a5d6a7', n: 6, shape: 'long' }), ['french beans', 'sem', 'pole beans']),
  row('Peas', 'Vegetables', 'Fabaceae', S('pod', { pod: '#7cb342', seed: '#c5e1a5', n: 5, shape: 'fat' }), ['matar', 'green peas']),
  row('Cluster Beans', 'Vegetables', 'Fabaceae', S('pod', { pod: '#388e3c', seed: '#81c784', n: 3, shape: 'flat' }), ['guar', 'gawar']),
  row('Sweet Potato', 'Vegetables', 'Convolvulaceae', E('🍠'), ['shakarkand']),
  row('Ginger', 'Vegetables', 'Zingiberaceae', S('tuber', { body: '#d7b98a', eye: '#a1887f', shape: 'rhizome' }), ['adrak']),
  row('Turmeric', 'Vegetables', 'Zingiberaceae', S('tuber', { body: '#ef6c00', eye: '#bf360c', shape: 'rhizome' }), ['haldi']),
  row('Drumstick', 'Vegetables', 'Moringaceae', S('gourd', { body: '#8bc34a', shape: 'drumstick' }), ['moringa', 'sahjan']),
  row('Colocasia', 'Vegetables', 'Araceae', S('tuber', { body: '#8d6e63', eye: '#5d4037', shape: 'corm' }), ['arbi', 'taro']),
  row('Yam', 'Vegetables', 'Dioscoreaceae', S('tuber', { body: '#a1887f', eye: '#6d4c41', shape: 'long' }), ['suran', 'jimikand']),

  // ============================================================ FRUITS (29)
  row('Mango', 'Fruits', 'Anacardiaceae', E('🥭'), ['aam'], 'Perennial tree'),
  row('Banana', 'Fruits', 'Musaceae', E('🍌'), ['kela']),
  row('Orange', 'Fruits', 'Rutaceae', E('🍊'), ['santra', 'narangi', 'mandarin'], 'Perennial tree'),
  row('Lemon', 'Fruits', 'Rutaceae', E('🍋'), ['nimbu', 'lime'], 'Perennial tree'),
  row('Sweet Lime', 'Fruits', 'Rutaceae', S('fruit', { body: '#9ccc65', hi: '#c5e1a5', shape: 'round', navel: true, citrus: true, leaf: '#2e7d32' }), ['mosambi'], 'Perennial tree'),
  row('Grapes', 'Fruits', 'Vitaceae', E('🍇'), ['angur']),
  row('Papaya', 'Fruits', 'Caricaceae', S('fruit', { body: '#ffa726', hi: '#ffcc80', shape: 'tall', leaf: '#388e3c' }), ['papita']),
  row('Apple', 'Fruits', 'Rosaceae', E('🍎'), ['seb']),
  row('Guava', 'Fruits', 'Myrtaceae', S('fruit', { body: '#c5e1a5', hi: '#f1f8e9', shape: 'round', blush: '#f48fb1', leaf: '#2e7d32' }), ['amrud']),
  row('Pomegranate', 'Fruits', 'Lythraceae', S('fruit', { body: '#c62828', hi: '#ef5350', shape: 'round', crown: '#8e1b1b' }), ['anar']),
  row('Pineapple', 'Fruits', 'Bromeliaceae', E('🍍'), ['ananas']),
  row('Watermelon', 'Fruits', 'Cucurbitaceae', E('🍉'), ['tarbuj']),
  row('Muskmelon', 'Fruits', 'Cucurbitaceae', E('🍈'), ['kharbuja', 'cantaloupe']),
  row('Jackfruit', 'Fruits', 'Moraceae', S('fruit', { body: '#9e9d24', hi: '#c0ca33', shape: 'oval', bumps: '#6d6d1a' }), ['kathal']),
  row('Sapota', 'Fruits', 'Sapotaceae', S('fruit', { body: '#a1744a', hi: '#c19a6b', shape: 'round', leaf: '#4e7a2e' }), ['chikoo', 'chiku', 'sapodilla']),
  row('Custard Apple', 'Fruits', 'Annonaceae', S('fruit', { body: '#7cb342', hi: '#aed581', shape: 'heart', scales: '#558b2f' }), ['sitaphal', 'sharifa']),
  row('Litchi', 'Fruits', 'Sapindaceae', S('cluster', { berry: '#d32f2f', stem: '#6d4c41', shape: 'litchi' }), ['lychee']),
  row('Coconut', 'Fruits', 'Arecaceae', E('🥥'), ['nariyal']),
  row('Fig', 'Fruits', 'Moraceae', S('fruit', { body: '#6a1b9a', hi: '#9c4dcc', shape: 'pear', leaf: '#2e7d32' }), ['anjeer']),
  row('Jamun', 'Fruits', 'Myrtaceae', S('cluster', { berry: '#4a148c', stem: '#5d4037', shape: 'jamun' }), ['black plum', 'jambul']),
  row('Ber', 'Fruits', 'Rhamnaceae', S('fruit', { body: '#c0ca33', hi: '#e6ee9c', shape: 'round', small: true }), ['indian jujube', 'bor']),
  row('Amla', 'Fruits', 'Phyllanthaceae', S('fruit', { body: '#aed581', hi: '#dcedc8', shape: 'round', ridge: true, small: true }), ['indian gooseberry', 'awla']),
  row('Pear', 'Fruits', 'Rosaceae', E('🍐'), ['nashpati']),
  row('Peach', 'Fruits', 'Rosaceae', E('🍑'), ['aadu']),
  row('Plum', 'Fruits', 'Rosaceae', S('fruit', { body: '#6a1b9a', hi: '#ab47bc', shape: 'round', leaf: '#2e7d32' }), ['aloo bukhara']),
  row('Strawberry', 'Fruits', 'Rosaceae', E('🍓'), []),
  row('Dragon Fruit', 'Fruits', 'Cactaceae', S('fruit', { body: '#e91e63', hi: '#f48fb1', shape: 'oval', scales: '#66bb6a' }), ['kamalam', 'pitaya']),
  row('Apricot', 'Fruits', 'Rosaceae', S('fruit', { body: '#ffb74d', hi: '#ffe0b2', shape: 'round', leaf: '#388e3c' }), ['khubani']),
  row('Bael', 'Fruits', 'Rutaceae', S('fruit', { body: '#c8a96a', hi: '#e8d5a3', shape: 'round', leaf: '#6b8e23' }), ['bel', 'stone apple']),

  // ============================================================ LEAFY CROPS & HERBS (26)
  row('Spinach', 'Leafy', 'Amaranthaceae', S('leaf', { c1: '#2e7d32', c2: '#43a047', shape: 'oval' }), ['palak']),
  row('Fenugreek', 'Leafy', 'Fabaceae', S('leaf', { c1: '#7cb342', c2: '#9ccc65', shape: 'trifoliate' }), ['methi']),
  row('Coriander', 'Leafy', 'Apiaceae', S('leaf', { c1: '#66bb6a', c2: '#a5d6a7', shape: 'lobed' }), ['dhania', 'cilantro']),
  row('Mint', 'Leafy', 'Lamiaceae', S('leaf', { c1: '#2e7d32', c2: '#66bb6a', shape: 'serrated' }), ['pudina']),
  row('Lettuce', 'Leafy', 'Asteraceae', S('leaf', { c1: '#aed581', c2: '#dcedc8', shape: 'frilly' }), ['salad patta']),
  row('Amaranth Leaves', 'Leafy', 'Amaranthaceae', S('leaf', { c1: '#c2185b', c2: '#66bb6a', shape: 'oval' }), ['chaulai', 'lal saag']),
  row('Curry Leaf', 'Leafy', 'Rutaceae', S('leaf', { c1: '#1b5e20', c2: '#388e3c', shape: 'pinnate' }), ['kadi patta', 'curry patta']),
  row('Dill', 'Leafy', 'Apiaceae', S('leaf', { c1: '#81c784', c2: '#c8e6c9', shape: 'feathery' }), ['suva', 'sowa']),
  row('Mustard Greens', 'Leafy', 'Brassicaceae', S('leaf', { c1: '#2e7d32', c2: '#7cb342', shape: 'lobed' }), ['sarson saag']),
  row('Kale', 'Leafy', 'Brassicaceae', S('leaf', { c1: '#2f5d4a', c2: '#5c8d78', shape: 'frilly' }), []),
  row('Celery', 'Leafy', 'Apiaceae', S('leaf', { c1: '#9ccc65', c2: '#dcedc8', shape: 'stalks' }), []),
  row('Parsley', 'Leafy', 'Apiaceae', S('leaf', { c1: '#2e7d32', c2: '#66bb6a', shape: 'curly' }), []),
  row('Spring Onion', 'Leafy', 'Amaryllidaceae', S('leaf', { c1: '#43a047', c2: '#ffffff', shape: 'blade' }), ['hara pyaz', 'scallion']),
  row('Bathua', 'Leafy', 'Amaranthaceae', S('leaf', { c1: '#689f38', c2: '#9ccc65', shape: 'arrow' }), ['lamb quarters']),
  row('Gongura', 'Leafy', 'Malvaceae', S('leaf', { c1: '#388e3c', c2: '#c62828', shape: 'star' }), ['roselle', 'ambadi', 'pundi']),
  row('Pak Choi', 'Leafy', 'Brassicaceae', S('leaf', { c1: '#558b2f', c2: '#f1f8e9', shape: 'stalks' }), ['bok choy']),
  row('Swiss Chard', 'Leafy', 'Amaranthaceae', S('leaf', { c1: '#2e7d32', c2: '#e53935', shape: 'stalks' }), ['chard']),
  row('Basil', 'Leafy', 'Lamiaceae', S('leaf', { c1: '#2e7d32', c2: '#7cb342', shape: 'heart' }), ['sweet basil']),
  row('Purslane', 'Leafy', 'Portulacaceae', S('leaf', { c1: '#7cb342', c2: '#c62828', shape: 'round' }), ['kulfa', 'lonia']),
  row('Water Spinach', 'Leafy', 'Convolvulaceae', S('leaf', { c1: '#33691e', c2: '#8bc34a', shape: 'arrow' }), ['kalmi saag', 'kangkong']),
  row('Malabar Spinach', 'Leafy', 'Basellaceae', S('leaf', { c1: '#2e7d32', c2: '#8e24aa', shape: 'heart' }), ['poi', 'basale']),
  row('Chicory', 'Leafy', 'Asteraceae', S('leaf', { c1: '#7cb342', c2: '#c5e1a5', shape: 'lobed' }), ['kasni']),
  row('Rocket', 'Leafy', 'Brassicaceae', S('leaf', { c1: '#558b2f', c2: '#9ccc65', shape: 'serrated' }), ['arugula', 'taramira']),
  row('Lemongrass', 'Leafy', 'Poaceae', S('leaf', { c1: '#9ccc65', c2: '#33691e', shape: 'blade' }), ['nimbu ghas']),
  row('Watercress', 'Leafy', 'Brassicaceae', S('leaf', { c1: '#2e7d32', c2: '#66bb6a', shape: 'round' }), []),
  row('Fennel', 'Leafy', 'Apiaceae', S('leaf', { c1: '#a5d6a7', c2: '#e8f5e9', shape: 'feathery' }), ['saunf']),
].map((crop) => ({ ...crop, iconKey: crop.icon.type === 'emoji' ? `emoji:${crop.icon.value}` : `svg:${JSON.stringify(crop.icon)}` }));

// ---------------------------------------------------------------------------- pairings
const partnerOf = (pair, cropId) => {
  const other = pair.a === cropId ? pair.b : pair.a;
  if (typeof other === 'string') {
    const crop = CROPS.find((c) => c.id === other);
    return { id: other, name: crop ? crop.name : other, external: false };
  }
  return { id: null, name: other.name, note: other.note, external: true };
};

export function pairsFor(cropId) {
  const mine = PAIRS.filter((p) => p.a === cropId || p.b === cropId);
  const all = mine.map((p) => ({ ...p, partner: partnerOf(p, cropId), sourceList: sourceList(p.sources), evidence: evidenceBadges(p) }));
  return {
    all,
    supported: all.filter((p) => p.status === 'supported'),
    potential: all.filter((p) => p.status === 'potential'),
    unsuitable: all.filter((p) => p.status === 'unsuitable'),
  };
}

// ---------------------------------------------------------------------------- lookups
export const matchesQuery = (crop, query) => {
  const q = norm(query);
  if (!q) return true;
  const partners = pairsFor(crop.id).all.map((p) => p.partner.name);
  return [crop.name, crop.family, ...crop.aliases, ...partners].some((h) => norm(h).includes(q));
};

export function filterCrops({ query = '', category = 'All Crops', crops = CROPS } = {}) {
  return crops.filter((c) => (category === 'All Crops' || c.category === category) && matchesQuery(c, query));
}

export function findCrop(nameOrAlias, crops = CROPS) {
  const q = norm(nameOrAlias);
  if (!q) return null;
  return crops.find((c) => norm(c.name) === q || c.id === slug(q) || c.aliases.some((a) => norm(a) === q)) || null;
}

export function catalogStats() {
  const counts = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0]));
  CROPS.forEach((c) => { counts[c.category] += 1; });
  return { total: CROPS.length, byCategory: counts };
}

// What to suggest when a crop has no verified pairing: (1) its own verified partners, then (2) the sourced
// general principles for its family. Never an invented pairing.
export function alternativesFor(crop) {
  const own = pairsFor(crop.id);
  const verified = [...own.supported, ...own.potential].map((p) => ({ partner: p.partner.name, status: p.status, summary: p.summary }));
  const principles = [{ key: 'family', ...GENERAL_PRINCIPLES.family, family: crop.family }];
  if (crop.family === 'Poaceae' || crop.family === 'Fabaceae') principles.unshift({ key: 'legume', ...GENERAL_PRINCIPLES.legume });
  principles.push({ key: 'caution', ...GENERAL_PRINCIPLES.caution });
  return { verified, principles: principles.map((p) => ({ ...p, sourceList: sourceList(p.sources) })) };
}

export function checkPair(aName, bName) {
  const a = findCrop(aName);
  const b = findCrop(bName);
  if (!a || !b) return { verdict: 'invalid', message: 'Pick two crops from the list.' };
  if (a.id === b.id) return { verdict: 'invalid', message: 'Pick two different crops.' };

  const pair = PAIRS.find((p) => typeof p.b === 'string' && ((p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id)));
  const base = { a, b, alternatives: { [a.id]: alternativesFor(a), [b.id]: alternativesFor(b) } };
  if (pair) return { ...base, verdict: pair.status, pair: { ...pair, sourceList: sourceList(pair.sources), evidence: evidenceBadges(pair) }, message: pair.summary };

  if (a.family === b.family) {
    return {
      ...base, verdict: 'insufficient', sameFamily: true,
      message: `No field research was found on growing ${a.name} and ${b.name} together. Both are in the ${a.family} family, which usually means shared pests and diseases, so the safer advice is to rotate them rather than combine them.`,
    };
  }
  return {
    ...base, verdict: 'insufficient', sameFamily: false,
    message: `No field research was found on growing ${a.name} and ${b.name} together. That does not mean they are incompatible: it means this tool cannot recommend or rule out the combination.`,
  };
}

// ---------------------------------------------------------------------------- self-check (used by tests)
export function validateCatalog() {
  const problems = [];
  const seen = { id: new Map(), name: new Map(), alias: new Map(), icon: new Map() };
  const claim = (bucket, key, who) => {
    if (seen[bucket].has(key)) problems.push(`${bucket} "${key}" used by both ${seen[bucket].get(key)} and ${who}`);
    else seen[bucket].set(key, who);
  };
  CROPS.forEach((c) => {
    claim('id', c.id, c.name);
    claim('name', norm(c.name), c.name);
    c.aliases.forEach((a) => claim('alias', norm(a), c.name));
    claim('icon', c.iconKey, c.name);
    if (!CATEGORY_META[c.category]) problems.push(`${c.name}: unknown category ${c.category}`);
    if (!c.family) problems.push(`${c.name}: missing botanical family`);
  });
  [...seen.alias.keys()].forEach((alias) => {
    if (seen.name.has(alias)) problems.push(`alias "${alias}" collides with the crop name ${seen.name.get(alias)}`);
  });
  PAIRS.forEach((p, i) => {
    const label = `pair #${i} (${p.a} + ${p.b.name || p.b})`;
    if (!CROPS.some((c) => c.id === p.a)) problems.push(`${label}: unknown crop a`);
    if (typeof p.b === 'string' && !CROPS.some((c) => c.id === p.b)) problems.push(`${label}: unknown crop b`);
    if (!STATUS_META[p.status] || p.status === 'insufficient') problems.push(`${label}: invalid status ${p.status}`);
    if (!p.sources || p.sources.length === 0) problems.push(`${label}: no sources`);
    (p.sources || []).forEach((s) => { if (!SOURCES[s]) problems.push(`${label}: unknown source ${s}`); });
    if (!p.summary) problems.push(`${label}: no summary`);
  });
  return problems;
}
