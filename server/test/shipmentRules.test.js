const {
  loadRules, evaluateDelay, evaluateQuantity, evaluateDamage, evaluateVerification, planAlertActions, canActOnAlert, ALERT_POLICY,
} = require('../lib/shipmentRules');

const rules = loadRules({});
const T0 = new Date('2026-10-30T08:00:00Z');
const hours = (h) => new Date(T0.getTime() + h * 3600 * 1000);

const moving = (extra = {}) => ({
  status: 'in_transit', readyAt: T0, expectedDeliveryAt: hours(24), lastEventAt: hours(1), ...extra,
});

describe('configurable thresholds', () => {
  test('defaults', () => {
    expect(rules.delay.graceMinutes).toBe(60);
    expect(rules.quantity.tolerancePercent).toBe(2);
    expect(rules.verification.warnAfterFailures).toBe(3);
  });
  test('environment variables override them; nonsense falls back to the default', () => {
    const r = loadRules({ ALERT_DELAY_GRACE_MINUTES: '15', ALERT_QUANTITY_TOLERANCE_PERCENT: 'lots', ALERT_STALE_HOURS: '' });
    expect(r.delay.graceMinutes).toBe(15);
    expect(r.quantity.tolerancePercent).toBe(2);
    expect(r.delay.staleHours).toBe(12);
  });
});

describe('delay rule', () => {
  test('on time: no alert', () => {
    expect(evaluateDelay(moving(), hours(10), rules)).toEqual([]);
  });
  test('inside the grace period: no alert (avoids false alarms)', () => {
    expect(evaluateDelay(moving({ lastEventAt: hours(24) }), hours(24.9), rules)).toEqual([]);
  });
  test('past the grace period: a warning that explains itself', () => {
    const [f] = evaluateDelay(moving({ lastEventAt: hours(25) }), hours(26), rules);   // 2 h late
    expect(f.type).toBe('delay');
    expect(f.rule).toBe('overdue');
    expect(f.severity).toBe('warning');
    expect(f.reason).toMatch(/Expected delivery was 2026-10-31 08:00 UTC/);
    expect(f.reason).toMatch(/2 h later/);
    expect(f.reason).toMatch(/grace period: 60 min/);
    expect(f.details.lateMinutes).toBe(120);
  });
  test('12 hours late or more is critical', () => {
    const [f] = evaluateDelay(moving({ lastEventAt: hours(35) }), hours(36), rules);
    expect(f.severity).toBe('critical');
  });
  test('a delivered shipment is never "late"', () => {
    expect(evaluateDelay(moving({ status: 'delivered' }), hours(100), rules)).toEqual([]);
  });
  test('no expected delivery time: nothing to compare with', () => {
    expect(evaluateDelay(moving({ expectedDeliveryAt: null }), hours(100), rules)).toEqual([]);
  });
  test('no news for too long while on the road is a warning', () => {
    const [f] = evaluateDelay(moving({ lastEventAt: hours(1) }), hours(14), rules);   // 13 h of silence, not yet late
    expect(f.rule).toBe('no_update');
    expect(f.reason).toMatch(/no tracking update for 13 h/);
  });
  test('early warning: most of the window used up but still waiting for pickup', () => {
    const s = { status: 'ready_for_pickup', readyAt: T0, expectedDeliveryAt: hours(10), lastEventAt: T0 };
    const [f] = evaluateDelay(s, hours(7), rules);   // 70% of the window
    expect(f.rule).toBe('at_risk');
    expect(f.reason).toMatch(/70% of the delivery window/);
    expect(evaluateDelay(s, hours(5), rules)).toEqual([]); // 50%: below the 60% threshold
  });
  test('one alert per shipment: the most serious reason wins and the others are recorded', () => {
    const [f] = evaluateDelay(moving({ lastEventAt: hours(1) }), hours(30), rules);   // late AND silent
    expect(f.rule).toBe('overdue');
    expect(f.details.alsoTriggered).toEqual(['no_update']);
  });
  test('thresholds are really configurable', () => {
    const strict = loadRules({ ALERT_DELAY_GRACE_MINUTES: '0' });
    expect(evaluateDelay(moving({ lastEventAt: hours(24) }), hours(24.5), strict)).toHaveLength(1);
  });
});

