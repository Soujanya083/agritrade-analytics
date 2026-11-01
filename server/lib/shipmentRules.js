// lib/shipmentRules.js - the alert rules, as pure functions with configurable thresholds.
//
// Every finding carries the rule that fired, a plain-language reason and the numbers behind it, so a user
// can see WHY they were alerted and judge whether it is a false alarm. The thresholds come from environment
// variables (see docs/SHIPMENT_SAFETY.md); nothing here talks to a database.
//
// These are early warnings and evidence, not a guarantee that goods arrive safely.
const { statusLabel } = require('./shipmentLifecycle');

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value !== null && value !== undefined ? n : fallback;
};

function loadRules(env = process.env) {
  return {
    delay: {
      graceMinutes: num(env.ALERT_DELAY_GRACE_MINUTES, 60),         // lateness tolerated before an alert
      criticalAfterHours: num(env.ALERT_DELAY_CRITICAL_HOURS, 12),   // warning becomes critical
      atRiskFraction: num(env.ALERT_AT_RISK_FRACTION, 0.6),          // share of the window used up before pickup
      staleHours: num(env.ALERT_STALE_HOURS, 12),                    // no tracking update for this long
    },
    quantity: {
      tolerancePercent: num(env.ALERT_QUANTITY_TOLERANCE_PERCENT, 2),
      minToleranceKg: num(env.ALERT_QUANTITY_MIN_TOLERANCE_KG, 0.5),
      criticalPercent: num(env.ALERT_QUANTITY_CRITICAL_PERCENT, 10),
    },
    damage: {
      criticalPercent: num(env.ALERT_DAMAGE_CRITICAL_PERCENT, 25),
      reportWindowHours: num(env.ALERT_DAMAGE_WINDOW_HOURS, 48),
    },
    verification: {
      warnAfterFailures: num(env.ALERT_OTP_WARN_FAILURES, 3),
      criticalAfterFailures: num(env.ALERT_OTP_CRITICAL_FAILURES, 5),
    },
    cooldown: { resolvedSuppressHours: num(env.ALERT_RESOLVED_COOLDOWN_HOURS, 6) },
  };
}

const SEVERITY_RANK = { info: 1, warning: 2, critical: 3 };
const severityRank = (s) => SEVERITY_RANK[s] || 0;

