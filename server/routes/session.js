// routes/session.js - silent token refresh and logout (httpOnly refresh cookie).
const express = require('express');
const rateLimit = require('express-rate-limit');
const { User, RefreshToken } = require('../models');
const { signToken } = require('../lib/auth');
const { sendServerError } = require('../lib/helpers');
const {
  rotateRefreshToken, revokeFamilyByRaw, readRefreshCookie, setRefreshCookie, clearRefreshCookie, hasCsrfHeader,
} = require('../lib/refreshTokens');

const router = express.Router();

// The page refreshes on load and after a 401, so this needs more headroom than login.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.REFRESH_RATE_LIMIT_MAX) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many session refreshes, please try again later.' },
});

const publicUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  role: user.role,
  location: user.location,
  deliveryAddress: user.deliveryAddress,
});

router.post('/api/auth/refresh', refreshLimiter, async (req, res) => {
  try {
    if (!hasCsrfHeader(req)) return res.status(403).json({ message: 'Missing X-Requested-With header' });
    const result = await rotateRefreshToken(RefreshToken, readRefreshCookie(req));
    if (!result.ok) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    const user = await User.findById(result.userId);
    if (!user || !user.isVerified) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    if (result.raw) setRefreshCookie(res, result.raw); // null = duplicate request within the grace window
    return res.status(200).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    return sendServerError(res, error, 'Failed to refresh session');
  }
});

router.post('/api/auth/logout', async (req, res) => {
  try {
    if (!hasCsrfHeader(req)) return res.status(403).json({ message: 'Missing X-Requested-With header' });
    await revokeFamilyByRaw(RefreshToken, readRefreshCookie(req));
    clearRefreshCookie(res);
    return res.status(200).json({ message: 'Logged out' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to log out');
  }
});

module.exports = router;
