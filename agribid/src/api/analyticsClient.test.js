import { createAnalyticsClient, AnalyticsError, describeError, isNoDataError } from './analyticsClient';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const make = (fetchImpl, extra = {}) => createAnalyticsClient({ baseUrl: 'http://x/api/analytics', getToken: () => 'tok', fetchImpl, ...extra });

describe('analytics client', () => {
  test('sends the bearer token and builds the query string, skipping empty params', async () => {
    const fetchImpl = jest.fn(async () => reply(200, { ok: 1 }));
    const client = make(fetchImpl);
    await client.get('/price-prediction', { cropName: 'Wheat', daysAhead: 7, state: '', other: null });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://x/api/analytics/price-prediction?cropName=Wheat&daysAhead=7');
    expect(options.headers.Authorization).toBe('Bearer tok');
  });

  test('no token => no Authorization header', async () => {
    const fetchImpl = jest.fn(async () => reply(200, {}));
    await make(fetchImpl, { getToken: () => null }).get('/crops');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test('identical simultaneous GETs share ONE request', async () => {
    const fetchImpl = jest.fn(async () => reply(200, { data: [1] }));
    const client = make(fetchImpl);
    const results = await Promise.all([client.get('/recommend-crops'), client.get('/recommend-crops'), client.get('/recommend-crops')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results[2]).toEqual({ data: [1] });
  });

  test('a repeat GET within the cache window is served from memory; fresh bypasses it', async () => {
    let clock = 0;
    const fetchImpl = jest.fn(async () => reply(200, { n: 1 }));
    const client = make(fetchImpl, { now: () => clock, cacheMs: 1000 });
    await client.get('/crops');
    clock = 500; await client.get('/crops');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 1500; await client.get('/crops');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await client.get('/crops', null, { fresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('errors are not cached', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(reply(503, { detail: 'down' }))
      .mockResolvedValueOnce(reply(200, { ok: 1 }));
    const client = make(fetchImpl);
    await expect(client.get('/crops')).rejects.toMatchObject({ status: 503 });
    await expect(client.get('/crops')).resolves.toEqual({ ok: 1 });
  });

  test('maps HTTP errors to AnalyticsError with the server detail and context', async () => {
    const client = make(async () => reply(422, { detail: 'Not enough bidding data', context: { recordsAvailable: 3 } }));
    let caught;
    try { await client.get('/bid-anomalies'); } catch (e) { caught = e; }
    expect(caught instanceof AnalyticsError).toBe(true);
    expect(caught.status).toBe(422);
    expect(caught.detail).toBe('Not enough bidding data');
    expect(caught.context).toEqual({ recordsAvailable: 3 });
    expect(isNoDataError(caught)).toBe(true);
  });

  test('a 401 notifies the app so it can log the user out', async () => {
    const onUnauthorized = jest.fn();
    const client = make(async () => reply(401, { detail: 'Token expired' }), { onUnauthorized });
    await expect(client.get('/crops')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('a network failure becomes status 0', async () => {
    const client = make(async () => { throw new TypeError('Failed to fetch'); });
    await expect(client.get('/crops')).rejects.toMatchObject({ status: 0 });
  });

  test('a non-JSON error body still yields a useful error', async () => {
    const client = make(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    await expect(client.get('/crops')).rejects.toMatchObject({ status: 502 });
  });

  test('an aborted caller rejects without cancelling the shared request', async () => {
    const fetchImpl = jest.fn(async () => reply(200, { v: 1 }));
    const client = make(fetchImpl);
    const controller = new AbortController();
    const aborted = client.get('/crops', null, { signal: controller.signal });
    const other = client.get('/crops');
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    await expect(other).resolves.toEqual({ v: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('POST sends a JSON body with the token', async () => {
    const fetchImpl = jest.fn(async () => reply(200, { reply: 'hi' }));
    const out = await make(fetchImpl).post('/chatbot', { message: 'hello' });
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ message: 'hello' }));
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(out).toEqual({ reply: 'hi' });
  });
});

describe('describeError', () => {
  const e = (status, detail) => new AnalyticsError(status, detail);
  test('gives a friendly message per status', () => {
    expect(describeError(e(0))).toMatch(/could not reach/i);
    expect(describeError(e(401))).toMatch(/log in again/i);
    expect(describeError(e(404, 'Unknown crop'))).toBe('Unknown crop');
    expect(describeError(e(422, 'Not enough data'))).toBe('Not enough data');
    expect(describeError(e(429))).toMatch(/too many/i);
    expect(describeError(e(503))).toMatch(/unavailable/i);
    expect(describeError(e(500))).toMatch(/problem/i);
    expect(describeError(new Error('x'))).toMatch(/went wrong/i);
  });

  test('after a 401 it renews the token through refreshToken() and retries once', async () => {
    const calls = [];
    const fetchImpl = jest.fn(async (url, init) => {
      calls.push(init.headers.Authorization);
      return init.headers.Authorization === 'Bearer fresh' ? reply(200, { ok: 1 }) : { ok: false, status: 401, json: async () => ({}) };
    });
    const client = createAnalyticsClient({ baseUrl: 'http://a', getToken: () => 'stale', refreshToken: async () => 'fresh', fetchImpl });
    await client.get('/x');
    expect(calls).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  test('getToken may be async (the default asks the session module, which can refresh)', async () => {
    const fetchImpl = jest.fn(async () => reply(200, { ok: 1 }));
    const client = createAnalyticsClient({ baseUrl: 'http://a', getToken: async () => 'async-token', fetchImpl });
    await client.get('/y');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer async-token');
  });
});
