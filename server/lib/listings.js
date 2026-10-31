// lib/listings.js - pure helpers for GET /api/crops (pagination, filters, image URLs).
// Kept free of Express/Mongoose so they can be unit-tested directly.
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const CATEGORIES = ['Grains', 'Vegetables', 'Fruits', 'Leafy'];
const STATUSES = ['open', 'deal_done', 'completed'];

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

function parsePagination(query = {}) {
  const page = Math.max(1, toInt(query.page, 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, toInt(query.limit, DEFAULT_LIMIT)));
  return { page, limit, skip: (page - 1) * limit };
}

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only whitelisted filters are ever turned into a Mongo query: nothing from the
// query string is passed through as an operator (no NoSQL-injection via ?status[$ne]=x).
function buildListFilter(query = {}) {
  const filter = {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  if (CATEGORIES.includes(str(query.category))) filter.category = str(query.category);
  if (STATUSES.includes(str(query.status))) filter.status = str(query.status);
  if (/^[a-f0-9]{24}$/i.test(str(query.farmerId))) filter.farmerId = str(query.farmerId);
  const q = str(query.q).slice(0, 60);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ cropName: rx }, { variety: rx }, { location: rx }];
  }
  return filter;
}

const DATA_URI = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

// Splits an inline image into { mime, buffer }, or null when it is not an inline image.
function parseInlineImage(value) {
  const match = DATA_URI.exec(String(value || ''));
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

// Inline (data-URI) photos used to be shipped inside EVERY listing of EVERY page load
// (up to 400 KB each). The list now carries a small cacheable URL instead; external
// https photos are passed through unchanged.
function toListItem(crop, baseUrl) {
  const item = { ...crop };
  if (typeof item.imageUrl === 'string' && item.imageUrl.startsWith('data:')) {
    const version = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    item.imageUrl = `${baseUrl}/api/crops/${item._id}/image?v=${version}`;
  }
  return item;
}

function pageMeta({ page, limit, total, returned }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasMore: (page - 1) * limit + returned < total };
}

module.exports = {
  DEFAULT_LIMIT, MAX_LIMIT, parsePagination, buildListFilter, parseInlineImage, toListItem, pageMeta, escapeRegex,
};
