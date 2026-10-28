const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const Razorpay = require('razorpay');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const {
  isValidObjectId, isPositiveNumber, isNonEmptyString, isValidPhone, isValidLength, isReasonableDate, sanitizeString,
  toCropName,
} = require('./validators');
const {
  isProduction, resolveJwtSecret, buildCorsOptions, generateOtp, safeEqual, shouldExposeOtp,
} = require('./security');
const { normalizeImageInput } = require('./services/imageValidation');
const { createCropImageResolver } = require('./services/cropImages');

const app = express();

// Behind Render/Heroku-style proxies every request arrives from the proxy's
// IP. Without this, express-rate-limit sees ONE client for the whole world,
// so the 20-attempt login limit and 300-request limit were shared by ALL
// users. TRUST_PROXY = number of proxy hops (default: 1 when deployed).
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? (isProduction() ? 1 : 0)));

app.use(helmet());
app.use(cors(buildCorsOptions()));
// Photos are validated to <= 400 KB (see services/imageValidation.js), so
// 1 MB is ample; the old 10 MB limit let one request bloat the database.
app.use(express.json({ limit: '1mb' }));

// General limiter: generous enough not to interfere with normal use
// (dashboard polling, browsing listings), just stops a runaway
// script/bot from hammering the API.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

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

const MAX_OTP_ATTEMPTS = 5;

