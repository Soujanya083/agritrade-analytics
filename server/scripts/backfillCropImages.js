// Usage (from server/):  PEXELS_API_KEY=... MONGO_URI=... npm run backfill-images
//
// Repairs listings that show a placeholder: crops with no photo, or with the
// SVG cartoon the old frontend stored in imageUrl. Looks up a real photo per
// distinct (crop, category) once, then updates every matching listing.
// Safe to re-run. Uploaded photos (PNG/JPEG/WebP data URIs, https URLs) are
// never touched.
require('dotenv').config();
const mongoose = require('mongoose');
const { createCropImageResolver } = require('../services/cropImages');

async function main() {
  if (!process.env.PEXELS_API_KEY) {
    console.error('PEXELS_API_KEY is not set - nothing can be looked up. Get a free key at https://www.pexels.com/api/');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/agribid');
  const crops = mongoose.connection.collection('crops');
  const { resolveCropImage } = createCropImageResolver({ apiKey: process.env.PEXELS_API_KEY });

  const needsImage = {
    $or: [{ imageUrl: null }, { imageUrl: '' }, { imageUrl: { $regex: '^data:image/svg', $options: 'i' } }],
  };
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
      { ...needsImage, cropName: name, category },
      { $set: { imageUrl: photo.url, imageCredit: photo.credit } },
    );
    updated += result.modifiedCount;
    console.log(`  ${name} (${category}): ${result.modifiedCount} listing(s) updated`);
  }
  console.log(`Done. Updated ${updated}; ${missed} left on the icon placeholder.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
