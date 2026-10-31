// lib/refreshTokens.js - rotating refresh tokens kept in an httpOnly cookie.
//
// Why: the short-lived access token (JWT, ~30 min) now lives only in the browser's
// memory, so an XSS bug cannot steal a 7-day credential from localStorage. The
// long-lived part is an opaque random value the page's JavaScript cannot read.
//
// Rotation: every refresh consumes the old token and issues a new one. If an
// already-used token is replayed (stolen cookie), the whole family is revoked.
// The store is injected so the logic is unit-tested without a database.
const crypto = require('crypto');
const { isProduction } = require('../security');

const COOKIE_NAME = 'agri_rt';
const COOKIE_PATH = '/api/auth';
const GRACE_MS = 10 * 1000; // two tabs / a double request may legitimately present the same token

const refreshTtlMs = (env = process.env) => (Number(env.REFRESH_TTL_DAYS) > 0 ? Number(env.REFRESH_TTL_DAYS) : 7) * 24 * 60 * 60 * 1000;
const newRawToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (!k) return;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { out[k] = part.slice(i + 1).trim(); }
  });
  return out;
}

// Cross-site in production (Vercel front end -> Render API) needs SameSite=None + Secure.
function cookieOptions(env = process.env) {
  const prod = isProduction(env);
  return {
    httpOnly: true, secure: prod, sameSite: prod ? 'none' : 'lax', path: COOKIE_PATH, maxAge: refreshTtlMs(env),
  };
}

const setRefreshCookie = (res, raw, env = process.env) => res.cookie(COOKIE_NAME, raw, cookieOptions(env));
const clearRefreshCookie = (res, env = process.env) => {
  const { maxAge, ...rest } = cookieOptions(env);
  res.clearCookie(COOKIE_NAME, rest);
};
const readRefreshCookie = (req) => parseCookies(req.headers && req.headers.cookie)[COOKIE_NAME] || null;

// CSRF guard for the cookie-authenticated endpoints: a custom header cannot be sent
// cross-origin without a CORS preflight, which only our allow-listed origin passes.
const hasCsrfHeader = (req) => Boolean(req.headers && req.headers['x-requested-with']);

// Creates the first token of a new login chain.
async function issueRefreshToken(store, userId, { now = Date.now(), env = process.env, family } = {}) {
  const raw = newRawToken();
  await store.create({
    userId, tokenHash: hashToken(raw), family: family || crypto.randomUUID(),
    expiresAt: new Date(now + refreshTtlMs(env)), revokedAt: null, replacedByHash: null,
  });
  return raw;
}

// Returns { ok: true, userId, raw } (new cookie value), { ok: true, userId, raw: null }
// (benign duplicate within the grace window: keep the cookie you already got), or { ok: false, reason }.
async function rotateRefreshToken(store, rawToken, { now = Date.now(), env = process.env } = {}) {
  if (!rawToken) return { ok: false, reason: 'missing' };
  const oldHash = hashToken(rawToken);
  // Atomic claim: only one concurrent request can flip revokedAt from null.
  const claimed = await store.findOneAndUpdate(
    { tokenHash: oldHash, revokedAt: null, expiresAt: { $gt: new Date(now) } },
    { $set: { revokedAt: new Date(now) } },
    { new: false },
  );
  if (claimed) {
    const raw = newRawToken();
    const newHash = hashToken(raw);
    await store.create({
      userId: claimed.userId, tokenHash: newHash, family: claimed.family,
      expiresAt: new Date(now + refreshTtlMs(env)), revokedAt: null, replacedByHash: null,
    });
    await store.updateOne({ tokenHash: oldHash }, { $set: { replacedByHash: newHash } });
    return { ok: true, userId: claimed.userId, raw };
  }
  const known = await store.findOne({ tokenHash: oldHash });
  if (!known) return { ok: false, reason: 'unknown' };
  if (known.revokedAt) {
    const age = now - new Date(known.revokedAt).getTime();
    if (known.replacedByHash && age <= GRACE_MS) return { ok: true, userId: known.userId, raw: null };
    await store.updateMany({ family: known.family, revokedAt: null }, { $set: { revokedAt: new Date(now) } });
    return { ok: false, reason: 'reuse-detected' };
  }
  return { ok: false, reason: 'expired' };
}

async function revokeFamilyByRaw(store, rawToken, { now = Date.now() } = {}) {
  if (!rawToken) return false;
  const known = await store.findOne({ tokenHash: hashToken(rawToken) });
  if (!known) return false;
  await store.updateMany({ family: known.family, revokedAt: null }, { $set: { revokedAt: new Date(now) } });
  return true;
}

module.exports = {
  COOKIE_NAME, COOKIE_PATH, GRACE_MS, refreshTtlMs, hashToken, parseCookies, cookieOptions,
  setRefreshCookie, clearRefreshCookie, readRefreshCookie, hasCsrfHeader,
  issueRefreshToken, rotateRefreshToken, revokeFamilyByRaw,
};
