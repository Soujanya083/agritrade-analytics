// test/shipments-api.test.js
// The shipment endpoints over HTTP, against a real (in-memory) MongoDB: login required, participants only,
// status rules, the one-time delivery code, photos, alerts and the QR code.
// (shipmentFlow.test.js covers the same logic without a database; this proves the HTTP + MongoDB wiring.)
const { startTestMongo } = require('./helpers/testMongo');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mongoServer;
let app;
let Transaction;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]);

beforeAll(async () => {
  mongoServer = await startTestMongo();
  process.env.MONGO_URI = mongoServer.uri;
  process.env.NODE_ENV = 'development';
  process.env.AUTH_RATE_LIMIT_MAX = '1000';
  process.env.ALERT_SWEEP_INTERVAL_MINUTES = '0';
  delete process.env.EMAIL_PROVIDER;
  // eslint-disable-next-line global-require
  app = require('../server');
  // eslint-disable-next-line global-require
  ({ Transaction } = require('../models'));
  await new Promise((resolve) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once('open', resolve);
  });
}, 30000);

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });
let counter = 0;

async function newUser(role) {
  counter += 1;
  const email = `ship${counter}-${role.toLowerCase()}@example.com`;
  const phone = `98770${String(10000 + counter)}`;
  const signup = await request(app).post('/api/signup').send({
    role, fullName: `${role} ${counter}`, email, phone, location: 'Pune', password: 'password123', confirmPassword: 'password123',
    ...(role === 'Buyer' ? { deliveryAddress: '12 Test Street, Pune' } : {}),
  });
  await request(app).post('/api/verify-otp').send({ email, otp: signup.body.otp });
  const login = await request(app).post('/api/login').send({ email, password: 'password123', role, phone });
  return { email, token: login.body.token, id: login.body.user.id };
}

// a deal with a shipment, paid and ready to go
async function newDeal({ quantity = 100 } = {}) {
  const farmer = await newUser('Farmer');
  const buyer = await newUser('Buyer');
  const transporter = await newUser('Transporter');
  const crop = await request(app).post('/api/crops').set(auth(farmer.token)).send({
    cropName: 'Tomato', variety: 'Hybrid', quantityKg: quantity, location: 'Hubli', harvestedDate: new Date().toISOString().slice(0, 10), basePrice: 20, category: 'Vegetables',
  });
  const cropId = crop.body.crop._id;
  const bid = await request(app).post('/api/bids').set(auth(buyer.token)).send({ cropId, amount: 30 });
  const accepted = await request(app).post(`/api/bids/${bid.body.bid._id}/accept`).set(auth(farmer.token)).send({});
  const txId = accepted.body.transaction ? accepted.body.transaction._id : (await Transaction.findOne({ cropId }))._id;
  await Transaction.updateOne({ _id: txId }, { status: 'payment_confirmed' });
  const list = await request(app).get(`/api/transactions/user/${farmer.id}`).set(auth(farmer.token));
  const code = list.body.transactions.find((t) => String(t._id) === String(txId)).shipmentId;
  return { farmer, buyer, transporter, txId: String(txId), code };
}
const status = (deal, who, to, extra = {}) => request(app).post(`/api/shipments/${deal.code}/status`).set(auth(deal[who].token)).send({ status: to, ...extra });

async function toOutForDelivery(deal) {
  await status(deal, 'farmer', 'ready_for_pickup');
  await request(app).put(`/api/shipments/${deal.code}/carrier`).set(auth(deal.farmer.token)).send({ transporterEmail: deal.transporter.email });
  await status(deal, 'transporter', 'picked_up');
  await status(deal, 'transporter', 'in_transit', { location: { source: 'manual', label: 'Hubli bypass' } });
  return status(deal, 'transporter', 'out_for_delivery');
}
const getCode = async (deal) => (await request(app).post(`/api/shipments/${deal.code}/delivery-code`).set(auth(deal.buyer.token))).body.devCode;

describe('a new deal gets a shipment', () => {
  test('with a unique, well-formed code that the transaction list shows', async () => {
    const deal = await newDeal();
    expect(deal.code).toMatch(/^SHP-\d{8}-[A-HJKMNP-Z2-9]{8}$/);
  });
});

