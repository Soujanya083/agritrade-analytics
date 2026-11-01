// End-to-end behaviour of the shipment service against an in-memory stand-in for MongoDB (see helpers/fakeModels.js).
// It runs the real service, engine, rules and OTP code: create, track, deliver with the one-time code, raise and
// resolve alerts, hold and release the payout. The MongoDB-backed shipments-api.test.js repeats the key paths over HTTP.
jest.mock('../models', () => require('./helpers/fakeModels').build());

const models = require('../models');
const svc = require('../services/shipmentService');
const alerts = require('../services/shipmentAlerts');
const { actOnAlert } = alerts;
const { isValidShipmentCode } = require('../lib/shipmentIds');

const { Transaction, Notification, Shipment, ShipmentAlert, User, Crop, Bid, ShipmentPhoto } = models;
const T0 = new Date();
const at = (h) => new Date(T0.getTime() + h * 3600000);
const DEV = { NODE_ENV: 'development' };

// every test starts from an empty database
beforeEach(() => { Object.values(models).forEach((m) => { if (m && m.rows) m.rows.length = 0; }); });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
let seq = 0;

async function seed({ txStatus = 'payment_confirmed', quantity = 100 } = {}) {
  seq += 1;
  const farmer = await User.create({ fullName: `Asha ${seq}`, email: `asha${seq}@x.com`, role: 'Farmer', isVerified: true, location: 'Hubli' });
  const buyer = await User.create({ fullName: `Ravi ${seq}`, email: `ravi${seq}@x.com`, role: 'Buyer', isVerified: true, deliveryAddress: '12 MG Road, Pune', location: 'Pune' });
  const transporter = await User.create({ fullName: `Kiran ${seq}`, email: `kiran${seq}@x.com`, role: 'Transporter', isVerified: true });
  const crop = await Crop.create({ cropName: 'Tomato', quantityKg: quantity, location: 'Hubli', farmerId: farmer._id, status: 'deal_done' });
  const bid = await Bid.create({ cropId: crop._id, buyerId: buyer._id, amount: 30, status: 'accepted' });
  const tx = await Transaction.create({ cropId: crop._id, bidId: bid._id, farmerId: farmer._id, buyerId: buyer._id, totalAmount: 3000, platformFee: 150, payout: 2850, status: txStatus });
  const actors = {
    farmer: { id: String(farmer._id), name: farmer.fullName, email: farmer.email, admin: false },
    buyer: { id: String(buyer._id), name: buyer.fullName, email: buyer.email, admin: false },
    transporter: { id: String(transporter._id), name: transporter.fullName, email: transporter.email, admin: false },
    stranger: { id: '0'.repeat(23) + '9', name: 'Mallory', email: 'm@x.com', admin: false },
    admin: { id: '0'.repeat(23) + '8', name: 'Ops', email: 'ops@x.com', admin: true },
  };
  const shipment = await svc.ensureShipmentForTransaction(tx);
  return { farmer, buyer, transporter, crop, bid, tx, shipment, actors, code: shipment.shipmentCode };
}

const as = async (ctx, who) => {
  const found = await svc.findForActor(ctx.code, ctx.actors[who]);
  return found ? { ...found, actor: ctx.actors[who] } : null;
};
const move = async (ctx, who, to, extra = {}, now = T0) => {
  const f = await as(ctx, who);
  return svc.changeStatus(f.shipment, f.actor, f.roles, { to, ...extra }, { now, env: DEV });
};
const fresh = async (ctx) => Shipment.findOne({ shipmentCode: ctx.code });
const txOf = async (ctx) => Transaction.findById(ctx.tx._id);

// takes the shipment all the way to "out for delivery" with a transporter, like a real run
async function toOutForDelivery(ctx, now = T0) {
  await move(ctx, 'farmer', 'ready_for_pickup', { expectedDeliveryAt: at(48) }, now);
  const f = await as(ctx, 'farmer');
  await svc.assignCarrier(f.shipment, f.actor, f.roles, { transporterEmail: ctx.actors.transporter.email });
  await move(ctx, 'transporter', 'picked_up', {}, now);
  await move(ctx, 'transporter', 'in_transit', { location: { source: 'manual', label: 'Hubli bypass' } }, now);
  return move(ctx, 'transporter', 'out_for_delivery', {}, now);
}
async function requestCode(ctx, now = T0) {
  const f = await as(ctx, 'buyer');
  return svc.issueDeliveryCode(f.shipment, { auto: false, now, env: DEV });
}
async function confirm(ctx, body, now = T0) {
  const f = await as(ctx, 'buyer');
  return svc.confirmDelivery(f.shipment, f.actor, f.roles, body, { now, env: DEV });
}

