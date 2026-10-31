// models/index.js - Mongoose schemas and models (moved out of server.js).
const mongoose = require('mongoose');

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

// Long-lived session credential, stored HASHED. The raw value only ever lives in an
// httpOnly cookie (see lib/refreshTokens.js). `family` lets us revoke a whole login
// chain if a rotated token is ever replayed.
const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByHash: { type: String, default: null },
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
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Mongo deletes expired rows itself
refreshTokenSchema.index({ family: 1 });

const User = mongoose.model('User', userSchema);
const Crop = mongoose.model('Crop', cropSchema);
const Bid = mongoose.model('Bid', bidSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = { User, Crop, Bid, Transaction, Notification, RefreshToken };
