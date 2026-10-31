// lib/cropPhotos.js - real crop photos, used when a farmer doesn't upload their own.
// All the logic (category-aware queries, relevance checks, caching) lives in
// services/cropImages.js. resolveCropImage returns { url, credit, sourceUrl } or null.
// Pexels is used when a key is set, and the keyless Wikipedia fallback is always
// available (turn it off with CROP_PHOTO_WIKIPEDIA=false).
const { createCropImageResolver } = require('../services/cropImages');

let cropPhotoOverrides = {};
try { cropPhotoOverrides = require('../data/cropPhotoOverrides.json'); } catch (e) { /* no overrides file: fine */ }

const { resolveCropImage } = createCropImageResolver({
  overrides: cropPhotoOverrides,
  apiKey: process.env.PEXELS_API_KEY,
  // never reach out to Wikipedia from automated tests
  useWikipedia: process.env.CROP_PHOTO_WIKIPEDIA !== 'false' && !process.env.JEST_WORKER_ID,
});

module.exports = { resolveCropImage };