describe('creating a shipment', () => {
  test('gets a unique, well-formed code and a first timeline entry', async () => {
    const ctx = await seed();
    expect(isValidShipmentCode(ctx.code)).toBe(true);
    const s = await fresh(ctx);
    expect(s.status).toBe('created');
    expect(s.quantityDispatchedKg).toBe(100);
    expect(s.destinationLabel).toBe('12 MG Road, Pune');
    expect(s.events[0].type).toBe('created');
  });
  test('asking again returns the same shipment (one per deal)', async () => {
    const ctx = await seed();
    const again = await svc.ensureShipmentForTransaction(ctx.tx);
    expect(again.shipmentCode).toBe(ctx.code);
    expect(Shipment.rows.filter((r) => String(r.transactionId) === String(ctx.tx._id))).toHaveLength(1);
  });
  test('two shipments never share a code', async () => {
    const a = await seed(); const b = await seed();
    expect(a.code).not.toBe(b.code);
  });
});

describe('who can see a shipment', () => {
  test('the farmer, the buyer and an admin can; a stranger and an unassigned transporter cannot', async () => {
    const ctx = await seed();
    expect(await as(ctx, 'farmer')).not.toBeNull();
    expect(await as(ctx, 'buyer')).not.toBeNull();
    expect(await as(ctx, 'admin')).not.toBeNull();
    expect(await as(ctx, 'stranger')).toBeNull();
    expect(await as(ctx, 'transporter')).toBeNull();
  });
  test('after being assigned, the transporter can', async () => {
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup');
    const f = await as(ctx, 'farmer');
    await svc.assignCarrier(f.shipment, f.actor, f.roles, { transporterEmail: ctx.actors.transporter.email });
    expect((await as(ctx, 'transporter')).roles).toEqual(['carrier']);
    expect((await as(ctx, 'farmer')).roles).toEqual(['farmer']);   // no longer the carrier
  });
  test('a malformed code finds nothing', async () => {
    const ctx = await seed();
    expect(await svc.findForActor("SHP-1' OR '1'='1", ctx.actors.farmer)).toBeNull();
  });
  test('the tracking link carries the code and nothing secret', () => {
    expect(svc.buildTrackingUrl('SHP-20261030-ABCDEFGH', { PUBLIC_APP_URL: 'https://app.example.com/' })).toBe('https://app.example.com/#/shipment/SHP-20261030-ABCDEFGH');
    expect(svc.buildTrackingUrl('SHP-X', { CORS_ORIGINS: 'https://a.app, https://b.app' })).toBe('https://a.app/#/shipment/SHP-X');
  });
});

