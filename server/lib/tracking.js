// lib/tracking.js - location updates, and the honest label for where they came from.
//
// The server cannot prove that a GPS fix is real; it can refuse clearly impossible or stale data and, above
// all, never present a typed or simulated position as "live". Every update carries a source:
//   device_gps - the browser's Geolocation API on the carrier's phone, with the user's permission
//   manual     - the carrier typed where they are (a place name, optionally coordinates)
//   simulated  - demonstration only; refused in production unless TRACKING_ALLOW_SIMULATION=true

const SOURCES = Object.freeze(['device_gps', 'manual', 'simulated']);
const LABELS = Object.freeze({
  device_gps: 'Device GPS (reported by the carrier\'s phone)',
  manual: 'Manual update (typed by the carrier, not live)',
  simulated: 'SIMULATED location for demonstration - not a real position',
});
const MAX_ACCURACY_M = 2000;       // anything vaguer than 2 km is not a usable fix
const MAX_AGE_MS = 10 * 60 * 1000; // a GPS fix older than 10 minutes is stale
const CLOCK_SKEW_MS = 2 * 60 * 1000;
const STALE_LIVE_MS = 15 * 60 * 1000;

const inRange = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const cleanLabel = (text) => String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

function simulationAllowed(env = process.env) {
  if (String(env.TRACKING_ALLOW_SIMULATION || '').toLowerCase() === 'true') return true;
  return env.NODE_ENV !== 'production';
}

// -> { ok: true, location } | { ok: false, message }. A missing location is fine (location: null).
function validateLocation(input, { now = new Date(), env = process.env } = {}) {
  if (input === undefined || input === null) return { ok: true, location: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, message: 'location must be an object' };

  const source = input.source;
  if (!SOURCES.includes(source)) return { ok: false, message: `location.source must be one of: ${SOURCES.join(', ')}` };
  if (source === 'simulated' && !simulationAllowed(env)) return { ok: false, message: 'Simulated locations are disabled in production' };

  const hasCoords = input.lat !== undefined || input.lng !== undefined;
  const label = cleanLabel(input.label);
  const out = { source, label: label || null };

  if (hasCoords) {
    if (!inRange(input.lat, -90, 90) || !inRange(input.lng, -180, 180)) return { ok: false, message: 'lat/lng are not valid coordinates' };
    out.lat = Math.round(input.lat * 1e5) / 1e5; // ~1 m; no point storing more
    out.lng = Math.round(input.lng * 1e5) / 1e5;
  } else if (!label) {
    return { ok: false, message: 'Give a place name (label) or coordinates' };
  }

  if (source === 'device_gps') {
    if (!hasCoords) return { ok: false, message: 'device_gps needs coordinates from the phone' };
    if (!inRange(input.accuracyM, 0, MAX_ACCURACY_M)) return { ok: false, message: `GPS accuracy must be reported and at most ${MAX_ACCURACY_M} m` };
    const captured = new Date(input.capturedAt);
    if (Number.isNaN(captured.getTime())) return { ok: false, message: 'device_gps needs capturedAt (when the fix was taken)' };
    const age = now.getTime() - captured.getTime();
    if (age > MAX_AGE_MS) return { ok: false, message: 'That GPS fix is too old (over 10 minutes). Take a new one.' };
    if (age < -CLOCK_SKEW_MS) return { ok: false, message: 'The GPS timestamp is in the future' };
    out.accuracyM = Math.round(input.accuracyM);
    out.capturedAt = captured;
  }
  return { ok: true, location: out };
}

// How the tracking panel should describe the current position.
function describeTracking(lastLocation, now = new Date()) {
  if (!lastLocation) return { mode: 'none', label: 'No location has been recorded yet. Status updates are entered by hand.', live: false };
  const at = lastLocation.capturedAt || lastLocation.recordedAt;
  const ageMs = at ? now.getTime() - new Date(at).getTime() : null;
  const live = lastLocation.source === 'device_gps' && ageMs !== null && ageMs <= STALE_LIVE_MS;
  let label = LABELS[lastLocation.source] || 'Unknown source';
  if (lastLocation.source === 'device_gps' && !live) label = 'Last GPS position (older than 15 minutes, not live)';
  return { mode: lastLocation.source, label, live, ageMinutes: ageMs === null ? null : Math.max(0, Math.round(ageMs / 60000)) };
}

module.exports = { SOURCES, LABELS, MAX_ACCURACY_M, MAX_AGE_MS, validateLocation, describeTracking, simulationAllowed, cleanLabel };
