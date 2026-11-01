// routes/shipments.js - shipment tracking, delivery confirmation, photos and alerts.
//
// Every route needs a login. Reading or changing a shipment also needs a place on it (farmer, buyer, its
// transporter, or an admin from SHIPMENT_ADMIN_EMAILS); anyone else gets the same 404 as for a code that does not
// exist, so codes cannot be probed. See docs/SHIPMENT_SAFETY.md.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { Shipment, ShipmentPhoto, ShipmentAlert, Transaction } = require('../models');
const { authenticateToken } = require('../lib/auth');
const { sendServerError } = require('../lib/helpers');
const { isValidObjectId } = require('../validators');
const { encodeQr } = require('../lib/qr');
const { actorRoles } = require('../lib/shipmentAccess');
const { safeFileName, maxPhotoBytes } = require('../lib/shipmentFiles');
const { STATUS_LABELS } = require('../lib/shipmentLifecycle');
const svc = require('../services/shipmentService');
const { evaluateAlerts, actOnAlert, publicAlert } = require('../services/shipmentAlerts');
const { buildDetail, buildList } = require('../services/shipmentView');

const router = express.Router();
const { ShipmentError } = svc;

const NOT_FOUND = { message: 'Shipment not found' };
const perUser = (windowMs, max, message) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false, message: { message },
  keyGenerator: (req) => (req.user && req.user.id ? String(req.user.id) : 'anonymous'), // runs after authenticateToken
});
const confirmLimiter = perUser(15 * 60 * 1000, Number(process.env.DELIVERY_CONFIRM_RATE_LIMIT_MAX) || 10, 'Too many delivery confirmation attempts. Please wait a few minutes.');
const codeRequestLimiter = perUser(60 * 60 * 1000, 10, 'Too many delivery code requests. Please try again later.');
const uploadLimiter = perUser(60 * 60 * 1000, 40, 'Too many photo uploads. Please try again later.');

function fail(res, err, fallback) {
  if (err instanceof ShipmentError) return res.status(err.status).json({ message: err.message, code: err.code, ...err.extra });
  return sendServerError(res, err, fallback);
}

// Loads the caller and their shipment, or answers 404. Returns null when it has already answered.
async function context(req, res) {
  const actor = await svc.loadActor(req.user);
  if (!actor) { res.status(401).json({ message: 'Your account no longer exists. Please log in again.' }); return null; }
  const found = await svc.findForActor(req.params.code, actor);
  if (!found) { res.status(404).json(NOT_FOUND); return null; }
  return { actor, ...found };
}

async function detail(shipment, roles) {
  await evaluateAlerts(shipment).catch(() => null);          // keep delay alerts fresh without a scheduler
  await svc.syncTransaction(shipment).catch(() => null);      // heal a half-finished delivery, if any
  const fresh = await Shipment.findById(shipment._id);
  return buildDetail(fresh, roles);
}

// ---- lists ------------------------------------------------------------------------------------------------
router.get('/api/shipments', authenticateToken, async (req, res) => {
  try {
    const actor = await svc.loadActor(req.user);
    if (!actor) return res.status(401).json({ message: 'Please log in again.' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = actor.admin ? {} : { $or: [{ farmerId: actor.id }, { buyerId: actor.id }, { transporterId: actor.id }] };
    if (typeof req.query.status === 'string' && STATUS_LABELS[req.query.status]) filter.status = req.query.status;
    if (req.query.active === 'true') filter.status = { $nin: ['delivered'] };
    const [rows, total] = await Promise.all([
      Shipment.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Shipment.countDocuments(filter),
    ]);
    res.status(200).json({ shipments: await buildList(rows, actor.id), page, limit, total, hasMore: page * limit < total });
  } catch (error) { return fail(res, error, 'Failed to load shipments'); }
});

router.get('/api/shipments/by-transaction/:transactionId', authenticateToken, async (req, res) => {
  try {
    const { transactionId } = req.params;
    if (!isValidObjectId(transactionId)) return res.status(404).json(NOT_FOUND);
    const actor = await svc.loadActor(req.user);
    if (!actor) return res.status(401).json({ message: 'Please log in again.' });
    const tx = await Transaction.findById(transactionId);
    if (!tx || (![String(tx.farmerId), String(tx.buyerId)].includes(actor.id) && !actor.admin)) return res.status(404).json(NOT_FOUND);
    const shipment = await svc.ensureShipmentForTransaction(tx);   // older transactions get their shipment on first look
    if (!shipment) return res.status(404).json(NOT_FOUND);
    const roles = actorRoles({ id: actor.id }, shipment, { admin: actor.admin });
    res.status(200).json({ shipment: await detail(shipment, roles) });
  } catch (error) { return fail(res, error, 'Failed to load the shipment'); }
});

// ---- one shipment -------------------------------------------------------------------------------------------
router.get('/api/shipments/:code', authenticateToken, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    res.status(200).json({ shipment: await detail(ctx.shipment, ctx.roles) });
  } catch (error) { return fail(res, error, 'Failed to load the shipment'); }
});

