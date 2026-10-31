// Unit tests for rotating refresh tokens, using an in-memory fake of the Mongoose model.
const {
  hashToken, parseCookies, cookieOptions, issueRefreshToken, rotateRefreshToken, revokeFamilyByRaw, hasCsrfHeader, GRACE_MS, refreshTtlMs,
} = require('../lib/refreshTokens');

// Just enough of a Mongoose model for the functions under test.
const makeStore = () => {
  const rows = [];
  const matches = (row, filter) => Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && '$gt' in v) return row[k] > v.$gt;
    if (v === null) return row[k] === null || row[k] === undefined;
    return row[k] === v;
  });
  return {
    rows,
    async create(doc) { const row = { ...doc }; rows.push(row); return row; },
    async findOne(filter) { return rows.find((r) => matches(r, filter)) || null; },
    async findOneAndUpdate(filter, update) {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return null;
      const before = { ...row };
      Object.assign(row, update.$set);
      return before;
    },
    async updateOne(filter, update) { const row = rows.find((r) => matches(r, filter)); if (row) Object.assign(row, update.$set); },
    async updateMany(filter, update) { rows.filter((r) => matches(r, filter)).forEach((r) => Object.assign(r, update.$set)); },
  };
};

const NOW = 1_800_000_000_000;

describe('cookie helpers', () => {
  test('parseCookies reads several cookies and decodes values', () => {
    expect(parseCookies('a=1; agri_rt=abc%2Bdef; theme=dark')).toEqual({ a: '1', agri_rt: 'abc+def', theme: 'dark' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('garbage')).toEqual({});
  });
  test('the cookie is httpOnly and scoped to the auth path', () => {
    const o = cookieOptions({});
    expect(o.httpOnly).toBe(true);
    expect(o.path).toBe('/api/auth');
    expect(o.maxAge).toBe(7 * 24 * 3600 * 1000);
  });
  test('in production it is Secure and cross-site capable; locally it is Lax', () => {
    expect(cookieOptions({ NODE_ENV: 'production' })).toMatchObject({ secure: true, sameSite: 'none' });
    expect(cookieOptions({ NODE_ENV: 'development' })).toMatchObject({ secure: false, sameSite: 'lax' });
  });
  test('lifetime is configurable', () => {
    expect(refreshTtlMs({ REFRESH_TTL_DAYS: '2' })).toBe(2 * 24 * 3600 * 1000);
    expect(refreshTtlMs({ REFRESH_TTL_DAYS: 'nope' })).toBe(7 * 24 * 3600 * 1000);
  });
  test('the CSRF guard needs the custom header', () => {
    expect(hasCsrfHeader({ headers: { 'x-requested-with': 'agribid-web' } })).toBe(true);
    expect(hasCsrfHeader({ headers: {} })).toBe(false);
  });
});

describe('issueRefreshToken', () => {
  test('stores only a hash, never the raw token', async () => {
    const store = makeStore();
    const raw = await issueRefreshToken(store, 'u1', { now: NOW });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tokenHash).toBe(hashToken(raw));
    expect(JSON.stringify(store.rows[0])).not.toMatch(new RegExp(raw));
    expect(store.rows[0].expiresAt.getTime()).toBe(NOW + refreshTtlMs({}));
  });
});

describe('rotateRefreshToken', () => {
  test('a valid token is consumed and replaced by a new one in the same family', async () => {
    const store = makeStore();
    const raw = await issueRefreshToken(store, 'u1', { now: NOW });
    const out = await rotateRefreshToken(store, raw, { now: NOW + 1000 });
    expect(out.ok).toBe(true);
    expect(out.userId).toBe('u1');
    expect(out.raw).toBeTruthy();
    expect(out.raw === raw).toBe(false);
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1].family).toBe(store.rows[0].family);
    expect(store.rows[0].revokedAt).toBeTruthy();
    expect(store.rows[0].replacedByHash).toBe(hashToken(out.raw));
  });
  test('the new token works again (a chain of refreshes)', async () => {
    const store = makeStore();
    const raw = await issueRefreshToken(store, 'u1', { now: NOW });
    const a = await rotateRefreshToken(store, raw, { now: NOW + 1000 });
    const b = await rotateRefreshToken(store, a.raw, { now: NOW + 2000 });
    expect(b.ok).toBe(true);
  });
  test('missing and unknown tokens are rejected', async () => {
    const store = makeStore();
    expect(await rotateRefreshToken(store, null, { now: NOW })).toEqual({ ok: false, reason: 'missing' });
    expect(await rotateRefreshToken(store, 'forged', { now: NOW })).toEqual({ ok: false, reason: 'unknown' });
  });
  test('an expired token is rejected', async () => {
    const store = makeStore();
    const raw = await issueRefreshToken(store, 'u1', { now: NOW });
    const out = await rotateRefreshToken(store, raw, { now: NOW + refreshTtlMs({}) + 1 });
    expect(out).toEqual({ ok: false, reason: 'expired' });
  });
  test('replaying an old token after the grace window revokes the WHOLE family (stolen-cookie defence)', async () => {
    const store = makeStore();
    const raw = await issueRefreshToken(store, 'u1', { now: NOW });
    const a = await rotateRefreshToken(store, raw, { now: NOW + 1000 });
    const replay = await rotateRefreshToken(store, raw, { now: NOW + 1000 + GRACE_MS + 5000 });
    expect(replay).toEqual({ ok: false, reason: 'reuse-detected' });
    // the legitimate newest token is now dead too, so the thief and the owner must log in again
    const afterwards = await rotateRefreshToken(store, a.raw, { now: NOW + 1000 + GRACE_MS + 6000 });
    expect(afterwards.ok).toBe(false);
  });
  test('a duplicate request inside the grace window (two tabs) is allowed but gets no new cookie', async () => {
    const store = makeStore();
    const raw = await issueRefreshToken(store, 'u1', { now: NOW });
    const first = await rotateRefreshToken(store, raw, { now: NOW + 1000 });
    const dup = await rotateRefreshToken(store, raw, { now: NOW + 2000 });
    expect(dup).toEqual({ ok: true, userId: 'u1', raw: null });
    // ...and the first response's cookie still works afterwards
    expect((await rotateRefreshToken(store, first.raw, { now: NOW + 3000 })).ok).toBe(true);
  });
  test('different users have independent chains', async () => {
    const store = makeStore();
    const a = await issueRefreshToken(store, 'u1', { now: NOW });
    const b = await issueRefreshToken(store, 'u2', { now: NOW });
    await rotateRefreshToken(store, a, { now: NOW + 1000 });
    await rotateRefreshToken(store, a, { now: NOW + 1000 + GRACE_MS + 1 }); // u1 family revoked
    expect((await rotateRefreshToken(store, b, { now: NOW + 5000 })).ok).toBe(true); // u2 unaffected
  });
});

describe('revokeFamilyByRaw (logout)', () => {
  test('logging out kills the whole chain', async () => {
    const store = makeStore();
    const raw = await issueRefreshToken(store, 'u1', { now: NOW });
    const a = await rotateRefreshToken(store, raw, { now: NOW + 1000 });
    expect(await revokeFamilyByRaw(store, a.raw, { now: NOW + 2000 })).toBe(true);
    expect((await rotateRefreshToken(store, a.raw, { now: NOW + 3000 })).ok).toBe(false);
  });
  test('an unknown or missing token is a no-op', async () => {
    const store = makeStore();
    expect(await revokeFamilyByRaw(store, null)).toBe(false);
    expect(await revokeFamilyByRaw(store, 'nope')).toBe(false);
  });
});
