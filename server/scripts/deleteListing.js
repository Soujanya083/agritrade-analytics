// Deletes one or more of YOUR listings after showing exactly what will go.
//
//   npm run delete-listing -- --crop rice --location banglore
//
// It matches the crop name exactly and the location loosely (both ignore capital letters), prints every match with
// its price, bids and photo type, and waits for you to type DELETE. A listing with a deal (accepted bid or payment
// record) is never deleted. Uses MONGO_URI from .env or the environment (set it to the Atlas address for the live
// site, as with the other scripts).
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const photoKind = (c) => (!c.imageUrl ? 'no photo' : /^data:image\/svg/i.test(c.imageUrl) ? 'old cartoon' : c.imageCredit ? 'automatic photo' : 'UPLOADED photo');
const ask = (q) => new Promise((resolve) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); resolve(a); }); });

async function main() {
  const crop = arg('crop');
  const location = arg('location');
  if (!crop) { console.log('Usage: npm run delete-listing -- --crop <name> [--location <place>]'); return; }
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/agribid';
  await mongoose.connect(uri);
  console.log(`Database: ${mongoose.connection.name} on ${uri.replace(/\/\/[^@/]*@/, '//<hidden>@')}`);
  const crops = mongoose.connection.collection('crops');
  const bids = mongoose.connection.collection('bids');
  const transactions = mongoose.connection.collection('transactions');

  const filter = { cropName: { $regex: `^${escapeRegex(crop)}$`, $options: 'i' } };
  if (location) filter.location = { $regex: escapeRegex(location), $options: 'i' };
  const matches = await crops.find(filter).toArray();
  if (matches.length === 0) { console.log('No listing matches. Nothing to do.'); await mongoose.disconnect(); return; }

  const deletable = [];
  for (const c of matches) {
    const bidCount = await bids.countDocuments({ cropId: c._id });
    const hasDeal = Boolean(c.acceptedBidId) || (await transactions.countDocuments({ cropId: c._id })) > 0;
    console.log(`- ${c._id}  ${c.cropName} - ${c.variety}, ${c.quantityKg} kg, ${c.location}, base INR ${c.basePrice}/kg, status ${c.status}, ${bidCount} bid(s), ${photoKind(c)}${hasDeal ? '  <- HAS A DEAL: will NOT be deleted' : ''}`);
    if (!hasDeal) deletable.push(c);
  }
  if (deletable.length === 0) { console.log('Nothing can be deleted.'); await mongoose.disconnect(); return; }

  const answer = await ask(`Type DELETE to remove ${deletable.length} listing(s) and their bids: `);
  if (answer.trim() !== 'DELETE') { console.log('Cancelled. Nothing was deleted.'); await mongoose.disconnect(); return; }
  const ids = deletable.map((c) => c._id);
  const removedBids = await bids.deleteMany({ cropId: { $in: ids } });
  const removedCrops = await crops.deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${removedCrops.deletedCount} listing(s) and ${removedBids.deletedCount} bid(s).`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
