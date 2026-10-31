// lib/limiters.js - rate limiters (moved out of server.js).
const rateLimit = require('express-rate-limit');

// General limiter: generous enough not to interfere with normal use
// (dashboard polling, browsing listings), just stops a runaway
// script/bot from hammering the API.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
  // photo fetches have their own limiter (routes/crops.js) so a page of thumbnails can't eat the API budget
  skip: (req) => /^\/api\/crops\/[a-f0-9]{24}\/image$/i.test(req.path),
});

// Tighter limiter specifically for login/signup - these are the routes
// worth protecting against brute-force/credential-stuffing attempts,
// so they get a stricter cap than everything else.
// Defaults are the production values; the env overrides exist so automated
// tests that create many accounts from one IP don't trip them.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again in a few minutes.' },
});

module.exports = { generalLimiter, authLimiter };