const signToken = (user) => jwt.sign(
  { id: user._id.toString(), role: user.role },
  JWT_SECRET,
  { expiresIn: '7d', algorithm: 'HS256' },
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

// --- Real crop photos (Pexels), used when a farmer doesn't upload their own.
// All the logic (category-aware queries, relevance checks, caching) lives in
// services/cropImages.js. Returns { url, credit, sourceUrl } or null.
// Real crop photos: Pexels when a key is set, and always the keyless Wikipedia fallback (set CROP_PHOTO_WIKIPEDIA=false to turn it off).
let cropPhotoOverrides = {};
try { cropPhotoOverrides = require('./data/cropPhotoOverrides.json'); } catch (e) { /* no overrides file: fine */ }
const { resolveCropImage } = createCropImageResolver({
  overrides: cropPhotoOverrides,
  apiKey: process.env.PEXELS_API_KEY,
  // never reach out to Wikipedia from automated tests
  useWikipedia: process.env.CROP_PHOTO_WIKIPEDIA !== 'false' && !process.env.JEST_WORKER_ID,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmailValid = (email) => EMAIL_REGEX.test(String(email || '').toLowerCase().trim());
const isStrongPassword = (password) => typeof password === 'string' && password.length >= 8;
const otpExpiryMinutes = 10;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/agribid';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  : null;

const userSchema = new mongoose.Schema({
  role: { type: String, required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  location: { type: String, required: true },
  deliveryAddress: { type: String, default: null },
  isVerified: { type: Boolean, default: false },
  verificationOtp: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  otpAttempts: { type: Number, default: 0 },
  password: { type: String, required: true },
}, { timestamps: true });

const cropSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cropName: { type: String, required: true },
  variety: { type: String, required: true },
  quantityKg: { type: Number, required: true },
  location: { type: String, required: true },
  harvestedDate: { type: String, required: true },
  basePrice: { type: Number, required: true },
  currentBid: { type: Number, required: true },
  category: { type: String, default: 'Grains' },
  imageUrl: { type: String, default: null },
  imageCredit: { type: String, default: null },
  status: { type: String, enum: ['open', 'deal_done', 'completed'], default: 'open' },
  acceptedBidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', default: null },
}, { timestamps: true });

const bidSchema = new mongoose.Schema({
  cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'accepted', 'rejected', 'outbid', 'delivery_completed'], default: 'active' },
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
  cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
  bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', required: true },
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalAmount: { type: Number, required: true },
  platformFee: { type: Number, required: true },
  payout: { type: Number, required: true },
  status: {
    type: String,
    enum: ['awaiting_payment', 'payment_confirmed', 'dispatched', 'delivery_completed'],
    default: 'awaiting_payment',
  },
  paymentProvider: { type: String, default: 'razorpay' },
  razorpayOrderId: { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },
  otpCode: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  dispatchedDate: { type: String, default: null },
  paymentDate: { type: String, default: null },
  completedDate: { type: String, default: null },
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'info' },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

// Indexes for the queries the API and the analytics service actually run.
cropSchema.index({ farmerId: 1, createdAt: -1 });
cropSchema.index({ status: 1, createdAt: -1 });
cropSchema.index({ cropName: 1 });
bidSchema.index({ cropId: 1, status: 1 });
bidSchema.index({ buyerId: 1, createdAt: -1 });
transactionSchema.index({ farmerId: 1, createdAt: -1 });
transactionSchema.index({ buyerId: 1, createdAt: -1 });
transactionSchema.index({ cropId: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

const User = mongoose.model('User', userSchema);
const Crop = mongoose.model('Crop', cropSchema);
const Bid = mongoose.model('Bid', bidSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Notification = mongoose.model('Notification', notificationSchema);

const createNotification = async (userId, message, type = 'info') => {
  await Notification.create({ userId, message, type, isRead: false });
};

// Logs the real error server-side, tells the client nothing about internals
// (the original returned the raw error object: stack-like detail, DB messages).
const sendServerError = (res, error, message) => {
  console.error(`${message}:`, error);
  return res.status(500).json({ message });
};

app.get('/', (req, res) => res.send('Agri-Bid Backend is Online! '));
app.get('/api/health', (req, res) => res.status(200).json({
  status: 'ok',
  razorpayConfigured: Boolean(razorpay),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
}));

app.post('/api/signup', authLimiter, async (req, res) => {
  try {
    const {
      role, fullName, email, phone, location, password, confirmPassword, deliveryAddress,
    } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedRole = role === 'Buyer' ? 'Buyer' : 'Farmer';

    if (!fullName || !phone || !location || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }
    if (!isValidLength(fullName, 2, 60)) {
      return res.status(400).json({ message: 'Full name must be between 2 and 60 characters' });
    }
    if (!isEmailValid(normalizedEmail) || !isValidLength(normalizedEmail, 5, 100)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Phone number must contain digits only (10-15 digits, optional leading +)' });
    }
    if (!isValidLength(location, 2, 100)) {
      return res.status(400).json({ message: 'Location must be between 2 and 100 characters' });
    }
    if (!isStrongPassword(password) || !isValidLength(password, 8, 64)) {
      return res.status(400).json({ message: 'Password must be between 8 and 64 characters long' });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ message: 'Password and confirm password do not match' });
    }
    if (normalizedRole === 'Buyer') {
      if (!deliveryAddress?.trim()) {
        return res.status(400).json({ message: 'Buyer delivery address is required' });
      }
      if (!isValidLength(deliveryAddress, 5, 200)) {
        return res.status(400).json({ message: 'Delivery address must be between 5 and 200 characters' });
      }
    }
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const otpCode = generateOtp();
    const newUser = await User.create({
      role: normalizedRole,
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      location: location.trim(),
      deliveryAddress: normalizedRole === 'Buyer' ? deliveryAddress.trim() : null,
      isVerified: false,
      verificationOtp: otpCode,
      otpExpiresAt: new Date(Date.now() + otpExpiryMinutes * 60 * 1000),
      otpAttempts: 0,
      password: hashedPassword,
    });
    res.status(201).json({
      message: 'User registered successfully! Please verify your account with the OTP sent to your email or phone.',
      user: {
        id: newUser._id,
        role: newUser.role,
        fullName: newUser.fullName,
        email: newUser.email,
        location: newUser.location,
        deliveryAddress: newUser.deliveryAddress,
      },
      otpSent: true,
      // DEMO MODE: no email/SMS provider is wired up, so the OTP is returned
      // in the response (otherwise no account could ever be verified). This
      // means OTP verification proves nothing yet. Set
      // EXPOSE_OTP_IN_RESPONSE=false once a real sender is plugged in.
      ...(shouldExposeOtp() ? { otp: otpCode, otpDelivery: 'demo-mode-in-response' } : {}),
    });
  } catch (error) {
    return sendServerError(res, error, 'Server Error');
  }
});

app.post('/api/verify-otp', authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!isEmailValid(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }
    if (!otp || String(otp).trim().length !== 6) {
      return res.status(400).json({ message: 'Please enter a valid 6-digit OTP' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isVerified) return res.status(200).json({ message: 'Account already verified' });
    if (!user.verificationOtp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    // The IP limiter does not stop one account being attacked from many addresses, so each code also has a
    // small number of tries: after MAX_OTP_ATTEMPTS wrong guesses it is destroyed and a new one must be requested.
    if (!safeEqual(user.verificationOtp, String(otp).trim())) {
      const attempts = (user.otpAttempts || 0) + 1;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await User.updateOne({ _id: user._id }, { $set: { verificationOtp: null, otpExpiresAt: null, otpAttempts: 0 } });
        return res.status(429).json({ message: 'Too many wrong codes. Please request a new OTP.' });
      }
      await User.updateOne({ _id: user._id }, { $inc: { otpAttempts: 1 } });
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.isVerified = true;
    user.verificationOtp = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Account verified successfully' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to verify OTP');
  }
});

app.post('/api/resend-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!isEmailValid(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Account is already verified' });

    const otpCode = generateOtp();
    user.verificationOtp = otpCode;
    user.otpExpiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();

    res.status(200).json({
      message: 'OTP resent successfully',
      // Same demo-mode reasoning as the signup endpoint above.
      ...(shouldExposeOtp() ? { otp: otpCode, otpDelivery: 'demo-mode-in-response' } : {}),
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to resend OTP');
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password, role, phone } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!isEmailValid(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }
    if (!password || !isValidLength(password, 8, 64)) {
      return res.status(400).json({ message: 'Please enter a valid password' });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.role !== role) {
      return res.status(400).json({ message: `Account is registered as ${user.role}` });
    }
    if (user.phone.trim() !== String(phone).trim()) {
      return res.status(400).json({ message: 'Phone number does not match our records' });
    }

    let isMatch = false;
    if (user.password && user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
      if (isMatch) {
        user.password = await bcrypt.hash(password, 10);
        await user.save();
      }
    }
    if (!isMatch) return res.status(400).json({ message: 'Invalid password' });
    // Only reveal "not verified" to someone who proved they know the password.
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Account not verified. Please confirm OTP first.' });
    }

    const token = signToken(user);

    res.status(200).json({
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        location: user.location,
        deliveryAddress: user.deliveryAddress,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

const CROP_CATEGORIES = ['Grains', 'Vegetables', 'Fruits', 'Leafy'];

app.post('/api/crops', authenticateToken, async (req, res) => {
  try {
    const {
      cropName, variety, quantityKg, location, harvestedDate, basePrice, category, imageUrl,
    } = req.body;
    // farmerId now comes from the verified token, not the request body -
    // a client can no longer list a crop "as" another farmer.
    const farmerId = req.user.id;

    if (req.user.role !== 'Farmer') {
      return res.status(403).json({ message: 'Only farmer accounts can list crops' });
    }
    if (!cropName || !variety || !quantityKg || !location || !harvestedDate || !basePrice) {
      return res.status(400).json({ message: 'Missing required crop details' });
    }
    if (!isValidObjectId(farmerId)) {
      return res.status(400).json({ message: 'Invalid farmer ID' });
    }
    if (!isNonEmptyString(cropName, 80) || !isNonEmptyString(variety, 80) || !isNonEmptyString(location, 100)) {
      return res.status(400).json({ message: 'Crop name, variety, and location must be valid text' });
    }
    if (!isPositiveNumber(quantityKg)) {
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }
    if (!isPositiveNumber(basePrice)) {
      return res.status(400).json({ message: 'Base price must be a positive number' });
    }
    if (!isReasonableDate(harvestedDate, { maxPastYears: 2, maxFutureDays: 180 })) {
      return res.status(400).json({ message: 'Harvested date must be a valid, reasonable date' });
    }

    // Previously an unknown category was silently stored as 'Grains', so a mistake (or a category the
    // server did not know, such as leafy crops) would corrupt the data without any error.
    if (category !== undefined && category !== null && category !== '' && !CROP_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Category must be one of: ${CROP_CATEGORIES.join(', ')}` });
    }
    const normalizedCategory = category || 'Grains';

    // A farmer's own photo always wins (validated: https URL or small
    // PNG/JPEG/WebP). Legacy SVG placeholders are ignored. Otherwise look up
    // a stock photo of the actual crop; null means the UI shows its icon.
    const image = normalizeImageInput(imageUrl);
    if (!image.ok) return res.status(400).json({ message: image.message });
    let resolvedImageUrl = image.imageUrl;
    let imageCredit = null;
    if (!resolvedImageUrl) {
      const stock = await resolveCropImage(cropName, normalizedCategory);
      if (stock) { resolvedImageUrl = stock.url; imageCredit = stock.credit; }
    }

    const crop = await Crop.create({
      farmerId,
      cropName: toCropName(sanitizeString(cropName)),
      variety: sanitizeString(variety),
      quantityKg: Number(quantityKg),
      location: sanitizeString(location),
      harvestedDate,
      basePrice: Number(basePrice),
      currentBid: Number(basePrice),
      category: normalizedCategory,
      imageUrl: resolvedImageUrl || null,
      imageCredit,
      status: 'open',
    });
    res.status(201).json({ message: 'Crop uploaded successfully', crop });
  } catch (error) {
    return sendServerError(res, error, 'Failed to upload crop');
  }
});

// A farmer can withdraw their OWN listing while it is still open (no accepted deal). The delete itself is
// atomic on { owner, status: 'open' }, so a deal accepted at the same moment can never lose its listing.
app.delete('/api/crops/:cropId', authenticateToken, async (req, res) => {
  try {
    const { cropId } = req.params;
    if (!isValidObjectId(cropId)) return res.status(400).json({ message: 'Invalid crop ID' });
    if (req.user.role !== 'Farmer') return res.status(403).json({ message: 'Only farmer accounts can delete listings' });
    const existing = await Crop.findById(cropId).lean();
    if (!existing) return res.status(404).json({ message: 'Crop not found' });
    if (String(existing.farmerId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only delete your own listings' });
    }
    const crop = await Crop.findOneAndDelete({ _id: cropId, farmerId: req.user.id, status: 'open' });
    if (!crop) return res.status(409).json({ message: 'A listing with an accepted deal cannot be deleted' });

    const activeBids = await Bid.find({ cropId, status: 'active' }).select('buyerId').lean();
    await Bid.deleteMany({ cropId });
    await Promise.all(activeBids.map((bid) => createNotification(
      bid.buyerId, `The ${crop.cropName} listing you bid on was withdrawn by the farmer.`, 'bid',
    )));
    return res.status(200).json({ message: 'Listing deleted', deletedBids: activeBids.length });
  } catch (error) {
    return sendServerError(res, error, 'Failed to delete listing');
  }
});

app.get('/api/crops', async (req, res) => {
  try {
    const crops = await Crop.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({ crops });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch crops');
  }
});

app.post('/api/bids', authenticateToken, async (req, res) => {
  try {
    const { cropId, amount } = req.body;
    // buyerId comes from the token - a client can no longer bid "as"
    // another buyer just by knowing their Mongo ID.
    const buyerId = req.user.id;

    if (req.user.role !== 'Buyer') {
      return res.status(403).json({ message: 'Only buyer accounts can place bids' });
    }
    if (!isValidObjectId(cropId) || !isValidObjectId(buyerId)) {
      return res.status(400).json({ message: 'Invalid crop or buyer ID' });
    }
    if (!isPositiveNumber(amount)) {
      return res.status(400).json({ message: 'Bid amount must be a valid positive number' });
    }

    // Atomic conditional update instead of read-then-write: two bids
    // arriving close together used to both read the same stale
    // crop.currentBid, both pass the ">" check against it, and then
    // whichever .save() landed last would win - even if it was the
    // lower bid. MongoDB serializes writes to a single document, so
    // only one concurrent request can match this filter and win at a
    // time; a second bid re-checks against whatever currentBid the
    // first one just set, not a stale value.
    const crop = await Crop.findOneAndUpdate(
      { _id: cropId, status: 'open', currentBid: { $lt: Number(amount) } },
      { $set: { currentBid: Number(amount) } },
      { new: true },
    );

    if (!crop) {
      // The atomic update above can't tell us *why* it didn't match, so
      // do one extra read purely to give the buyer a correct error
      // message - this read has no effect on correctness, since the
      // update itself already made the real decision atomically.
      const existing = await Crop.findById(cropId);
      if (!existing) return res.status(404).json({ message: 'Crop not found' });
      if (existing.status !== 'open') {
        return res.status(400).json({ message: 'This crop is no longer open for bidding' });
      }
      return res.status(400).json({ message: 'Bid must be higher than current bid' });
    }

    const bid = await Bid.create({
      cropId,
      buyerId,
      amount: Number(amount),
      status: 'active',
    });
    await createNotification(crop.farmerId, `New bid of INR ${Number(amount).toLocaleString()} received for ${crop.cropName}.`, 'bid');
    res.status(201).json({ message: 'Bid placed successfully', bid });
  } catch (error) {
    return sendServerError(res, error, 'Failed to place bid');
  }
});

app.get('/api/bids/buyer/:buyerId', authenticateToken, requireOwnerOf('buyerId'), async (req, res) => {
  try {
    const bids = await Bid.find({ buyerId: req.params.buyerId })
      .populate('cropId')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ bids });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch buyer bids');
  }
});

app.get('/api/bids/farmer/:farmerId', authenticateToken, requireOwnerOf('farmerId'), async (req, res) => {
  try {
    const crops = await Crop.find({ farmerId: req.params.farmerId }).select('_id').lean();
    const cropIds = crops.map((item) => item._id);
    const bids = await Bid.find({ cropId: { $in: cropIds } })
      .populate('cropId')
      .populate('buyerId', 'fullName email deliveryAddress location')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ bids });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch farmer bids');
  }
});

app.post('/api/bids/:bidId/accept', authenticateToken, async (req, res) => {
  try {
    const farmerId = req.user.id;
    const { bidId } = req.params;
    if (!isValidObjectId(bidId) || !isValidObjectId(farmerId)) {
      return res.status(400).json({ message: 'Invalid bid or farmer ID' });
    }
    const bid = await Bid.findById(bidId);
    if (!bid) return res.status(404).json({ message: 'Bid not found' });
    if (bid.status !== 'active') {
      return res.status(400).json({ message: 'Only an active bid can be accepted' });
    }

    // Claim the crop ATOMICALLY (open -> deal_done, owned by this farmer).
    // The old read-check-then-write let two near-simultaneous accepts both
    // pass the "is it still open?" check and create two transactions.
    const crop = await Crop.findOneAndUpdate(
      { _id: bid.cropId, farmerId, status: 'open' },
      { $set: { status: 'deal_done', acceptedBidId: bid._id } },
      { new: true },
    );
    if (!crop) {
      const existing = await Crop.findById(bid.cropId);
      if (!existing) return res.status(404).json({ message: 'Crop not found' });
      if (String(existing.farmerId) !== String(farmerId)) {
        return res.status(403).json({ message: 'Not authorized to accept this bid' });
      }
      return res.status(400).json({ message: 'Crop is already in deal stage' });
    }

    bid.status = 'accepted';
    await bid.save();
    await Bid.updateMany(
      { cropId: crop._id, _id: { $ne: bid._id }, status: 'active' },
      { $set: { status: 'outbid' } },
    );

    const totalAmount = Number(bid.amount) * Number(crop.quantityKg);
    const platformFee = Number((totalAmount * 0.05).toFixed(2));
    const payout = Number((totalAmount - platformFee).toFixed(2));

    const transaction = await Transaction.create({
      cropId: crop._id,
      bidId: bid._id,
      farmerId: crop.farmerId,
      buyerId: bid.buyerId,
      totalAmount,
      platformFee,
      payout,
      status: 'awaiting_payment',
      paymentProvider: 'razorpay',
    });

    await createNotification(
      bid.buyerId,
      `Your bid for ${crop.cropName} was accepted. Complete payment to proceed.`,
      'deal',
    );

    res.status(200).json({ message: 'Bid accepted and deal marked done', transaction });
  } catch (error) {
    return sendServerError(res, error, 'Failed to accept bid');
  }
});


// Creates a real Razorpay order and stores its ID on the transaction, so
// that /verify-payment (below) has something real to check the buyer's
// signature against. Without this endpoint, transaction.razorpayOrderId
// stays null forever and /verify-payment can never succeed - this was a
// genuine gap: the signature-verification code existed, but nothing ever
// created the order it verifies against.
app.post('/api/transactions/:transactionId/create-order', authenticateToken, async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(503).json({
        message: 'Online payment is not configured on this server. Use UPI confirmation instead.',
      });
    }
    const buyerId = req.user.id;
    const { transactionId } = req.params;
    if (!isValidObjectId(transactionId) || !isValidObjectId(buyerId)) {
      return res.status(400).json({ message: 'Invalid transaction or buyer ID' });
    }
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (String(transaction.buyerId) !== String(buyerId)) {
      return res.status(403).json({ message: 'Not authorized for this payment' });
    }
    if (transaction.status !== 'awaiting_payment') {
      return res.status(400).json({ message: 'Payment already completed for this transaction' });
    }

    // Reuse an already-created order rather than creating a duplicate one
    // if the buyer opens the checkout modal more than once.
    if (transaction.razorpayOrderId) {
      return res.status(200).json({
        orderId: transaction.razorpayOrderId,
        amount: Math.round(Number(transaction.totalAmount) * 100),
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
      });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(Number(transaction.totalAmount) * 100), // Razorpay wants paise, not rupees
      currency: 'INR',
      receipt: String(transaction._id),
    });

    transaction.razorpayOrderId = order.id;
    await transaction.save();

    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to create payment order');
  }
});

// UPI manual confirmation endpoint
app.post('/api/transactions/:transactionId/confirm-upi-payment', authenticateToken, async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { transactionId } = req.params;
    if (!isValidObjectId(transactionId) || !isValidObjectId(buyerId)) {
      return res.status(400).json({ message: 'Invalid transaction or buyer ID' });
    }
    const transaction = await Transaction.findById(transactionId).populate('cropId');
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (String(transaction.buyerId) !== String(buyerId)) {
      return res.status(403).json({ message: 'Not authorized for this payment' });
    }
    if (transaction.status !== 'awaiting_payment') {
      return res.status(400).json({ message: 'Payment already completed for this transaction' });
    }
    // The manual route trusts the buyer's word. Once real online payments are configured it must not be a way
    // around them, so it is switched off and the buyer has to pay through Razorpay (verified by signature).
    if (razorpay) {
      return res.status(409).json({ message: 'Online payment is enabled: please pay through the payment gateway. Manual confirmation is disabled.' });
    }
    // Mark as paid (manual trust-based; demo mode only)
    transaction.status = 'payment_confirmed';
    transaction.paymentDate = new Date().toISOString().slice(0, 10);
    await transaction.save();

    await createNotification(
      transaction.farmerId,
      `Buyer has completed UPI payment for ${transaction.cropId.cropName}. Please mark dispatch.`,
      'payment',
    );
    await createNotification(
      transaction.buyerId,
      'Payment marked as completed. Waiting for farmer dispatch.',
      'payment',
    );
    res.status(200).json({ message: 'Payment marked as completed.' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to confirm UPI payment');
  }
});

app.post('/api/transactions/:transactionId/verify-payment', authenticateToken, async (req, res) => {
  try {
    const {
      razorpayOrderId, razorpayPaymentId, razorpaySignature,
    } = req.body;
    const buyerId = req.user.id;
    const { transactionId } = req.params;
    if (!isValidObjectId(transactionId) || !isValidObjectId(buyerId)) {
      return res.status(400).json({ message: 'Invalid transaction or buyer ID' });
    }
    if (!isNonEmptyString(razorpayOrderId) || !isNonEmptyString(razorpayPaymentId) || !isNonEmptyString(razorpaySignature)) {
      return res.status(400).json({ message: 'Missing or invalid payment verification details' });
    }
    const transaction = await Transaction.findById(transactionId).populate('cropId');
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (String(transaction.buyerId) !== String(buyerId)) {
      return res.status(403).json({ message: 'Not authorized for this payment verification' });
    }
    if (transaction.status !== 'awaiting_payment') {
      return res.status(400).json({ message: 'Payment already verified' });
    }
    if (!transaction.razorpayOrderId || transaction.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ message: 'Order mismatch' });
    }

    // Without the secret an HMAC keyed with '' is something an attacker can
    // compute themselves, so refuse to verify at all rather than "verify".
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ message: 'Online payments are not configured' });
    }
    const digest = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (!safeEqual(digest, razorpaySignature)) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    transaction.status = 'payment_confirmed';
    transaction.paymentDate = new Date().toISOString().slice(0, 10);
    transaction.razorpayPaymentId = razorpayPaymentId;
    await transaction.save();

    await createNotification(
      transaction.farmerId,
      `Buyer has completed payment for ${transaction.cropId.cropName}. Please mark dispatch.`,
      'payment',
    );
    await createNotification(
      transaction.buyerId,
      'Payment verified successfully. Waiting for farmer dispatch.',
      'payment',
    );
    res.status(200).json({ message: 'Payment verified successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to verify payment');
  }
});

app.post('/api/transactions/:transactionId/mark-dispatch', authenticateToken, async (req, res) => {
  try {
    const farmerId = req.user.id;
    const { transactionId } = req.params;
    if (!isValidObjectId(transactionId) || !isValidObjectId(farmerId)) {
      return res.status(400).json({ message: 'Invalid transaction or farmer ID' });
    }
    const transaction = await Transaction.findById(transactionId).populate('cropId');
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (String(transaction.farmerId) !== String(farmerId)) {
      return res.status(403).json({ message: 'Not authorized to dispatch this order' });
    }
    if (transaction.status !== 'payment_confirmed') {
      return res.status(400).json({ message: 'Dispatch allowed only after payment confirmation' });
    }
    const otpCode = generateOtp();
    transaction.status = 'dispatched';
    transaction.dispatchedDate = new Date().toISOString().slice(0, 10);
    transaction.otpCode = otpCode;
    transaction.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await transaction.save();

    await createNotification(
      transaction.buyerId,
      `Farmer dispatched ${transaction.cropId.cropName}. Use OTP ${otpCode} to confirm delivery.`,
      'dispatch',
    );
    await createNotification(
      transaction.farmerId,
      `Dispatch marked for ${transaction.cropId.cropName}. Waiting for buyer OTP confirmation.`,
      'dispatch',
    );
    res.status(200).json({ message: 'Dispatch marked. OTP generated for buyer confirmation.' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to mark dispatch');
  }
});

// A 6-digit OTP has only 1,000,000 values; without a per-user cap an
// authenticated buyer could simply try them all.
const deliveryOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `otp:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP attempts, please try again later.' },
});

app.post('/api/transactions/:transactionId/complete-delivery', authenticateToken, deliveryOtpLimiter, async (req, res) => {
  try {
    const { otpCode } = req.body;
    const buyerId = req.user.id;
    const { transactionId } = req.params;
    if (!isValidObjectId(transactionId) || !isValidObjectId(buyerId)) {
      return res.status(400).json({ message: 'Invalid transaction or buyer ID' });
    }
    if (!otpCode || !/^[0-9]{6}$/.test(String(otpCode).trim())) {
      return res.status(400).json({ message: 'OTP must be a 6-digit code' });
    }
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (String(transaction.buyerId) !== String(buyerId)) {
      return res.status(403).json({ message: 'Not authorized to complete this delivery' });
    }
    if (transaction.status !== 'dispatched') {
      return res.status(400).json({ message: 'Delivery confirmation is available only after dispatch' });
    }
    if (!transaction.otpCode || !safeEqual(transaction.otpCode, String(otpCode).trim())) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (transaction.otpExpiresAt && transaction.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    transaction.status = 'delivery_completed';
    transaction.completedDate = new Date().toISOString().slice(0, 10);
    transaction.otpCode = null;
    transaction.otpExpiresAt = null;
    await transaction.save();

    await Bid.findByIdAndUpdate(transaction.bidId, { status: 'delivery_completed' });
    await Crop.findByIdAndUpdate(transaction.cropId, { status: 'completed' });

    await createNotification(
      transaction.farmerId,
      `Delivery completed. Payout INR ${transaction.payout.toLocaleString()} released after 5% fee deduction.`,
      'delivery',
    );
    await createNotification(
      transaction.buyerId,
      'Delivery confirmed successfully. Transaction completed.',
      'delivery',
    );

    res.status(200).json({
      message: 'Delivery completed successfully',
      payout: transaction.payout,
      platformFee: transaction.platformFee,
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to complete delivery');
  }
});

app.get('/api/transactions/user/:userId', authenticateToken, requireOwnerOf('userId'), async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role === 'Farmer' ? { farmerId: req.params.userId } : { buyerId: req.params.userId };
    const transactions = await Transaction.find(filter)
      .populate('cropId')
      .populate('buyerId', 'fullName deliveryAddress location')
      .populate('farmerId', 'fullName location')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ transactions });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch transactions');
  }
});

app.get('/api/notifications/:userId', authenticateToken, requireOwnerOf('userId'), async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.status(200).json({
      notifications,
      unreadCount: notifications.filter((item) => !item.isRead).length,
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch notifications');
  }
});

app.patch('/api/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    if (String(notification.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to update this notification' });
    }
    notification.isRead = true;
    await notification.save();
    res.status(200).json({ message: 'Notification marked as read', notification });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update notification');
  }
});

app.patch('/api/notifications/user/:userId/read-all', authenticateToken, requireOwnerOf('userId'), async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.params.userId, isRead: false }, { isRead: true });
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to mark all notifications as read');
  }
});


const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
if (require.main === module) {
  app.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
}

module.exports = app;