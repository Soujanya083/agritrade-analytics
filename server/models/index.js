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
  // legacy (before shipments): the delivery code used to be stored here in clear text. No longer written;
  // the one-time delivery code now lives, hashed, on the Shipment.
  otpCode: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  // true while a quantity or damage question on the shipment is open: the payout is not released
  deliveryDisputed: { type: Boolean, default: false },
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


// ---------------------------------------------------------------------------------------------
// Shipments: traceability and evidence for each delivery. One shipment per transaction.
// ---------------------------------------------------------------------------------------------
const locationSchema = new mongoose.Schema({
  source: { type: String, enum: ['device_gps', 'manual', 'simulated'] },
  lat: Number,
  lng: Number,
  accuracyM: Number,
  capturedAt: Date,
  recordedAt: Date,
  label: String,
}, { _id: false });

// Append-only log: events are only ever added, never edited or deleted.
const shipmentEventSchema = new mongoose.Schema({
  type: { type: String, required: true },
  status: String,
  fromStatus: String,
  at: { type: Date, default: Date.now },
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byRole: String,
  byName: String,
  note: String,
  location: locationSchema,
  data: mongoose.Schema.Types.Mixed,
});

const shipmentSchema = new mongoose.Schema({
  shipmentCode: { type: String, required: true, unique: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, unique: true },
  cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // what was shipped, copied at creation so later edits to the listing cannot rewrite history
  cropName: String,
  quantityDispatchedKg: { type: Number, required: true },
  originLabel: String,
  destinationLabel: String,
  status: {
    type: String,
    enum: ['created', 'ready_for_pickup', 'picked_up', 'in_transit', 'delayed', 'out_for_delivery', 'delivered', 'delivery_failed', 'damage_reported', 'under_investigation'],
    default: 'created',
  },
  statusUpdatedAt: { type: Date, default: Date.now },
  statusBeforeIncident: { type: String, default: null },
  readyAt: Date,
  pickedUpAt: Date,
  deliveredAt: Date,
  expectedDeliveryAt: Date,
  lastEventAt: { type: Date, default: Date.now },
  deliveryAttempts: { type: Number, default: 0 },
  lastLocation: locationSchema,
  events: [shipmentEventSchema],
  // the one-time delivery code (stored only as an HMAC) and the evidence from the handover
  delivery: {
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    failedAttemptsTotal: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    issueCount: { type: Number, default: 0 },
    lastIssuedAt: { type: Date, default: null },
    channel: { type: String, default: null },
    confirmedAt: { type: Date, default: null },
    receivedQuantityKg: { type: Number, default: null },
    condition: { type: String, default: null },
  },
  photoCount: { type: Number, default: 0 },
  alertsEvaluatedAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true });

// Photos live in their own collection so listing shipments never loads image bytes.
const shipmentPhotoSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true },
  photoId: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['pickup', 'delivery', 'damage'], required: true },
  mime: { type: String, required: true },
  ext: { type: String, required: true },
  size: { type: Number, required: true },
  sha256: { type: String, required: true },
  caption: { type: String, default: '' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedByRole: String,
  data: { type: Buffer, required: true },
}, { timestamps: true });

const alertNoteSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byRole: String,
  byName: String,
  action: { type: String, enum: ['acknowledged', 'investigating', 'note', 'resolved', 'escalated', 'auto_resolved'] },
  text: String,
}, { _id: false });

const shipmentAlertSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true },
  shipmentCode: { type: String, required: true },
  type: { type: String, enum: ['delay', 'quantity_mismatch', 'damage_reported', 'verification_failed'], required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
  status: { type: String, enum: ['open', 'acknowledged', 'investigating', 'resolved'], default: 'open' },
  isOpen: { type: Boolean, default: true },
  rule: String,
  reason: { type: String, required: true },          // plain-language explanation shown to every user
  details: mongoose.Schema.Types.Mixed,              // the numbers and thresholds behind it
  dedupeKey: { type: String, required: true },
  raisedBy: { type: String, default: 'system' },
  history: [alertNoteSchema],
  resolvedAt: Date,
  resolvedByRole: String,
  resolutionNote: String,
}, { timestamps: true });

shipmentSchema.index({ farmerId: 1, createdAt: -1 });
shipmentSchema.index({ buyerId: 1, createdAt: -1 });
shipmentSchema.index({ transporterId: 1, createdAt: -1 });
shipmentSchema.index({ status: 1, expectedDeliveryAt: 1 });
shipmentPhotoSchema.index({ shipmentId: 1, createdAt: 1 });
shipmentAlertSchema.index({ shipmentId: 1, createdAt: -1 });
// at most ONE unresolved alert per cause: this is what stops duplicate alerts even if two requests race
shipmentAlertSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });

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
const Shipment = mongoose.model('Shipment', shipmentSchema);
const ShipmentPhoto = mongoose.model('ShipmentPhoto', shipmentPhotoSchema);
const ShipmentAlert = mongoose.model('ShipmentAlert', shipmentAlertSchema);

module.exports = {
  User, Crop, Bid, Transaction, Notification, RefreshToken, Shipment, ShipmentPhoto, ShipmentAlert,
};
