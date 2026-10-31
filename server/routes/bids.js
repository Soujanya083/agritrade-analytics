// routes/bids.js - bidding and accepting bids
const express = require('express');
const { Crop, Bid, Transaction } = require('../models');
const { createNotification, sendServerError } = require('../lib/helpers');
const { authenticateToken, requireOwnerOf } = require('../lib/auth');
const { razorpay } = require('../lib/razorpay');
const { isValidObjectId, isPositiveNumber } = require('../validators');

const router = express.Router();

router.post('/api/bids', authenticateToken, async (req, res) => {
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

router.get('/api/bids/buyer/:buyerId', authenticateToken, requireOwnerOf('buyerId'), async (req, res) => {
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

router.get('/api/bids/farmer/:farmerId', authenticateToken, requireOwnerOf('farmerId'), async (req, res) => {
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

router.post('/api/bids/:bidId/accept', authenticateToken, async (req, res) => {
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

module.exports = router;
