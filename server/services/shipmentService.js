// services/shipmentService.js - applies shipment actions to the database.
//
// The decisions (who may do what, which status follows, what to record) are made by the pure functions in
// lib/shipmentEngine.js, lib/shipmentLifecycle.js, lib/deliveryOtp.js and lib/shipmentRules.js. This file loads
// the data, asks them, stores the outcome, sends notifications and keeps the legacy Transaction in step.
const {
  Shipment, ShipmentPhoto, ShipmentAlert, Transaction, Crop, Bid, User,
} = require('../models');
const { createNotification } = require('./../lib/helpers');
const { JWT_SECRET } = require('../lib/auth');
const { generateShipmentCode, isValidShipmentCode, normalizeShipmentCode } = require('../lib/shipmentIds');
const { actorRoles, isShipmentAdmin } = require('../lib/shipmentAccess');
const { STATUS } = require('../lib/shipmentLifecycle');
const engine = require('../lib/shipmentEngine');
const otp = require('../lib/deliveryOtp');
const { loadRules } = require('../lib/shipmentRules');
const { emailProviderConfigured } = require('../security');
const { sendDeliveryCodeEmail } = require('./otpSender');
const { evaluateAlerts } = require('./shipmentAlerts');
const {
  validatePhoto, maxPhotoBytes, newPhotoId, sanitizeText, canUploadKind, MAX_PHOTOS_PER_SHIPMENT, KINDS,
} = require('../lib/shipmentFiles');

class ShipmentError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const refusal = (plan) => new ShipmentError(plan.status, plan.code, plan.message, plan.extra || {});
const toId = (v) => String(v && v._id ? v._id : v);

// The QR code carries only this link: an identifier, never a secret. Opening it still requires a login and
// a place on the shipment.
function buildTrackingUrl(code, env = process.env) {
  const first = String(env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  const base = (env.PUBLIC_APP_URL || first || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/#/shipment/${code}`;
}

// The code may be echoed to the buyer for demos and tests; never by default in production.
function shouldExposeDeliveryCode(env = process.env) {
  const explicit = env.EXPOSE_DELIVERY_OTP_IN_RESPONSE;
  if (explicit !== undefined && String(explicit).trim() !== '') return String(explicit).toLowerCase() === 'true';
  return env.NODE_ENV !== 'production' && !emailProviderConfigured(env);
}

// ---- who is asking ------------------------------------------------------------------------------------
async function loadActor(authUser) {
  const user = await User.findById(authUser.id).select('fullName email role isVerified').lean();
  if (!user) return null;
  return { id: String(user._id), name: user.fullName, email: user.email, accountRole: user.role, admin: isShipmentAdmin(user.email) };
}

// -> { shipment, roles } or null. "Not found" and "not yours" are deliberately the same answer.
async function findForActor(codeParam, actor) {
  const code = normalizeShipmentCode(codeParam);
  if (!isValidShipmentCode(code)) return null;
  const shipment = await Shipment.findOne({ shipmentCode: code });
  if (!shipment) return null;
  const roles = actorRoles({ id: actor.id }, shipment, { admin: actor.admin });
  return roles.length ? { shipment, roles } : null;
}

const asActor = (actor, roles) => ({ id: actor.id, name: actor.name, roles });

// Stores a plan on the shipment document. Two people changing it at once: one wins, the other is told.
async function save(shipment, plan) {
  Object.entries(plan.set || {}).forEach(([path, value]) => shipment.set(path, value));
  (plan.events || []).forEach((event) => shipment.events.push(event));
  try {
    await shipment.save();
  } catch (err) {
    if (err && err.name === 'VersionError') throw new ShipmentError(409, 'conflict', 'The shipment was just updated by someone else. Reload and try again.');
    throw err;
  }
}

async function sendNotifications(list = []) {
  for (const n of list) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(n.userIds.map((id) => createNotification(id, n.message, n.type || 'shipment')));
  }
}

// ---- creation -----------------------------------------------------------------------------------------
async function ensureShipmentForTransaction(txOrId) {
  const tx = txOrId && txOrId._id ? txOrId : await Transaction.findById(txOrId);
  if (!tx) return null;
  const existing = await Shipment.findOne({ transactionId: tx._id });
  if (existing) return existing;

  const [crop, buyer, farmer] = await Promise.all([
    Crop.findById(tx.cropId).lean(),
    User.findById(tx.buyerId).select('deliveryAddress location').lean(),
    User.findById(tx.farmerId).select('location').lean(),
  ]);
  if (!crop) return null;
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await Shipment.create({
        shipmentCode: generateShipmentCode(now),
        transactionId: tx._id, cropId: tx.cropId, farmerId: tx.farmerId, buyerId: tx.buyerId,
        cropName: crop.cropName, quantityDispatchedKg: crop.quantityKg,
        originLabel: crop.location || (farmer && farmer.location) || null,
        destinationLabel: (buyer && (buyer.deliveryAddress || buyer.location)) || null,
        status: STATUS.CREATED, statusUpdatedAt: now, lastEventAt: now,
        events: [{ type: 'created', status: STATUS.CREATED, at: now, byRole: 'system', byName: 'AgriTrade', note: 'Shipment created when the bid was accepted' }],
      });
    } catch (err) {
      if (err && err.code === 11000) {
        // eslint-disable-next-line no-await-in-loop
        const again = await Shipment.findOne({ transactionId: tx._id });
        if (again) return again; // someone else created it a moment ago
        continue; // the random code collided with another shipment: draw another
      }
      throw err;
    }
  }
  throw new Error('Could not allocate a unique shipment code');
}

