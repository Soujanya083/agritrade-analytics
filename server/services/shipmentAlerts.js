// services/shipmentAlerts.js - evaluates the alert rules for a shipment and applies the result.
//
// Runs (1) right after anything that can change the picture (status update, receipt, damage report, a wrong
// code), (2) when a shipment is read (at most once a minute per shipment), and (3) from a periodic sweep.
// The rules and the "do not duplicate" decisions are pure and tested in lib/shipmentRules.js; this file only
// reads the existing alerts, asks the planner what to do, and stores it.
const { ShipmentAlert, Shipment } = require('../models');
const { createNotification } = require('../lib/helpers');
const {
  loadRules, evaluateDelay, evaluateVerification, planAlertActions, canActOnAlert, OPEN_STATES,
} = require('../lib/shipmentRules');

const RECHECK_MS = 60 * 1000;
const participantIds = (s) => [s.farmerId, s.buyerId, s.transporterId].filter(Boolean).map(String);
const short = (text, n = 280) => (String(text).length > n ? `${String(text).slice(0, n - 1)}…` : String(text));

async function notify(shipment, alert, prefix) {
  const message = `${prefix} [${String(alert.severity).toUpperCase()}] Shipment ${shipment.shipmentCode}: ${short(alert.reason)}`;
  await Promise.all(participantIds(shipment).map((id) => createNotification(id, message, 'alert')));
}

// extraFindings: damage / quantity findings produced by an action that just happened.
async function evaluateAlerts(shipment, { extraFindings = [], now = new Date(), force = false, env = process.env } = {}) {
  if (!force && !extraFindings.length && shipment.alertsEvaluatedAt && now - new Date(shipment.alertsEvaluatedAt) < RECHECK_MS) return { skipped: true };
  const rules = loadRules(env);
  const delivered = Boolean(shipment.deliveredAt);

  const findings = [...extraFindings];
  if (!delivered) findings.push(...evaluateDelay(shipment, now, rules));
  const locked = shipment.delivery && shipment.delivery.lockedUntil && new Date(shipment.delivery.lockedUntil) > now;
  if (!delivered) {
    findings.push(...evaluateVerification({ failedAttempts: (shipment.delivery && shipment.delivery.failedAttemptsTotal) || 0, locked: Boolean(locked) }, rules));
  }

  const existing = await ShipmentAlert.find({ shipmentId: shipment._id }).lean();
  const plan = planAlertActions({
    shipmentCode: shipment.shipmentCode, existing, findings, evaluatedTypes: ['delay', 'verification_failed'], now, rules,
  });

  const created = [];
  for (const finding of plan.create) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const alert = await ShipmentAlert.create({
        shipmentId: shipment._id, shipmentCode: shipment.shipmentCode, type: finding.type, severity: finding.severity,
        rule: finding.rule, reason: finding.reason, details: finding.details, dedupeKey: finding.dedupeKey,
        status: 'open', isOpen: true, raisedBy: 'system', history: [],
      });
      created.push(alert);
      // eslint-disable-next-line no-await-in-loop
      await notify(shipment, alert, 'New alert:');
      // eslint-disable-next-line no-await-in-loop
      await Shipment.updateOne({ _id: shipment._id }, {
        $push: { events: { type: 'alert_raised', at: now, byRole: 'system', byName: 'AgriTrade', note: short(finding.reason, 200), data: { alertId: String(alert._id), alertType: finding.type, severity: finding.severity } } },
      });
    } catch (err) {
      if (err && err.code === 11000) continue; // a parallel request raised the same alert first: exactly what the unique index is for
      throw err;
    }
  }

  for (const esc of plan.escalate) {
    // eslint-disable-next-line no-await-in-loop
    const alert = await ShipmentAlert.findByIdAndUpdate(esc.alertId, {
      $set: { severity: esc.severity, reason: esc.reason, details: esc.details },
      $push: { history: { at: now, byRole: 'system', byName: 'AgriTrade', action: 'escalated', text: `Severity raised to ${esc.severity}.` } },
    }, { new: true });
    // eslint-disable-next-line no-await-in-loop
    if (alert) await notify(shipment, alert, 'Escalated:');
  }

  for (const done of plan.autoResolve) {
    // eslint-disable-next-line no-await-in-loop
    await ShipmentAlert.updateOne({ _id: done.alertId, isOpen: true }, {
      $set: { status: 'resolved', isOpen: false, resolvedAt: now, resolvedByRole: 'system', resolutionNote: done.why },
      $push: { history: { at: now, byRole: 'system', byName: 'AgriTrade', action: 'auto_resolved', text: done.why } },
    });
  }

  await Shipment.updateOne({ _id: shipment._id }, { $set: { alertsEvaluatedAt: now } });
  shipment.alertsEvaluatedAt = now;
  return { created: created.length, escalated: plan.escalate.length, autoResolved: plan.autoResolve.length, suppressed: plan.suppressed.length };
}