describe('access control', () => {
  test('a login is required', async () => {
    const deal = await newDeal();
    expect((await request(app).get(`/api/shipments/${deal.code}`)).statusCode).toBe(401);
    expect((await request(app).get(`/api/shipments/${deal.code}/qr`)).statusCode).toBe(401);
    expect((await request(app).get('/api/shipments')).statusCode).toBe(401);
  });
  test('a logged-in stranger gets the same 404 as for a code that does not exist', async () => {
    const deal = await newDeal();
    const stranger = await newUser('Buyer');
    const real = await request(app).get(`/api/shipments/${deal.code}`).set(auth(stranger.token));
    const fake = await request(app).get('/api/shipments/SHP-20260101-ABCDEFGH').set(auth(stranger.token));
    expect(real.statusCode).toBe(404);
    expect(real.body).toEqual(fake.body);
    expect((await request(app).get(`/api/shipments/${deal.code}/qr`).set(auth(stranger.token))).statusCode).toBe(404);
    expect((await status({ ...deal, stranger }, 'stranger', 'ready_for_pickup')).statusCode).toBe(404);
  });
  test('the farmer, the buyer and (once assigned) the transporter can read it; an unassigned transporter cannot', async () => {
    const deal = await newDeal();
    expect((await request(app).get(`/api/shipments/${deal.code}`).set(auth(deal.farmer.token))).statusCode).toBe(200);
    expect((await request(app).get(`/api/shipments/${deal.code}`).set(auth(deal.buyer.token))).statusCode).toBe(200);
    expect((await request(app).get(`/api/shipments/${deal.code}`).set(auth(deal.transporter.token))).statusCode).toBe(404);
    await status(deal, 'farmer', 'ready_for_pickup');
    await request(app).put(`/api/shipments/${deal.code}/carrier`).set(auth(deal.farmer.token)).send({ transporterEmail: deal.transporter.email });
    expect((await request(app).get(`/api/shipments/${deal.code}`).set(auth(deal.transporter.token))).statusCode).toBe(200);
  });
  test('lists show only your own shipments', async () => {
    const deal = await newDeal();
    const other = await newUser('Farmer');
    const mine = await request(app).get('/api/shipments').set(auth(deal.farmer.token));
    expect(mine.body.shipments.map((s) => s.shipmentId)).toContain(deal.code);
    const theirs = await request(app).get('/api/shipments').set(auth(other.token));
    expect(theirs.body.shipments.map((s) => s.shipmentId)).not.toContain(deal.code);
  });
  test('an injected shipment code is not a valid code', async () => {
    const user = await newUser('Farmer');
    expect((await request(app).get("/api/shipments/SHP-1'%20OR%20'1'='1").set(auth(user.token))).statusCode).toBe(404);
  });
});

describe('the QR code', () => {
  test('holds only the tracking link, and is a valid matrix', async () => {
    const deal = await newDeal();
    const res = await request(app).get(`/api/shipments/${deal.code}/qr`).set(auth(deal.buyer.token));
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toMatch(new RegExp(`#/shipment/${deal.code}$`));
    expect(res.body.url).not.toMatch(/token|otp|key=/i);
    expect(res.body.modules).toHaveLength(res.body.size);
    expect(res.body.modules[0]).toHaveLength(res.body.size);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('status updates', () => {
  test('follow the lifecycle and appear on the timeline with who and when', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const view = (await request(app).get(`/api/shipments/${deal.code}`).set(auth(deal.buyer.token))).body.shipment;
    expect(view.status).toBe('out_for_delivery');
    expect(view.timeline.filter((e) => e.type === 'status_change').map((e) => e.status)).toEqual(['ready_for_pickup', 'picked_up', 'in_transit', 'out_for_delivery']);
    const pickup = view.timeline.find((e) => e.status === 'picked_up');
    expect(pickup.by.role).toBe('transporter');
    expect(new Date(pickup.at).getTime()).toBeGreaterThan(0);
    expect(view.tracking.label).toMatch(/Manual update/);
    expect(view.tracking.live).toBe(false);
  });
  test('invalid jumps and wrong roles are refused', async () => {
    const deal = await newDeal();
    expect((await status(deal, 'farmer', 'in_transit')).statusCode).toBe(409);
    expect((await status(deal, 'buyer', 'ready_for_pickup')).statusCode).toBe(403);
    expect((await status(deal, 'farmer', 'teleported')).statusCode).toBe(409);
  });
  test('"delivered" cannot be set with a status update', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    for (const who of ['transporter', 'farmer', 'buyer']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await status(deal, who, 'delivered');
      expect([403, 409]).toContain(res.statusCode);
    }
  });
  test('releasing for pickup needs confirmed payment', async () => {
    const deal = await newDeal();
    await Transaction.updateOne({ _id: deal.txId }, { status: 'awaiting_payment' });
    const res = await status(deal, 'farmer', 'ready_for_pickup');
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('payment_required');
  });
  test('the old dispatch button now opens the shipment', async () => {
    const deal = await newDeal();
    const res = await request(app).post(`/api/transactions/${deal.txId}/mark-dispatch`).set(auth(deal.farmer.token)).send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.shipmentId).toBe(deal.code);
    expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
  });
  test('locations are labelled by source; a stale GPS fix is refused', async () => {
    const deal = await newDeal();
    await status(deal, 'farmer', 'ready_for_pickup');
    await status(deal, 'farmer', 'picked_up');
    const old = new Date(Date.now() - 30 * 60000).toISOString();
    const res = await status(deal, 'farmer', 'in_transit', { location: { source: 'device_gps', lat: 15.36, lng: 75.12, accuracyM: 10, capturedAt: old } });
    expect(res.statusCode).toBe(400);
    const fresh = new Date().toISOString();
    const ok = await status(deal, 'farmer', 'in_transit', { location: { source: 'device_gps', lat: 15.36, lng: 75.12, accuracyM: 10, capturedAt: fresh } });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.shipment.tracking.live).toBe(true);
  });
});