describe('quantity rule', () => {
  test('exact match and small differences within tolerance: no alert', () => {
    expect(evaluateQuantity(100, 100, rules)).toEqual([]);
    expect(evaluateQuantity(100, 98.5, rules)).toEqual([]);   // 1.5% <= 2%
    expect(evaluateQuantity(10, 9.6, rules)).toEqual([]);     // 0.4 kg <= the 0.5 kg minimum tolerance
  });
  test('a shortfall beyond tolerance is a warning with the arithmetic in the reason', () => {
    const [f] = evaluateQuantity(100, 95, rules);
    expect(f.type).toBe('quantity_mismatch');
    expect(f.severity).toBe('warning');
    expect(f.reason).toBe('100 kg was dispatched but the buyer confirmed 95 kg: 5 kg (5.0%) short. Allowed difference: 2.0 kg (2% or at least 0.5 kg).');
    expect(f.details.differenceKg).toBe(5);
  });
  test('10% or more is critical', () => {
    expect(evaluateQuantity(100, 90, rules)[0].severity).toBe('critical');
    expect(evaluateQuantity(100, 91, rules)[0].severity).toBe('warning');
  });
  test('receiving MORE than was sent is also flagged', () => {
    const [f] = evaluateQuantity(100, 110, rules);
    expect(f.details.direction).toBe('over');
    expect(f.reason).toMatch(/over/);
  });
  test('missing or invalid numbers raise nothing', () => {
    expect(evaluateQuantity(0, 5, rules)).toEqual([]);
    expect(evaluateQuantity(100, NaN, rules)).toEqual([]);
  });
});

describe('damage rule', () => {
  const base = { kind: 'damage', description: 'crates crushed', eventId: 'e1', reporterRole: 'buyer' };
  test('a small damaged share is a warning; 25% or more is critical', () => {
    expect(evaluateDamage({ ...base, affectedQuantityKg: 10 }, { dispatchedKg: 100 }, rules)[0].severity).toBe('warning');
    expect(evaluateDamage({ ...base, affectedQuantityKg: 25 }, { dispatchedKg: 100 }, rules)[0].severity).toBe('critical');
  });
  test('says whether photo evidence exists', () => {
    expect(evaluateDamage(base, { dispatchedKg: 100, photoCount: 0 }, rules)[0].reason).toMatch(/No photo evidence attached yet/);
    expect(evaluateDamage(base, { dispatchedKg: 100, photoCount: 2 }, rules)[0].reason).toMatch(/2 photo\(s\) attached/);
  });
  test('each report has its own dedupe key; missing goods are described as such', () => {
    const f = evaluateDamage({ ...base, kind: 'missing', eventId: 'e7' }, { dispatchedKg: 100 }, rules)[0];
    expect(f.dedupeKey).toBe('damage:e7');
    expect(f.reason).toMatch(/Missing goods/);
  });
  test('works without a stated amount', () => {
    const f = evaluateDamage(base, { dispatchedKg: 100 }, rules)[0];
    expect(f.details.affectedPercent).toBeNull();
    expect(f.severity).toBe('warning');
  });
});

describe('verification rule', () => {
  test('below the threshold: nothing', () => {
    expect(evaluateVerification({ failedAttempts: 2, locked: false }, rules)).toEqual([]);
  });
  test('3 wrong codes: warning; 5 or locked: critical', () => {
    expect(evaluateVerification({ failedAttempts: 3, locked: false }, rules)[0].severity).toBe('warning');
    expect(evaluateVerification({ failedAttempts: 5, locked: true }, rules)[0].severity).toBe('critical');
    expect(evaluateVerification({ failedAttempts: 5, locked: true }, rules)[0].reason).toMatch(/locked/);
  });
});