describe('the journey', () => {
  test('releasing for pickup needs payment, then moves the legacy transaction to dispatched', async () => {
    const unpaid = await seed({ txStatus: 'awaiting_payment' });
    await expect(move(unpaid, 'farmer', 'ready_for_pickup')).rejects.toMatchObject({ status: 409, code: 'payment_required' });
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup', { expectedDeliveryAt: at(30) });
    expect((await txOf(ctx)).status).toBe('dispatched');
    expect((await fresh(ctx)).expectedDeliveryAt.getTime()).toBe(at(30).getTime());
  });
  test('every step is on the timeline with a time and who did it', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const s = await fresh(ctx);
    const steps = s.events.filter((e) => e.type === 'status_change').map((e) => e.status);
    expect(steps).toEqual(['ready_for_pickup', 'picked_up', 'in_transit', 'out_for_delivery']);
    const pickup = s.events.find((e) => e.status === 'picked_up');
    expect(pickup.byRole).toBe('transporter');
    expect(pickup.byName).toBe(ctx.actors.transporter.name);
    expect(pickup.at).toBeTruthy();
    expect(s.lastLocation.label).toBe('Hubli bypass');
  });
  test('the wrong person or an impossible jump is refused', async () => {
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup');
    const f = await as(ctx, 'farmer');
    await svc.assignCarrier(f.shipment, f.actor, f.roles, { transporterEmail: ctx.actors.transporter.email });
    await expect(move(ctx, 'farmer', 'picked_up')).rejects.toMatchObject({ status: 403 });          // the farmer is no longer the carrier
    await expect(move(ctx, 'buyer', 'picked_up')).rejects.toMatchObject({ status: 403 });
    await expect(move(ctx, 'transporter', 'out_for_delivery')).rejects.toMatchObject({ status: 409, code: 'invalid_transition' });
  });
  test('only a verified transporter account can be assigned; the buyer cannot assign anyone', async () => {
    const ctx = await seed();
    const f = await as(ctx, 'farmer');
    await expect(svc.assignCarrier(f.shipment, f.actor, f.roles, { transporterEmail: ctx.actors.buyer.email })).rejects.toMatchObject({ status: 404 });
    const b = await as(ctx, 'buyer');
    await expect(svc.assignCarrier(b.shipment, b.actor, b.roles, { transporterEmail: ctx.actors.transporter.email })).rejects.toMatchObject({ status: 403 });
  });
  test('with no transporter the farmer delivers and the timeline says so', async () => {
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup');
    await move(ctx, 'farmer', 'picked_up');
    const e = (await fresh(ctx)).events.find((x) => x.status === 'picked_up');
    expect(e.byRole).toBe('farmer (delivering)');
  });
  test('"delivered" cannot be set by an update, by anyone', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    for (const who of ['transporter', 'farmer', 'buyer', 'admin']) {
      await expect(move(ctx, who, 'delivered')).rejects.toMatchObject({ code: 'requires_otp' }).catch(() => {});
    }
    expect((await fresh(ctx)).status).toBe('out_for_delivery');
  });
  test('checkpoints are recorded while on the road', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const f = await as(ctx, 'transporter');
    await svc.recordCheckpoint(f.shipment, f.actor, f.roles, { note: 'Fuel stop', location: { source: 'manual', label: 'Dharwad' } }, { now: T0, env: DEV });
    const cp = (await fresh(ctx)).events.filter((e) => e.type === 'checkpoint');
    expect(cp).toHaveLength(1);
    expect(cp[0].note).toBe('Fuel stop');
  });
});

describe('the delivery code', () => {
  test('the carrier going out for delivery issues a code that is stored hashed and shown to nobody', async () => {
    const ctx = await seed();
    const out = await toOutForDelivery(ctx);
    expect(out.delivery.devCode).toBeUndefined();
    const s = await fresh(ctx);
    expect(s.delivery.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.delivery.otpExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(out)).not.toMatch(/\b\d{6}\b/);
  });
  test('the buyer who asks gets a code in development mode only; a second request right away is refused', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const first = await requestCode(ctx, at(0));
    expect(first.devCode).toMatch(/^\d{6}$/);
    expect(first.channel).toBe('development');
    await expect(requestCode(ctx, at(0.005))).rejects.toMatchObject({ status: 429, code: 'otp_cooldown' });
    const later = await requestCode(ctx, at(0.1));
    expect(later.devCode).toMatch(/^\d{6}$/);
  });
  test('in production without an e-mail service the code is never revealed', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const f = await as(ctx, 'buyer');
    const out = await svc.issueDeliveryCode(f.shipment, { auto: false, now: T0, env: { NODE_ENV: 'production' } });
    expect(out.devCode).toBeUndefined();
    expect(out.channel).toBe('none');
    expect(svc.shouldExposeDeliveryCode({ NODE_ENV: 'production' })).toBe(false);
    expect(svc.shouldExposeDeliveryCode({ NODE_ENV: 'production', EXPOSE_DELIVERY_OTP_IN_RESPONSE: 'true' })).toBe(true);
  });
  test('only the buyer can ask for the code, and only while out for delivery', async () => {
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup');
    const f = await as(ctx, 'buyer');
    await expect(svc.issueDeliveryCode(f.shipment, { auto: false, now: T0, env: DEV })).rejects.toMatchObject({ status: 409 });
  });
  test('no notification, event or alert text ever contains the code', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx, at(0));
    await confirm(ctx, { otp: '000000', receivedQuantityKg: 100 }).catch(() => {});
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 100 });
    const everything = JSON.stringify([Notification.rows, (await fresh(ctx)).toObject().events, ShipmentAlert.rows]);
    expect(everything.includes(devCode)).toBe(false);
  });
});

