// routes/transactions.js - payments, dispatch and delivery
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Crop, Bid, Transaction } = require('../models');
const { createNotification, sendServerError } = require('../lib/helpers');
const { authenticateToken, requireOwnerOf } = require('../lib/auth');
const { razorpay } = require('../lib/razorpay');
const { isValidObjectId, isNonEmptyString } = require('../validators');
const { generateOtp, safeEqual } = require('../security');

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

router.post('/api/transactions/:transactionId/complete-delivery', authenticateToken, deliveryOtpLimiter, async (req, res) => {
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
    res.status(200).json({ transactions });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch transactions');
  }
});

module.exports = router;
