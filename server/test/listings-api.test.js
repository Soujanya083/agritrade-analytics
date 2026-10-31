// test/listings-api.test.js
// Integration tests for paginated GET /api/crops and the cacheable image endpoint.
const { startTestMongo } = require('./helpers/testMongo');
const mongoose = require('mongoose');
const request = require('supertest');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await startTestMongo();
  process.env.MONGO_URI = mongoServer.uri;
  process.env.NODE_ENV = 'development';
  delete process.env.PEXELS_API_KEY;
  process.env.AUTH_RATE_LIMIT_MAX = '1000';
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

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let farmerToken;
let farmerId;

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const listCrop = (extra = {}) => request(app).post('/api/crops').set(auth(farmerToken)).send({
  cropName: 'Onion', variety: 'Red', quantityKg: 100, location: 'Nashik',
  harvestedDate: new Date().toISOString().slice(0, 10), basePrice: 20, category: 'Vegetables', ...extra,
});

beforeAll(async () => {
  const email = 'listings-farmer@example.com';
  const phone = '9876012345';
  const signup = await request(app).post('/api/signup').send({
    role: 'Farmer', fullName: 'Lister', email, phone, location: 'Pune', password: 'password123', confirmPassword: 'password123',
  });
  await request(app).post('/api/verify-otp').send({ email, otp: signup.body.otp });
  const login = await request(app).post('/api/login').send({ email, password: 'password123', role: 'Farmer', phone });
  farmerToken = login.body.token;
  farmerId = login.body.user.id;
  for (let i = 0; i < 7; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await listCrop({ cropName: i % 2 ? 'Tomato' : 'Onion', variety: `V${i}`, category: i % 2 ? 'Vegetables' : 'Fruits' });
  }
  await listCrop({ cropName: 'Rice', variety: 'Basmati', category: 'Grains', imageUrl: TINY_PNG });
}, 30000);

describe('GET /api/crops pagination', () => {
  test('returns page metadata and honours limit/page', async () => {
    const p1 = await request(app).get('/api/crops?limit=3&page=1');
    expect(p1.statusCode).toBe(200);
    expect(p1.body.crops).toHaveLength(3);
    expect(p1.body).toMatchObject({ page: 1, limit: 3, total: 8, totalPages: 3, hasMore: true });
    const p3 = await request(app).get('/api/crops?limit=3&page=3');
    expect(p3.body.crops).toHaveLength(2);
    expect(p3.body.hasMore).toBe(false);
  });
  test('pages do not overlap and cover every listing exactly once', async () => {
    const ids = [];
    for (let page = 1; page <= 3; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(`/api/crops?limit=3&page=${page}`);
      res.body.crops.forEach((c) => ids.push(c._id));
    }
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });
  test('the page size is capped', async () => {
    const res = await request(app).get('/api/crops?limit=100000');
    expect(res.body.limit).toBeLessThanOrEqual(60);
  });
  test('filters by category, text search and farmer', async () => {
    expect((await request(app).get('/api/crops?category=Grains')).body.total).toBe(1);
    expect((await request(app).get('/api/crops?q=tomato')).body.crops.every((c) => c.cropName === 'Tomato')).toBe(true);
    expect((await request(app).get(`/api/crops?farmerId=${farmerId}`)).body.total).toBe(8);
    expect((await request(app).get('/api/crops?farmerId=507f1f77bcf86cd799439011')).body.total).toBe(0);
  });
  test('operator injection in the query string does not widen the result', async () => {
    const res = await request(app).get('/api/crops?status[$ne]=open&category[$ne]=Grains');
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(8); // both bogus filters were ignored
  });
});

describe('inline photos', () => {
  test('the list carries a small URL instead of the base64 photo', async () => {
    const res = await request(app).get('/api/crops?category=Grains');
    const rice = res.body.crops[0];
    expect(rice.imageUrl).toMatch(/\/api\/crops\/[a-f0-9]{24}\/image\?v=\d+$/);
    expect(JSON.stringify(res.body)).not.toMatch(/base64/);
  });
  test('the image endpoint serves real bytes, cacheable and usable cross-origin', async () => {
    const list = await request(app).get('/api/crops?category=Grains');
    const url = new URL(list.body.crops[0].imageUrl);
    const img = await request(app).get(url.pathname + url.search);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toMatch(/image\/png/);
    expect(img.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(img.body.length).toBeGreaterThan(0);
  });
  test('404 for a listing without an uploaded photo, 400 for a bad id', async () => {
    const list = await request(app).get('/api/crops?category=Fruits');
    expect((await request(app).get(`/api/crops/${list.body.crops[0]._id}/image`)).statusCode).toBe(404);
    expect((await request(app).get('/api/crops/not-an-id/image')).statusCode).toBe(400);
  });
});