// ---- status changes and checkpoints -------------------------------------------------------------------
async function changeStatus(shipment, actor, roles, input, { now = new Date(), env = process.env } = {}) {
  const tx = await Transaction.findById(shipment.transactionId).select('status').lean();
  const plan = engine.planStatusChange(shipment.toObject(), asActor(actor, roles), input, { now, env, transactionStatus: tx && tx.status });
  if (!plan.ok) throw refusal(plan);
  await save(shipment, plan);

  if (plan.effects.syncTransaction === 'dispatched') {
    await Transaction.updateOne({ _id: shipment.transactionId, status: 'payment_confirmed' }, { $set: { status: 'dispatched', dispatchedDate: now.toISOString().slice(0, 10) } });
  }
  let delivery = null;
  if (plan.effects.issueDeliveryCode) delivery = await issueDeliveryCode(shipment, { auto: true, now, env });
  await sendNotifications(plan.effects.notify);
  await evaluateAlerts(shipment, { now, force: true, env });
  return { shipment, delivery };
}

async function recordCheckpoint(shipment, actor, roles, input, { now = new Date(), env = process.env } = {}) {
  const plan = engine.planCheckpoint(shipment.toObject(), asActor(actor, roles), input, { now, env });
  if (!plan.ok) throw refusal(plan);
  await save(shipment, plan);
  await evaluateAlerts(shipment, { now, force: true, env });
  return shipment;
}

// ---- carrier assignment -----------------------------------------------------------------------------------
async function assignCarrier(shipment, actor, roles, { transporterEmail, clear }, { now = new Date() } = {}) {
  if (!roles.some((r) => r === 'farmer' || r === 'admin')) throw new ShipmentError(403, 'not_permitted', 'Only the farmer can choose the carrier');
  if (shipment.deliveredAt || ['delivered', 'delivery_failed'].includes(shipment.status)) throw new ShipmentError(409, 'invalid_state', 'The carrier can no longer be changed');
  if (['picked_up', 'in_transit', 'out_for_delivery'].includes(shipment.status)) throw new ShipmentError(409, 'invalid_state', 'The carrier cannot be changed while the goods are on the road');

  let carrier = null;
  if (!clear) {
    const email = String(transporterEmail || '').toLowerCase().trim();
    carrier = email ? await User.findOne({ email, role: 'Transporter', isVerified: true }).select('fullName').lean() : null;
    if (!carrier) throw new ShipmentError(404, 'carrier_not_found', 'No verified transporter account was found for that e-mail address');
  }
  const who = { id: actor.id, name: actor.name, primaryRole: roles.includes('admin') ? 'admin' : 'farmer' };
  shipment.set('transporterId', carrier ? carrier._id : null);
  shipment.set('lastEventAt', now);
  shipment.events.push({
    _id: engine.newEventId(), type: 'carrier_assigned', at: now, byUserId: who.id, byRole: who.primaryRole, byName: who.name,
    note: carrier ? `Carrier assigned: ${carrier.fullName}` : 'Carrier removed: the farmer will deliver',
  });
  await save(shipment, { set: {}, events: [] });
  if (carrier) await createNotification(carrier._id, `You were assigned shipment ${shipment.shipmentCode} (${shipment.cropName}).`, 'shipment');
  return shipment;
}