const fmtTime = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 48) return rest ? `${h} h ${rest} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

// ---- 1. Delay -----------------------------------------------------------------------------
const ACTIVE_FOR_DELAY = new Set(['ready_for_pickup', 'picked_up', 'in_transit', 'delayed', 'out_for_delivery', 'delivery_failed']);
const MOVING = new Set(['picked_up', 'in_transit', 'delayed', 'out_for_delivery']);
const EARLY_STAGE = new Set(['ready_for_pickup', 'picked_up']);

// Returns at most ONE finding per call (the most important reason), so a late shipment raises one alert.
function evaluateDelay(shipment, now = new Date(), rules = loadRules()) {
  const r = rules.delay;
  if (!ACTIVE_FOR_DELAY.has(shipment.status) || !shipment.expectedDeliveryAt) return [];
  const eta = new Date(shipment.expectedDeliveryAt).getTime();
  const t = now.getTime();
  const findings = [];

  const lateMinutes = (t - eta) / 60000;
  if (lateMinutes > r.graceMinutes) {
    findings.push({
      type: 'delay', rule: 'overdue',
      severity: lateMinutes >= r.criticalAfterHours * 60 ? 'critical' : 'warning',
      reason: `Expected delivery was ${fmtTime(eta)}. It is now ${fmtDuration(lateMinutes)} later and the shipment is still "${statusLabel(shipment.status)}" (grace period: ${r.graceMinutes} min).`,
      details: { expectedDeliveryAt: new Date(eta), lateMinutes: Math.round(lateMinutes), graceMinutes: r.graceMinutes, status: shipment.status },
    });
  }

  const lastEventAt = shipment.lastEventAt ? new Date(shipment.lastEventAt).getTime() : null;
  if (MOVING.has(shipment.status) && lastEventAt) {
    const silentHours = (t - lastEventAt) / 3600000;
    if (silentHours >= r.staleHours) {
      findings.push({
        type: 'delay', rule: 'no_update', severity: 'warning',
        reason: `There has been no tracking update for ${fmtDuration(silentHours * 60)} while the shipment is "${statusLabel(shipment.status)}" (limit: ${r.staleHours} h).`,
        details: { lastEventAt: new Date(lastEventAt), silentHours: Math.round(silentHours * 10) / 10, staleHours: r.staleHours, status: shipment.status },
      });
    }
  }

  const windowStart = shipment.readyAt ? new Date(shipment.readyAt).getTime() : null;
  if (EARLY_STAGE.has(shipment.status) && windowStart && eta > windowStart && lateMinutes <= r.graceMinutes) {
    const used = (t - windowStart) / (eta - windowStart);
    if (used >= r.atRiskFraction) {
      findings.push({
        type: 'delay', rule: 'at_risk', severity: 'warning',
        reason: `${Math.round(used * 100)}% of the delivery window has passed but the shipment is only "${statusLabel(shipment.status)}". Delivery by ${fmtTime(eta)} is at risk (alert threshold: ${Math.round(r.atRiskFraction * 100)}%).`,
        details: { windowUsedPercent: Math.round(used * 100), atRiskPercent: Math.round(r.atRiskFraction * 100), expectedDeliveryAt: new Date(eta), status: shipment.status },
      });
    }
  }

  if (!findings.length) return [];
  const priority = { overdue: 3, no_update: 2, at_risk: 1 };
  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || priority[b.rule] - priority[a.rule]);
  const [main, ...others] = findings;
  return [{ ...main, details: { ...main.details, alsoTriggered: others.map((o) => o.rule) } }];
}

// ---- 2. Quantity --------------------------------------------------------------------------
function evaluateQuantity(dispatchedKg, receivedKg, rules = loadRules()) {
  const q = rules.quantity;
  if (!Number.isFinite(dispatchedKg) || !Number.isFinite(receivedKg) || dispatchedKg <= 0) return [];
  const diff = Math.round((dispatchedKg - receivedKg) * 1000) / 1000;
  const tolerance = Math.max(q.minToleranceKg, (dispatchedKg * q.tolerancePercent) / 100);
  if (Math.abs(diff) <= tolerance) return [];
  const percent = (Math.abs(diff) / dispatchedKg) * 100;
  const direction = diff > 0 ? 'short' : 'over';
  return [{
    type: 'quantity_mismatch', rule: 'received_vs_dispatched',
    severity: percent >= q.criticalPercent ? 'critical' : 'warning',
    reason: `${dispatchedKg} kg was dispatched but the buyer confirmed ${receivedKg} kg: ${Math.abs(diff)} kg (${percent.toFixed(1)}%) ${direction}. Allowed difference: ${tolerance.toFixed(1)} kg (${q.tolerancePercent}% or at least ${q.minToleranceKg} kg).`,
    details: { dispatchedKg, receivedKg, differenceKg: diff, differencePercent: Math.round(percent * 10) / 10, toleranceKg: Math.round(tolerance * 100) / 100, direction },
  }];
}

// ---- 3. Damage ----------------------------------------------------------------------------
// report: { kind: 'damage'|'missing'|'quantity', affectedQuantityKg?, description, eventId, reporterRole }
function evaluateDamage(report, { dispatchedKg, photoCount = 0 } = {}, rules = loadRules()) {
  const d = rules.damage;
  const affected = Number(report.affectedQuantityKg);
  const hasAmount = Number.isFinite(affected) && affected > 0 && Number.isFinite(dispatchedKg) && dispatchedKg > 0;
  const percent = hasAmount ? Math.min(100, (affected / dispatchedKg) * 100) : null;
  const critical = percent !== null && percent >= d.criticalPercent;
  const what = report.kind === 'missing' ? 'Missing goods' : 'Damaged goods';
  const evidence = photoCount > 0 ? `${photoCount} photo(s) attached.` : 'No photo evidence attached yet.';
  return [{
    type: 'damage_reported', rule: 'damage_report', severity: critical ? 'critical' : 'warning',
    dedupeKey: `damage:${report.eventId}`,
    reason: `${what} reported by the ${report.reporterRole}${percent !== null ? `: ${affected} kg of ${dispatchedKg} kg (${percent.toFixed(1)}%)` : ''}. ${critical ? `This is at or above the ${d.criticalPercent}% critical level. ` : ''}${evidence}`,
    details: { kind: report.kind, affectedQuantityKg: hasAmount ? affected : null, affectedPercent: percent === null ? null : Math.round(percent * 10) / 10, criticalPercent: d.criticalPercent, photoCount, description: String(report.description || '').slice(0, 500) },
  }];
}

// ---- 4. Failed delivery verification ------------------------------------------------------
function evaluateVerification({ failedAttempts, locked }, rules = loadRules()) {
  const v = rules.verification;
  if (!locked && failedAttempts < v.warnAfterFailures) return [];
  const critical = locked || failedAttempts >= v.criticalAfterFailures;
  return [{
    type: 'verification_failed', rule: 'otp_failures', severity: critical ? 'critical' : 'warning',
    reason: locked
      ? `The delivery code was entered wrongly ${failedAttempts} times and the code is now locked. This may be a mistyping buyer, or someone who is not the buyer trying to confirm the delivery.`
      : `The delivery code was entered wrongly ${failedAttempts} times (alert after ${v.warnAfterFailures}; the code locks after ${v.criticalAfterFailures}).`,
    details: { failedAttempts, locked: Boolean(locked), warnAfter: v.warnAfterFailures, lockAfter: v.criticalAfterFailures },
  }];
}

// ---- Planner: decides what to do with findings, without creating duplicates ----------------
const OPEN_STATES = new Set(['open', 'acknowledged', 'investigating']);
const AUTO_RESOLVE_TYPES = new Set(['delay', 'verification_failed']); // conditions that can clear on their own
const defaultKey = (shipmentCode, finding) => finding.dedupeKey || `${shipmentCode}:${finding.type}`;

// existing: alerts of ONE shipment (plain objects). evaluatedTypes: the finding types this evaluation covers.
// Returns { create, escalate, autoResolve, suppressed }
function planAlertActions({ shipmentCode, existing = [], findings = [], evaluatedTypes = [], now = new Date(), rules = loadRules() }) {
  const plan = { create: [], escalate: [], autoResolve: [], suppressed: [] };
  const cooldownMs = rules.cooldown.resolvedSuppressHours * 3600 * 1000;
  const seen = new Set();

  findings.forEach((finding) => {
    const key = defaultKey(shipmentCode, finding);
    if (seen.has(key)) return;
    seen.add(key);
    const open = existing.find((a) => a.dedupeKey === key && OPEN_STATES.has(a.status));
    if (open) {
      if (severityRank(finding.severity) > severityRank(open.severity)) plan.escalate.push({ alertId: open._id, severity: finding.severity, reason: finding.reason, details: finding.details });
      return; // otherwise: same alert already open, so say nothing
    }
    const recent = existing
      .filter((a) => a.dedupeKey === key && a.status === 'resolved' && a.resolvedAt)
      .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt))[0];
    if (recent && now.getTime() - new Date(recent.resolvedAt).getTime() < cooldownMs && severityRank(finding.severity) <= severityRank(recent.severity)) {
      plan.suppressed.push({ key, why: `an alert for the same cause was resolved ${Math.round((now - new Date(recent.resolvedAt)) / 60000)} min ago` });
      return;
    }
    plan.create.push({ ...finding, dedupeKey: key });
  });

  existing.forEach((a) => {
    if (!OPEN_STATES.has(a.status) || !AUTO_RESOLVE_TYPES.has(a.type) || !evaluatedTypes.includes(a.type)) return;
    if (!seen.has(a.dedupeKey)) plan.autoResolve.push({ alertId: a._id, why: 'The condition that raised this alert is no longer true.' });
  });
  return plan;
}

// ---- Who may do what with an alert ---------------------------------------------------------
const ALL_PARTICIPANTS = ['farmer', 'buyer', 'carrier', 'admin'];
const ALERT_POLICY = Object.freeze({
  delay: { acknowledge: ALL_PARTICIPANTS, investigate: ALL_PARTICIPANTS, resolve: ['farmer', 'carrier', 'admin'] },
  quantity_mismatch: { acknowledge: ALL_PARTICIPANTS, investigate: ALL_PARTICIPANTS, resolve: ['buyer', 'admin'] },
  damage_reported: { acknowledge: ALL_PARTICIPANTS, investigate: ALL_PARTICIPANTS, resolve: ['buyer', 'admin'] },
  verification_failed: { acknowledge: ALL_PARTICIPANTS, investigate: ALL_PARTICIPANTS, resolve: ['farmer', 'carrier', 'admin'] },
});

function canActOnAlert(type, action, roles) {
  const allowed = (ALERT_POLICY[type] || {})[action] || [];
  return roles.some((r) => allowed.includes(r));
}

module.exports = {
  loadRules, evaluateDelay, evaluateQuantity, evaluateDamage, evaluateVerification, planAlertActions,
  ALERT_POLICY, canActOnAlert, severityRank, OPEN_STATES, AUTO_RESOLVE_TYPES, fmtDuration,
};
