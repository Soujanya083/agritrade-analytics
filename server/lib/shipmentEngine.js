// lib/shipmentEngine.js - decides what a shipment action does, as plain data (no database, no Express).
//
// Each plan* function takes a plain snapshot of the shipment plus who is acting and returns either
//   { ok: false, status, code, message }                       (refused, nothing changes), or
//   { ok: true, set, events, findings?, effects }               (what the service should store and do).
// The service layer (services/shipmentService.js) only applies the result, so the rules are testable
// here without MongoDB.
const crypto = require('crypto');
const {
  STATUS, TRANSITIONS, validateTransition, withinDamageWindow, statusLabel,
} = require('./shipmentLifecycle');
const { validateLocation } = require('./tracking');
const { sanitizeText } = require('./shipmentFiles');
const { evaluateQuantity, evaluateDamage, loadRules } = require('./shipmentRules');

const DEFAULT_TRANSIT_HOURS = 48;
const MAX_ETA_DAYS = 30;
const NOTE_REQUIRED = new Set(['delayed', 'delivery_failed', 'damage_reported', 'under_investigation']);
const MOVING = new Set(['picked_up', 'in_transit', 'delayed', 'out_for_delivery']);
const INCIDENT = new Set(['damage_reported', 'under_investigation']);
const ISSUE_KINDS = ['damage', 'missing', 'quantity'];
const CONDITIONS = ['ok', 'damaged', 'missing_items'];

const newEventId = () => crypto.randomBytes(12).toString('hex'); // 24 hex chars = a valid ObjectId

const refuse = (status, code, message) => ({ ok: false, status, code, message });

// "Farmer (delivering)" when the farmer is also the carrier, so nobody mistakes who recorded it.
function roleLabel(role, shipment) {
  if (role === 'carrier') return shipment.transporterId ? 'transporter' : 'farmer (delivering)';
  return role;
}

function eventBase(type, actor, shipment, now, extra = {}) {
  return {
    _id: newEventId(),
    type,
    at: now,
    byUserId: actor.system ? null : actor.id,
    byRole: actor.system ? 'system' : roleLabel(actor.primaryRole, shipment),
    byName: actor.system ? 'AgriTrade' : actor.name || null,
    ...extra,
  };
}

function checkEta(value, now) {
  const eta = new Date(value);
  if (Number.isNaN(eta.getTime())) return { ok: false, message: 'expectedDeliveryAt is not a valid date' };
  if (eta.getTime() <= now.getTime()) return { ok: false, message: 'The expected delivery time must be in the future' };
  if (eta.getTime() > now.getTime() + MAX_ETA_DAYS * 86400000) return { ok: false, message: `The expected delivery time can be at most ${MAX_ETA_DAYS} days ahead` };
  return { ok: true, eta };
}