describe('planAlertActions: no duplicates, no false alarms', () => {
  const finding = (extra = {}) => ({ type: 'delay', rule: 'overdue', severity: 'warning', reason: 'late', details: {}, ...extra });
  const plan = (existing, findings, now = hours(30), evaluatedTypes = ['delay']) => planAlertActions({ shipmentCode: 'SHP-1', existing, findings, evaluatedTypes, now, rules });

  test('a new finding creates one alert', () => {
    const p = plan([], [finding()]);
    expect(p.create).toHaveLength(1);
    expect(p.create[0].dedupeKey).toBe('SHP-1:delay');
  });
  test('the same finding evaluated again does NOT create a second alert', () => {
    const p = plan([{ _id: 'a1', type: 'delay', dedupeKey: 'SHP-1:delay', status: 'open', severity: 'warning' }], [finding()]);
    expect(p.create).toEqual([]);
    expect(p.escalate).toEqual([]);
  });
  test('an acknowledged alert is still "the same alert" (no repeat notification)', () => {
    const p = plan([{ _id: 'a1', type: 'delay', dedupeKey: 'SHP-1:delay', status: 'acknowledged', severity: 'warning' }], [finding()]);
    expect(p.create).toEqual([]);
  });
  test('getting worse escalates the existing alert instead of adding another', () => {
    const p = plan([{ _id: 'a1', type: 'delay', dedupeKey: 'SHP-1:delay', status: 'open', severity: 'warning' }], [finding({ severity: 'critical' })]);
    expect(p.create).toEqual([]);
    expect(p.escalate).toEqual([{ alertId: 'a1', severity: 'critical', reason: 'late', details: {} }]);
  });
  test('an alert that was just resolved is not raised again for the same cause (cooldown)', () => {
    const resolved = { _id: 'a1', type: 'delay', dedupeKey: 'SHP-1:delay', status: 'resolved', severity: 'warning', resolvedAt: hours(29) };
    const p = plan([resolved], [finding()]);
    expect(p.create).toEqual([]);
    expect(p.suppressed).toHaveLength(1);
  });
  test('...unless it got worse than what was resolved', () => {
    const resolved = { _id: 'a1', type: 'delay', dedupeKey: 'SHP-1:delay', status: 'resolved', severity: 'warning', resolvedAt: hours(29) };
    expect(plan([resolved], [finding({ severity: 'critical' })]).create).toHaveLength(1);
  });
  test('...and after the cooldown a new alert is allowed', () => {
    const resolved = { _id: 'a1', type: 'delay', dedupeKey: 'SHP-1:delay', status: 'resolved', severity: 'warning', resolvedAt: hours(10) };
    expect(plan([resolved], [finding()], hours(30)).create).toHaveLength(1);
  });
  test('when the cause disappears (ETA extended, shipment delivered) a delay alert closes itself', () => {
    const p = plan([{ _id: 'a1', type: 'delay', dedupeKey: 'SHP-1:delay', status: 'open', severity: 'warning' }], []);
    expect(p.autoResolve).toEqual([{ alertId: 'a1', why: 'The condition that raised this alert is no longer true.' }]);
  });
  test('damage and quantity alerts never close themselves: a person must decide', () => {
    const existing = [
      { _id: 'q1', type: 'quantity_mismatch', dedupeKey: 'SHP-1:quantity_mismatch', status: 'open', severity: 'warning' },
      { _id: 'd1', type: 'damage_reported', dedupeKey: 'damage:e1', status: 'open', severity: 'warning' },
    ];
    expect(planAlertActions({ shipmentCode: 'SHP-1', existing, findings: [], evaluatedTypes: ['delay', 'quantity_mismatch', 'damage_reported'], now: hours(30), rules }).autoResolve).toEqual([]);
  });
  test('only types that were actually evaluated can be auto-closed', () => {
    const p = plan([{ _id: 'v1', type: 'verification_failed', dedupeKey: 'SHP-1:verification_failed', status: 'open', severity: 'warning' }], [], hours(30), ['delay']);
    expect(p.autoResolve).toEqual([]);
  });
  test('two findings with the same key in one pass produce one alert', () => {
    expect(plan([], [finding(), finding()]).create).toHaveLength(1);
  });
});

describe('who may act on an alert', () => {
  test('everyone on the shipment may acknowledge and investigate', () => {
    for (const type of Object.keys(ALERT_POLICY)) {
      for (const role of ['farmer', 'buyer', 'carrier', 'admin']) {
        expect(canActOnAlert(type, 'acknowledge', [role])).toBe(true);
        expect(canActOnAlert(type, 'investigate', [role])).toBe(true);
      }
    }
  });
  test('damage and quantity alerts are resolved by the buyer or an admin, not by the seller', () => {
    expect(canActOnAlert('damage_reported', 'resolve', ['buyer'])).toBe(true);
    expect(canActOnAlert('damage_reported', 'resolve', ['admin'])).toBe(true);
    expect(canActOnAlert('damage_reported', 'resolve', ['farmer'])).toBe(false);
    expect(canActOnAlert('damage_reported', 'resolve', ['carrier'])).toBe(false);
    expect(canActOnAlert('quantity_mismatch', 'resolve', ['farmer', 'carrier'])).toBe(false);
  });
  test('delay alerts are resolved by the people who move the goods (or an admin), not the buyer', () => {
    expect(canActOnAlert('delay', 'resolve', ['carrier'])).toBe(true);
    expect(canActOnAlert('delay', 'resolve', ['buyer'])).toBe(false);
  });
  test('an unknown alert type or a stranger can do nothing', () => {
    expect(canActOnAlert('mystery', 'resolve', ['admin'])).toBe(false);
    expect(canActOnAlert('delay', 'acknowledge', [])).toBe(false);
  });
});
