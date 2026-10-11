// analyticsClient.js - the ONE place the React app talks to the analytics service.
//
// Why it exists:
//  * The analytics API now requires the same JWT as the Node API, so every
//    request must carry it (three components used to call fetch() directly,
//    with no token).
//  * The API now returns real HTTP status codes (404/422/429/503...). This
//    turns them into one error type with a human-readable message, instead
//    of each component guessing from a `{error}` body on a 200.
//  * The dashboard asks for the same data from several components at once
//    (e.g. crop recommendations). Identical in-flight GETs are shared, and
//    successful GETs are remembered briefly, so duplicates cost nothing.

export const ANALYTICS_BASE =
  process.env.REACT_APP_ANALYTICS_BASE_URL || 'http://localhost:8000/api/analytics';

export class AnalyticsError extends Error {
  constructor(status, detail, context) {
    super(detail);
    this.name = 'AnalyticsError';
    this.status = status;       // 0 = could not reach the service
    this.detail = detail;       // message from the server (safe to show)
    this.context = context || null;
  }
}

// A short, friendly sentence for any error, suitable for the UI.
export function describeError(error) {
  if (!(error instanceof AnalyticsError)) return 'Something went wrong. Please try again.';
  switch (error.status) {
    case 0: return 'Could not reach the analytics service. Check your connection and try again.';
    case 401: return 'Your session has expired. Please log in again.';
    case 403: return 'Your account is not allowed to view analytics.';
    case 404: return error.detail || 'No data found for that crop yet.';
    case 422: return error.detail || 'Not enough data yet to calculate this.';
    case 429: return 'Too many requests. Please wait a moment and try again.';
    case 503: return 'The analytics service is temporarily unavailable.';
    default: return error.status >= 500 ? 'The analytics service had a problem. Please try again later.' : (error.detail || 'Request failed.');
  }
}

// "Expected" outcomes that mean "no data for this", not "something broke".
export const isNoDataError = (error) => error instanceof AnalyticsError && (error.status === 404 || error.status === 422);

const buildQuery = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

// Resolve with `promise`, but reject early (without cancelling the shared
// request other callers may be waiting on) if THIS caller's signal aborts.
const withAbort = (promise, signal) => {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    return promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
};

export function createAnalyticsClient({
  baseUrl = ANALYTICS_BASE,
  getToken = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null),
  fetchImpl = (...args) => fetch(...args),
  onUnauthorized = () => {},
  cacheMs = 60 * 1000,
  now = Date.now,
} = {}) {
  const inflight = new Map();
  const cache = new Map();

  async function request(method, path, params, body) {
    const token = getToken();
    const headers = { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}${buildQuery(params)}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (networkError) {
      throw new AnalyticsError(0, 'Could not reach the analytics service.');
    }

    let payload = null;
    try { payload = await response.json(); } catch (e) { payload = null; }

    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const detail = (payload && (payload.detail || payload.error)) || `Request failed (${response.status})`;
      throw new AnalyticsError(response.status, typeof detail === 'string' ? detail : 'Request failed', payload && payload.context);
    }
    return payload;
  }

  // GET with in-flight sharing + a short cache. `fresh: true` bypasses the cache.
  function get(path, params, { signal, fresh = false } = {}) {
    const key = `${path}${buildQuery(params)}`;
    const cached = cache.get(key);
    if (!fresh && cached && now() - cached.at < cacheMs) return withAbort(Promise.resolve(cached.value), signal);
    if (!inflight.has(key)) {
      const task = request('GET', path, params)
        .then((value) => { cache.set(key, { value, at: now() }); return value; })
        .finally(() => inflight.delete(key));
      inflight.set(key, task);
    }
    return withAbort(inflight.get(key), signal);
  }

  const post = (path, body) => request('POST', path, null, body);
  const clear = () => { cache.clear(); };

  return { get, post, clear };
}

export const analytics = createAnalyticsClient({
  onUnauthorized: () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('agritrade:unauthorized'));
  },
});
