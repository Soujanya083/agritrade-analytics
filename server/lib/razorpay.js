// lib/razorpay.js - Razorpay client, or null when no keys are configured.
const Razorpay = require('razorpay');

const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  : null;

module.exports = { razorpay };
