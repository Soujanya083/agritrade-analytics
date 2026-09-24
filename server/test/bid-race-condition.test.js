/**
 * test/bid-race-condition.test.js
 *
 * Regression test for the bid-placement race condition: two bids
 * arriving close together used to both read the same stale
 * crop.currentBid, both pass their individual "> current price"
 * check, and then whichever write landed last would win - even if it
 * was the LOWER of the two bids. The fix replaces read-then-write with
 * an atomic conditional findOneAndUpdate (see server.js).
 *
 * This fires two bid requests concurrently via Promise.all against the
 * same running app + in-memory MongoDB instance, which genuinely
 * exercises real interleaving at the database level (not simulated) -
 * MongoDB serializes writes to a single document, but two requests
 * awaiting their DB round-trip can still race each other in Node's
 * event loop.
 *
 * Uses the real signup -> verify-otp -> login flow (not a shortcut),
 * since /api/bids requires a real JWT via authenticateToken.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  process.env.NODE_ENV = 'development'; // so OTP is returned in signup responses
  // eslint-disable-next-line global-require
  app = require('../server'); // requires AFTER setting MONGO_URI, so its own
  // internal mongoose.connect() call connects to the in-memory DB, not a
  // real local MongoDB - same pattern as test/api.test.js.
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

const registerVerifyAndLogin = async ({ role, fullName, email, phone, deliveryAddress }) => {
  const signupRes = await request(app).post('/api/signup').send({
    role,
    fullName,
    email,
    phone,
    location: 'Pune',
    password: 'password123',
    confirmPassword: 'password123',
    ...(role === 'Buyer' ? { deliveryAddress: deliveryAddress || '123 Test Street, Pune' } : {}),
  });

  const { otp } = signupRes.body;
  await request(app).post('/api/verify-otp').send({ email, otp });

  const loginRes = await request(app).post('/api/login').send({
    email, password: 'password123', role, phone,
  });

  return { token: loginRes.body.token, userId: loginRes.body.user.id };
};

describe('POST /api/bids - concurrency (race condition fix)', () => {
  let farmerToken;
  let farmerId;
  let buyerAToken;
  let buyerBToken;
  let cropId;

  beforeAll(async () => {
    const farmer = await registerVerifyAndLogin({
      role: 'Farmer', fullName: 'Race Test Farmer', email: 'racefarmer@example.com', phone: '9876500001',
    });
    farmerToken = farmer.token;
    farmerId = farmer.userId;

    const buyerA = await registerVerifyAndLogin({
      role: 'Buyer', fullName: 'Race Buyer A', email: 'racebuyera@example.com', phone: '9876500002',
    });
    buyerAToken = buyerA.token;

    const buyerB = await registerVerifyAndLogin({
      role: 'Buyer', fullName: 'Race Buyer B', email: 'racebuyerb@example.com', phone: '9876500003',
    });
    buyerBToken = buyerB.token;

    const cropRes = await request(app)
      .post('/api/crops')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        farmerId,
        cropName: 'Wheat',
        variety: 'Sharbati',
        quantityKg: 100,
        location: 'Pune',
        harvestedDate: new Date().toISOString(),
        basePrice: 20, // starting currentBid
      });
    cropId = cropRes.body.crop._id;
  }, 30000); // 3x signup+verify+login + 1 crop creation = several real DB round-trips + bcrypt hashing - 5s default is too tight, especially on Windows

  test('final currentBid is always the true highest bid, regardless of write order', async () => {
    // Buyer A bids 150, Buyer B bids 200, fired concurrently.
    // Whichever DB write happens to land last must NOT silently
    // overwrite the other with a lower value - the atomic update
    // guarantees currentBid always ends up as the true max.
    const [resA, resB] = await Promise.all([
      request(app).post('/api/bids').set('Authorization', `Bearer ${buyerAToken}`).send({ cropId, amount: 150 }),
      request(app).post('/api/bids').set('Authorization', `Bearer ${buyerBToken}`).send({ cropId, amount: 200 }),
    ]);

    // At least one of the two must have succeeded; if the lower bid's
    // request happened to be evaluated after the higher one already
    // won, it correctly gets rejected rather than overwriting it.
    const statuses = [resA.statusCode, resB.statusCode].sort();
    expect(statuses).toContain(201);

    // No GET /api/crops/:id route exists - the list endpoint is what
    // the app itself uses, so fetch the list and find this crop in it.
    const cropsRes = await request(app).get('/api/crops');
    const crop = cropsRes.body.crops.find((c) => c._id === cropId);
    // This is the actual regression check: under the old read-then-write
    // code, this could come back as 150 (the lower bid) if the writes
    // landed in an unlucky order. With the atomic fix it can only ever
    // be 200.
    expect(crop.currentBid).toBe(200);
  }, 15000);

  test('a bid that has already been overtaken is rejected, not silently accepted', async () => {
    // currentBid is now 200 from the previous test. A late, lower bid
    // must still be rejected even under concurrent load.
    const res = await request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${buyerAToken}`)
      .send({ cropId, amount: 180 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/higher than current bid/i);
  }, 15000);

  test('ten simultaneous increasing bids never leave currentBid below the true maximum', async () => {
    // Broader stress version of the same property: fire many
    // concurrent bids at once and confirm the final price is exactly
    // the maximum submitted, not something lower due to write-order.
    const amounts = [210, 215, 220, 225, 230, 235, 240, 245, 250, 255];
    const requests = amounts.map((amount) => request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${buyerBToken}`)
      .send({ cropId, amount }));

    await Promise.all(requests);

    const cropsRes = await request(app).get('/api/crops');
    const crop = cropsRes.body.crops.find((c) => c._id === cropId);
    expect(crop.currentBid).toBe(Math.max(...amounts));
  }, 20000);
});