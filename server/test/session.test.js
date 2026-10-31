// test/session.test.js
// Integration tests for the short-lived access token + rotating httpOnly refresh cookie.
// Same harness as hardening.test.js (in-memory MongoDB + supertest).
const { startTestMongo } = require('./helpers/testMongo');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await startTestMongo();
  process.env.MONGO_URI = mongoServer.uri;
  process.env.NODE_ENV = 'development'; // cookie is not Secure, so supertest agents keep it
  process.env.AUTH_RATE_LIMIT_MAX = '1000';
  delete process.env.EMAIL_PROVIDER;
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

const CSRF = { 'X-Requested-With': 'agribid-web' };
let counter = 0;
// Registers + verifies a user, then logs in through an agent so cookies persist.
const loginAgent = async (role = 'Farmer') => {
  counter += 1;
  const email = `session${counter}@example.com`;
  const phone = `98760${String(10000 + counter)}`;
  const signup = await request(app).post('/api/signup').send({
    role, fullName: `Session ${counter}`, email, phone, location: 'Pune', password: 'password123', confirmPassword: 'password123',
    ...(role === 'Buyer' ? { deliveryAddress: '12 Test Street, Pune' } : {}),
  });
  await request(app).post('/api/verify-otp').send({ email, otp: signup.body.otp });
  const agent = request.agent(app);
  const login = await agent.post('/api/login').send({ email, password: 'password123', role, phone });
  return { agent, login };
};

describe('login', () => {
  test('returns a short-lived access token and sets an httpOnly refresh cookie', async () => {
    const { login } = await loginAgent();
    expect(login.statusCode).toBe(200);
    const claims = jwt.decode(login.body.token);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60 * 60); // far less than the old 7 days
    const cookie = (login.headers['set-cookie'] || []).join(';');
    expect(cookie).toMatch(/agri_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(login.body.token).toBeTruthy();
    expect(JSON.stringify(login.body)).not.toMatch(/agri_rt/); // the refresh value is never in the JSON body
  });
});

describe('POST /api/auth/refresh', () => {
  test('needs the CSRF header', async () => {
    const { agent } = await loginAgent();
    const res = await agent.post('/api/auth/refresh');
    expect(res.statusCode).toBe(403);
  });
  test('without a cookie it is a 401', async () => {
    const res = await request(app).post('/api/auth/refresh').set(CSRF);
    expect(res.statusCode).toBe(401);
  });
  test('with the cookie it returns a fresh working access token and rotates the cookie', async () => {
    const { agent, login } = await loginAgent();
    const res = await agent.post('/api/auth/refresh').set(CSRF);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.id).toBe(login.body.user.id);
    expect(res.headers['set-cookie'].join(';')).toMatch(/agri_rt=/);
    const ok = await request(app).get(`/api/notifications/${login.body.user.id}`).set({ Authorization: `Bearer ${res.body.token}` });
    expect(ok.statusCode).toBe(200);
    const again = await agent.post('/api/auth/refresh').set(CSRF); // the rotated cookie keeps working
    expect(again.statusCode).toBe(200);
  });
  test('replaying a consumed cookie after the grace window kills the session', async () => {
    const { agent, login } = await loginAgent();
    const stolen = (login.headers['set-cookie'] || []).find((c) => c.startsWith('agri_rt=')).split(';')[0];
    await agent.post('/api/auth/refresh').set(CSRF); // legitimate rotation
    await new Promise((r) => setTimeout(r, 10500)); // wait out the 10 s duplicate-request grace window
    const replay = await request(app).post('/api/auth/refresh').set(CSRF).set('Cookie', stolen);
    expect(replay.statusCode).toBe(401);
    const owner = await agent.post('/api/auth/refresh').set(CSRF);
    expect(owner.statusCode).toBe(401); // whole family revoked: the owner must log in again
  }, 20000);
});

describe('POST /api/auth/logout', () => {
  test('revokes the session and clears the cookie', async () => {
    const { agent } = await loginAgent();
    const out = await agent.post('/api/auth/logout').set(CSRF);
    expect(out.statusCode).toBe(200);
    expect(out.headers['set-cookie'].join(';')).toMatch(/agri_rt=;/);
    const after = await agent.post('/api/auth/refresh').set(CSRF);
    expect(after.statusCode).toBe(401);
  });
  test('needs the CSRF header', async () => {
    const { agent } = await loginAgent();
    expect((await agent.post('/api/auth/logout')).statusCode).toBe(403);
  });
});
