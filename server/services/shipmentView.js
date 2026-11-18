// services/shipmentView.js - what the API shows about a shipment. Everything private is left out here, in one place:
// no code hash, no photo bytes, no e-mail addresses or phone numbers, no other user's identifiers.
const { User, ShipmentPhoto, ShipmentAlert } = require('../models');
const { STATUS, statusLabel, allowedNextStatuses } = require('../lib/shipmentLifecycle');
const { capabilities, idOf } = require('../lib/shipmentAccess');
const { describeTracking, LABELS } = require('../lib/tracking');
const { safeFileName } = require('../lib/shipmentFiles');
const { otpConfig } = require('../lib/deliveryOtp');
const { publicAlert } = require('./shipmentAlerts');
const { buildTrackingUrl } = require('./shipmentService');

// only these keys of an event's data are ever sent to a browser
const SAFE_DATA_KEYS = ['kind', 'affectedQuantityKg', 'attempt', 'outcome', 'channel', 'locked', 'expiresInMinutes', 'receivedQuantityKg', 'dispatchedQuantityKg', 'condition', 'photoId', 'sizeBytes', 'alertId', 'alertType', 'severity', 'from', 'to'];
const NEEDS_NOTE = new Set(['delayed', 'delivery_failed', 'damage_reported', 'under_investigation']);

function publicLocation(loc) {
  if (!loc) return null;
  return {
    source: loc.source, sourceLabel: LABELS[loc.source] || loc.source, label: loc.label || null,
    lat: loc.lat ?? null, lng: loc.lng ?? null, accuracyM: loc.accuracyM ?? null, at: loc.capturedAt || loc.recordedAt || null,
  };
}

function publicEvent(e) {
  const data = {};
  SAFE_DATA_KEYS.forEach((k) => { if (e.data && e.data[k] !== undefined) data[k] = e.data[k]; });
  return {
    id: String(e._id), type: e.type, status: e.status || null, statusLabel: e.status ? statusLabel(e.status) : null,
    fromStatus: e.fromStatus || null, at: e.at, by: { role: e.byRole || null, name: e.byName || null },
    note: e.note || null, location: publicLocation(e.location), data,
  };
}

async function namesFor(shipment) {
  const ids = [shipment.farmerId, shipment.buyerId, shipment.transporterId].filter(Boolean);
  const users = await User.find({ _id: { $in: ids } }).select('fullName').lean();
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u.fullName]));
  return { farmer: byId[idOf(shipment.farmerId)] || null, buyer: byId[idOf(shipment.buyerId)] || null, transporter: shipment.transporterId ? byId[idOf(shipment.transporterId)] || null : null };
}

async function buildDetail(shipment, roles, { now = new Date(), env = process.env } = {}) {
  const [names, photos, alerts] = await Promise.all([
    namesFor(shipment),
    ShipmentPhoto.find({ shipmentId: shipment._id }).select('-data').sort({ createdAt: 1 }).lean(),
    ShipmentAlert.find({ shipmentId: shipment._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const plain = shipment.toObject ? shipment.toObject() : shipment;
  const d = plain.delivery || {};
  const cfg = otpConfig(env);
  const locked = d.lockedUntil && new Date(d.lockedUntil) > now;
  const codeActive = Boolean(d.otpHash) && d.otpExpiresAt && new Date(d.otpExpiresAt) > now;
  const isBuyer = roles.includes('buyer');
  const caps = capabilities(plain, roles);

  return {
    shipmentId: plain.shipmentCode,
    trackingUrl: buildTrackingUrl(plain.shipmentCode, env),
    status: plain.status,
    statusLabel: statusLabel(plain.status),
    statusUpdatedAt: plain.statusUpdatedAt,
    crop: { name: plain.cropName },
    quantityDispatchedKg: plain.quantityDispatchedKg,
    origin: plain.originLabel || null,
    destination: plain.destinationLabel || null,
    expectedDeliveryAt: plain.expectedDeliveryAt || null,
    deliveredAt: plain.deliveredAt || null,
    deliveryAttempts: plain.deliveryAttempts || 0,
    people: {
      farmer: names.farmer,
      buyer: names.buyer,
      carrier: { name: names.transporter, assigned: Boolean(plain.transporterId), selfDelivery: !plain.transporterId },
    },
    yourRoles: roles,
    tracking: { ...describeTracking(plain.lastLocation, now), lastLocation: publicLocation(plain.lastLocation) },
    timeline: (plain.events || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at)).map(publicEvent),
    photos: photos.map((p) => ({
      photoId: p.photoId, kind: p.kind, caption: p.caption || '', uploadedAt: p.createdAt, uploadedByRole: p.uploadedByRole,
      sizeBytes: p.size, fileName: safeFileName(plain.shipmentCode, p.kind, p.photoId, p.ext),
    })),
    alerts: alerts.map(publicAlert),
    openAlertCount: alerts.filter((a) => a.isOpen).length,
    delivery: {
      codeActive: Boolean(codeActive && !locked),
      locked: Boolean(locked),
      // what only the buyer needs to know
      ...(isBuyer ? {
        expiresAt: codeActive ? d.otpExpiresAt : null,
        attemptsRemaining: codeActive ? Math.max(0, cfg.maxAttempts - (d.attempts || 0)) : null,
        lockedUntil: locked ? d.lockedUntil : null,
        codeChannel: d.channel || null,
      } : {}),
      confirmedAt: d.confirmedAt || null,
      receivedQuantityKg: d.receivedQuantityKg ?? null,
      condition: d.condition || null,
    },
    permissions: caps,
    nextStatuses: allowedNextStatuses(plain, roles).map((s) => ({ status: s, label: statusLabel(s), requiresNote: NEEDS_NOTE.has(s), asksNewEstimate: s === STATUS.DELAYED })),
    payout: { onHold: Boolean(plain.deliveredAt) && [STATUS.DAMAGE_REPORTED, STATUS.UNDER_INVESTIGATION].includes(plain.status) },
  };
}

// compact version for lists and dashboards
async function buildList(shipments, actorId) {
  if (!shipments.length) return [];
  const counts = await ShipmentAlert.aggregate([
    { $match: { shipmentId: { $in: shipments.map((s) => s._id) }, isOpen: true } },
    { $group: { _id: '$shipmentId', n: { $sum: 1 }, worst: { $max: { $switch: { branches: [{ case: { $eq: ['$severity', 'critical'] }, then: 3 }, { case: { $eq: ['$severity', 'warning'] }, then: 2 }], default: 1 } } } } },
  ]);
  const byShipment = Object.fromEntries(counts.map((c) => [String(c._id), c]));
  const sev = { 3: 'critical', 2: 'warning', 1: 'info' };
  return shipments.map((s) => ({
    shipmentId: s.shipmentCode,
    crop: s.cropName,
    quantityDispatchedKg: s.quantityDispatchedKg,
    status: s.status,
    statusLabel: statusLabel(s.status),
    statusUpdatedAt: s.statusUpdatedAt,
    expectedDeliveryAt: s.expectedDeliveryAt || null,
    destination: s.destinationLabel || null,
    origin: s.originLabel || null,
    yourPart: idOf(s.farmerId) === actorId ? 'farmer' : idOf(s.buyerId) === actorId ? 'buyer' : idOf(s.transporterId) === actorId ? 'transporter' : 'admin',
    openAlerts: (byShipment[String(s._id)] || {}).n || 0,
    worstAlertSeverity: byShipment[String(s._id)] ? sev[byShipment[String(s._id)].worst] : null,
  }));
}

module.exports = { buildDetail, buildList, publicEvent, publicLocation };
