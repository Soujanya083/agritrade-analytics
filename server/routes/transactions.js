// routes/transactions.js - payments, dispatch and delivery
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Transaction, Shipment } = require('../models');
const { createNotification, sendServerError } = require('../lib/helpers');
const { authenticateToken, requireOwnerOf } = require('../lib/auth');
const { razorpay } = require('../lib/razorpay');
const { isValidObjectId, isNonEmptyString } = require('../validators');
const { safeEqual } = require('../security');
const shipments = require('../services/shipmentService');

const router = express.Router();

router.post('/api/transactions/:transactionId/create-order', authenticateToken, async (req, res) => {
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
router.post('/api/transactions/:transactionId/confirm-upi-payment', authenticateToken, async (req, res) => {
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

router.post('/api/transactions/:transactionId/verify-payment', authenticateToken, async (req, res) => {
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

// "Dispatch" now releases the shipment for pickup. The delivery code is NOT created here any more: it is issued
// when the carrier sets the shipment out for delivery, stored only as a hash, and sent to the buyer privately
// (it used to be saved in clear text and written into the buyer's notification text).
router.post('/api/transactions/:transactionId/mark-dispatch', authenticateToken, async (req, res) => {
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
    const actor = await shipments.loadActor(req.user);
    const shipment = await shipments.ensureShipmentForTransaction(transaction);
    const found = await shipments.findForActor(shipment.shipmentCode, actor);
    const { expectedDeliveryAt, note } = req.body || {};
    await shipments.changeStatus(found.shipment, actor, found.roles, { to: 'ready_for_pickup', expectedDeliveryAt, note });
    await createNotification(
      transaction.farmerId,
      `Shipment ${shipment.shipmentCode} for ${transaction.cropId.cropName} is ready for pickup. Track it from the Shipments tab.`,
      'dispatch',
    );
    res.status(200).json({ message: 'Shipment released for pickup.', shipmentId: shipment.shipmentCode });
  } catch (error) {
    if (error instanceof shipments.ShipmentError) return res.status(error.status).json({ message: error.message, code: error.code });
    return sendServerError(res, error, 'Failed to mark dispatch');
  }
});
// Per-user brake on delivery confirmations (the shipment itself also locks after repeated wrong codes).
const deliveryOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.DELIVERY_OTP_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id ? String(req.user.id) : 'anonymous'),
  message: { message: 'Too many delivery confirmation attempts. Please wait a few minutes.' },
});

// Kept so older clients keep working: it is the same confirmation as POST /api/shipments/:code/confirm-delivery
// (hashed single-use code, attempt limits, and the buyer must state the quantity actually received).
router.post('/api/transactions/:transactionId/complete-delivery', authenticateToken, deliveryOtpLimiter, async (req, res) => {
  try {
    const { otpCode, receivedQuantityKg, condition, damagedQuantityKg, note } = req.body || {};
    const { transactionId } = req.params;
    if (!isValidObjectId(transactionId) || !isValidObjectId(req.user.id)) {
      return res.status(400).json({ message: 'Invalid transaction or buyer ID' });
    }
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (String(transaction.buyerId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to complete this delivery' });
    }
    const shipment = await shipments.ensureShipmentForTransaction(transaction);
    const actor = await shipments.loadActor(req.user);
    const found = await shipments.findForActor(shipment.shipmentCode, actor);
    const out = await shipments.confirmDelivery(found.shipment, actor, found.roles, { otp: otpCode, receivedQuantityKg, condition, damagedQuantityKg, note });
    res.status(200).json({
      message: out.issues ? 'Delivery recorded. Your report was logged and the payout is on hold until it is reviewed.' : 'Delivery completed successfully',
      shipmentId: shipment.shipmentCode,
      payout: out.issues ? undefined : transaction.payout,
      platformFee: out.issues ? undefined : transaction.platformFee,
    });
  } catch (error) {
    if (error instanceof shipments.ShipmentError) return res.status(error.status).json({ message: error.message, code: error.code, ...error.extra });
    return sendServerError(res, error, 'Failed to complete delivery');
  }
});
router.get('/api/transactions/user/:userId', authenticateToken, requireOwnerOf('userId'), async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role === 'Farmer' ? { farmerId: req.params.userId } : { buyerId: req.params.userId };
    const transactions = await Transaction.find(filter)
      .populate('cropId')
      .populate('buyerId', 'fullName deliveryAddress location')
      .populate('farmerId', 'fullName location')
      .sort({ createdAt: -1 })
      .lean();
    const links = await Shipment.find({ transactionId: { $in: transactions.map((t) => t._id) } }).select('transactionId shipmentCode status').lean();
    const byTx = Object.fromEntries(links.map((l) => [String(l.transactionId), l]));
    transactions.forEach((t) => {
      const link = byTx[String(t._id)];
      t.shipmentId = link ? link.shipmentCode : null;     // null for older deals: the Shipments tab creates it on first look
      t.shipmentStatus = link ? link.status : null;
    });
    res.status(200).json({ transactions });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch transactions');
  }
});

module.exports = router;