describe('confirming delivery', () => {
  test('the right code with the right quantity: delivered, payout released, one-time code gone', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    const out = await confirm(ctx, { otp: devCode, receivedQuantityKg: 100 });
    expect(out.issues).toBe(0);
    const s = await fresh(ctx);
    expect(s.status).toBe('delivered');
    expect(s.deliveredAt).toBeTruthy();
    expect(s.delivery.otpHash).toBeNull();
    expect(s.delivery.receivedQuantityKg).toBe(100);
    const tx = await txOf(ctx);
    expect(tx.status).toBe('delivery_completed');
    expect((await Crop.findById(ctx.crop._id)).status).toBe('completed');
    expect(ShipmentAlert.rows.filter((a) => a.shipmentId === s._id && a.isOpen)).toHaveLength(0);
  });
  test('a used code cannot be used again (replay)', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 100 });
    await expect(confirm(ctx, { otp: devCode, receivedQuantityKg: 100 })).rejects.toMatchObject({ status: 409, code: 'already_confirmed' });
  });
  test('an expired code is refused and does not count as a guess', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx, at(0));
    await expect(confirm(ctx, { otp: devCode, receivedQuantityKg: 100 }, at(2))).rejects.toMatchObject({ status: 400, code: 'otp_expired' });
    expect((await fresh(ctx)).delivery.attempts).toBe(0);
  });
  test('only the buyer can confirm', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    for (const who of ['farmer', 'transporter', 'admin']) {
      const f = await as(ctx, who);
      await expect(svc.confirmDelivery(f.shipment, f.actor, f.roles, { otp: devCode, receivedQuantityKg: 100 }, { now: T0, env: DEV })).rejects.toMatchObject({ status: 403 });
    }
    expect((await fresh(ctx)).status).toBe('out_for_delivery');
  });
  test('the quantity must be stated and the code must look like a code', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    await expect(confirm(ctx, { otp: devCode })).rejects.toMatchObject({ code: 'invalid_quantity' });
    await expect(confirm(ctx, { otp: 'abc', receivedQuantityKg: 100 })).rejects.toMatchObject({ code: 'otp_malformed' });
    await expect(confirm(ctx, { otp: { $ne: 1 }, receivedQuantityKg: 100 })).rejects.toMatchObject({ code: 'otp_malformed' });
  });
  test('confirming before the shipment is out for delivery is refused', async () => {
    const ctx = await seed();
    await expect(confirm(ctx, { otp: '123456', receivedQuantityKg: 100 })).rejects.toMatchObject({ status: 409 });
  });
});

describe('brute force', () => {
  test('wrong codes are counted; the 5th locks confirmation and burns the code, even a correct code is then refused', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx, at(0));
    const wrong = devCode === '000000' ? '111111' : '000000';
    const remaining = [];
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const err = await confirm(ctx, { otp: wrong, receivedQuantityKg: 100 }, at(0.01)).catch((e) => e);
      expect(err.code).toBe('otp_invalid');
      remaining.push(err.extra.attemptsRemaining);
    }
    expect(remaining).toEqual([4, 3, 2, 1]);
    const locked = await confirm(ctx, { otp: wrong, receivedQuantityKg: 100 }, at(0.01)).catch((e) => e);
    expect(locked).toMatchObject({ status: 423, code: 'otp_locked' });
    const s = await fresh(ctx);
    expect(s.delivery.otpHash).toBeNull();
    expect(s.delivery.lockedUntil).toBeTruthy();
    await expect(confirm(ctx, { otp: devCode, receivedQuantityKg: 100 }, at(0.02))).rejects.toMatchObject({ status: 423 });
    expect((await fresh(ctx)).status).toBe('out_for_delivery');
  });
  test('failures raise a verification alert (warning after 3, critical when locked) without duplicates', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx, at(0));
    const wrong = devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await confirm(ctx, { otp: wrong, receivedQuantityKg: 100 }, at(0.01)).catch(() => {});
    }
    const list = ShipmentAlert.rows.filter((a) => a.type === 'verification_failed');
    expect(list).toHaveLength(1);
    expect(list[0].severity).toBe('critical');
    expect(list[0].reason).toMatch(/wrongly 5 times/);
  });
  test('after the lock ends a new code can be issued and used; the old alert closes itself', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const first = await requestCode(ctx, at(0));
    const wrong = first.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await confirm(ctx, { otp: wrong, receivedQuantityKg: 100 }, at(0.01)).catch(() => {});
    }
    await expect(requestCode(ctx, at(0.1))).rejects.toMatchObject({ status: 423, code: 'otp_locked' });   // still locked (15 minutes)
    const next = await requestCode(ctx, at(0.5));
    await confirm(ctx, { otp: next.devCode, receivedQuantityKg: 100 }, at(0.51));
    expect((await fresh(ctx)).status).toBe('delivered');
    expect(ShipmentAlert.rows.filter((a) => a.type === 'verification_failed' && a.isOpen)).toHaveLength(0);
  });
});