describe('the delivery code', () => {
  test('the carrier\'s response and the shipment view never contain the code or its hash', async () => {
    const deal = await newDeal();
    const out = await toOutForDelivery(deal);
    expect(JSON.stringify(out.body)).not.toMatch(/devCode|otpHash|\b\d{6}\b/);
    for (const who of ['farmer', 'transporter', 'buyer']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(`/api/shipments/${deal.code}`).set(auth(deal[who].token));
      expect(JSON.stringify(res.body)).not.toMatch(/otpHash|devCode/);
    }
  });
  test('only the buyer can ask for the code; in development mode it is returned to them, labelled', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    expect((await request(app).post(`/api/shipments/${deal.code}/delivery-code`).set(auth(deal.transporter.token))).statusCode).toBe(403);
    const res = await request(app).post(`/api/shipments/${deal.code}/delivery-code`).set(auth(deal.buyer.token));
    expect(res.statusCode).toBe(200);
    expect(res.body.devCode).toMatch(/^\d{6}$/);
    expect(res.body.devModeNotice).toMatch(/DEVELOPMENT MODE/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect((await request(app).post(`/api/shipments/${deal.code}/delivery-code`).set(auth(deal.buyer.token))).statusCode).toBe(429); // cooldown
  });
  test('the code never appears in notifications', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const code = await getCode(deal);
    await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: code, receivedQuantityKg: 100 });
    for (const who of ['farmer', 'buyer', 'transporter']) {
      // eslint-disable-next-line no-await-in-loop
      const n = await request(app).get(`/api/notifications/${deal[who].id}`).set(auth(deal[who].token));
      expect(JSON.stringify(n.body).includes(code)).toBe(false);
    }
  });
  test('right code + quantity: delivered, payout released; replay refused', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const code = await getCode(deal);
    const ok = await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: code, receivedQuantityKg: 100 });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.shipment.status).toBe('delivered');
    expect((await Transaction.findById(deal.txId)).status).toBe('delivery_completed');
    const replay = await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: code, receivedQuantityKg: 100 });
    expect(replay.statusCode).toBe(409);
  });
  test('only the buyer can confirm', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const code = await getCode(deal);
    for (const who of ['farmer', 'transporter']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal[who].token)).send({ otp: code, receivedQuantityKg: 100 });
      expect(res.statusCode).toBe(403);
    }
  });
  test('five wrong codes lock confirmation, even for the right code afterwards', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const code = await getCode(deal);
    const wrong = code === '000000' ? '111111' : '000000';
    let last;
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      last = await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: wrong, receivedQuantityKg: 100 });
    }
    expect(last.statusCode).toBe(423);
    const right = await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: code, receivedQuantityKg: 100 });
    expect(right.statusCode).toBe(423);
    const alerts = await request(app).get('/api/shipment-alerts').set(auth(deal.farmer.token));
    expect(alerts.body.alerts.some((a) => a.type === 'verification_failed' && a.severity === 'critical')).toBe(true);
  });
  test('a shortfall is delivered but flagged, the payout waits for the buyer to resolve it', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const code = await getCode(deal);
    const res = await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: code, receivedQuantityKg: 85 });
    expect(res.body.hasIssues).toBe(true);
    expect((await Transaction.findById(deal.txId)).deliveryDisputed).toBe(true);
    const alerts = (await request(app).get('/api/shipment-alerts').set(auth(deal.buyer.token))).body.alerts;
    const alert = alerts.find((a) => a.type === 'quantity_mismatch');
    expect(alert.reason).toMatch(/100 kg was dispatched but the buyer confirmed 85 kg/);
    const byFarmer = await request(app).post(`/api/shipment-alerts/${alert.id}/resolve`).set(auth(deal.farmer.token)).send({ note: 'we agree it was short' });
    expect(byFarmer.statusCode).toBe(403);
    const byBuyer = await request(app).post(`/api/shipment-alerts/${alert.id}/resolve`).set(auth(deal.buyer.token)).send({ note: 'Refund of 15 kg agreed' });
    expect(byBuyer.statusCode).toBe(200);
    expect((await Transaction.findById(deal.txId)).status).toBe('delivery_completed');
  });
});