// ---- the one-time delivery code ----------------------------------------------------------------------------
// auto = issued by the system when the shipment goes out for delivery (no cooldown; nothing is returned).
async function issueDeliveryCode(shipment, { auto = false, now = new Date(), env = process.env } = {}) {
  const cfg = otp.otpConfig(env);
  const state = (shipment.toObject().delivery) || {};
  if (!auto) {
    const gate = otp.canIssue(state, now, cfg);
    if (!gate.ok) throw new ShipmentError(gate.code === 'otp_locked' ? 423 : 429, gate.code, gate.message, { retryAfterSeconds: gate.retryAfterSeconds });
  }
  if (shipment.status !== STATUS.OUT_FOR_DELIVERY) throw new ShipmentError(409, 'invalid_state', 'A delivery code is available only while the shipment is out for delivery');

  const code = otp.generateCode();
  const buyer = await User.findById(shipment.buyerId).select('email').lean();
  const mail = buyer ? await sendDeliveryCodeEmail({ to: buyer.email, code, shipmentCode: shipment.shipmentCode, cropName: shipment.cropName, minutes: cfg.ttlMinutes }, { env }) : { sent: false };
  // Development / explicit demo mode: the buyer who ASKS for a code gets it in the response. A code issued
  // automatically (by the carrier's status update) is never returned to anyone.
  const devMode = !mail.sent && shouldExposeDeliveryCode(env);
  const expose = devMode && !auto;
  const channel = mail.sent ? 'email' : devMode ? 'development' : 'none';
  const eventNote = mail.sent
    ? 'A delivery code was e-mailed to the buyer'
    : devMode ? 'Development mode: the buyer can request the delivery code in the app'
      : 'The delivery code could not be sent to the buyer';

  const updated = await Shipment.findOneAndUpdate(
    { _id: shipment._id, status: STATUS.OUT_FOR_DELIVERY },
    {
      $set: {
        'delivery.otpHash': otp.hashCode(code, shipment.shipmentCode, JWT_SECRET),
        'delivery.otpExpiresAt': new Date(now.getTime() + cfg.ttlMinutes * 60000),
        'delivery.attempts': 0,
        'delivery.lockedUntil': null,
        'delivery.channel': channel,
        ...(auto ? {} : { 'delivery.lastIssuedAt': now }),
      },
      $inc: { 'delivery.issueCount': 1 },
      $push: { events: { _id: engine.newEventId(), type: mail.sent || devMode ? 'otp_issued' : 'otp_delivery_failed', at: now, byRole: 'system', byName: 'AgriTrade', note: eventNote, data: { channel, expiresInMinutes: cfg.ttlMinutes } } },
    },
    { new: true },
  );
  if (!updated) throw new ShipmentError(409, 'conflict', 'The shipment changed while the code was being issued. Try again.');
  if (mail.sent) await createNotification(shipment.buyerId, `A delivery code for shipment ${shipment.shipmentCode} was sent to your e-mail address.`, 'shipment');
  return {
    sent: mail.sent, channel, expiresAt: updated.delivery.otpExpiresAt,
    // ONLY in development / explicit demo mode, and only ever to the buyer who asked (see the route)
    ...(expose ? { devCode: code } : {}),
  };
}

