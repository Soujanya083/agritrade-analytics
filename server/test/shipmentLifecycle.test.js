const {
  STATUS, ALL_STATUSES, TRANSITIONS, validateTransition, allowedNextStatuses, withinDamageWindow, statusLabel,
} = require('../lib/shipmentLifecycle');

const ship = (status, extra = {}) => ({ status, ...extra });

describe('the ten statuses', () => {
  test('all requested statuses exist with readable labels', () => {
    expect(ALL_STATUSES).toHaveLength(10);
    expect(statusLabel('ready_for_pickup')).toBe('Ready for Pickup');
    expect(statusLabel('under_investigation')).toBe('Under Investigation');
    expect(statusLabel('delivery_failed')).toBe('Delivery Failed');
  });
  test('every status mentioned in the table is a real status', () => {
    Object.entries(TRANSITIONS).forEach(([from, row]) => {
      expect(ALL_STATUSES).toContain(from);
      Object.keys(row).forEach((to) => expect(ALL_STATUSES).toContain(to));
    });
  });
});

describe('validateTransition', () => {
  test('the normal journey is allowed step by step, by the right people', () => {
    expect(validateTransition(ship('created'), 'ready_for_pickup', ['farmer']).ok).toBe(true);
    expect(validateTransition(ship('ready_for_pickup'), 'picked_up', ['carrier']).ok).toBe(true);
    expect(validateTransition(ship('picked_up'), 'in_transit', ['carrier']).ok).toBe(true);
    expect(validateTransition(ship('in_transit'), 'out_for_delivery', ['carrier']).ok).toBe(true);
    expect(validateTransition(ship('out_for_delivery'), 'delivery_failed', ['carrier']).ok).toBe(true);
  });
  test('steps cannot be skipped', () => {
    for (const [from, to] of [['created', 'picked_up'], ['created', 'in_transit'], ['ready_for_pickup', 'out_for_delivery'], ['picked_up', 'out_for_delivery'], ['in_transit', 'picked_up']]) {
      const r = validateTransition(ship(from), to, ['admin']);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('invalid_transition');
    }
  });
  test('a no-op update is refused', () => {
    expect(validateTransition(ship('in_transit'), 'in_transit', ['carrier']).code).toBe('same_status');
  });
  test('an unknown status is refused', () => {
    expect(validateTransition(ship('created'), 'teleported', ['admin']).code).toBe('unknown_status');
  });
  test('the wrong role is refused even for a legal step', () => {
    expect(validateTransition(ship('created'), 'ready_for_pickup', ['buyer']).code).toBe('not_permitted');
    expect(validateTransition(ship('ready_for_pickup'), 'picked_up', ['buyer']).code).toBe('not_permitted');
    expect(validateTransition(ship('ready_for_pickup'), 'picked_up', ['farmer']).code).toBe('not_permitted'); // only the carrier collects
    expect(validateTransition(ship('in_transit'), 'out_for_delivery', ['buyer']).code).toBe('not_permitted');
  });
  test('Delivered can NEVER be set by a plain status update: it needs the buyer\'s one-time code', () => {
    for (const roles of [['carrier'], ['farmer'], ['buyer'], ['admin']]) {
      const r = validateTransition(ship('out_for_delivery'), 'delivered', roles);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('requires_otp');
    }
  });
  test('...but the confirmation flow itself (system) may move it to Delivered', () => {
    expect(validateTransition(ship('out_for_delivery'), 'delivered', ['buyer'], { allowSystem: true }).ok).toBe(true);
  });
  test('cannot be delivered from any other status', () => {
    for (const from of ['created', 'ready_for_pickup', 'picked_up', 'in_transit', 'delayed', 'delivery_failed']) {
      expect(validateTransition(ship(from), 'delivered', ['admin'], { allowSystem: true }).ok).toBe(false);
    }
  });
  test('only the buyer or an admin can report damage after delivery', () => {
    const delivered = ship('delivered', { deliveredAt: new Date() });
    expect(validateTransition(delivered, 'damage_reported', ['buyer']).ok).toBe(true);
    expect(validateTransition(delivered, 'damage_reported', ['farmer']).code).toBe('not_permitted');
    expect(validateTransition(delivered, 'damage_reported', ['carrier']).code).toBe('not_permitted');
  });
  test('after delivery the shipment cannot go back on the road', () => {
    const delivered = ship('damage_reported', { deliveredAt: new Date() });
    for (const to of ['in_transit', 'out_for_delivery', 'delayed']) {
      expect(validateTransition(delivered, to, ['carrier', 'admin']).ok).toBe(false);
    }
    expect(validateTransition(delivered, 'under_investigation', ['buyer']).ok).toBe(true);
  });
  test('damage during transit can be reported and the shipment can then continue', () => {
    expect(validateTransition(ship('in_transit'), 'damage_reported', ['carrier']).ok).toBe(true);
    expect(validateTransition(ship('damage_reported'), 'in_transit', ['carrier']).ok).toBe(true);
  });
  test('only an admin can close an investigation as delivered', () => {
    expect(validateTransition(ship('under_investigation'), 'delivered', ['admin']).ok).toBe(true);
    expect(validateTransition(ship('under_investigation'), 'delivered', ['buyer']).code).toBe('not_permitted');
  });
  test('a failed delivery can be retried by the carrier or investigated by anyone involved', () => {
    expect(validateTransition(ship('delivery_failed'), 'out_for_delivery', ['carrier']).ok).toBe(true);
    expect(validateTransition(ship('delivery_failed'), 'under_investigation', ['buyer']).ok).toBe(true);
    expect(validateTransition(ship('delivery_failed'), 'in_transit', ['carrier']).ok).toBe(false);
  });
});

describe('allowedNextStatuses (drives the buttons on screen)', () => {
  test('a carrier on an in-transit shipment sees the carrier moves only', () => {
    expect(allowedNextStatuses(ship('in_transit'), ['carrier']).sort()).toEqual(['damage_reported', 'delayed', 'out_for_delivery']);
  });
  test('a buyer on an in-transit shipment can do nothing', () => {
    expect(allowedNextStatuses(ship('in_transit'), ['buyer'])).toEqual([]);
  });
  test('Delivered is never offered as a button', () => {
    expect(allowedNextStatuses(ship('out_for_delivery'), ['carrier', 'admin', 'buyer'])).not.toContain('delivered');
  });
  test('a farmer who is also the carrier gets both sets of moves', () => {
    expect(allowedNextStatuses(ship('created'), ['farmer', 'carrier'])).toEqual(['ready_for_pickup']);
    expect(allowedNextStatuses(ship('ready_for_pickup'), ['farmer', 'carrier']).sort()).toEqual(['delayed', 'picked_up']);
  });
});

describe('withinDamageWindow', () => {
  const t0 = new Date('2026-10-30T10:00:00Z');
  test('open for 48 hours after delivery, then closed', () => {
    expect(withinDamageWindow({ deliveredAt: t0 }, new Date('2026-11-01T09:00:00Z'), 48)).toBe(true);
    expect(withinDamageWindow({ deliveredAt: t0 }, new Date('2026-11-01T10:01:00Z'), 48)).toBe(false);
  });
  test('not yet delivered: always open', () => {
    expect(withinDamageWindow({}, new Date(), 48)).toBe(true);
  });
});
