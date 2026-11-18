// lib/shipmentAccess.js - who is allowed to see or change what on a shipment (pure functions).
const { statusLabel } = require('./shipmentLifecycle');

const idOf = (value) => (value && value._id ? String(value._id) : value ? String(value) : '');

// SHIPMENT_ADMIN_EMAILS="ops@example.com, lead@example.com": people who may resolve disputes.
function isShipmentAdmin(email, env = process.env) {
  const list = String(env.SHIPMENT_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && list.includes(String(email).trim().toLowerCase());
}

// Roles this user holds ON THIS SHIPMENT. An empty list means "not a participant": no access at all.
// When no transporter is assigned the farmer is also the carrier (delivering themselves).
function actorRoles(user, shipment, { admin = false } = {}) {
  const roles = [];
  const uid = idOf(user && (user.id || user._id));
  if (!uid) return roles;
  if (uid === idOf(shipment.farmerId)) roles.push('farmer');
  if (uid === idOf(shipment.buyerId)) roles.push('buyer');
  if (shipment.transporterId && uid === idOf(shipment.transporterId)) roles.push('carrier');
  if (!shipment.transporterId && uid === idOf(shipment.farmerId)) roles.push('carrier');
  if (admin) roles.push('admin');
  return roles;
}

const accountRoleOf = (roles, accountRole) => (roles.includes('admin') ? 'admin' : String(accountRole || '').toLowerCase() || 'unknown');

// What the screen may offer this user (the server still re-checks on every action).
function capabilities(shipment, roles) {
  const has = (r) => roles.includes(r);
  const open = shipment.status !== 'delivered';
  return {
    canViewPrivateDetails: roles.length > 0,
    canAssignCarrier: (has('farmer') || has('admin')) && !['delivered', 'delivery_failed'].includes(shipment.status) && !shipment.deliveredAt,
    canRecordCheckpoint: (has('carrier') || has('admin')) && ['picked_up', 'in_transit', 'delayed', 'out_for_delivery'].includes(shipment.status),
    canConfirmDelivery: has('buyer') && shipment.status === 'out_for_delivery',
    canRequestDeliveryCode: has('buyer') && shipment.status === 'out_for_delivery',
    canReportIssue: roles.length > 0 && (open || has('buyer') || has('admin')),
    canUploadPhoto: roles.length > 0,
    canActOnAlerts: roles.length > 0,
  };
}

// Minimal "who is this" for another participant: a name, never contact details or password data.
const displayName = (user) => (user && user.fullName ? String(user.fullName) : 'Unknown');

module.exports = { isShipmentAdmin, actorRoles, capabilities, accountRoleOf, displayName, idOf, statusLabel };
