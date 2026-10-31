// The browser session: access token in memory only, silent refresh through the cookie.
import {
  API_BASE, getAccessToken, setAccessToken, clearSession, refreshSession, ensureAccessToken, authFetch, logoutSession,
} from './session';

const jsonResponse = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// A fake server: /auth/refresh hands out tokens, everything else checks the Bearer token.
const makeServer = ({ validToken = 'good', refreshOk = true } = {}) => {
  const calls = [];
  const fetchImpl = jest.fn(async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/refresh')) return refreshOk ? jsonResponse(200, { token: validToken, user: { id: 'u1' } }) : jsonResponse(401, {});
    if (url.endsWith('/auth/logout')) return jsonResponse(200, {});
    const auth = (init.headers || {}).Authorization;
    return auth === `Bearer ${validToken}` ? jsonResponse(200, { ok: true }) : jsonResponse(401, {});
  });
  return { fetchImpl, calls };
};

let clock = 1_000_000;
const now = () => clock;

beforeEach(() => {
  clearSession();
  clock += 60_000; // clear any failure back-off between tests
});

describe('token storage', () => {
  test('the access token lives in memory, never in localStorage', () => {
    setAccessToken('secret-jwt');
    expect(getAccessToken()).toBe('secret-jwt');
    expect(JSON.stringify(Object.keys(localStorage))).not.toMatch(/token/);
  });
  test('clearSession wipes the token, the profile and any legacy localStorage token', () => {
    setAccessToken('x');
    localStorage.setItem('user', '{"id":"u1"}');
    localStorage.setItem('token', 'old-7-day-token');
    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('refreshSession', () => {
  test('sends the cookie (credentials) and the CSRF header, then keeps the new token in memory', async () => {
    const { fetchImpl, calls } = makeServer();
    const out = await refreshSession({ fetchImpl, now });
    expect(out.token).toBe('good');
    expect(getAccessToken()).toBe('good');
    expect(calls[0].url).toBe(`${API_BASE}/auth/refresh`);
    expect(calls[0].init.credentials).toBe('include');
    expect(calls[0].init.headers['X-Requested-With']).toBe('agribid-web');
  });
  test('concurrent callers share ONE request (the cookie is single-use)', async () => {
    const { fetchImpl } = makeServer();
    await Promise.all([refreshSession({ fetchImpl, now }), refreshSession({ fetchImpl, now }), refreshSession({ fetchImpl, now })]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  test('a rejected refresh returns null and backs off instead of hammering the server', async () => {
    const { fetchImpl } = makeServer({ refreshOk: false });
    expect(await refreshSession({ fetchImpl, now })).toBeNull();
    expect(await refreshSession({ fetchImpl, now })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1); // second call skipped by the back-off
    clock += 6000;
    await refreshSession({ fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  test('a network error is swallowed (returns null)', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('offline'); });
    expect(await refreshSession({ fetchImpl, now })).toBeNull();
  });
});

describe('ensureAccessToken', () => {
  test('reuses the token it already has', async () => {
    setAccessToken('mem');
    const { fetchImpl } = makeServer();
    expect(await ensureAccessToken({ fetchImpl, now })).toBe('mem');
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });
  test('after a page reload (no token in memory) it silently gets one from the cookie', async () => {
    const { fetchImpl } = makeServer();
    expect(await ensureAccessToken({ fetchImpl, now })).toBe('good');
  });
});

describe('authFetch', () => {
  test('attaches the Bearer token', async () => {
    setAccessToken('good');
    const { fetchImpl, calls } = makeServer();
    const res = await authFetch('http://api/x', {}, { fetchImpl, now });
    expect(res.status).toBe(200);
    expect(calls[0].init.headers.Authorization).toBe('Bearer good');
  });
  test('an expired access token is renewed through the cookie and the request is retried once', async () => {
    setAccessToken('expired');
    const { fetchImpl, calls } = makeServer({ validToken: 'fresh' });
    const res = await authFetch('http://api/x', {}, { fetchImpl, now });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.url.split('/').slice(-2).join('/'))).toEqual(['api/x', 'auth/refresh', 'api/x']);
    expect(getAccessToken()).toBe('fresh');
  });
  test('if the cookie is gone too, the 401 is handed back to the caller (no retry loop)', async () => {
    setAccessToken('expired');
    const { fetchImpl, calls } = makeServer({ refreshOk: false });
    const res = await authFetch('http://api/x', {}, { fetchImpl, now });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(2); // original + one refresh attempt, nothing more
  });
  test('keeps the caller\'s own headers and options', async () => {
    setAccessToken('good');
    const { fetchImpl, calls } = makeServer();
    await authFetch('http://api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, { fetchImpl, now });
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(calls[0].init.body).toBe('{}');
  });
});

describe('logoutSession', () => {
  test('tells the server to revoke the cookie and clears the browser even if the server is unreachable', async () => {
    setAccessToken('good');
    localStorage.setItem('user', '{}');
    const fetchImpl = jest.fn(async () => { throw new Error('offline'); });
    await logoutSession({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
