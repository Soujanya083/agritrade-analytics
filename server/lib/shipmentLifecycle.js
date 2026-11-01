// lib/shipmentLifecycle.js - the shipment status machine (pure: no database, no Express).
//
// Every status change goes through validateTransition(), so an invalid update is refused in one place
// no matter which endpoint asked for it. "Who may do it" is part of the table, not scattered checks.
//
// Actor roles on a shipment: farmer, buyer, carrier (the assigned transporter - or the farmer when
// they deliver themselves), admin (see SHIPMENT_ADMIN_EMAILS) and system (automatic steps).

const STATUS = Object.freeze({
  CREATED: 'created',
  READY_FOR_PICKUP: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  DELAYED: 'delayed',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  DELIVERY_FAILED: 'delivery_failed',
  DAMAGE_REPORTED: 'damage_reported',
  UNDER_INVESTIGATION: 'under_investigation',
});

const STATUS_LABELS = Object.freeze({
  created: 'Created',
  ready_for_pickup: 'Ready for Pickup',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delayed: 'Delayed',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery Failed',
  damage_reported: 'Damage Reported',
  under_investigation: 'Under Investigation',
});

const ALL_STATUSES = Object.freeze(Object.values(STATUS));
const PARTICIPANTS = ['farmer', 'buyer', 'carrier', 'admin'];

// from -> to -> roles allowed to make that change
const TRANSITIONS = Object.freeze({
  created: { ready_for_pickup: ['farmer', 'admin'] },
  ready_for_pickup: { picked_up: ['carrier', 'admin'], delayed: ['carrier', 'farmer', 'admin'] },
  picked_up: { in_transit: ['carrier', 'admin'], delayed: ['carrier', 'admin'], damage_reported: ['carrier', 'farmer', 'admin'] },
  in_transit: {
    delayed: ['carrier', 'admin'],
    out_for_delivery: ['carrier', 'admin'],
    damage_reported: ['carrier', 'farmer', 'admin'],
  },
  delayed: {
    picked_up: ['carrier', 'admin'],
    in_transit: ['carrier', 'admin'],
    out_for_delivery: ['carrier', 'admin'],
    damage_reported: ['carrier', 'farmer', 'admin'],
  },
  out_for_delivery: {
    delivered: ['system'], // only through the buyer's one-time code, never by a plain status update
    delivery_failed: ['carrier', 'admin'],
    delayed: ['carrier', 'admin'],
    damage_reported: ['carrier', 'buyer', 'admin'],
  },
  delivery_failed: {
    out_for_delivery: ['carrier', 'admin'],
    under_investigation: ['farmer', 'buyer', 'carrier', 'admin'],
  },
  delivered: {
    damage_reported: ['buyer', 'admin'],
    under_investigation: ['farmer', 'buyer', 'admin'],
  },
  damage_reported: {
    under_investigation: PARTICIPANTS,
    in_transit: ['carrier', 'admin'],
    out_for_delivery: ['carrier', 'admin'],
    delayed: ['carrier', 'admin'],
  },
  under_investigation: {
    delivered: ['admin'],              // the investigation concluded that the goods did arrive
    in_transit: ['carrier', 'admin'],
    out_for_delivery: ['carrier', 'admin'],
    delivery_failed: ['admin'],
  },
});

// After delivery the shipment can never go "back on the road".
const RESUME_STATUSES = new Set(['picked_up', 'in_transit', 'out_for_delivery', 'delayed']);

const isStatus = (value) => ALL_STATUSES.includes(value);
const statusLabel = (status) => STATUS_LABELS[status] || status;

function rolesAllowed(shipment, to) {
  const row = TRANSITIONS[shipment.status] || {};
  return row[to] || null;
}

// { ok: true } or { ok: false, code, message }
function validateTransition(shipment, to, actorRoles = [], { allowSystem = false } = {}) {
  if (!isStatus(to)) return { ok: false, code: 'unknown_status', message: `Unknown status "${to}"` };
  if (to === shipment.status) return { ok: false, code: 'same_status', message: `The shipment is already "${statusLabel(to)}"` };

  const allowed = rolesAllowed(shipment, to);
  if (!allowed) {
    return { ok: false, code: 'invalid_transition', message: `A shipment that is "${statusLabel(shipment.status)}" cannot move to "${statusLabel(to)}"` };
  }
  if (shipment.deliveredAt && RESUME_STATUSES.has(to)) {
    return { ok: false, code: 'invalid_transition', message: 'A delivered shipment cannot go back in transit' };
  }
  if (to === STATUS.DELIVERED && shipment.status === STATUS.OUT_FOR_DELIVERY && !allowSystem) {
    return { ok: false, code: 'requires_otp', message: 'Delivery is confirmed by the buyer with the one-time delivery code, not by a status update' };
  }
  const roles = allowSystem ? [...actorRoles, 'system'] : actorRoles;
  if (!roles.some((r) => allowed.includes(r))) {
    return { ok: false, code: 'not_permitted', message: `Your role cannot change a shipment from "${statusLabel(shipment.status)}" to "${statusLabel(to)}"` };
  }
  return { ok: true };
}

// Statuses the given roles could move this shipment to right now (used to build the UI's buttons).
function allowedNextStatuses(shipment, actorRoles = []) {
  const row = TRANSITIONS[shipment.status] || {};
  return Object.keys(row).filter((to) => to !== STATUS.DELIVERED && validateTransition(shipment, to, actorRoles).ok);
}

// A buyer can report damage on a delivered shipment only for a limited time (configurable).
function withinDamageWindow(shipment, now = new Date(), windowHours = 48) {
  if (!shipment.deliveredAt) return true;
  return now.getTime() - new Date(shipment.deliveredAt).getTime() <= windowHours * 3600 * 1000;
}

const TERMINAL_FOR_ALERTS = new Set(['delivered']);

module.exports = {
  STATUS, STATUS_LABELS, ALL_STATUSES, TRANSITIONS, PARTICIPANTS, TERMINAL_FOR_ALERTS,
  isStatus, statusLabel, validateTransition, allowedNextStatuses, withinDamageWindow,
};
