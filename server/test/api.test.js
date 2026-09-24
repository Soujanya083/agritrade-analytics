// test/api.test.js
// Integration tests for key API routes, using an in-memory MongoDB
// (no real database needed, no risk to your actual seeded data).
// Run with: npm test

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  process.env.NODE_ENV = 'development'; // so OTP is returned in responses for testing
  // eslint-disable-next-line global-require
  app = require('../server'); // requires AFTER setting MONGO_URI, so it connects to the in-memory DB
  // wait for mongoose to actually finish connecting before tests run
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

// Signs a user up, verifies their OTP (returned directly in the signup
// response - see server.js's own demo-mode comment on that), then logs
// in for a real JWT. /api/crops and /api/bids both require this token
// via authenticateToken - they used to read farmerId/buyerId straight
// from the request body, but that changed when JWT auth was added, and
// this test file was never updated to match until now.
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

describe('POST /api/signup', () => {
  test('rejects an alphanumeric phone number', async () => {
    const res = await request(app).post('/api/signup').send({
      role: 'Farmer',
      fullName: 'Test Farmer',
      email: 'testfarmer1@example.com',
      phone: 'abc1234567',
      location: 'Pune',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/digits only/i);
  });

  test('rejects mismatched password and confirmPassword', async () => {
    const res = await request(app).post('/api/signup').send({
      role: 'Farmer',
      fullName: 'Test Farmer',
      email: 'testfarmer2@example.com',
      phone: '9876543210',
      location: 'Pune',
      password: 'password123',
      confirmPassword: 'differentPassword',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/do not match/i);
  });

  test('rejects a too-short full name', async () => {
    const res = await request(app).post('/api/signup').send({
      role: 'Farmer',
      fullName: 'A',
      email: 'testfarmer3@example.com',
      phone: '9876543210',
      location: 'Pune',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/between 2 and 60/i);
  });

  test('accepts valid signup data and returns success', async () => {
    const res = await request(app).post('/api/signup').send({
      role: 'Farmer',
      fullName: 'Valid Farmer',
      email: 'validfarmer@example.com',
      phone: '9876543210',
      location: 'Pune',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.otpSent).toBe(true);
  });
});

describe('POST /api/crops (data validation protecting the ML pipeline)', () => {
  let farmerToken;

  beforeAll(async () => {
    const farmer = await registerVerifyAndLogin({
      role: 'Farmer',
      fullName: 'Crop Test Farmer',
      email: 'cropfarmer@example.com',
      phone: '9876543211',
    });
    farmerToken = farmer.token;
  }, 15000);

  test('rejects a request with no auth token', async () => {
    // farmerId now comes from the verified JWT, not the request body -
    // this closes the exact "supply someone else's farmerId" spoofing
    // risk the old "rejects an invalid farmer ID" test used to check
    // for; that specific attack is no longer expressible at all, since
    // there's no farmerId field for a client to spoof in the first
    // place. What's left to verify is that the route still requires a
    // token at all.
    const res = await request(app).post('/api/crops').send({
      cropName: 'Wheat',
      variety: 'Standard',
      quantityKg: 100,
      location: 'Nashik',
      harvestedDate: new Date().toISOString(),
      basePrice: 20,
    });
    expect(res.statusCode).toBe(401);
  });

  test('rejects a negative price', async () => {
    const res = await request(app)
      .post('/api/crops')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        cropName: 'Wheat',
        variety: 'Standard',
        quantityKg: 100,
        location: 'Nashik',
        harvestedDate: new Date().toISOString(),
        basePrice: -50,
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/positive number/i);
  });

  test('accepts a valid crop listing', async () => {
    const res = await request(app)
      .post('/api/crops')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        cropName: 'Wheat',
        variety: 'Standard',
        quantityKg: 100,
        location: 'Nashik',
        harvestedDate: new Date().toISOString(),
        basePrice: 20,
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.crop.cropName).toBe('Wheat');
  });
});

describe('POST /api/bids (proves the NaN bug fix)', () => {
  let farmerToken;
  let buyerToken;
  let cropId;

  beforeAll(async () => {
    const farmer = await registerVerifyAndLogin({
      role: 'Farmer',
      fullName: 'Bid Test Farmer',
      email: 'bidfarmer@example.com',
      phone: '9876543212',
    });
    farmerToken = farmer.token;

    const buyer = await registerVerifyAndLogin({
      role: 'Buyer',
      fullName: 'Bid Test Buyer',
      email: 'bidbuyer@example.com',
      phone: '9876543213',
      deliveryAddress: '123 Test Street, Pune',
    });
    buyerToken = buyer.token;

    const cropRes = await request(app)
      .post('/api/crops')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        cropName: 'Rice',
        variety: 'Basmati',
        quantityKg: 200,
        location: 'Pune',
        harvestedDate: new Date().toISOString(),
        basePrice: 30,
      });
    cropId = cropRes.body.crop._id;
  }, 20000);

  test('rejects a non-numeric bid amount (this was the original bug)', async () => {
    // Before the fix, Number('abc') = NaN, and the old check
    // `Number(amount) <= Number(crop.currentBid)` was FALSE for NaN,
    // so this invalid bid would have been silently accepted.
    const res = await request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cropId, amount: 'abc' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/positive number/i);
  });

  test('rejects a bid lower than or equal to the current price', async () => {
    const res = await request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cropId, amount: 10 }); // lower than basePrice of 30
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/higher than current bid/i);
  });

  test('accepts a valid bid higher than the current price', async () => {
    const res = await request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cropId, amount: 35 });
    expect(res.statusCode).toBe(201);
    expect(res.body.bid.amount).toBe(35);
  });
});