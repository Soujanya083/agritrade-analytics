const {
  planStatusChange, planCheckpoint, planIssueReport, validateReceiptInput, planReceipt, DEFAULT_TRANSIT_HOURS,
} = require('../lib/shipmentEngine');
const { loadRules } = require('../lib/shipmentRules');

const NOW = new Date('2026-10-30T08:00:00Z');
const hours = (h) => new Date(NOW.getTime() + h * 3600000);
const rules = loadRules({});
const dev = { NODE_ENV: 'development' };

const base = (extra = {}) => ({
  shipmentCode: 'SHP-20261030-ABCDEFGH', status: 'created', farmerId: 'F1', buyerId: 'B1', transporterId: null,
  quantityDispatchedKg: 100, expectedDeliveryAt: null, ...extra,
});
const farmer = { id: 'F1', name: 'Asha', roles: ['farmer', 'carrier'] };
const buyer = { id: 'B1', name: 'Ravi', roles: ['buyer'] };
const transporter = { id: 'T1', name: 'Kiran', roles: ['carrier'] };
const admin = { id: 'A1', name: 'Ops', roles: ['admin'] };
const opts = { now: NOW, env: dev, transactionStatus: 'payment_confirmed' };

describe('releasing a shipment for pickup', () => {
  test('needs confirmed payment', () => {
    const r = planStatusChange(base(), farmer, { to: 'ready_for_pickup' }, { ...opts, transactionStatus: 'awaiting_payment' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('payment_required');
  });
  test('sets the pickup time, a default delivery estimate of 48 hours, and asks the transaction to sync', () => {
    const r = planStatusChange(base(), farmer, { to: 'ready_for_pickup' }, opts);
    expect(r.ok).toBe(true);
    expect(r.set.status).toBe('ready_for_pickup');
    expect(r.set.readyAt).toEqual(NOW);
    expect(r.set.expectedDeliveryAt).toEqual(hours(DEFAULT_TRANSIT_HOURS));
    expect(r.effects.syncTransaction).toBe('dispatched');
    expect(r.events[0]).toMatchObject({ type: 'status_change', fromStatus: 'created', status: 'ready_for_pickup', byRole: 'farmer' });
  });
  test('a custom estimate must be in the future and within 30 days', () => {
    expect(planStatusChange(base(), farmer, { to: 'ready_for_pickup', expectedDeliveryAt: hours(-1) }, opts).code).toBe('invalid_eta');
    expect(planStatusChange(base(), farmer, { to: 'ready_for_pickup', expectedDeliveryAt: hours(24 * 31) }, opts).code).toBe('invalid_eta');
    expect(planStatusChange(base(), farmer, { to: 'ready_for_pickup', expectedDeliveryAt: 'tomorrow-ish' }, opts).code).toBe('invalid_eta');
    expect(planStatusChange(base(), farmer, { to: 'ready_for_pickup', expectedDeliveryAt: hours(30) }, opts).set.expectedDeliveryAt).toEqual(hours(30));
  });
  test('the buyer cannot release the shipment', () => {
    const r = planStatusChange(base(), buyer, { to: 'ready_for_pickup' }, opts);
    expect(r.status).toBe(403);
  });
});

describe('moving along the journey', () => {
  const ready = base({ status: 'ready_for_pickup', readyAt: NOW, expectedDeliveryAt: hours(48) });
  test('pickup is recorded by the carrier with a timestamp and the actor\'s identity', () => {
    const r = planStatusChange(ready, transporter, { to: 'picked_up' }, opts);
    expect(r.ok).toBe(true);
    expect(r.set.pickedUpAt).toEqual(NOW);
    expect(r.events[0]).toMatchObject({ byUserId: 'T1', byName: 'Kiran', byRole: 'farmer (delivering)' }); // no transporter assigned on this fixture
  });
  test('with a transporter assigned the event says "transporter"', () => {
    const r = planStatusChange({ ...ready, transporterId: 'T1' }, transporter, { to: 'picked_up' }, opts);
    expect(r.events[0].byRole).toBe('transporter');
  });
  test('an invalid jump is refused with 409 and changes nothing', () => {
    const r = planStatusChange(base(), admin, { to: 'in_transit' }, opts);
    expect(r).toMatchObject({ ok: false, status: 409, code: 'invalid_transition' });
    expect(r.set).toBeUndefined();
  });
  test('Delivered cannot be set by an update, whoever asks', () => {
    const s = base({ status: 'out_for_delivery' });
    for (const a of [transporter, farmer, buyer, admin]) expect(planStatusChange(s, a, { to: 'delivered' }, opts).code).toBe('requires_otp');
  });
  test('going out for delivery asks the service to issue the delivery code', () => {
    const r = planStatusChange(base({ status: 'in_transit' }), transporter, { to: 'out_for_delivery' }, opts);
    expect(r.effects.issueDeliveryCode).toBe(true);
  });
  test('the other people on the shipment are told, the actor is not', () => {
    const r = planStatusChange(base({ status: 'in_transit', transporterId: 'T1' }), transporter, { to: 'out_for_delivery' }, opts);
    expect(r.effects.notify[0].userIds.sort()).toEqual(['B1', 'F1']);
    expect(r.effects.notify[0].message).toBe('Shipment SHP-20261030-ABCDEFGH is now "Out for Delivery".');
  });
  test('no notification text ever contains a code', () => {
    const r = planStatusChange(base({ status: 'in_transit' }), transporter, { to: 'out_for_delivery' }, opts);
    expect(JSON.stringify(r.effects)).not.toMatch(/\b\d{6}\b/);
  });
});

describe('reasons are required where they matter', () => {
  test('delayed, delivery failed, damage and investigation need a note', () => {
    expect(planStatusChange(base({ status: 'in_transit' }), transporter, { to: 'delayed' }, opts).code).toBe('note_required');
    expect(planStatusChange(base({ status: 'out_for_delivery' }), transporter, { to: 'delivery_failed', note: '  ' }, opts).code).toBe('note_required');
    expect(planStatusChange(base({ status: 'in_transit' }), transporter, { to: 'delayed', note: 'Truck broke down' }, opts).ok).toBe(true);
  });
  test('a delayed update can carry a new estimate, which is logged as its own event', () => {
    const s = base({ status: 'in_transit', expectedDeliveryAt: hours(24) });
    const r = planStatusChange(s, transporter, { to: 'delayed', note: 'Heavy rain on the highway', expectedDeliveryAt: hours(40) }, opts);
    expect(r.set.expectedDeliveryAt).toEqual(hours(40));
    expect(r.events.map((e) => e.type)).toEqual(['status_change', 'eta_changed']);
  });
  test('a failed delivery counts the attempt', () => {
    const s = base({ status: 'out_for_delivery', deliveryAttempts: 1 });
    const r = planStatusChange(s, transporter, { to: 'delivery_failed', note: 'Buyer not at the address' }, opts);
    expect(r.set.deliveryAttempts).toBe(2);
    expect(r.events[0]).toMatchObject({ type: 'delivery_attempt', data: { attempt: 2, outcome: 'failed' } });
  });
});

describe('incidents remember where the shipment was', () => {
  test('entering an incident stores the status before it; leaving clears it', () => {
    const into = planStatusChange(base({ status: 'in_transit' }), transporter, { to: 'damage_reported', note: 'Crate fell off' }, opts);
    expect(into.set.statusBeforeIncident).toBe('in_transit');
    const out = planStatusChange(base({ status: 'damage_reported', statusBeforeIncident: 'in_transit' }), transporter, { to: 'in_transit' }, opts);
    expect(out.set.statusBeforeIncident).toBeNull();
  });
});

describe('locations', () => {
  test('a manual location is stored with its label', () => {
    const r = planStatusChange(base({ status: 'picked_up' }), transporter, { to: 'in_transit', location: { source: 'manual', label: 'Tumkur toll plaza' } }, opts);
    expect(r.set.lastLocation).toMatchObject({ source: 'manual', label: 'Tumkur toll plaza' });
  });
  test('a bad location refuses the whole update', () => {
    const r = planStatusChange(base({ status: 'picked_up' }), transporter, { to: 'in_transit', location: { source: 'device_gps', lat: 12, lng: 77 } }, opts);
    expect(r.code).toBe('invalid_location');
  });
});

describe('checkpoints', () => {
  const moving = base({ status: 'in_transit' });
  test('the carrier records one; it is logged with a time and a location label', () => {
    const r = planCheckpoint(moving, transporter, { note: 'Crossed the state border', location: { source: 'manual', label: 'Hosur' } }, opts);
    expect(r.ok).toBe(true);
    expect(r.events[0]).toMatchObject({ type: 'checkpoint', status: 'in_transit', note: 'Crossed the state border' });
    expect(r.set.lastLocation.label).toBe('Hosur');
  });
  test('the buyer and the farmer (when a transporter exists) cannot', () => {
    expect(planCheckpoint(moving, buyer, { note: 'x' }, opts).status).toBe(403);
    expect(planCheckpoint(base({ status: 'in_transit', transporterId: 'T1' }), { id: 'F1', roles: ['farmer'] }, { note: 'x' }, opts).status).toBe(403);
  });
  test('not before pickup, not after delivery', () => {
    expect(planCheckpoint(base({ status: 'created' }), transporter, { note: 'x' }, opts).code).toBe('invalid_state');
    expect(planCheckpoint(base({ status: 'delivered' }), transporter, { note: 'x' }, opts).code).toBe('invalid_state');
  });
  test('an empty checkpoint is refused', () => {
    expect(planCheckpoint(moving, transporter, {}, opts).code).toBe('empty_checkpoint');
  });
});

describe('reporting damaged or missing goods', () => {
  const delivered = base({ status: 'delivered', deliveredAt: hours(-2) });
  const o = { now: NOW, rules };
  test('the buyer reports damage on a delivered shipment: status moves, alert finding is produced with an explanation', () => {
    const r = planIssueReport(delivered, buyer, { kind: 'damage', description: 'Half the crates are crushed', affectedQuantityKg: 50 }, o);
    expect(r.ok).toBe(true);
    expect(r.set.status).toBe('damage_reported');
    expect(r.set.statusBeforeIncident).toBe('delivered');
    expect(r.findings[0]).toMatchObject({ type: 'damage_reported', severity: 'critical' });
    expect(r.findings[0].dedupeKey).toBe(`damage:${r.eventId}`);
    expect(r.findings[0].reason).toMatch(/reported by the buyer: 50 kg of 100 kg \(50.0%\)/);
  });
  test('after the 48-hour window the buyer is refused, an admin is not', () => {
    const old = base({ status: 'delivered', deliveredAt: hours(-72) });
    expect(planIssueReport(old, buyer, { kind: 'damage', description: 'Spoiled goods found' }, o).code).toBe('damage_window_closed');
    expect(planIssueReport(old, admin, { kind: 'damage', description: 'Spoiled goods found' }, o).ok).toBe(true);
  });
  test('the farmer can report on a delivered shipment (event + alert) without changing the status', () => {
    const r = planIssueReport(delivered, { id: 'F1', roles: ['farmer'] }, { kind: 'missing', description: 'Buyer claims less arrived' }, o);
    expect(r.ok).toBe(true);
    expect(r.set.status).toBeUndefined();
    expect(r.findings).toHaveLength(1);
  });
  test('a stranger is told the shipment does not exist', () => {
    expect(planIssueReport(delivered, { id: 'X', roles: [] }, { kind: 'damage', description: 'xxxxxx' }, o).status).toBe(404);
  });
  test('input is validated', () => {
    expect(planIssueReport(delivered, buyer, { kind: 'broken', description: 'xxxxxx' }, o).code).toBe('invalid_kind');
    expect(planIssueReport(delivered, buyer, { kind: 'damage', description: 'no' }, o).code).toBe('description_required');
    expect(planIssueReport(delivered, buyer, { kind: 'damage', description: 'xxxxxx', affectedQuantityKg: -3 }, o).code).toBe('invalid_quantity');
    expect(planIssueReport(delivered, buyer, { kind: 'damage', description: 'xxxxxx', affectedQuantityKg: 5000 }, o).code).toBe('invalid_quantity');
  });
  test('control characters in the description are removed before they are stored', () => {
    const r = planIssueReport(delivered, buyer, { kind: 'damage', description: 'bad\u0000 crates' }, o);
    expect(r.events[0].note).toBe('bad crates');
  });
  test('a second report on an already open incident does not move the status again', () => {
    const r = planIssueReport(base({ status: 'damage_reported', deliveredAt: hours(-1) }), buyer, { kind: 'damage', description: 'Another crate is crushed' }, o);
    expect(r.set.status).toBeUndefined();
  });
});

describe('confirming receipt', () => {
  const out = base({ status: 'out_for_delivery' });
  const o = { now: NOW, rules };
  test('quantity must be stated', () => {
    expect(validateReceiptInput(out, {}).code).toBe('invalid_quantity');
    expect(validateReceiptInput(out, { receivedQuantityKg: '' }).code).toBe('invalid_quantity');
    expect(validateReceiptInput(out, { receivedQuantityKg: -1 }).code).toBe('invalid_quantity');
    expect(validateReceiptInput(out, { receivedQuantityKg: 500 }).code).toBe('invalid_quantity');
    expect(validateReceiptInput(out, { receivedQuantityKg: 0 }).ok).toBe(true);
  });
  test('damage needs a description', () => {
    expect(validateReceiptInput(out, { receivedQuantityKg: 100, condition: 'damaged' }).code).toBe('description_required');
    expect(validateReceiptInput(out, { receivedQuantityKg: 100, condition: 'on_fire' }).code).toBe('invalid_condition');
  });
  test('a clean delivery: delivered, one-time code erased, nothing blocking, payout can be released', () => {
    const parsed = validateReceiptInput(out, { receivedQuantityKg: 100 });
    const r = planReceipt(out, buyer, parsed, o);
    expect(r.set).toMatchObject({ status: 'delivered', deliveredAt: NOW, 'delivery.otpHash': null, 'delivery.receivedQuantityKg': 100, 'delivery.condition': 'ok' });
    expect(r.findings).toEqual([]);
    expect(r.blocking).toBe(false);
    expect(r.events.map((e) => e.type)).toEqual(['receipt_confirmed', 'status_change']);
  });
  test('a shortfall is delivered but flagged, and the payout is held', () => {
    const r = planReceipt(out, buyer, validateReceiptInput(out, { receivedQuantityKg: 90 }), o);
    expect(r.set.status).toBe('delivered');
    expect(r.findings[0]).toMatchObject({ type: 'quantity_mismatch', severity: 'critical' });
    expect(r.blocking).toBe(true);
  });
  test('damage at the door: delivered, then Damage Reported, with the two alerts explained', () => {
    const parsed = validateReceiptInput(out, { receivedQuantityKg: 95, condition: 'damaged', damagedQuantityKg: 30, note: 'Water damage on 30 kg' });
    const r = planReceipt(out, buyer, parsed, o);
    expect(r.set.status).toBe('damage_reported');
    expect(r.set.statusBeforeIncident).toBe('delivered');
    expect(r.set.deliveredAt).toEqual(NOW);
    expect(r.events.map((e) => e.type)).toEqual(['receipt_confirmed', 'status_change', 'damage_reported', 'status_change']);
    expect(r.findings.map((f) => f.type).sort()).toEqual(['damage_reported', 'quantity_mismatch']);
    expect(r.blocking).toBe(true);
  });
  test('the farmer is told that payout is on hold, without detail that belongs to the buyer', () => {
    const r = planReceipt(out, buyer, validateReceiptInput(out, { receivedQuantityKg: 80 }), o);
    expect(r.effects.notify[0].message).toMatch(/Payout is on hold/);
  });
});
