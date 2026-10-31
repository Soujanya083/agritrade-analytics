// routes/health.js - liveness endpoints
const express = require('express');
const { Bid } = require('../models');
const { razorpay } = require('../lib/razorpay');

const router = express.Router();

router.get('/', (req, res) => res.send('Agri-Bid Backend is Online! '));
router.get('/api/health', (req, res) => res.status(200).json({
  status: 'ok',
  razorpayConfigured: Boolean(razorpay),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
}));

module.exports = router;