// The QR code holds only the tracking link. Whoever scans it must still log in and be on the shipment.
router.get('/api/shipments/:code/qr', authenticateToken, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const url = svc.buildTrackingUrl(ctx.shipment.shipmentCode);
    const qr = encodeQr(url);
    res.set('Cache-Control', 'private, no-store');
    res.status(200).json({ shipmentId: ctx.shipment.shipmentCode, url, size: qr.size, version: qr.version, modules: qr.modules.map((row) => row.map((x) => (x ? 1 : 0)).join('')) });
  } catch (error) { return fail(res, error, 'Failed to build the QR code'); }
});

router.post('/api/shipments/:code/status', authenticateToken, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const { status, note, location, expectedDeliveryAt } = req.body || {};
    await svc.changeStatus(ctx.shipment, ctx.actor, ctx.roles, { to: status, note, location, expectedDeliveryAt });
    res.status(200).json({ message: 'Status updated', shipment: await detail(await Shipment.findById(ctx.shipment._id), ctx.roles) });
  } catch (error) { return fail(res, error, 'Failed to update the shipment'); }
});

router.post('/api/shipments/:code/checkpoints', authenticateToken, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const { note, location } = req.body || {};
    await svc.recordCheckpoint(ctx.shipment, ctx.actor, ctx.roles, { note, location });
    res.status(201).json({ message: 'Checkpoint recorded', shipment: await detail(await Shipment.findById(ctx.shipment._id), ctx.roles) });
  } catch (error) { return fail(res, error, 'Failed to record the checkpoint'); }
});

router.put('/api/shipments/:code/carrier', authenticateToken, perUser(15 * 60 * 1000, 20, 'Too many carrier changes. Please wait.'), async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const { transporterEmail, clear } = req.body || {};
    await svc.assignCarrier(ctx.shipment, ctx.actor, ctx.roles, { transporterEmail, clear: clear === true });
    const fresh = await Shipment.findById(ctx.shipment._id);
    res.status(200).json({ message: clear ? 'Carrier removed' : 'Carrier assigned', shipment: await buildDetail(fresh, actorRoles({ id: ctx.actor.id }, fresh, { admin: ctx.actor.admin })) });
  } catch (error) { return fail(res, error, 'Failed to assign the carrier'); }
});

// ---- delivery confirmation (the buyer) ----------------------------------------------------------------------
// "Send me a delivery code": e-mails a fresh single-use code to the buyer. In development / explicit demo mode the
// code is returned HERE, to the buyer who asked, and nowhere else. It is never logged and never put in a notification.
router.post('/api/shipments/:code/delivery-code', authenticateToken, codeRequestLimiter, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    if (!ctx.roles.includes('buyer')) return res.status(403).json({ message: 'Only the buyer can request the delivery code' });
    const out = await svc.issueDeliveryCode(ctx.shipment, { auto: false });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      message: out.sent ? 'A delivery code was sent to your e-mail address.' : out.devCode ? 'Development mode: your code is shown below. In production it is sent by e-mail.' : 'The code could not be delivered because no e-mail service is configured.',
      sent: out.sent, channel: out.channel, expiresAt: out.expiresAt,
      ...(out.devCode ? { devCode: out.devCode, devModeNotice: 'DEVELOPMENT MODE: never shown in production.' } : {}),
    });
  } catch (error) { return fail(res, error, 'Failed to issue the delivery code'); }
});

router.post('/api/shipments/:code/confirm-delivery', authenticateToken, confirmLimiter, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const { otp, receivedQuantityKg, condition, damagedQuantityKg, note } = req.body || {};
    const out = await svc.confirmDelivery(ctx.shipment, ctx.actor, ctx.roles, { otp, receivedQuantityKg, condition, damagedQuantityKg, note });
    res.status(200).json({
      message: out.issues ? 'Delivery recorded. Your report has been logged and the payout is on hold until it is reviewed.' : 'Delivery confirmed. Thank you.',
      hasIssues: out.issues > 0,
      shipment: await buildDetail(await Shipment.findById(ctx.shipment._id), ctx.roles),
    });
  } catch (error) { return fail(res, error, 'Failed to confirm the delivery'); }
});

