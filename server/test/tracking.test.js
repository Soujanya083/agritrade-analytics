const { validateLocation, describeTracking, simulationAllowed } = require('../lib/tracking');

const NOW = new Date('2026-10-30T10:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const prod = { NODE_ENV: 'production' };
const dev = { NODE_ENV: 'development' };

describe('validateLocation', () => {
  test('no location is fine', () => {
    expect(validateLocation(undefined, { now: NOW, env: dev })).toEqual({ ok: true, location: null });
  });
  test('a fresh device GPS fix is accepted and rounded', () => {
    const r = validateLocation({ source: 'device_gps', lat: 12.971598, lng: 77.594566, accuracyM: 12.4, capturedAt: ago(30000) }, { now: NOW, env: prod });
    expect(r.ok).toBe(true);
    expect(r.location.lat).toBe(12.9716);
    expect(r.location.accuracyM).toBe(12);
  });
  test('a stale GPS fix is refused (it would be shown as "live")', () => {
    const r = validateLocation({ source: 'device_gps', lat: 12, lng: 77, accuracyM: 10, capturedAt: ago(11 * 60000) }, { now: NOW, env: prod });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too old/);
  });
  test('a GPS fix from the future is refused', () => {
    expect(validateLocation({ source: 'device_gps', lat: 12, lng: 77, accuracyM: 10, capturedAt: ago(-10 * 60000) }, { now: NOW, env: prod }).ok).toBe(false);
  });
  test('a very vague fix is refused', () => {
    expect(validateLocation({ source: 'device_gps', lat: 12, lng: 77, accuracyM: 5000, capturedAt: ago(1000) }, { now: NOW, env: prod }).ok).toBe(false);
    expect(validateLocation({ source: 'device_gps', lat: 12, lng: 77, capturedAt: ago(1000) }, { now: NOW, env: prod }).ok).toBe(false);
  });
  test('GPS needs coordinates and a capture time', () => {
    expect(validateLocation({ source: 'device_gps', label: 'near Hubli', accuracyM: 5, capturedAt: ago(1) }, { now: NOW, env: prod }).ok).toBe(false);
    expect(validateLocation({ source: 'device_gps', lat: 12, lng: 77, accuracyM: 5 }, { now: NOW, env: prod }).ok).toBe(false);
  });
  test('impossible coordinates are refused', () => {
    for (const [lat, lng] of [[91, 0], [-91, 0], [0, 181], [0, -181], ['12', '77'], [NaN, 5]]) {
      expect(validateLocation({ source: 'manual', lat, lng, label: 'x' }, { now: NOW, env: prod }).ok).toBe(false);
    }
  });
  test('manual updates need only a place name, and are labelled manual', () => {
    const r = validateLocation({ source: 'manual', label: '  Tumkur   toll plaza ' }, { now: NOW, env: prod });
    expect(r.ok).toBe(true);
    expect(r.location.label).toBe('Tumkur toll plaza');
    expect(r.location.source).toBe('manual');
    expect(validateLocation({ source: 'manual' }, { now: NOW, env: prod }).ok).toBe(false);
  });
  test('an unknown source is refused', () => {
    expect(validateLocation({ source: 'satellite', label: 'x' }, { now: NOW, env: prod }).ok).toBe(false);
  });
  test('simulated positions are blocked in production unless explicitly allowed', () => {
    expect(validateLocation({ source: 'simulated', lat: 12, lng: 77 }, { now: NOW, env: prod }).ok).toBe(false);
    expect(validateLocation({ source: 'simulated', lat: 12, lng: 77 }, { now: NOW, env: { ...prod, TRACKING_ALLOW_SIMULATION: 'true' } }).ok).toBe(true);
    expect(validateLocation({ source: 'simulated', lat: 12, lng: 77 }, { now: NOW, env: dev }).ok).toBe(true);
    expect(simulationAllowed(prod)).toBe(false);
  });
  test('rejects non-object input', () => {
    expect(validateLocation('Bengaluru', { now: NOW, env: dev }).ok).toBe(false);
    expect(validateLocation([1, 2], { now: NOW, env: dev }).ok).toBe(false);
  });
});

describe('describeTracking never pretends', () => {
  test('nothing recorded: says so', () => {
    const d = describeTracking(null, NOW);
    expect(d.live).toBe(false);
    expect(d.label).toMatch(/entered by hand/);
  });
  test('fresh device GPS is "live"', () => {
    const d = describeTracking({ source: 'device_gps', capturedAt: new Date(NOW.getTime() - 120000) }, NOW);
    expect(d.live).toBe(true);
    expect(d.label).toMatch(/Device GPS/);
  });
  test('an old GPS fix is explicitly NOT live', () => {
    const d = describeTracking({ source: 'device_gps', capturedAt: new Date(NOW.getTime() - 3600000) }, NOW);
    expect(d.live).toBe(false);
    expect(d.label).toMatch(/not live/);
  });
  test('manual and simulated are never live, and are labelled as such', () => {
    expect(describeTracking({ source: 'manual', recordedAt: NOW }, NOW)).toMatchObject({ live: false });
    expect(describeTracking({ source: 'manual', recordedAt: NOW }, NOW).label).toMatch(/not live/);
    const sim = describeTracking({ source: 'simulated', recordedAt: NOW }, NOW);
    expect(sim.live).toBe(false);
    expect(sim.label).toMatch(/SIMULATED/);
  });
});
