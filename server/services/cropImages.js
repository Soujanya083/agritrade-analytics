// cropImages.js - finds a real photo of the crop a farmer is listing.
//
// What was wrong before (verified in the original code):
//  1. The frontend always sent an SVG data-URI as imageUrl, so the server's
//     `imageUrl || resolveCropImage()` NEVER reached Pexels for UI listings.
//  2. The query was "<crop> vegetable farm" for every crop - wrong for fruits
//     and grains ("Orange vegetable farm"), and it took the first hit blindly.
//  3. A failed lookup was cached as null FOREVER (until restart).
//
// Now: category-aware queries, local-name aliases (Brinjal -> eggplant),
// several candidates per query, each verified against the photo's alt text.
// If nothing convincingly shows the crop we return null and the UI shows a
// clearly-labelled icon - an honest placeholder beats a wrong photo.

const ALIASES = {
  brinjal: ['eggplant', 'aubergine'], jowar: ['sorghum'], bajra: ['pearl millet'], ragi: ['finger millet'],
  maize: ['corn', 'maize'], chana: ['chickpea', 'chickpeas'], 'toor dal': ['pigeon pea', 'pigeon peas'],
  'tur dal': ['pigeon pea'], moong: ['mung bean', 'mung beans'], urad: ['black gram'], masoor: ['lentil', 'lentils'],
  'green chilli': ['chili', 'chilli', 'chile'], chilli: ['chili', 'chilli'], capsicum: ['bell pepper', 'capsicum'],
  'bitter gourd': ['bitter melon', 'bitter gourd'], 'bottle gourd': ['bottle gourd'], 'ladies finger': ['okra'],
  bhindi: ['okra'], sapota: ['sapodilla'], litchi: ['lychee'], peas: ['pea', 'peas'], beans: ['bean', 'beans'],
  groundnut: ['peanut', 'groundnut'], sugarcane: ['sugarcane', 'sugar cane'], cotton: ['cotton'],
  tomato: ['tomato', 'tomatoes'], potato: ['potato', 'potatoes'], onion: ['onion', 'onions'],
  mango: ['mango', 'mangoes'], banana: ['banana', 'bananas'], apple: ['apple', 'apples'], grapes: ['grape', 'grapes'],
  orange: ['orange', 'oranges'], carrot: ['carrot', 'carrots'], wheat: ['wheat'], rice: ['rice', 'paddy'],
};

// Words that signal the photo is NOT a real picture of the crop.
const REJECT_WORDS = ['illustration', 'cartoon', 'vector', 'drawing', 'clipart', 'icon', 'logo', 'pattern', 'texture', 'wallpaper', 'background', 'render'];
const CATEGORY_WORDS = { fruits: ['fruit', 'fruits'], vegetables: ['vegetable', 'vegetables'], grains: ['grain', 'grains', 'field', 'crop', 'harvest', 'seeds'] };

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normCategory = (c) => { const k = norm(c); return CATEGORY_WORDS[k] ? k : null; };

// Names to look for in a photo's alt text, e.g. brinjal -> [brinjal, eggplant, aubergine].
function matchTerms(cropName) {
  const name = norm(cropName);
  return [...new Set([name, ...(ALIASES[name] || [])])].filter(Boolean);
}

// Ordered list of Pexels queries to try for this crop.
function buildSearchPlan(cropName, category) {
  const name = norm(cropName);
  const term = (ALIASES[name] && ALIASES[name][0]) || name;
  const cat = normCategory(category);
  if (cat === 'fruits') return [`${term} fruit`, `fresh ${term}`];
  if (cat === 'vegetables') return [`${term} vegetable`, `fresh ${term}`];
  if (cat === 'grains') return [`${term} grain`, `${term} crop field`, `${term} seeds`];
  return [`fresh ${term}`, `${term} agriculture`];
}

// Score a Pexels photo for a crop. Returns -Infinity when it must be rejected.
function scorePhoto(photo, cropName, category) {
  const alt = norm(photo && photo.alt);
  if (!alt) return -Infinity; // can't verify what it shows -> don't use it
  if (REJECT_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(alt))) return -Infinity;
  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // whole word, optionally plural ("orange" matches "oranges" but not "orangery")
  const named = matchTerms(cropName).some((t) => new RegExp(`\\b${escape(t)}(?:s|es)?\\b`).test(alt));
  if (!named) return -Infinity;
  let score = 3;
  const cat = normCategory(category);
  if (cat && CATEGORY_WORDS[cat].some((w) => alt.includes(w))) score += 1;
  if (photo.width && photo.height && photo.width >= photo.height) score += 0.5; // landscape fits the card
  return score;
}

const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000; // retry soon: a failure may be transient
const RATE_LIMIT_BACKOFF_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

function createCropImageResolver({
  apiKey, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 4000, logger = console,
} = {}) {
  const cache = new Map(); // key -> { value, expires }
  const inflight = new Map();
  let blockedUntil = 0;

  const remember = (key, value, ttl) => {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: now() + ttl });
  };

  async function search(query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`;
      const response = await fetchImpl(url, { headers: { Authorization: apiKey }, signal: controller.signal });
      if (response.status === 429) { blockedUntil = now() + RATE_LIMIT_BACKOFF_MS; return null; }
      if (!response.ok) return null;
      return (await response.json()).photos || [];
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookup(cropName, category) {
    for (const query of buildSearchPlan(cropName, category)) {
      if (now() < blockedUntil) return null;
      const photos = await search(query);
      if (!photos) return null;
      let best = null;
      let bestScore = -Infinity;
      photos.forEach((photo) => {
        const score = scorePhoto(photo, cropName, category);
        if (score > bestScore) { best = photo; bestScore = score; }
      });
      if (best && bestScore > -Infinity && best.src && best.src.medium) {
        return {
          url: best.src.medium,
          credit: best.photographer ? `Photo by ${best.photographer} on Pexels` : 'Photo from Pexels',
          sourceUrl: best.url || 'https://www.pexels.com',
        };
      }
    }
    return null;
  }

  // Resolves to { url, credit, sourceUrl } or null. Never throws, never blocks listing a crop.
  async function resolveCropImage(cropName, category) {
    if (!apiKey || !norm(cropName)) return null;
    const key = `${norm(cropName)}|${normCategory(category) || ''}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.value;
    if (inflight.has(key)) return inflight.get(key);

    const task = (async () => {
      try {
        const value = await lookup(cropName, category);
        remember(key, value, value ? SUCCESS_TTL_MS : FAILURE_TTL_MS);
        return value;
      } catch (error) {
        logger.warn && logger.warn(`Crop image lookup failed for "${cropName}": ${error.name}`);
        remember(key, null, FAILURE_TTL_MS);
        return null;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, task);
    return task;
  }

  return { resolveCropImage, _cache: cache };
}

module.exports = { createCropImageResolver, buildSearchPlan, scorePhoto, matchTerms };
