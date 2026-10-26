// One-off: gives EXISTING listings the same canonical crop name that new listings now get
// ("rice" -> "Rice"), so one crop is no longer counted twice in the analytics.
//   npm run normalize-crop-names            shows what would change
//   npm run normalize-crop-names -- --apply  makes the change
// Uses MONGO_URI from .env or the environment (set it to the Atlas address for the live site).
require('dotenv').config();
const mongoose = require('mongoose');
const { toCropName } = require('../validators');

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/agribid';
  await mongoose.connect(uri);
  console.log(`Database: ${mongoose.connection.name} on ${uri.replace(/\/\/[^@/]*@/, '//<hidden>@')}`);
  const crops = mongoose.connection.collection('crops');
  const names = await crops.distinct('cropName');
  let changed = 0;
  for (const name of names) {
    const tidy = toCropName(name);
    if (tidy === name) continue;
    const count = await crops.countDocuments({ cropName: name });
    console.log(`  "${name}" -> "${tidy}"  (${count} listing${count === 1 ? '' : 's'})`);
    if (apply) await crops.updateMany({ cropName: name }, { $set: { cropName: tidy } });
    changed += count;
  }
  console.log(changed === 0 ? 'Nothing to change.' : apply ? `Updated ${changed} listing(s).` : `${changed} listing(s) would change. Run again with --apply.`);
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
