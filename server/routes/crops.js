// routes/crops.js - crop listings
const express = require('express');
const rateLimit = require('express-rate-limit');
const { parsePagination, buildListFilter, parseInlineImage, toListItem, pageMeta } = require('../lib/listings');
const { Crop, Bid } = require('../models');
const { createNotification, sendServerError, CROP_CATEGORIES } = require('../lib/helpers');
const { authenticateToken } = require('../lib/auth');
const { resolveCropImage } = require('../lib/cropPhotos');
const { isValidObjectId, isPositiveNumber, isNonEmptyString, isReasonableDate, sanitizeString, toCropName } = require('../validators');
const { normalizeImageInput } = require('../services/imageValidation');

const router = express.Router();


router.post('/api/crops', authenticateToken, async (req, res) => {
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
router.delete('/api/crops/:cropId', authenticateToken, async (req, res) => {
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

// Browsers fetch up to a page of photos at once; they are cacheable, so give the image
// route its own generous limit instead of spending the general API budget.
const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many image requests, please try again later.' },
});

// Paginated: ?page=1&limit=24 (max 60), optional filters ?category= ?q= ?status= ?farmerId=.
// Inline photos are replaced by a cacheable image URL (see lib/listings.js).
router.get('/api/crops', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = buildListFilter(req.query);
    const [crops, total] = await Promise.all([
      Crop.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Crop.countDocuments(filter),
    ]);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(200).json({
      crops: crops.map((crop) => toListItem(crop, baseUrl)),
      ...pageMeta({ page, limit, total, returned: crops.length }),
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch crops');
  }
});

// Serves a listing's uploaded photo as a real image (public, like the listing itself).
router.get('/api/crops/:cropId/image', imageLimiter, async (req, res) => {
  try {
    const { cropId } = req.params;
    if (!isValidObjectId(cropId)) return res.status(400).json({ message: 'Invalid crop ID' });
    const crop = await Crop.findById(cropId).select('imageUrl').lean();
    const image = parseInlineImage(crop && crop.imageUrl);
    if (!image) return res.status(404).json({ message: 'No uploaded image for this listing' });
    res.set('Content-Type', image.mime);
    // helmet defaults to same-origin, which would stop the React site (another domain) from showing it.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    // The URL carries ?v=<updatedAt>, so a changed photo gets a new URL: safe to cache for a year.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(image.buffer);
  } catch (error) {
    return sendServerError(res, error, 'Failed to load image');
  }
});

module.exports = router;