// ---- status change ------------------------------------------------------------------------------
// actor: { id, name, roles: [...] }.  input: { to, note, location, expectedDeliveryAt }
function planStatusChange(shipment, actor, input, { now = new Date(), env = process.env, transactionStatus } = {}) {
  const to = input.to;
  const check = validateTransition(shipment, to, actor.roles);
  if (!check.ok) {
    const status = check.code === 'not_permitted' ? 403 : 409;
    return { ...refuse(status, check.code, check.message) };
  }

  const note = sanitizeText(input.note, 500);
  if (NOTE_REQUIRED.has(to) && note.length < 3) {
    return refuse(400, 'note_required', `Please say why: a note is required to mark a shipment "${statusLabel(to)}"`);
  }

  if (to === STATUS.READY_FOR_PICKUP && !['payment_confirmed', 'dispatched'].includes(transactionStatus)) {
    return refuse(409, 'payment_required', 'The shipment can be released for pickup only after the buyer\'s payment is confirmed');
  }

  const loc = validateLocation(input.location, { now, env });
  if (!loc.ok) return refuse(400, 'invalid_location', loc.message);

  // expected delivery time: required (or defaulted) when the shipment is released; optional new ETA when delayed
  let eta = null;
  let etaChanged = false;
  if (to === STATUS.READY_FOR_PICKUP) {
    const given = input.expectedDeliveryAt !== undefined && input.expectedDeliveryAt !== null && input.expectedDeliveryAt !== '';
    const r = given ? checkEta(input.expectedDeliveryAt, now) : { ok: true, eta: new Date(now.getTime() + DEFAULT_TRANSIT_HOURS * 3600000) };
    if (!r.ok) return refuse(400, 'invalid_eta', r.message);
    eta = r.eta; etaChanged = true;
  } else if (input.expectedDeliveryAt !== undefined && input.expectedDeliveryAt !== null && input.expectedDeliveryAt !== '') {
    const r = checkEta(input.expectedDeliveryAt, now);
    if (!r.ok) return refuse(400, 'invalid_eta', r.message);
    eta = r.eta;
    etaChanged = !shipment.expectedDeliveryAt || new Date(shipment.expectedDeliveryAt).getTime() !== eta.getTime();
  }

  // the role that actually authorised this step (a farmer who also delivers is a 'farmer' when releasing the goods)
  const authorising = (TRANSITIONS[shipment.status] || {})[to] || [];
  const primaryRole = ['carrier', 'farmer', 'buyer', 'admin'].find((r) => actor.roles.includes(r) && authorising.includes(r)) || actor.roles[0];
  const who = { ...actor, primaryRole };
  const set = { status: to, statusUpdatedAt: now, lastEventAt: now };
  const events = [eventBase('status_change', who, shipment, now, { fromStatus: shipment.status, status: to, note: note || null, location: loc.location || undefined })];

  if (to === STATUS.READY_FOR_PICKUP) set.readyAt = now;
  if (to === STATUS.PICKED_UP) set.pickedUpAt = now;
  if (to === STATUS.DELIVERY_FAILED) {
    set.deliveryAttempts = (shipment.deliveryAttempts || 0) + 1;
    events[0].type = 'delivery_attempt';
    events[0].data = { attempt: set.deliveryAttempts, outcome: 'failed' };
  }
  if (INCIDENT.has(to) && !INCIDENT.has(shipment.status)) set.statusBeforeIncident = shipment.status;
  if (!INCIDENT.has(to) && INCIDENT.has(shipment.status)) set.statusBeforeIncident = null;
  if (loc.location) set.lastLocation = { ...loc.location, recordedAt: now };
  if (eta) {
    set.expectedDeliveryAt = eta;
    if (etaChanged && to !== STATUS.READY_FOR_PICKUP) {
      events.push(eventBase('eta_changed', who, shipment, now, { note: note || null, data: { from: shipment.expectedDeliveryAt || null, to: eta } }));
    }
  }

  return {
    ok: true,
    set,
    events,
    effects: {
      issueDeliveryCode: to === STATUS.OUT_FOR_DELIVERY,
      syncTransaction: to === STATUS.READY_FOR_PICKUP ? 'dispatched' : null,
      notify: notifications(shipment, to, note, who),
    },
  };
}

// Who hears about a status change, and what we tell them (never a code, never contact details).
function notifications(shipment, to, note, actor) {
  const code = shipment.shipmentCode;
  const label = statusLabel(to);
  const everyone = [shipment.farmerId, shipment.buyerId, shipment.transporterId].filter(Boolean).map(String);
  const others = everyone.filter((id) => id !== String(actor.id));
  const text = `Shipment ${code} is now "${label}".${note ? ` Note: ${note}` : ''}`;
  const out = [];
  if (others.length) out.push({ userIds: others, message: text, type: 'shipment' });
  return out;
}

