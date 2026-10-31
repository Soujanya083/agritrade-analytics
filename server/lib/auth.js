// lib/auth.js - JWT secret resolution, token signing and auth middleware.
const jwt = require('jsonwebtoken');
const { resolveJwtSecret } = require('../security');

// JWT_SECRET must be set when deployed (NODE_ENV=production or on Render);
// the dev fallback only exists so a missing .env doesn't crash local dev.
let JWT_SECRET;
try {
  const resolved = resolveJwtSecret();
  JWT_SECRET = resolved.secret;
  if (resolved.usingFallback) console.warn('WARNING: JWT_SECRET not set - using the public dev-only secret. Never deploy like this.');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Access tokens are short-lived (the browser keeps them in memory only). The 7-day
// "stay logged in" part is the rotating httpOnly refresh cookie - see lib/refreshTokens.js.
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '30m';

const signToken = (user) => jwt.sign(
  { id: user._id.toString(), role: user.role },
  JWT_SECRET,
  { expiresIn: ACCESS_TTL, algorithm: 'HS256' },
);

// Verifies the Bearer token and attaches { id, role } to req.user.
// Every route that trusts "who is making this request" must use this
// instead of trusting a farmerId/buyerId the client typed into the body.
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication token required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Use on routes where the caller must own the resource identified by a
// specific param name (e.g. requireOwnerOf('farmerId') on
// /api/bids/farmer/:farmerId ensures only that farmer can read their own bids).
const requireOwnerOf = (paramName) => (req, res, next) => {
  if (String(req.user?.id) !== String(req.params[paramName])) {
    return res.status(403).json({ message: 'Not authorized to access this resource' });
  }
  return next();
};

module.exports = { JWT_SECRET, ACCESS_TTL, signToken, authenticateToken, requireOwnerOf };
