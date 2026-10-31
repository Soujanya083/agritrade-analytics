// session.js - where the login session lives in the browser.
//
// Before: the 7-day JWT sat in localStorage, readable by any script that ran on the
// page (one XSS bug = stolen account).
// Now:
//   * the short-lived access token (about 30 min) is kept ONLY in memory (this module);
//   * the long-lived part is an httpOnly cookie that JavaScript cannot read; the server
//     rotates it on every use (see server/lib/refreshTokens.js);
//   * `authFetch` asks the server for a fresh access token when it has none (page
//     reload) or when the server answers 401, then retries the request once.
// localStorage keeps only the non-sensitive display profile (name, role, ...).

export const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  `http://${(typeof window !== 'undefined' && window.location.hostname) || 'localhost'}:5000/api`;

const CSRF_HEADER = { 'X-Requested-With': 'agribid-web' };
const RETRY_AFTER_FAILURE_MS = 5000; // do not hammer /auth/refresh when the cookie is gone

let accessToken = null;
let refreshInFlight = null;
let lastFailureAt = 0;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token || null; };

// Removes every trace of the session from this browser (also purges tokens that older
// versions of the app stored in localStorage).
export function clearSession() {
  accessToken = null;
  lastFailureAt = 0;
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  } catch (e) { /* storage unavailable: nothing to clear */ }
}

// Asks the server for a new access token using the httpOnly cookie. Concurrent callers
// share ONE request (the cookie is single-use, so two parallel refreshes would race).
// Resolves { token, user } or null.
export function refreshSession({ fetchImpl = (...a) => fetch(...a), now = Date.now } = {}) {
  if (refreshInFlight) return refreshInFlight;
  if (lastFailureAt && now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) return Promise.resolve(null);
  refreshInFlight = (async () => {
    try {
      const response = await fetchImpl(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: CSRF_HEADER });
      if (!response.ok) { lastFailureAt = now(); return null; }
      const data = await response.json();
      if (!data || !data.token) { lastFailureAt = now(); return null; }
      lastFailureAt = 0;
      setAccessToken(data.token);
      return data;
    } catch (e) {
      lastFailureAt = now();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// The token if we hold one, otherwise try to get one from the cookie.
export async function ensureAccessToken(options) {
  if (accessToken) return accessToken;
  const refreshed = await refreshSession(options);
  return refreshed ? accessToken : null;
}

export async function logoutSession({ fetchImpl = (...a) => fetch(...a) } = {}) {
  try {
    await fetchImpl(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include', headers: CSRF_HEADER });
  } catch (e) { /* offline: the cookie simply expires */ } finally {
    clearSession();
  }
}

// fetch() with the Bearer token attached. On 401 it renews the token once and retries.
// Returns the raw Response, so callers keep their own error handling.
export async function authFetch(url, options = {}, { fetchImpl = (...a) => fetch(...a), now } = {}) {
  const send = (token) => fetchImpl(url, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const token = await ensureAccessToken({ fetchImpl, ...(now ? { now } : {}) });
  let response = await send(token);
  if (response.status === 401 && token) {
    setAccessToken(null);
    const refreshed = await refreshSession({ fetchImpl, ...(now ? { now } : {}) });
    if (refreshed) response = await send(refreshed.token);
  }
  return response;
}