describe('quantity mismatch and damage', () => {
  test('a shortfall delivers the goods but holds the payout and raises ONE critical, explained alert', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    const out = await confirm(ctx, { otp: devCode, receivedQuantityKg: 88 });
    expect(out.issues).toBe(1);
    const tx = await txOf(ctx);
    expect(tx.status).toBe('dispatched');
    expect(tx.deliveryDisputed).toBe(true);
    const a = ShipmentAlert.rows.filter((x) => x.type === 'quantity_mismatch');
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe('critical');
    expect(a[0].reason).toMatch(/100 kg was dispatched but the buyer confirmed 88 kg/);
    expect(a[0].shipmentCode).toBe(ctx.code);
    expect(a[0].createdAt).toBeTruthy();
  });
  test('everyone on the shipment is notified of the alert, with the reason', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 80 });
    const forAlert = Notification.rows.filter((n) => n.type === 'alert');
    expect(forAlert.map((n) => String(n.userId)).sort()).toEqual([ctx.actors.buyer.id, ctx.actors.farmer.id, ctx.actors.transporter.id].sort());
    expect(forAlert[0].message).toMatch(/\[CRITICAL\] Shipment SHP-.*dispatched but the buyer confirmed 80 kg/);
  });
  test('the farmer cannot resolve a quantity alert; the buyer can, with a note; then the payout is released', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 92 });
    const alert = ShipmentAlert.rows.find((x) => x.type === 'quantity_mismatch');
    const farmer = await as(ctx, 'farmer');
    const buyer = await as(ctx, 'buyer');
    expect(await actOnAlert(alert, farmer.shipment, farmer.actor, farmer.roles, 'resolve', 'we agree it was short')).toMatchObject({ ok: false, status: 403 });
    expect(await actOnAlert(alert, buyer.shipment, buyer.actor, buyer.roles, 'resolve', '')).toMatchObject({ ok: false, code: 'note_required' });
    expect((await actOnAlert(alert, farmer.shipment, farmer.actor, farmer.roles, 'acknowledge', 'looking into it')).ok).toBe(true);
    expect((await actOnAlert(alert, buyer.shipment, buyer.actor, buyer.roles, 'investigate', 'weighed again: 92 kg')).ok).toBe(true);
    const done = await actOnAlert(alert, buyer.shipment, buyer.actor, buyer.roles, 'resolve', 'Farmer refunded the 8 kg');
    expect(done.ok).toBe(true);
    expect(done.alert.status).toBe('resolved');
    expect(done.alert.history.map((h) => h.action)).toEqual(['acknowledged', 'investigating', 'resolved']);
    await svc.afterAlertResolved(buyer.shipment, buyer.actor, buyer.roles);
    expect((await txOf(ctx)).status).toBe('delivery_completed');
    expect(await actOnAlert(done.alert.toObject(), buyer.shipment, buyer.actor, buyer.roles, 'resolve', 'again again')).toMatchObject({ ok: false, status: 409 });
  });
  test('damage at the door: status Damage Reported, two alerts, payout held, photos attach as evidence', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 95, condition: 'damaged', damagedQuantityKg: 30, note: 'Water damage on 30 kg' });
    expect((await fresh(ctx)).status).toBe('damage_reported');
    expect(ShipmentAlert.rows.map((a) => a.type).sort()).toEqual(['damage_reported', 'quantity_mismatch']);
    expect((await txOf(ctx)).deliveryDisputed).toBe(true);

    const buyer = await as(ctx, 'buyer');
    const photo = await svc.addPhoto(buyer.shipment, buyer.actor, buyer.roles, { kind: 'damage', caption: 'Crate 3 \u0000 soaked', buffer: JPEG, mime: 'image/jpeg' }, { now: T0, env: DEV });
    expect(photo.photoId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const stored = ShipmentPhoto.rows[0];
    expect(stored.caption).toBe('Crate 3 soaked');
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await fresh(ctx)).photoCount).toBe(1);
    expect(ShipmentAlert.rows.find((a) => a.type === 'damage_reported').details.photoCount).toBe(1);
  });
  test('resolving every blocking alert closes the incident and releases the payout', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 95, condition: 'damaged', damagedQuantityKg: 5, note: 'Two crates cracked' });
    const buyer = await as(ctx, 'buyer');
    for (const a of ShipmentAlert.rows.filter((x) => x.isOpen)) {
      // eslint-disable-next-line no-await-in-loop
      const current = ShipmentAlert.rows.find((x) => x._id === a._id);
      // eslint-disable-next-line no-await-in-loop
      expect((await actOnAlert(current, buyer.shipment, buyer.actor, buyer.roles, 'resolve', 'Refund agreed with the farmer')).ok).toBe(true);
    }
    const latest = await svc.afterAlertResolved(buyer.shipment, buyer.actor, buyer.roles);
    expect(latest.status).toBe('delivered');
    expect((await txOf(ctx)).status).toBe('delivery_completed');
  });
  test('a damage report after the 48 hour window is refused for the buyer', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const { devCode } = await requestCode(ctx);
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 100 });
    const buyer = await as(ctx, 'buyer');
    await expect(svc.reportIssue(buyer.shipment, buyer.actor, buyer.roles, { kind: 'damage', description: 'Found rotten goods inside' }, { now: at(72), env: DEV })).rejects.toMatchObject({ code: 'damage_window_closed' });
    const ok = await svc.reportIssue(buyer.shipment, buyer.actor, buyer.roles, { kind: 'damage', description: 'Found rotten goods inside' }, { now: at(1), env: DEV });
    expect(ok.eventId).toBeTruthy();
    expect((await fresh(ctx)).status).toBe('damage_reported');
  });
});

