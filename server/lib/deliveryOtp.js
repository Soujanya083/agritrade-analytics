// lib/deliveryOtp.js - the one-time delivery code (pure helpers; the database part lives in the service).
//
//  * 6 digits from crypto.randomInt, valid for DELIVERY_OTP_TTL_MINUTES (default 60), then useless.
//  * Stored only as an HMAC (keyed with the server secret and the shipment id), never in clear text,
//    so a leaked database does not reveal live codes and one shipment's code cannot be replayed on another.
//  * Single use: it is erased the moment it is accepted.
//  * Wrong guesses are counted per shipment; MAX_ATTEMPTS wrong answers burn the code and lock confirmation
//    for LOCK_MINUTES. (A per-user rate limit in the route adds a second layer.)
const crypto = require('crypto');

const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);

function otpConfig(env = process.env) {
  return {
    ttlMinutes: num(env.DELIVERY_OTP_TTL_MINUTES, 60),
    maxAttempts: num(env.DELIVERY_OTP_MAX_ATTEMPTS, 5),
    lockMinutes: num(env.DELIVERY_OTP_LOCK_MINUTES, 15),
    resendCooldownSeconds: num(env.DELIVERY_OTP_RESEND_COOLDOWN_SECONDS, 60),
    maxIssues: num(env.DELIVERY_OTP_MAX_ISSUES, 5),
  };
}

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

function hashCode(code, shipmentCode, secret) {
  if (!secret) throw new Error('A server secret is required to hash delivery codes');
  return crypto.createHmac('sha256', secret).update(`delivery-otp:${shipmentCode}:${String(code)}`).digest('hex');
}

function codesMatch(code, shipmentCode, secret, storedHash) {
  if (!storedHash) return false;
  const given = Buffer.from(hashCode(code, shipmentCode, secret), 'hex');
  const stored = Buffer.from(String(storedHash), 'hex');
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
}

const isWellFormed = (code) => /^[0-9]{6}$/.test(String(code ?? '').trim());

// May a new code be issued now? state = shipment.delivery
function canIssue(state, now = new Date(), cfg = otpConfig()) {
  const t = now.getTime();
  if (state.lockedUntil && new Date(state.lockedUntil).getTime() > t) {
    return { ok: false, code: 'otp_locked', retryAfterSeconds: Math.ceil((new Date(state.lockedUntil).getTime() - t) / 1000), message: 'Too many wrong codes. Try again after the lock ends.' };
  }
  if ((state.issueCount || 0) >= cfg.maxIssues) {
    return { ok: false, code: 'otp_issue_limit', message: 'The maximum number of delivery codes has been sent for this shipment. Please contact the farmer or support.' };
  }
  if (state.lastIssuedAt) {
    const wait = cfg.resendCooldownSeconds * 1000 - (t - new Date(state.lastIssuedAt).getTime());
    if (wait > 0) return { ok: false, code: 'otp_cooldown', retryAfterSeconds: Math.ceil(wait / 1000), message: `Please wait ${Math.ceil(wait / 1000)} seconds before asking for another code.` };
  }
  return { ok: true };
}

// What to tell the user BEFORE counting a guess (nothing to count when there is no usable code).
function precheck(state, now = new Date()) {
  const t = now.getTime();
  if (state.lockedUntil && new Date(state.lockedUntil).getTime() > t) {
    return { ok: false, code: 'otp_locked', retryAfterSeconds: Math.ceil((new Date(state.lockedUntil).getTime() - t) / 1000), message: 'Too many wrong codes. Confirmation is locked for a while.' };
  }
  if (!state.otpHash) return { ok: false, code: 'otp_not_issued', message: 'No delivery code is active. Ask for a new code.' };
  if (!state.otpExpiresAt || new Date(state.otpExpiresAt).getTime() <= t) {
    return { ok: false, code: 'otp_expired', message: 'This delivery code has expired. Ask for a new one.' };
  }
  return { ok: true };
}

// After a wrong guess has been counted: lock (and burn the code) or report what is left.
function afterWrongAttempt(attemptsNow, now = new Date(), cfg = otpConfig()) {
  if (attemptsNow >= cfg.maxAttempts) {
    return { locked: true, lockedUntil: new Date(now.getTime() + cfg.lockMinutes * 60000), attemptsRemaining: 0 };
  }
  return { locked: false, lockedUntil: null, attemptsRemaining: cfg.maxAttempts - attemptsNow };
}

module.exports = { otpConfig, generateCode, hashCode, codesMatch, isWellFormed, canIssue, precheck, afterWrongAttempt };