// ---- checkpoints (carrier updates while moving) ------------------------------------------------------
function planCheckpoint(shipment, actor, input, { now = new Date(), env = process.env } = {}) {
  if (!actor.roles.some((r) => r === 'carrier' || r === 'admin')) return refuse(403, 'not_permitted', 'Only the carrier can record tracking checkpoints');
  if (!MOVING.has(shipment.status)) return refuse(409, 'invalid_state', `Checkpoints can be recorded only while the shipment is on the road (it is "${statusLabel(shipment.status)}")`);
  const note = sanitizeText(input.note, 300);
  const loc = validateLocation(input.location, { now, env });
  if (!loc.ok) return refuse(400, 'invalid_location', loc.message);
  if (!note && !loc.location) return refuse(400, 'empty_checkpoint', 'A checkpoint needs a note or a location');
  const who = { ...actor, primaryRole: actor.roles.includes('carrier') ? 'carrier' : 'admin' };
  const set = { lastEventAt: now };
  if (loc.location) set.lastLocation = { ...loc.location, recordedAt: now };
  return { ok: true, set, events: [eventBase('checkpoint', who, shipment, now, { status: shipment.status, note: note || null, location: loc.location || undefined })], effects: { notify: [] } };
}

// ---- issue reports (damaged / missing goods) ---------------------------------------------------------
function planIssueReport(shipment, actor, input, { now = new Date(), rules = loadRules(), photoCount = 0 } = {}) {
  if (!actor.roles.length) return refuse(404, 'not_found', 'Shipment not found');
  if (!ISSUE_KINDS.includes(input.kind)) return refuse(400, 'invalid_kind', `kind must be one of: ${ISSUE_KINDS.join(', ')}`);
  const description = sanitizeText(input.description, 500);
  if (description.length < 5) return refuse(400, 'description_required', 'Please describe what is wrong (at least a few words)');
  let affected = null;
  if (input.affectedQuantityKg !== undefined && input.affectedQuantityKg !== null && input.affectedQuantityKg !== '') {
    affected = Number(input.affectedQuantityKg);
    const max = Number(shipment.quantityDispatchedKg) * 1.5;
    if (!Number.isFinite(affected) || affected < 0 || affected > max) return refuse(400, 'invalid_quantity', 'affectedQuantityKg must be a sensible number of kilograms');
  }
  const isAdmin = actor.roles.includes('admin');
  if (shipment.deliveredAt && !isAdmin && !withinDamageWindow(shipment, now, rules.damage.reportWindowHours)) {
    return refuse(409, 'damage_window_closed', `Damage can be reported within ${rules.damage.reportWindowHours} hours of delivery. Please contact support.`);
  }

  const primaryRole = ['admin', 'buyer', 'carrier', 'farmer'].find((r) => actor.roles.includes(r));
  const who = { ...actor, primaryRole };
  const eventId = newEventId();
  const event = eventBase('damage_reported', who, shipment, now, {
    status: shipment.status, note: description, data: { kind: input.kind, affectedQuantityKg: affected },
  });
  event._id = eventId;

  // The status moves to "Damage Reported" only where the lifecycle allows this person to do it.
  const set = { lastEventAt: now };
  const events = [event];
  const move = !INCIDENT.has(shipment.status) && validateTransition(shipment, STATUS.DAMAGE_REPORTED, actor.roles);
  if (move && move.ok) {
    set.status = STATUS.DAMAGE_REPORTED;
    set.statusUpdatedAt = now;
    set.statusBeforeIncident = shipment.status;
    events.push(eventBase('status_change', who, shipment, now, { fromStatus: shipment.status, status: STATUS.DAMAGE_REPORTED, note: null }));
  }

  const findings = evaluateDamage(
    { kind: input.kind === 'quantity' ? 'missing' : input.kind, affectedQuantityKg: affected, description, eventId, reporterRole: roleLabel(primaryRole, shipment) },
    { dispatchedKg: Number(shipment.quantityDispatchedKg), photoCount }, rules,
  );
  return {
    ok: true, set, events, findings, eventId,
    effects: { notify: notifications(shipment, STATUS.DAMAGE_REPORTED, description, who).map((n) => ({ ...n, message: `Shipment ${shipment.shipmentCode}: ${roleLabel(primaryRole, shipment)} reported a problem. ${description}` })) },
  };
}