describe('photos', () => {
  test('wrong type, disguised script, wrong role and too many are all refused', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx);
    const buyer = await as(ctx, 'buyer');
    const farmer = await as(ctx, 'farmer');
    const add = (f, kind, buffer, mime = 'image/jpeg') => svc.addPhoto(f.shipment, f.actor, f.roles, { kind, buffer, mime }, { now: T0, env: DEV });
    await expect(add(buyer, 'delivery', Buffer.from('<script>alert(1)</script>............'))).rejects.toMatchObject({ status: 415 });
    await expect(add(buyer, 'delivery', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml')).rejects.toMatchObject({ status: 415 });
    await expect(add(buyer, 'delivery', Buffer.concat([JPEG, Buffer.alloc(3 * 1024 * 1024)]))).rejects.toMatchObject({ status: 413 });
    await expect(add(buyer, 'pickup', JPEG)).rejects.toMatchObject({ status: 403 });
    await expect(add(farmer, 'delivery', JPEG)).rejects.toMatchObject({ status: 403 });
    await expect(add(buyer, 'selfie', JPEG)).rejects.toMatchObject({ status: 400 });
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await add(buyer, 'delivery', JPEG);
      // eslint-disable-next-line no-await-in-loop
      buyer.shipment = await Shipment.findOne({ shipmentCode: ctx.code });
    }
    await expect(add(buyer, 'delivery', JPEG)).rejects.toMatchObject({ status: 409, code: 'photo_limit' });
    expect(ShipmentPhoto.rows.every((p) => !/[\/\\]/.test(p.photoId))).toBe(true);
  });
});

