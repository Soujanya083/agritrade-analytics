// shipmentUtils.js - pure helpers for the shipment screens (labels, links, permissions, formatting).

export const JOURNEY = ['created', 'ready_for_pickup', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];

export const STATUS_META = {
  created: { label: 'Created', tone: 'neutral' },
  ready_for_pickup: { label: 'Ready for Pickup', tone: 'info' },
  picked_up: { label: 'Picked Up', tone: 'info' },
  in_transit: { label: 'In Transit', tone: 'info' },
  delayed: { label: 'Delayed', tone: 'warn' },
  out_for_delivery: { label: 'Out for Delivery', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'good' },
  delivery_failed: { label: 'Delivery Failed', tone: 'bad' },
  damage_reported: { label: 'Damage Reported', tone: 'bad' },
  under_investigation: { label: 'Under Investigation', tone: 'warn' },
};
export const statusLabel = (s) => (STATUS_META[s] ? STATUS_META[s].label : String(s || ''));
export const statusTone = (s) => (STATUS_META[s] ? STATUS_META[s].tone : 'neutral');

// 0..1 along the normal journey (exceptions such as "Delayed" keep the last normal position they have)
export function journeyProgress(status, statusBeforeIncident) {
  const effective = JOURNEY.includes(status) ? status : (statusBeforeIncident || 'in_transit');
  const i = JOURNEY.indexOf(effective);
  return i < 0 ? 0 : i / (JOURNEY.length - 1);
}

// ---- links and scanned text --------------------------------------------------------------------
const CODE_RE = /SHP-\d{8}-[A-HJKMNP-Z2-9]{8}/i;
export const extractShipmentCode = (text) => {
  const m = CODE_RE.exec(String(text || ''));
  return m ? m[0].toUpperCase() : null;
};
export const buildShipmentHash = (code) => `#/shipment/${code}`;
// '#/shipment/SHP-...' -> { type: 'code', value }, '#/shipment-for/<transactionId>' -> { type: 'transaction', value }
export function parseShipmentHash(hash) {
  const text = String(hash || '');
  const forTx = /^#\/shipment-for\/([a-f0-9]{24})$/i.exec(text);
  if (forTx) return { type: 'transaction', value: forTx[1] };
  const code = /^#\/shipment\/(.+)$/i.exec(text);
  const found = code ? extractShipmentCode(decodeURIComponent(code[1])) : null;
  return found ? { type: 'code', value: found } : null;
}

// ---- who can do what with an alert (mirrors the server; the server enforces it) -------------------
const ALL = ['farmer', 'buyer', 'carrier', 'admin'];
const RESOLVERS = { delay: ['farmer', 'carrier', 'admin'], quantity_mismatch: ['buyer', 'admin'], damage_reported: ['buyer', 'admin'], verification_failed: ['farmer', 'carrier', 'admin'] };
export function alertActionsFor(alert, roles = []) {
  if (!alert || alert.status === 'resolved') return [];
  const actions = [];
  if (roles.some((r) => ALL.includes(r))) {
    if (alert.status === 'open') actions.push('acknowledge');
    actions.push('investigate');
  }
  if (roles.some((r) => (RESOLVERS[alert.type] || []).includes(r))) actions.push('resolve');
  return actions;
}
export const ALERT_TYPE_LABELS = { delay: 'Delay', quantity_mismatch: 'Quantity mismatch', damage_reported: 'Damage or missing goods', verification_failed: 'Delivery verification failed' };

// ---- time -----------------------------------------------------------------------------------------------
export function formatDateTime(value, locale = 'en-IN') {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function timeUntil(value, now = new Date()) {
  if (!value) return null;
  const minutes = Math.round((new Date(value).getTime() - now.getTime()) / 60000);
  const abs = Math.abs(minutes);
  const text = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`;
  return minutes >= 0 ? `in ${text}` : `${text} overdue`;
}

// ---- the timeline text ------------------------------------------------------------------------------------
export function describeEvent(e) {
  switch (e.type) {
    case 'created': return 'Shipment created';
    case 'status_change': return e.fromStatus ? `${statusLabel(e.fromStatus)} to ${statusLabel(e.status)}` : `Status: ${statusLabel(e.status)}`;
    case 'delivery_attempt': return `Delivery attempt ${e.data && e.data.attempt ? e.data.attempt : ''} failed`.replace('  ', ' ');
    case 'checkpoint': return 'Checkpoint';
    case 'carrier_assigned': return 'Carrier';
    case 'eta_changed': return 'Expected delivery time changed';
    case 'otp_issued': return 'Delivery code issued to the buyer';
    case 'otp_delivery_failed': return 'Delivery code could not be sent';
    case 'otp_failed': return 'Wrong delivery code entered';
    case 'receipt_confirmed': return `Receipt confirmed${e.data && e.data.receivedQuantityKg != null ? `: ${e.data.receivedQuantityKg} kg received` : ''}`;
    case 'damage_reported': return e.data && e.data.kind === 'missing' ? 'Missing goods reported' : 'Damage reported';
    case 'photo_added': return `Photo added (${(e.data && e.data.kind) || 'evidence'})`;
    case 'alert_raised': return `Alert raised${e.data && e.data.severity ? ` (${e.data.severity})` : ''}`;
    default: return e.type;
  }
}
export const requiresNote = (nextStatus) => Boolean(nextStatus && nextStatus.requiresNote);
export const isProductionBuild = () => process.env.NODE_ENV === 'production';
export const simulationOffered = () => !isProductionBuild() || process.env.REACT_APP_ALLOW_SIMULATED_TRACKING === 'true';

// ---- browser-only helpers (each returns a Promise and fails with a readable message) ----------------------
export function getDevicePosition({ timeoutMs = 15000, geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined } = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('This device or browser cannot share its location. Type the place instead.')); return; }
    geolocation.getCurrentPosition(
      (p) => resolve({ source: 'device_gps', lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, capturedAt: new Date(p.timestamp || Date.now()).toISOString() }),
      (err) => reject(new Error(err && err.code === 1 ? 'Location permission was denied. You can type the place instead.' : 'Could not get a GPS position. Move to open sky or type the place instead.')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

// Shrinks a phone photo so it fits the server's size limit. Returns a Blob (JPEG), or the original file if it is already small.
export async function compressImage(file, { maxSide = 1600, quality = 0.82, maxBytes = 1.8 * 1024 * 1024 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  if (file.size <= maxBytes && file.type === 'image/jpeg') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not prepare the photo.');
  return blob;
}
