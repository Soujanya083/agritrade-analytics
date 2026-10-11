// security.js - small, dependency-free helpers for secrets, CORS and OTPs.
// Kept separate from server.js so the rules can be unit-tested without a
// database or an Express app.
const crypto = require('crypto');

// Same constant analytics-service/app/config.py uses, so a fresh local
// checkout works end-to-end with no .env. Never used when deployed.
const DEV_FALLBACK_JWT_SECRET = 'dev-only-secret-do-not-use-in-production';

// Render sets RENDER=true on every service, so a deployed instance counts as
// production even if NODE_ENV was left unset.
const isProduction = (env = process.env) => env.NODE_ENV === 'production' || Boolean(env.RENDER);

function resolveJwtSecret(env = process.env) {
  const secret = (env.JWT_SECRET || '').trim();
  if (secret) return { secret, usingFallback: false };
  if (isProduction(env)) {
    throw new Error('JWT_SECRET is not set. Refusing to start in production without it.');
  }
  return { secret: DEV_FALLBACK_JWT_SECRET, usingFallback: true };
}

// CORS_ORIGINS="https://a.app,https://b.app". Unset => allow any origin
// (local dev). The API is protected by bearer tokens, not cookies, so a
// permissive default is not a CSRF risk, but production should set it.
function parseCorsOrigins(env = process.env) {
  return (env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function buildCorsOptions(env = process.env) {
  const allowed = parseCorsOrigins(env);
  if (allowed.length === 0) return { origin: true };
  return {
    origin(origin, callback) {
      // No Origin header = non-browser client (curl, server-to-server): allow.
      if (!origin || allowed.includes(origin.replace(/\/$/, ''))) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  };
}

// crypto.randomInt is cryptographically secure; Math.random is predictable.
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Constant-time string comparison (avoids leaking how many leading digits matched).
function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// There is no email/SMS provider wired up. Returning the OTP in the signup
// response is therefore a DEMO-MODE behaviour (otherwise nobody could verify
// an account). It is on by default to preserve that, and can be switched
// off with EXPOSE_OTP_IN_RESPONSE=false the day a real sender exists.
const shouldExposeOtp = (env = process.env) => (env.EXPOSE_OTP_IN_RESPONSE || 'true').toLowerCase() !== 'false';

module.exports = {
  DEV_FALLBACK_JWT_SECRET, isProduction, resolveJwtSecret, parseCorsOrigins,
  buildCorsOptions, generateOtp, safeEqual, shouldExposeOtp,
};