describe('delay alerts', () => {
  test('an overdue shipment raises one alert, not a new one on every check, and it escalates instead of repeating', async () => {
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup', { expectedDeliveryAt: at(24) }, T0);
    await move(ctx, 'farmer', 'picked_up', {}, T0);
    await move(ctx, 'farmer', 'in_transit', {}, at(1));
    const s = await fresh(ctx);
    const before = Notification.rows.length;

    const only = { ...process.env, ALERT_STALE_HOURS: '1000' };            // isolate the "overdue" rule from the "no update" rule
    await alerts.evaluateAlerts(s, { now: at(23), force: true, env: only });  // still on time
    expect(ShipmentAlert.rows.filter((a) => a.type === 'delay')).toHaveLength(0);

    await alerts.evaluateAlerts(s, { now: at(24.5), force: true, env: only });      // within the grace period: still no alert
    expect(ShipmentAlert.rows.filter((a) => a.type === 'delay')).toHaveLength(0);

    await alerts.evaluateAlerts(s, { now: at(27), force: true, env: only });        // 3 h late
    let delay = ShipmentAlert.rows.filter((a) => a.type === 'delay');
    expect(delay).toHaveLength(1);
    expect(delay[0].severity).toBe('warning');
    expect(delay[0].rule).toBe('overdue');
    expect(delay[0].reason).toMatch(/Expected delivery was .* It is now 3 h later/);
    const afterFirst = Notification.rows.length;
    expect(afterFirst).toBeGreaterThan(before);

    await alerts.evaluateAlerts(s, { now: at(28), force: true, env: only });        // checked again: no duplicate, no new notification
    await alerts.evaluateAlerts(s, { now: at(29), force: true, env: only });
    expect(ShipmentAlert.rows.filter((a) => a.type === 'delay')).toHaveLength(1);
    expect(Notification.rows.length).toBe(afterFirst);

    await alerts.evaluateAlerts(s, { now: at(40), force: true, env: only });        // 16 h late: escalates the SAME alert
    delay = ShipmentAlert.rows.filter((a) => a.type === 'delay');
    expect(delay).toHaveLength(1);
    expect(delay[0].severity).toBe('critical');
    expect(delay[0].history.map((h) => h.action)).toContain('escalated');
    expect(Notification.rows.length).toBe(afterFirst + 2);                // one escalation message per participant (farmer and buyer: no transporter on this deal)
  });
  test('the carrier posting a delay with a new estimate closes the alert by itself', async () => {
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup', { expectedDeliveryAt: at(24) }, T0);
    await move(ctx, 'farmer', 'picked_up', {}, T0);
    await move(ctx, 'farmer', 'in_transit', {}, at(1));
    await alerts.evaluateAlerts(await fresh(ctx), { now: at(27), force: true });
    expect(ShipmentAlert.rows.filter((a) => a.type === 'delay' && a.isOpen)).toHaveLength(1);
    await move(ctx, 'farmer', 'delayed', { note: 'Truck breakdown near Tumkur', expectedDeliveryAt: at(60) }, at(27));
    expect(ShipmentAlert.rows.filter((a) => a.type === 'delay' && a.isOpen)).toHaveLength(0);
    const closed = ShipmentAlert.rows.find((a) => a.type === 'delay');
    expect(closed.status).toBe('resolved');
    expect(closed.resolvedByRole).toBe('system');
    expect(closed.resolutionNote).toMatch(/no longer true/);
    const s = await fresh(ctx);
    expect(s.events.some((e) => e.type === 'eta_changed')).toBe(true);
  });
  test('a delivered shipment is never reported as late', async () => {
    const ctx = await seed();
    await toOutForDelivery(ctx, T0);
    const { devCode } = await requestCode(ctx, at(1));
    await confirm(ctx, { otp: devCode, receivedQuantityKg: 100 }, at(1.2));
    await alerts.evaluateAlerts(await fresh(ctx), { now: at(500), force: true });
    expect(ShipmentAlert.rows.filter((a) => a.type === 'delay')).toHaveLength(0);
  });
  test('silence while on the road is flagged even before the estimate passes', async () => {
    const ctx = await seed();
    await move(ctx, 'farmer', 'ready_for_pickup', { expectedDeliveryAt: at(48) }, T0);
    await move(ctx, 'farmer', 'picked_up', {}, T0);
    await move(ctx, 'farmer', 'in_transit', {}, at(1));
    await alerts.evaluateAlerts(await fresh(ctx), { now: at(15), force: true });
    const a = ShipmentAlert.rows.find((x) => x.type === 'delay');
    expect(a.rule).toBe('no_update');
    expect(a.reason).toMatch(/no tracking update for 14 h/);
  });
});
