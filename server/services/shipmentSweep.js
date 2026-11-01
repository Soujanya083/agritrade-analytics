// services/shipmentSweep.js - periodic re-check of active shipments for delay alerts.
// ALERT_SWEEP_INTERVAL_MINUTES (default 10; 0 turns the timer off). Safe to run on several servers at once:
// the unique index on open alerts means a second instance cannot create a duplicate.
const { Shipment } = require('../models');
const { evaluateAlerts } = require('./shipmentAlerts');

const ACTIVE = ['ready_for_pickup', 'picked_up', 'in_transit', 'delayed', 'out_for_delivery', 'delivery_failed'];

async function sweepOnce({ now = new Date(), limit = 200 } = {}) {
  const shipments = await Shipment.find({ status: { $in: ACTIVE } }).sort({ alertsEvaluatedAt: 1 }).limit(limit);
  let checked = 0;
  for (const shipment of shipments) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await evaluateAlerts(shipment, { now, force: true });
      checked += 1;
    } catch (err) {
      console.error('Shipment sweep failed for one shipment:', err && err.message);
    }
  }
  return { checked };
}

let timer = null;
function start(env = process.env) {
  const minutes = Number(env.ALERT_SWEEP_INTERVAL_MINUTES ?? 10);
  if (!Number.isFinite(minutes) || minutes <= 0 || timer) return null;
  timer = setInterval(() => { sweepOnce().catch((e) => console.error('Shipment sweep error:', e && e.message)); }, minutes * 60000);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { sweepOnce, start };