async function confirmDelivery(shipment, actor, roles, body, { now = new Date(), env = process.env } = {}) {
  if (!roles.includes('buyer')) throw new ShipmentError(403, 'not_permitted', 'Only the buyer can confirm delivery');
  if (shipment.status === STATUS.DELIVERED || shipment.deliveredAt) throw new ShipmentError(409, 'already_confirmed', 'This delivery was already confirmed');
  if (shipment.status !== STATUS.OUT_FOR_DELIVERY) throw new ShipmentError(409, 'invalid_state', 'Delivery can be confirmed only while the shipment is out for delivery');

  const parsed = engine.validateReceiptInput(shipment.toObject(), body);
  if (!parsed.ok) throw refusal(parsed);
  if (!otp.isWellFormed(body.otp)) throw new ShipmentError(400, 'otp_malformed', 'Enter the 6-digit delivery code');
  const code = String(body.otp).trim();

  const cfg = otp.otpConfig(env);
  const state = shipment.toObject().delivery || {};
  const pre = otp.precheck(state, now);
  if (!pre.ok) throw new ShipmentError(pre.code === 'otp_locked' ? 423 : 400, pre.code, pre.message, { retryAfterSeconds: pre.retryAfterSeconds });

  // Count this guess BEFORE looking at it, atomically, so parallel requests cannot all get "free" tries.
  const counted = await Shipment.findOneAndUpdate(
    { _id: shipment._id, status: STATUS.OUT_FOR_DELIVERY, 'delivery.otpHash': state.otpHash, $or: [{ 'delivery.lockedUntil': null }, { 'delivery.lockedUntil': { $lte: now } }] },
    { $inc: { 'delivery.attempts': 1 } },
    { new: true },
  );
  if (!counted) throw new ShipmentError(409, 'conflict', 'The delivery code changed or was already used. Reload and try again.');

  if (!otp.codesMatch(code, shipment.shipmentCode, JWT_SECRET, state.otpHash)) {
    const attemptsNow = counted.delivery.attempts;
    const outcome = otp.afterWrongAttempt(attemptsNow, now, cfg);
    const failedTotal = (counted.delivery.failedAttemptsTotal || 0) + 1;
    await Shipment.updateOne({ _id: shipment._id }, {
      $set: { 'delivery.failedAttemptsTotal': failedTotal, lastEventAt: now, ...(outcome.locked ? { 'delivery.lockedUntil': outcome.lockedUntil, 'delivery.otpHash': null, 'delivery.otpExpiresAt': null } : {}) },
      $push: { events: { _id: engine.newEventId(), type: 'otp_failed', at: now, byUserId: actor.id, byRole: 'buyer', byName: actor.name, note: outcome.locked ? 'Wrong delivery code: confirmation is now locked' : `Wrong delivery code (${attemptsNow} of ${cfg.maxAttempts})`, data: { attempt: attemptsNow, locked: outcome.locked } } },
    });
    const fresh = await Shipment.findById(shipment._id);
    await evaluateAlerts(fresh, { now, force: true, env });
    if (outcome.locked) {
      throw new ShipmentError(423, 'otp_locked', 'Too many wrong codes. Delivery confirmation is locked for a while.', { retryAfterSeconds: Math.ceil((outcome.lockedUntil - now) / 1000) });
    }
    throw new ShipmentError(400, 'otp_invalid', 'That code is not correct.', { attemptsRemaining: outcome.attemptsRemaining });
  }

  // Right code. Burn it and record the receipt in one atomic step, only if it is still the active code
  // (a replay or a second tab that got here a moment later finds nothing to update).
  const fresh = counted;
  const photoCount = await ShipmentPhoto.countDocuments({ shipmentId: shipment._id, kind: { $in: ['delivery', 'damage'] } });
  const plan = engine.planReceipt(fresh.toObject(), asActor(actor, roles), parsed, { now, rules: loadRules(env), photoCount });
  const done = await Shipment.findOneAndUpdate(
    { _id: shipment._id, status: STATUS.OUT_FOR_DELIVERY, 'delivery.otpHash': state.otpHash },
    { $set: plan.set, $push: { events: { $each: plan.events } } },
    { new: true },
  );
  if (!done) throw new ShipmentError(409, 'already_confirmed', 'This delivery was already confirmed');

  await sendNotifications(plan.effects.notify);
  await evaluateAlerts(done, { extraFindings: plan.findings, now, force: true, env });
  await syncTransaction(done, { now });
  return { shipment: done, issues: plan.findings.length };
}

// Releases the payout once nothing is in dispute; holds it while a quantity or damage question is open.
async function syncTransaction(shipment, { now = new Date() } = {}) {
  if (!shipment.deliveredAt) return null;
  const openBlocking = await ShipmentAlert.countDocuments({ shipmentId: shipment._id, isOpen: true, type: { $in: ['quantity_mismatch', 'damage_reported'] } });
  const incident = [STATUS.DAMAGE_REPORTED, STATUS.UNDER_INVESTIGATION].includes(shipment.status);
  if (openBlocking > 0 || incident) {
    await Transaction.updateOne({ _id: shipment.transactionId, status: { $ne: 'delivery_completed' } }, { $set: { deliveryDisputed: true } });
    return 'held';
  }
  const tx = await Transaction.findOneAndUpdate(
    { _id: shipment.transactionId, status: { $in: ['dispatched', 'payment_confirmed'] } },
    { $set: { status: 'delivery_completed', deliveryDisputed: false, completedDate: now.toISOString().slice(0, 10), otpCode: null, otpExpiresAt: null } },
    { new: true },
  );
  if (!tx) return 'unchanged';
  await Bid.findByIdAndUpdate(tx.bidId, { status: 'delivery_completed' });
  await Crop.findByIdAndUpdate(tx.cropId, { status: 'completed' });
  await createNotification(tx.farmerId, `Delivery completed. Payout INR ${Number(tx.payout).toLocaleString()} released after 5% fee deduction.`, 'delivery');
  await createNotification(tx.buyerId, 'Delivery confirmed successfully. Transaction completed.', 'delivery');
  return 'completed';
}

