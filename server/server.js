const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const Razorpay = require('razorpay');
require('dotenv').config();
const {
  isValidObjectId, isPositiveNumber, isNonEmptyString, isValidPhone, isValidLength, isReasonableDate, sanitizeString,
} = require('./validators');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmailValid = (email) => EMAIL_REGEX.test(String(email || '').toLowerCase().trim());
const isStrongPassword = (password) => typeof password === 'string' && password.length >= 8;
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));
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

const User = mongoose.model('User', userSchema);
const Crop = mongoose.model('Crop', cropSchema);
const Bid = mongoose.model('Bid', bidSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Notification = mongoose.model('Notification', notificationSchema);

const createNotification = async (userId, message, type = 'info') => {
  await Notification.create({ userId, message, type, isRead: false });
};

app.get('/', (req, res) => res.send('Agri-Bid Backend is Online! '));
app.get('/api/health', (req, res) => res.status(200).json({
  status: 'ok',
  razorpayConfigured: Boolean(razorpay),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
}));

app.post('/api/signup', async (req, res) => {
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
      otp: process.env.NODE_ENV === 'development' ? otpCode : undefined,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error });
  }
});

app.post('/api/verify-otp', async (req, res) => {
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
    if (user.verificationOtp !== String(otp).trim()) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.isVerified = true;
    user.verificationOtp = null;
    user.otpExpiresAt = null;
    await user.save();

    res.status(200).json({ message: 'Account verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to verify OTP', error });
  }
});