// ---- people acting on alerts ------------------------------------------------------------------------
const publicAlert = (a) => ({
  id: String(a._id), shipmentId: a.shipmentCode, type: a.type, severity: a.severity, status: a.status,
  reason: a.reason, rule: a.rule, details: a.details, raisedAt: a.createdAt, raisedBy: a.raisedBy,
  resolvedAt: a.resolvedAt || null, resolutionNote: a.resolutionNote || null,
  history: (a.history || []).map((h) => ({ at: h.at, byRole: h.byRole, byName: h.byName, action: h.action, text: h.text })),
});

// action: 'acknowledge' | 'investigate' | 'resolve'.  Returns { ok, status, message, alert }.
async function actOnAlert(alert, shipment, actor, roles, action, text, now = new Date()) {
  if (!canActOnAlert(alert.type, action, roles)) {
    return { ok: false, status: 403, code: 'not_permitted', message: action === 'resolve' ? 'Your role cannot resolve this kind of alert' : 'You cannot act on this alert' };
  }
  if (!OPEN_STATES.has(alert.status)) return { ok: false, status: 409, code: 'already_resolved', message: 'This alert is already resolved' };
  const note = String(text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 500);
  const byRole = roles.includes('admin') ? 'admin' : roles.find((r) => canActOnAlert(alert.type, action, [r])) || roles[0];
  const entry = { at: now, byUserId: actor.id, byRole, byName: actor.name };

  if (action === 'resolve') {
    if (note.length < 5) return { ok: false, status: 400, code: 'note_required', message: 'Please write how this was resolved (at least a few words)' };
    const updated = await ShipmentAlert.findOneAndUpdate({ _id: alert._id, isOpen: true }, {
      $set: { status: 'resolved', isOpen: false, resolvedAt: now, resolvedByRole: byRole, resolutionNote: note },
      $push: { history: { ...entry, action: 'resolved', text: note } },
    }, { new: true });
    if (!updated) return { ok: false, status: 409, code: 'already_resolved', message: 'This alert is already resolved' };
    return { ok: true, alert: updated };
  }
  if (action === 'investigate' && note.length < 3) return { ok: false, status: 400, code: 'note_required', message: 'Say what you are investigating or what you found' };
  const nextStatus = action === 'acknowledge' ? (alert.status === 'open' ? 'acknowledged' : alert.status) : 'investigating';
  const updated = await ShipmentAlert.findOneAndUpdate({ _id: alert._id, isOpen: true }, {
    $set: { status: nextStatus },
    $push: { history: { ...entry, action: action === 'acknowledge' ? 'acknowledged' : 'investigating', text: note || null } },
  }, { new: true });
  if (!updated) return { ok: false, status: 409, code: 'already_resolved', message: 'This alert is already resolved' };
  return { ok: true, alert: updated };
}

module.exports = { evaluateAlerts, actOnAlert, publicAlert, RECHECK_MS };
