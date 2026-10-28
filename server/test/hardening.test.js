// test/hardening.test.js
// Integration tests for the security/robustness fixes: atomic bid acceptance,
// image validation, login ordering, CORS, trusted-proxy rate limiting, OTP.
// Same harness as api.test.js (in-memory MongoDB + supertest).
const { startTestMongo } = require('./helpers/testMongo');
const mongoose = require('mongoose');
const request = require('supertest');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await startTestMongo();
  process.env.MONGO_URI = mongoServer.uri;
  process.env.NODE_ENV = 'development';
  delete process.env.PEXELS_API_KEY; // never hit the network from tests
  process.env.AUTH_RATE_LIMIT_MAX = '1000'; // this file registers many users from one IP
  // eslint-disable-next-line global-require
  app = require('../server');
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

let counter = 0;
const register = async (role) => {
  counter += 1;
  const email = `hardening${counter}@example.com`;
  const phone = `98765${String(10000 + counter)}`;
  const signup = await request(app).post('/api/signup').send({
    role, fullName: `User ${counter}`, email, phone, location: 'Pune', password: 'password123', confirmPassword: 'password123',
    ...(role === 'Buyer' ? { deliveryAddress: '12 Test Street, Pune' } : {}),
  });
  await request(app).post('/api/verify-otp').send({ email, otp: signup.body.otp });
  const login = await request(app).post('/api/login').send({ email, password: 'password123', role, phone });
  return { token: login.body.token, userId: login.body.user.id, email, phone };
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const listCrop = (token, extra = {}) => request(app).post('/api/crops').set(auth(token)).send({
  cropName: 'Orange', variety: 'Nagpur', quantityKg: 100, location: 'Nagpur',
  harvestedDate: new Date().toISOString().slice(0, 10), basePrice: 40, category: 'Fruits', ...extra,
});

// 1x1 transparent PNG
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('crop image handling', () => {
  test('a legacy SVG placeholder is NOT stored as the crop photo', async () => {
    const { token } = await register('Farmer');
    const svg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;
    const res = await listCrop(token, { imageUrl: svg });
    expect(res.statusCode).toBe(201);
    expect(res.body.crop.imageUrl).toBeNull(); // (no PEXELS key in tests)
  });

  test('a valid uploaded photo is kept', async () => {
    const { token } = await register('Farmer');
    const res = await listCrop(token, { imageUrl: TINY_PNG });
    expect(res.statusCode).toBe(201);
    expect(res.body.crop.imageUrl).toBe(TINY_PNG);
  });

  test('an upload whose bytes are not an image is rejected with 400', async () => {
    const { token } = await register('Farmer');
    const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
    const res = await listCrop(token, { imageUrl: fake });
    expect(res.statusCode).toBe(400);
  });

  test('a javascript: URL is rejected with 400', async () => {
    const { token } = await register('Farmer');
    expect((await listCrop(token, { imageUrl: 'javascript:alert(1)' })).statusCode).toBe(400);
  });

  test('an unknown category is rejected with 400 instead of being silently stored as Grains', async () => {
    const { token } = await register('Farmer');
    const res = await listCrop(token, { category: '<b>hax</b>' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Category must be one of/);
  });

  test('every supported category can be saved and read back unchanged (including Leafy)', async () => {
    const { token } = await register('Farmer');
    const cases = [['Onion', 'Vegetables'], ['Rice', 'Grains'], ['Mango', 'Fruits'], ['Spinach', 'Leafy'], ['Wheat', 'Grains'], ['Potato', 'Vegetables']];
    for (const [cropName, category] of cases) {
      const created = await listCrop(token, { cropName, category });
      expect(created.statusCode).toBe(201);
      expect(created.body.crop.category).toBe(category);
    }
    const listed = await request(app).get('/api/crops');
    const byName = Object.fromEntries(listed.body.crops.map((c) => [c.cropName, c.category]));
    cases.forEach(([cropName, category]) => expect(byName[cropName]).toBe(category));
  });

  test('the crop name is tidied to one canonical spelling, so "rice" and "Rice" are one crop', async () => {
    const { token } = await register('Farmer');
    const res = await listCrop(token, { cropName: '  GREEN   gram ' });
    expect(res.statusCode).toBe(201);
    expect(res.body.crop.cropName).toBe('Green Gram');
    expect((await listCrop(token, { cropName: 'rice' })).body.crop.cropName).toBe('Rice');
  });

  test('a missing category defaults to Grains and messy spacing in the name is tidied', async () => {
    const { token } = await register('Farmer');
    const res = await listCrop(token, { cropName: '  Green   Chilli ', category: undefined });
    expect(res.statusCode).toBe(201);
    expect(res.body.crop.category).toBe('Grains');
    expect(res.body.crop.cropName).toBe('Green Chilli');
  });
});

describe('accepting a bid is atomic', () => {
  test('two simultaneous accepts create exactly ONE transaction', async () => {
    const farmer = await register('Farmer');
    const buyerA = await register('Buyer');
    const buyerB = await register('Buyer');
    const crop = (await listCrop(farmer.token)).body.crop;

    const bidA = (await request(app).post('/api/bids').set(auth(buyerA.token)).send({ cropId: crop._id, amount: 50 })).body.bid;
    const bidB = (await request(app).post('/api/bids').set(auth(buyerB.token)).send({ cropId: crop._id, amount: 60 })).body.bid;

    const [first, second] = await Promise.all([
      request(app).post(`/api/bids/${bidA._id}/accept`).set(auth(farmer.token)),
      request(app).post(`/api/bids/${bidB._id}/accept`).set(auth(farmer.token)),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 400]);
    const Transaction = mongoose.model('Transaction');
    expect(await Transaction.countDocuments({ cropId: crop._id })).toBe(1);
  });

  test('only an ACTIVE bid can be accepted', async () => {
    const farmer = await register('Farmer');
    const buyer = await register('Buyer');
    const crop = (await listCrop(farmer.token)).body.crop;
    const bid = (await request(app).post('/api/bids').set(auth(buyer.token)).send({ cropId: crop._id, amount: 45 })).body.bid;
    await mongoose.model('Bid').findByIdAndUpdate(bid._id, { status: 'rejected' });
    const res = await request(app).post(`/api/bids/${bid._id}/accept`).set(auth(farmer.token));
    expect(res.statusCode).toBe(400);
  });

  test("another farmer cannot accept a bid on someone else's crop", async () => {
    const owner = await register('Farmer');
    const intruder = await register('Farmer');
    const buyer = await register('Buyer');
    const crop = (await listCrop(owner.token)).body.crop;
    const bid = (await request(app).post('/api/bids').set(auth(buyer.token)).send({ cropId: crop._id, amount: 45 })).body.bid;
    const res = await request(app).post(`/api/bids/${bid._id}/accept`).set(auth(intruder.token));
    expect(res.statusCode).toBe(403);
    expect((await mongoose.model('Crop').findById(crop._id)).status).toBe('open'); // not claimed by the failed attempt
  });
});

describe('authentication details', () => {
  test('login does not reveal "not verified" without the right password', async () => {
    const email = 'unverified@example.com';
    const phone = '9876599999';
    await request(app).post('/api/signup').send({
      role: 'Farmer', fullName: 'Unverified', email, phone, location: 'Pune', password: 'password123', confirmPassword: 'password123',
    });
    const wrong = await request(app).post('/api/login').send({ email, password: 'wrongpassword', role: 'Farmer', phone });
    expect(wrong.statusCode).toBe(400);
    const right = await request(app).post('/api/login').send({ email, password: 'password123', role: 'Farmer', phone });
    expect(right.statusCode).toBe(403);
  });

  test('a token signed with another algorithm / secret is rejected', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ id: '507f1f77bcf86cd799439011', role: 'Farmer' }, 'attacker-secret');
    const res = await request(app).get('/api/transactions/user/507f1f77bcf86cd799439011').set(auth(forged));
    expect(res.statusCode).toBe(401);
  });

  test('signup returns the OTP only in demo mode and labels it', async () => {
    const res = await request(app).post('/api/signup').send({
      role: 'Farmer', fullName: 'Demo User', email: 'demo@example.com', phone: '9876588888', location: 'Pune',
      password: 'password123', confirmPassword: 'password123',
    });
    expect(res.body.otp).toMatch(/^[0-9]{6}$/);
    expect(res.body.otpDelivery).toBe('demo-mode-in-response');
  });
});