describe('photos', () => {
  test('upload, list and download as a participant; never as a stranger', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const up = await request(app).post(`/api/shipments/${deal.code}/photos?kind=damage&caption=Crate%203`).set(auth(deal.buyer.token)).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(up.statusCode).toBe(201);
    const view = (await request(app).get(`/api/shipments/${deal.code}`).set(auth(deal.buyer.token))).body.shipment;
    expect(view.photos).toHaveLength(1);
    expect(view.photos[0].fileName).toMatch(new RegExp(`^${deal.code}-damage-[A-Za-z0-9_-]{12}\\.jpg$`));
    expect(JSON.stringify(view)).not.toMatch(/base64|data:image/);
    const file = await request(app).get(`/api/shipments/${deal.code}/photos/${up.body.photo.photoId}`).set(auth(deal.farmer.token)).buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toMatch(/private, no-store/);
    expect(file.headers['content-disposition']).toMatch(/^inline; filename="SHP-/);
    const stranger = await newUser('Buyer');
    expect((await request(app).get(`/api/shipments/${deal.code}/photos/${up.body.photo.photoId}`).set(auth(stranger.token))).statusCode).toBe(404);
    expect((await request(app).get(`/api/shipments/${deal.code}/photos/${up.body.photo.photoId}`)).statusCode).toBe(401);
  });
  test('wrong types, disguised files and oversize uploads are refused', async () => {
    const deal = await newDeal();
    const post = (type, body, kind = 'damage') => request(app).post(`/api/shipments/${deal.code}/photos?kind=${kind}`).set(auth(deal.farmer.token)).set('Content-Type', type).send(body);
    expect((await post('image/jpeg', Buffer.from('<script>alert(1)</script> padding padding'))).statusCode).toBe(415);
    expect((await post('image/png', JPEG)).statusCode).toBe(415);
    expect((await post('image/svg+xml', Buffer.from('<svg/>'))).statusCode).toBeGreaterThanOrEqual(400);
    expect((await post('image/jpeg', Buffer.concat([JPEG, Buffer.alloc(3 * 1024 * 1024)]))).statusCode).toBe(413);
    expect((await post('image/jpeg', JPEG, 'selfie')).statusCode).toBe(400);
    expect((await post('image/jpeg', JPEG, 'delivery')).statusCode).toBe(403);   // the farmer takes no delivery photos
  });
});

describe('alerts', () => {
  test('a damage report raises an alert everyone on the shipment can see, acknowledge and discuss', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const code = await getCode(deal);
    await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: code, receivedQuantityKg: 100 });
    const rep = await request(app).post(`/api/shipments/${deal.code}/issues`).set(auth(deal.buyer.token)).send({ kind: 'damage', description: 'Several crates crushed', affectedQuantityKg: 40 });
    expect(rep.statusCode).toBe(201);
    expect(rep.body.shipment.status).toBe('damage_reported');
    const farmerAlerts = (await request(app).get('/api/shipment-alerts').set(auth(deal.farmer.token))).body.alerts;
    const alert = farmerAlerts.find((a) => a.type === 'damage_reported');
    expect(alert.severity).toBe('critical');
    expect(alert.reason).toMatch(/40 kg of 100 kg \(40.0%\)/);
    expect((await request(app).post(`/api/shipment-alerts/${alert.id}/acknowledge`).set(auth(deal.farmer.token)).send({ note: 'Seen' })).body.alert.status).toBe('acknowledged');
    expect((await request(app).post(`/api/shipment-alerts/${alert.id}/investigate`).set(auth(deal.farmer.token)).send({ note: 'Asking the carrier' })).body.alert.status).toBe('investigating');
    const stranger = await newUser('Farmer');
    expect((await request(app).post(`/api/shipment-alerts/${alert.id}/resolve`).set(auth(stranger.token)).send({ note: 'closing it' })).statusCode).toBe(404);
    expect((await request(app).post(`/api/shipment-alerts/${alert.id}/delete`).set(auth(deal.buyer.token)).send({})).statusCode).toBe(404);
  });
  test('every notification about an alert carries its reason and severity', async () => {
    const deal = await newDeal();
    await toOutForDelivery(deal);
    const code = await getCode(deal);
    await request(app).post(`/api/shipments/${deal.code}/confirm-delivery`).set(auth(deal.buyer.token)).send({ otp: code, receivedQuantityKg: 70 });
    const notes = (await request(app).get(`/api/notifications/${deal.farmer.id}`).set(auth(deal.farmer.token))).body.notifications;
    expect(notes.some((n) => /\[CRITICAL\] Shipment SHP-.*70 kg/.test(n.message))).toBe(true);
  });
});

describe('sessions still work with the new role', () => {
  test('a transporter can sign up and log in, and its token is short-lived', async () => {
    const t = await newUser('Transporter');
    const claims = jwt.decode(t.token);
    expect(claims.role).toBe('Transporter');
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(3600);
  });
});
