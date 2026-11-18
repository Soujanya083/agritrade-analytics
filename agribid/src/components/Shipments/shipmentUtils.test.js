import {
  extractShipmentCode, parseShipmentHash, buildShipmentHash, alertActionsFor, journeyProgress, statusLabel, statusTone,
  describeEvent, timeUntil, formatDateTime, getDevicePosition,
} from './shipmentUtils';

describe('shipment links and scanned text', () => {
  test('a code is found inside a scanned link or plain text', () => {
    expect(extractShipmentCode('https://app.example.com/#/shipment/SHP-20261030-ABCDEFGH')).toBe('SHP-20261030-ABCDEFGH');
    expect(extractShipmentCode('  shp-20261030-abcdefgh please ')).toBe('SHP-20261030-ABCDEFGH');
    expect(extractShipmentCode('SHP-20261030-ABCDEFG0')).toBeNull();   // 0 is not in the alphabet
    expect(extractShipmentCode('hello')).toBeNull();
    expect(extractShipmentCode(null)).toBeNull();
  });
  test('the hash round-trips', () => {
    expect(buildShipmentHash('SHP-20261030-ABCDEFGH')).toBe('#/shipment/SHP-20261030-ABCDEFGH');
    expect(parseShipmentHash('#/shipment/SHP-20261030-ABCDEFGH')).toEqual({ type: 'code', value: 'SHP-20261030-ABCDEFGH' });
  });
  test('a link for a transaction (older deals) is understood', () => {
    expect(parseShipmentHash('#/shipment-for/507f1f77bcf86cd799439011')).toEqual({ type: 'transaction', value: '507f1f77bcf86cd799439011' });
  });
  test('anything else is ignored', () => {
    for (const bad of ['', '#', '#/shipment/', '#/shipment/not-a-code', '#/other/SHP-20261030-ABCDEFGH', '#/shipment-for/zzz', undefined]) expect(parseShipmentHash(bad)).toBeNull();
  });
});

describe('alert permissions on screen', () => {
  const alert = (type, status = 'open') => ({ type, status });
  test('everyone on the shipment can acknowledge and investigate; resolved alerts have no actions', () => {
    expect(alertActionsFor(alert('delay'), ['buyer'])).toEqual(['acknowledge', 'investigate']);
    expect(alertActionsFor(alert('delay', 'acknowledged'), ['buyer'])).toEqual(['investigate']);
    expect(alertActionsFor(alert('delay', 'resolved'), ['admin'])).toEqual([]);
  });
  test('resolving is limited to the roles the server allows', () => {
    expect(alertActionsFor(alert('damage_reported'), ['buyer'])).toContain('resolve');
    expect(alertActionsFor(alert('damage_reported'), ['farmer'])).not.toContain('resolve');
    expect(alertActionsFor(alert('delay'), ['carrier'])).toContain('resolve');
    expect(alertActionsFor(alert('delay'), ['buyer'])).not.toContain('resolve');
    expect(alertActionsFor(alert('quantity_mismatch'), ['farmer', 'carrier'])).not.toContain('resolve');
  });
  test('a stranger gets nothing', () => {
    expect(alertActionsFor(alert('delay'), [])).toEqual([]);
  });
});

describe('labels and progress', () => {
  test('all ten statuses have a label and a tone', () => {
    for (const s of ['created', 'ready_for_pickup', 'picked_up', 'in_transit', 'delayed', 'out_for_delivery', 'delivered', 'delivery_failed', 'damage_reported', 'under_investigation']) {
      expect(statusLabel(s)).not.toBe(s);
      expect(['neutral', 'info', 'good', 'warn', 'bad']).toContain(statusTone(s));
    }
  });
  test('progress along the normal journey; exceptions keep their last position', () => {
    expect(journeyProgress('created')).toBe(0);
    expect(journeyProgress('delivered')).toBe(1);
    expect(journeyProgress('delayed', 'in_transit')).toBeCloseTo(0.6);
    expect(journeyProgress('damage_reported', 'delivered')).toBe(1);
  });
});

describe('times and the timeline', () => {
  const now = new Date('2026-10-30T10:00:00Z');
  test('time until / overdue', () => {
    expect(timeUntil('2026-10-30T12:00:00Z', now)).toBe('in 2 h');
    expect(timeUntil('2026-10-30T09:15:00Z', now)).toBe('45 min overdue');
    expect(timeUntil('2026-11-05T10:00:00Z', now)).toBe('in 6 days');
    expect(timeUntil(null, now)).toBeNull();
  });
  test('bad dates do not crash the screen', () => {
    expect(formatDateTime('not a date')).toBe('-');
    expect(formatDateTime(null)).toBe('-');
  });
  test('events read as plain sentences', () => {
    expect(describeEvent({ type: 'status_change', fromStatus: 'in_transit', status: 'out_for_delivery' })).toBe('In Transit to Out for Delivery');
    expect(describeEvent({ type: 'receipt_confirmed', data: { receivedQuantityKg: 90 } })).toBe('Receipt confirmed: 90 kg received');
    expect(describeEvent({ type: 'otp_failed' })).toBe('Wrong delivery code entered');
    expect(describeEvent({ type: 'delivery_attempt', data: { attempt: 2 } })).toBe('Delivery attempt 2 failed');
    expect(describeEvent({ type: 'something_new' })).toBe('something_new');
  });
});

describe('device position', () => {
  const fake = (result) => ({ getCurrentPosition: (ok, err) => (result.error ? err(result.error) : ok(result.position)) });
  test('a fix becomes a device_gps location with accuracy and capture time', async () => {
    const pos = await getDevicePosition({ geolocation: fake({ position: { coords: { latitude: 12.97, longitude: 77.59, accuracy: 14 }, timestamp: Date.UTC(2026, 9, 30, 10) } }) });
    expect(pos).toEqual({ source: 'device_gps', lat: 12.97, lng: 77.59, accuracyM: 14, capturedAt: '2026-10-30T10:00:00.000Z' });
  });
  test('a denied permission gives a friendly message and the manual fallback', async () => {
    await expect(getDevicePosition({ geolocation: fake({ error: { code: 1 } }) })).rejects.toMatchObject({ message: expect.stringMatching(/permission was denied/) });
  });
  test('a device without GPS says so', async () => {
    await expect(getDevicePosition({ geolocation: undefined })).rejects.toMatchObject({ message: expect.stringMatching(/cannot share its location/) });
  });
});