describe('error responses do not leak internals', () => {
  test('a database failure returns a generic 500 body', async () => {
    const Crop = mongoose.model('Crop');
    const original = Crop.find;
    Crop.find = () => { throw new Error('mongodb://user:secret@cluster internal detail'); };
    try {
      const res = await request(app).get('/api/crops');
      expect(res.statusCode).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/secret|mongodb|internal detail/);
      expect(res.body).toEqual({ message: 'Failed to fetch crops' });
    } finally {
      Crop.find = original;
    }
  });
});

describe('CORS', () => {
  test('reflects an origin when no allow-list is configured (dev default)', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});


describe('a farmer deleting their own listing', () => {
  test('removes the open listing and its bids, and tells the bidders', async () => {
    const farmer = await register('Farmer');
    const buyer = await register('Buyer');
    const crop = (await listCrop(farmer.token)).body.crop;
    await request(app).post('/api/bids').set(auth(buyer.token)).send({ cropId: crop._id, amount: 45 });

    const res = await request(app).delete(`/api/crops/${crop._id}`).set(auth(farmer.token));
    expect(res.statusCode).toBe(200);
    expect(res.body.deletedBids).toBe(1);
    expect(await mongoose.model('Crop').findById(crop._id)).toBeNull();
    expect(await mongoose.model('Bid').countDocuments({ cropId: crop._id })).toBe(0);
    const note = await mongoose.model('Notification').findOne({ userId: buyer.userId, message: /withdrawn by the farmer/ });
    expect(note).not.toBeNull();
  });

  test("another farmer cannot delete someone else's listing", async () => {
    const owner = await register('Farmer');
    const intruder = await register('Farmer');
    const crop = (await listCrop(owner.token)).body.crop;
    const res = await request(app).delete(`/api/crops/${crop._id}`).set(auth(intruder.token));
    expect(res.statusCode).toBe(403);
    expect(await mongoose.model('Crop').findById(crop._id)).not.toBeNull();
  });

  test('a buyer cannot delete listings, and a login is required', async () => {
    const farmer = await register('Farmer');
    const buyer = await register('Buyer');
    const crop = (await listCrop(farmer.token)).body.crop;
    expect((await request(app).delete(`/api/crops/${crop._id}`).set(auth(buyer.token))).statusCode).toBe(403);
    expect((await request(app).delete(`/api/crops/${crop._id}`)).statusCode).toBe(401);
  });

  test('a listing with an accepted deal can never be deleted', async () => {
    const farmer = await register('Farmer');
    const buyer = await register('Buyer');
    const crop = (await listCrop(farmer.token)).body.crop;
    const bid = (await request(app).post('/api/bids').set(auth(buyer.token)).send({ cropId: crop._id, amount: 50 })).body.bid;
    await request(app).post(`/api/bids/${bid._id}/accept`).set(auth(farmer.token));
    const res = await request(app).delete(`/api/crops/${crop._id}`).set(auth(farmer.token));
    expect(res.statusCode).toBe(409);
    expect(await mongoose.model('Crop').findById(crop._id)).not.toBeNull();
  });

  test('an unknown or malformed id is a clean error', async () => {
    const farmer = await register('Farmer');
    expect((await request(app).delete('/api/crops/not-an-id').set(auth(farmer.token))).statusCode).toBe(400);
    expect((await request(app).delete(`/api/crops/${new mongoose.Types.ObjectId()}`).set(auth(farmer.token))).statusCode).toBe(404);
  });
});


describe('verification OTP guessing is capped per account', () => {
  const signup = async (n) => {
    const email = `otpcap${n}@example.com`;
    const res = await request(app).post('/api/signup').send({
      role: 'Farmer', fullName: `Otp Cap ${n}`, email, phone: `97000${String(10000 + n)}`, location: 'Pune',
      password: 'password123', confirmPassword: 'password123',
    });
    return { email, otp: res.body.otp };
  };
  const wrongCode = (otp) => (otp === '111111' ? '222222' : '111111');

  test('five wrong codes destroy the OTP, even the right code is then refused until a new one is requested', async () => {
    const { email, otp } = await signup(1);
    for (let i = 0; i < 4; i += 1) {
      expect((await request(app).post('/api/verify-otp').send({ email, otp: wrongCode(otp) })).statusCode).toBe(400);
    }
    expect((await request(app).post('/api/verify-otp').send({ email, otp: wrongCode(otp) })).statusCode).toBe(429);
    const stale = await request(app).post('/api/verify-otp').send({ email, otp });
    expect(stale.statusCode).toBe(400);
    expect(stale.body.message).toMatch(/expired|request a new/i);

    const resend = await request(app).post('/api/resend-otp').send({ email });
    const fresh = await request(app).post('/api/verify-otp').send({ email, otp: resend.body.otp });
    expect(fresh.statusCode).toBe(200);
  });

  test('a correct code within the limit still verifies and resets the counter', async () => {
    const { email, otp } = await signup(2);
    await request(app).post('/api/verify-otp').send({ email, otp: wrongCode(otp) });
    expect((await request(app).post('/api/verify-otp').send({ email, otp })).statusCode).toBe(200);
  });
});

describe('manual UPI confirmation cannot bypass online payment', () => {
  test('is allowed in demo mode (no gateway configured)', async () => {
    const farmer = await register('Farmer');
    const buyer = await register('Buyer');
    const crop = (await listCrop(farmer.token)).body.crop;
    const bid = (await request(app).post('/api/bids').set(auth(buyer.token)).send({ cropId: crop._id, amount: 50 })).body.bid;
    const accepted = await request(app).post(`/api/bids/${bid._id}/accept`).set(auth(farmer.token));
    const transactionId = accepted.body.transaction._id;
    const res = await request(app).post(`/api/transactions/${transactionId}/confirm-upi-payment`).set(auth(buyer.token));
    expect(res.statusCode).toBe(200);
  });
});
