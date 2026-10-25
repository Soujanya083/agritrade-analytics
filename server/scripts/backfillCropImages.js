// Usage (from server/):  npm run backfill-images      (MONGO_URI from .env or the environment; PEXELS_API_KEY is optional)
//
// Repairs listings that show a placeholder: crops with no photo, or with the
// SVG cartoon the old frontend stored in imageUrl. Looks up a real photo per
// distinct (crop, category) once, then updates every matching listing.
// Replace the automatic photo of ONE crop (for example after choosing a better one in
// data/cropPhotoOverrides.json):   npm run backfill-images -- --refresh Potato
// Safe to re-run. Uploaded photos (PNG/JPEG/WebP data URIs, https URLs) are
// never touched.
require('dotenv').config();
const mongoose = require('mongoose');
const { createCropImageResolver } = require('../services/cropImages');

let overrides = {};
try { overrides = require('../data/cropPhotoOverrides.json'); } catch (e) { /* none */ }
const refreshIdx = process.argv.indexOf('--refresh');
const refreshCrop = refreshIdx > 0 ? process.argv[refreshIdx + 1] : null;
const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/agribid');
  const crops = mongoose.connection.collection('crops');
  const { resolveCropImage } = createCropImageResolver({
    apiKey: process.env.PEXELS_API_KEY,
    useWikipedia: process.env.CROP_PHOTO_WIKIPEDIA !== 'false',
    overrides,
    timeoutMs: 20000, // a one-off script can afford to wait: Wikipedia is sometimes slow (the app itself waits only 4 s)
  });

  // Normal run: listings with no photo or an old cartoon. With --refresh <Crop>: that crop's AUTOMATIC photos
  // (they carry a credit); photos uploaded by a farmer have no credit and are never touched.
  const needsImage = refreshCrop
    ? { cropName: { $regex: `^${escapeRegex(refreshCrop)}$`, $options: 'i' }, imageCredit: { $nin: [null, ''] }, imageUrl: { $regex: '^https?://', $options: 'i' } }
    : { $or: [{ imageUrl: null }, { imageUrl: '' }, { imageUrl: { $regex: '^data:image/svg', $options: 'i' } }] };
  const groups = await crops.aggregate([
    { $match: needsImage },
    { $group: { _id: { name: '$cropName', category: '$category' }, count: { $sum: 1 } } },
  ]).toArray();

  let updated = 0;
  let missed = 0;
  for (const { _id: { name, category }, count } of groups) {
    const photo = await resolveCropImage(name, category);
    if (!photo) { missed += count; console.log(`  no verified photo for "${name}" (${category}) - ${count} listing(s) keep the icon`); continue; }
    const result = await crops.updateMany(
      { ...needsImage, ...(refreshCrop ? {} : { cropName: name }), ...(refreshCrop ? { cropName: name } : {}), category },
      { $set: { imageUrl: photo.url, imageCredit: photo.credit } },
    );
    updated += result.modifiedCount;
    console.log(`  ${name} (${category}): ${result.modifiedCount} listing(s) updated`);
  }
  console.log(`Done. Updated ${updated}; ${missed} left on the icon placeholder.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