router.post('/api/shipments/:code/issues', authenticateToken, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const { kind, description, affectedQuantityKg } = req.body || {};
    const out = await svc.reportIssue(ctx.shipment, ctx.actor, ctx.roles, { kind, description, affectedQuantityKg });
    res.status(201).json({ message: 'Problem reported. You can add photos as evidence.', reportId: out.eventId, shipment: await detail(await Shipment.findById(ctx.shipment._id), ctx.roles) });
  } catch (error) { return fail(res, error, 'Failed to report the problem'); }
});

// ---- photos ---------------------------------------------------------------------------------------------------
const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: maxPhotoBytes() + 1024 });
const imageBody = (req, res, next) => rawImage(req, res, (err) => {
  if (!err) return next();
  const tooBig = err.type === 'entity.too.large' || err.status === 413;
  return res.status(tooBig ? 413 : 400).json({ message: tooBig ? `The photo is too large (max ${Math.round(maxPhotoBytes() / 1024)} KB).` : 'The photo could not be read.' });
});

// body = the image bytes, Content-Type = image/jpeg | image/png | image/webp; ?kind=pickup|delivery|damage&caption=...
router.post('/api/shipments/:code/photos', authenticateToken, uploadLimiter, imageBody, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const kind = String(req.query.kind || '');
    const out = await svc.addPhoto(ctx.shipment, ctx.actor, ctx.roles, {
      kind, caption: String(req.query.caption || ''), buffer: Buffer.isBuffer(req.body) ? req.body : null, mime: req.headers['content-type'],
    });
    res.status(201).json({ message: 'Photo saved', photo: { photoId: out.photoId, kind: out.kind, sizeBytes: out.size } });
  } catch (error) { return fail(res, error, 'Failed to save the photo'); }
});

// Photos are private evidence: only people on the shipment can download them, and only through this route.
router.get('/api/shipments/:code/photos/:photoId', authenticateToken, async (req, res) => {
  try {
    const ctx = await context(req, res); if (!ctx) return;
    const photo = await ShipmentPhoto.findOne({ shipmentId: ctx.shipment._id, photoId: String(req.params.photoId) });
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    res.set({
      'Content-Type': photo.mime,
      'Content-Disposition': `inline; filename="${safeFileName(ctx.shipment.shipmentCode, photo.kind, photo.photoId, photo.ext)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.status(200).send(photo.data);
  } catch (error) { return fail(res, error, 'Failed to load the photo'); }
});

// ---- alerts ------------------------------------------------------------------------------------------------------
router.get('/api/shipment-alerts', authenticateToken, async (req, res) => {
  try {
    const actor = await svc.loadActor(req.user);
    if (!actor) return res.status(401).json({ message: 'Please log in again.' });
    const mine = actor.admin ? {} : { $or: [{ farmerId: actor.id }, { buyerId: actor.id }, { transporterId: actor.id }] };
    const shipmentIds = (await Shipment.find(mine).select('_id').lean()).map((s) => s._id);
    const filter = { shipmentId: { $in: shipmentIds } };
    if (req.query.open !== 'false') filter.isOpen = true;
    if (['info', 'warning', 'critical'].includes(req.query.severity)) filter.severity = req.query.severity;
    const alerts = await ShipmentAlert.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.status(200).json({ alerts: alerts.map(publicAlert) });
  } catch (error) { return fail(res, error, 'Failed to load alerts'); }
});

const ALERT_ACTIONS = ['acknowledge', 'investigate', 'resolve'];
router.post('/api/shipment-alerts/:alertId/:action', authenticateToken, async (req, res) => {
  try {
    const { alertId, action } = req.params;
    if (!ALERT_ACTIONS.includes(action) || !isValidObjectId(alertId)) return res.status(404).json({ message: 'Alert not found' });
    const actor = await svc.loadActor(req.user);
    if (!actor) return res.status(401).json({ message: 'Please log in again.' });
    const alert = await ShipmentAlert.findById(alertId).lean();
    const shipment = alert ? await Shipment.findById(alert.shipmentId) : null;
    const roles = shipment ? actorRoles({ id: actor.id }, shipment, { admin: actor.admin }) : [];
    if (!alert || !roles.length) return res.status(404).json({ message: 'Alert not found' });

    const text = (req.body && (req.body.note || req.body.resolutionNote)) || '';
    const out = await actOnAlert(alert, shipment, actor, roles, action, text);
    if (!out.ok) return res.status(out.status).json({ message: out.message, code: out.code });
    if (action === 'resolve') await svc.afterAlertResolved(shipment, actor, roles);
    res.status(200).json({ message: action === 'resolve' ? 'Alert resolved' : action === 'investigate' ? 'Investigation note saved' : 'Alert acknowledged', alert: publicAlert(out.alert) });
  } catch (error) { return fail(res, error, 'Failed to update the alert'); }
});

module.exports = router;
