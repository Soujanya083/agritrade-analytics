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
    // DELETE is needed by DELETE /api/crops/:id; without it a browser blocks the
    // request at the preflight step whenever CORS_ORIGINS is set (i.e. when deployed).
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    // Needed so the browser sends the httpOnly refresh cookie. Only ever combined
    // with an explicit allow-list: never with "any origin".
    credentials: true,
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
// A real e-mail sender (see services/otpSender.js) is "configured" when a provider and its key exist.
const emailProviderConfigured = (env = process.env) => {
  const provider = String(env.EMAIL_PROVIDER || '').toLowerCase();
  if (!env.OTP_FROM_EMAIL) return false;
  if (provider === 'brevo') return Boolean(env.BREVO_API_KEY);
  if (provider === 'resend') return Boolean(env.RESEND_API_KEY);
  return false;
};

// Explicit EXPOSE_OTP_IN_RESPONSE always wins. Otherwise the OTP is only echoed in
// the response (demo mode) while NO real sender is configured; once e-mail works
// the OTP is never returned by the API.
const shouldExposeOtp = (env = process.env) => {
  const explicit = env.EXPOSE_OTP_IN_RESPONSE;
  if (explicit !== undefined && String(explicit).trim() !== '') return String(explicit).toLowerCase() !== 'false';
  return !emailProviderConfigured(env);
};

module.exports = {
  DEV_FALLBACK_JWT_SECRET, isProduction, resolveJwtSecret, parseCorsOrigins,
  buildCorsOptions, generateOtp, safeEqual, shouldExposeOtp, emailProviderConfigured,
};