// ---- problems and photos -----------------------------------------------------------------------------------
async function reportIssue(shipment, actor, roles, input, { now = new Date(), env = process.env } = {}) {
  const photoCount = await ShipmentPhoto.countDocuments({ shipmentId: shipment._id, kind: { $in: ['damage', 'delivery'] } });
  const plan = engine.planIssueReport(shipment.toObject(), asActor(actor, roles), input, { now, rules: loadRules(env), photoCount });
  if (!plan.ok) throw refusal(plan);
  await save(shipment, plan);
  await sendNotifications(plan.effects.notify);
  await evaluateAlerts(shipment, { extraFindings: plan.findings, now, force: true, env });
  await syncTransaction(shipment, { now });
  return { shipment, eventId: plan.eventId };
}

async function addPhoto(shipment, actor, roles, { kind, caption, buffer, mime }, { now = new Date(), env = process.env } = {}) {
  if (!KINDS.includes(kind)) throw new ShipmentError(400, 'invalid_kind', `kind must be one of: ${KINDS.join(', ')}`);
  if (!canUploadKind(kind, roles)) throw new ShipmentError(403, 'not_permitted', `Your role cannot add "${kind}" photos`);
  if ((shipment.photoCount || 0) >= MAX_PHOTOS_PER_SHIPMENT) throw new ShipmentError(409, 'photo_limit', `A shipment can hold at most ${MAX_PHOTOS_PER_SHIPMENT} photos`);
  const check = validatePhoto(buffer, mime, { maxBytes: maxPhotoBytes(env) });
  if (!check.ok) throw new ShipmentError(check.status, 'invalid_photo', check.message);

  const photoId = newPhotoId();
  const byRole = roles.includes('admin') ? 'admin' : roles.find((r) => canUploadKind(kind, [r])) || roles[0];
  await ShipmentPhoto.create({
    shipmentId: shipment._id, photoId, kind, mime: check.mime, ext: check.ext, size: check.size, sha256: check.sha256,
    caption: sanitizeText(caption, 200), uploadedBy: actor.id, uploadedByRole: byRole, data: buffer,
  });
  const updated = await Shipment.findOneAndUpdate({ _id: shipment._id }, {
    $inc: { photoCount: 1 }, $set: { lastEventAt: now },
    $push: { events: { _id: engine.newEventId(), type: 'photo_added', at: now, byUserId: actor.id, byRole, byName: actor.name, note: sanitizeText(caption, 200) || null, data: { photoId, kind, sizeBytes: check.size, sha256: check.sha256 } } },
  }, { new: true });
  if (kind !== 'pickup') {
    await ShipmentAlert.updateMany({ shipmentId: shipment._id, isOpen: true, type: 'damage_reported' }, {
      $set: { 'details.photoCount': updated ? updated.photoCount : (shipment.photoCount || 0) + 1 },
      $push: { history: { at: now, byUserId: actor.id, byRole, byName: actor.name, action: 'note', text: 'Photo evidence was added.' } },
    });
  }
  return { photoId, kind, size: check.size, mime: check.mime };
}

// After an alert is resolved: if nothing blocking is left on a DELIVERED shipment, the incident is over, so the
// status returns to Delivered and the payout can be released. (An incident during transit is closed by the carrier.)
async function afterAlertResolved(shipment, actor, roles, { now = new Date() } = {}) {
  const fresh = await Shipment.findById(shipment._id);
  if (!fresh) return null;
  if (fresh.deliveredAt && [STATUS.DAMAGE_REPORTED, STATUS.UNDER_INVESTIGATION].includes(fresh.status)) {
    const open = await ShipmentAlert.countDocuments({ shipmentId: fresh._id, isOpen: true, type: { $in: ['quantity_mismatch', 'damage_reported'] } });
    if (open === 0) {
      const byRole = roles.includes('admin') ? 'admin' : 'buyer';
      await Shipment.updateOne({ _id: fresh._id, status: fresh.status }, {
        $set: { status: STATUS.DELIVERED, statusUpdatedAt: now, lastEventAt: now, statusBeforeIncident: null },
        $push: { events: { _id: engine.newEventId(), type: 'status_change', fromStatus: fresh.status, status: STATUS.DELIVERED, at: now, byUserId: actor.id, byRole, byName: actor.name, note: 'All open problems were resolved' } },
      });
    }
  }
  // a delivered shipment whose only problem was a quantity difference (status already "Delivered") gets here too
  const latest = await Shipment.findById(shipment._id);
  await syncTransaction(latest, { now });
  return latest;
}

module.exports = {
  ShipmentError, afterAlertResolved, buildTrackingUrl, shouldExposeDeliveryCode, loadActor, findForActor, ensureShipmentForTransaction,
  changeStatus, recordCheckpoint, assignCarrier, issueDeliveryCode, confirmDelivery, syncTransaction, reportIssue, addPhoto, toId,
};