app.post('/api/resend-otp', async (req, res) => {
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
    await user.save();

    res.status(200).json({
      message: 'OTP resent successfully',
      otp: process.env.NODE_ENV === 'development' ? otpCode : undefined,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to resend OTP', error });
  }
});

app.post('/api/login', async (req, res) => {
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
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Account not verified. Please confirm OTP first.' });
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

    res.status(200).json({
      message: 'Login successful!',
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

app.post('/api/crops', async (req, res) => {
  try {
    const {
      farmerId, cropName, variety, quantityKg, location, harvestedDate, basePrice, category, imageUrl,
    } = req.body;

    if (!farmerId || !cropName || !variety || !quantityKg || !location || !harvestedDate || !basePrice) {
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

    const crop = await Crop.create({
      farmerId,
      cropName: sanitizeString(cropName),
      variety: sanitizeString(variety),
      quantityKg: Number(quantityKg),
      location: sanitizeString(location),
      harvestedDate,
      basePrice: Number(basePrice),
      currentBid: Number(basePrice),
      category: category || 'Grains',
      imageUrl: imageUrl || null,
      status: 'open',
    });
    res.status(201).json({ message: 'Crop uploaded successfully', crop });
  } catch (error) {
    res.status(500).json({ message: 'Failed to upload crop', error });
  }
});

app.get('/api/crops', async (req, res) => {
  try {
    const crops = await Crop.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({ crops });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch crops', error });
  }
});

app.post('/api/bids', async (req, res) => {
  try {
    const { cropId, buyerId, amount } = req.body;

    if (!isValidObjectId(cropId) || !isValidObjectId(buyerId)) {
      return res.status(400).json({ message: 'Invalid crop or buyer ID' });
    }
    if (!isPositiveNumber(amount)) {
      return res.status(400).json({ message: 'Bid amount must be a valid positive number' });
    }

    const crop = await Crop.findById(cropId);
    if (!crop) return res.status(404).json({ message: 'Crop not found' });
    if (crop.status !== 'open') return res.status(400).json({ message: 'This crop is no longer open for bidding' });
    if (Number(amount) <= Number(crop.currentBid)) {
      return res.status(400).json({ message: 'Bid must be higher than current bid' });
    }
    const bid = await Bid.create({
      cropId,
      buyerId,
      amount: Number(amount),
      status: 'active',
    });
    crop.currentBid = Number(amount);
    await crop.save();
    await createNotification(crop.farmerId, `New bid of INR ${Number(amount).toLocaleString()} received for ${crop.cropName}.`, 'bid');
    res.status(201).json({ message: 'Bid placed successfully', bid });
  } catch (error) {
    res.status(500).json({ message: 'Failed to place bid', error });
  }
});

app.get('/api/bids/buyer/:buyerId', async (req, res) => {
  try {
    const bids = await Bid.find({ buyerId: req.params.buyerId })
      .populate('cropId')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ bids });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch buyer bids', error });
  }
});

app.get('/api/bids/farmer/:farmerId', async (req, res) => {
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
    res.status(500).json({ message: 'Failed to fetch farmer bids', error });
  }
});

app.post('/api/bids/:bidId/accept', async (req, res) => {
  try {
    const { farmerId } = req.body;
    const { bidId } = req.params;
    if (!isValidObjectId(bidId) || !isValidObjectId(farmerId)) {
      return res.status(400).json({ message: 'Invalid bid or farmer ID' });
    }
    const bid = await Bid.findById(bidId).populate('cropId');
    if (!bid) return res.status(404).json({ message: 'Bid not found' });
    const crop = await Crop.findById(bid.cropId._id);
    if (!crop) return res.status(404).json({ message: 'Crop not found' });
    if (String(crop.farmerId) !== String(farmerId)) {
      return res.status(403).json({ message: 'Not authorized to accept this bid' });
    }
    if (crop.status !== 'open') {
      return res.status(400).json({ message: 'Crop is already in deal stage' });
    }

    bid.status = 'accepted';
    await bid.save();
    await Bid.updateMany(
      { cropId: crop._id, _id: { $ne: bid._id }, status: 'active' },
      { $set: { status: 'outbid' } },
    );

    crop.status = 'deal_done';
    crop.acceptedBidId = bid._id;
    await crop.save();

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
    res.status(500).json({ message: 'Failed to accept bid', error });
  }
});


// UPI manual confirmation endpoint
app.post('/api/transactions/:transactionId/confirm-upi-payment', async (req, res) => {
  try {
    const { buyerId } = req.body;
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
    // Mark as paid (manual trust-based)
    transaction.status = 'payment_confirmed';
    transaction.paymentDate = new Date().toLocaleDateString();
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
    res.status(500).json({ message: 'Failed to confirm UPI payment', error: error.message });
  }
});

app.post('/api/transactions/:transactionId/verify-payment', async (req, res) => {
  try {
    const {
      buyerId, razorpayOrderId, razorpayPaymentId, razorpaySignature,
    } = req.body;
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

    const digest = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (!digest || digest !== razorpaySignature) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    transaction.status = 'payment_confirmed';
    transaction.paymentDate = new Date().toLocaleDateString();
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
    res.status(500).json({ message: 'Failed to verify payment', error: error.message });
  }
});

app.post('/api/transactions/:transactionId/mark-dispatch', async (req, res) => {
  try {
    const { farmerId } = req.body;
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
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    transaction.status = 'dispatched';
    transaction.dispatchedDate = new Date().toLocaleDateString();
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
    res.status(500).json({ message: 'Failed to mark dispatch', error });
  }
});

app.post('/api/transactions/:transactionId/complete-delivery', async (req, res) => {
  try {
    const { buyerId, otpCode } = req.body;
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
    if (!transaction.otpCode || transaction.otpCode !== String(otpCode)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (transaction.otpExpiresAt && transaction.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    transaction.status = 'delivery_completed';
    transaction.completedDate = new Date().toLocaleDateString();
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
    res.status(500).json({ message: 'Failed to complete delivery', error });
  }
});

app.get('/api/transactions/user/:userId', async (req, res) => {
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
    res.status(500).json({ message: 'Failed to fetch transactions', error });
  }
});

app.get('/api/notifications/:userId', async (req, res) => {
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
    res.status(500).json({ message: 'Failed to fetch notifications', error });
  }
});

app.patch('/api/notifications/:notificationId/read', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.notificationId,
      { isRead: true },
      { new: true },
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.status(200).json({ message: 'Notification marked as read', notification });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notification', error });
  }
});

app.patch('/api/notifications/user/:userId/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.params.userId, isRead: false }, { isRead: true });
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark all notifications as read', error });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../agribid/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../agribid/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
if (require.main === module) {
  app.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
}

module.exports = app;