// ---- receipt: after the buyer's code was accepted ------------------------------------------------------
// input: { receivedQuantityKg, condition, damagedQuantityKg, note }
function validateReceiptInput(shipment, input) {
  const received = Number(input.receivedQuantityKg);
  const dispatched = Number(shipment.quantityDispatchedKg);
  if (input.receivedQuantityKg === undefined || input.receivedQuantityKg === null || input.receivedQuantityKg === '' || !Number.isFinite(received) || received < 0 || received > dispatched * 2) {
    return refuse(400, 'invalid_quantity', 'Enter the quantity you actually received, in kilograms (use 0 if nothing arrived)');
  }
  const condition = input.condition === undefined ? 'ok' : input.condition;
  if (!CONDITIONS.includes(condition)) return refuse(400, 'invalid_condition', `condition must be one of: ${CONDITIONS.join(', ')}`);
  let damaged = null;
  if (input.damagedQuantityKg !== undefined && input.damagedQuantityKg !== null && input.damagedQuantityKg !== '') {
    damaged = Number(input.damagedQuantityKg);
    if (!Number.isFinite(damaged) || damaged < 0 || damaged > Math.max(received, dispatched)) return refuse(400, 'invalid_quantity', 'damagedQuantityKg must be a sensible number of kilograms');
  }
  const note = sanitizeText(input.note, 500);
  if (condition !== 'ok' && note.length < 5) return refuse(400, 'description_required', 'Please describe the damage or what is missing');
  return { ok: true, received: Math.round(received * 1000) / 1000, condition, damaged, note };
}

function planReceipt(shipment, actor, parsed, { now = new Date(), rules = loadRules(), photoCount = 0 } = {}) {
  const who = { ...actor, primaryRole: 'buyer' };
  const set = {
    status: STATUS.DELIVERED, statusUpdatedAt: now, lastEventAt: now, deliveredAt: now,
    'delivery.otpHash': null, 'delivery.otpExpiresAt': null, 'delivery.attempts': 0,
    'delivery.confirmedAt': now, 'delivery.receivedQuantityKg': parsed.received, 'delivery.condition': parsed.condition,
  };
  const events = [
    eventBase('receipt_confirmed', who, shipment, now, {
      status: STATUS.DELIVERED, note: parsed.note || null,
      data: { receivedQuantityKg: parsed.received, dispatchedQuantityKg: shipment.quantityDispatchedKg, condition: parsed.condition },
    }),
    eventBase('status_change', who, shipment, now, { fromStatus: shipment.status, status: STATUS.DELIVERED, note: null }),
  ];

  const findings = [...evaluateQuantity(Number(shipment.quantityDispatchedKg), parsed.received, rules)];
  if (parsed.condition !== 'ok') {
    const damageEvent = eventBase('damage_reported', who, shipment, now, { status: STATUS.DELIVERED, note: parsed.note, data: { kind: parsed.condition === 'missing_items' ? 'missing' : 'damage', affectedQuantityKg: parsed.damaged } });
    events.push(damageEvent);
    events.push(eventBase('status_change', who, shipment, now, { fromStatus: STATUS.DELIVERED, status: STATUS.DAMAGE_REPORTED, note: null }));
    set.status = STATUS.DAMAGE_REPORTED;
    set.statusBeforeIncident = STATUS.DELIVERED;
    findings.push(...evaluateDamage(
      { kind: parsed.condition === 'missing_items' ? 'missing' : 'damage', affectedQuantityKg: parsed.damaged, description: parsed.note, eventId: damageEvent._id, reporterRole: 'buyer' },
      { dispatchedKg: Number(shipment.quantityDispatchedKg), photoCount }, rules,
    ));
  }
  return {
    ok: true, set, events, findings,
    // payout is held while any quantity or damage question is open
    blocking: findings.length > 0,
    effects: {
      notify: [{ userIds: [shipment.farmerId, shipment.transporterId].filter(Boolean).map(String), type: 'shipment', message: findings.length
        ? `Shipment ${shipment.shipmentCode} was received, but the buyer reported a problem. Payout is on hold until it is resolved.`
        : `Shipment ${shipment.shipmentCode} was delivered and confirmed by the buyer.` }],
    },
  };
}

module.exports = {
  planStatusChange, planCheckpoint, planIssueReport, validateReceiptInput, planReceipt,
  roleLabel, newEventId, DEFAULT_TRANSIT_HOURS, MAX_ETA_DAYS, ISSUE_KINDS, CONDITIONS,
};
