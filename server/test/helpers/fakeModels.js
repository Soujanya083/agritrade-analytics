// test/helpers/fakeModels.js - a small in-memory stand-in for the Mongoose models, enough to run the shipment
// service end to end WITHOUT a database. It understands the query and update operators the service uses
// ($set, $inc, $push/$each, $or, $ne, $lte, $in, dotted paths). It is NOT Mongoose: the MongoDB-backed tests
// (shipments-api.test.js) remain the real check. Its job is to catch logic and wiring mistakes quickly.
let counter = 0;
const newId = () => { counter += 1; return counter.toString(16).padStart(24, '0'); };

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { if (o[k] === undefined || o[k] === null) o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = value;
}
const same = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : String(a) === String(b));

function matchValue(actual, cond) {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, v]) => {
      if (op === '$ne') return !(actual !== undefined && actual !== null ? same(actual, v) : v === null);
      if (op === '$lte') return actual !== undefined && actual !== null && new Date(actual) <= new Date(v);
      if (op === '$gte') return actual !== undefined && actual !== null && new Date(actual) >= new Date(v);
      if (op === '$gt') return actual !== undefined && actual !== null && new Date(actual) > new Date(v);
      if (op === '$in') return v.some((x) => (actual === undefined || actual === null ? x === null : same(actual, x)));
      if (op === '$nin') return !v.some((x) => same(actual, x));
      throw new Error(`fakeModels: unsupported operator ${op}`);
    });
  }
  if (cond === null) return actual === null || actual === undefined;
  return actual !== undefined && actual !== null && same(actual, cond);
}
function matches(data, filter) {
  return Object.entries(filter || {}).every(([k, cond]) => {
    if (k === '$or') return cond.some((f) => matches(data, f));
    return matchValue(getPath(data, k), cond);
  });
}
function applyUpdate(data, update) {
  Object.entries(update.$set || {}).forEach(([p, v]) => setPath(data, p, v));
  Object.entries(update.$inc || {}).forEach(([p, v]) => setPath(data, p, (getPath(data, p) || 0) + v));
  Object.entries(update.$push || {}).forEach(([p, v]) => {
    const arr = getPath(data, p) || [];
    const items = v && v.$each ? v.$each : [v];
    items.forEach((item) => arr.push({ ...item, _id: item._id || newId() }));
    setPath(data, p, arr);
  });
}
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) ? new Date(v) : v)));

function makeModel(name, defaults = () => ({}), arrays = []) {
  const rows = [];
  // A document is a SNAPSHOT of the stored row (as in Mongoose): later updateOne/findOneAndUpdate calls do not change
  // an already loaded document, and save() writes back only what this document changed.
  const wrap = (data) => {
    if (!data) return null;
    const local = clone(data);
    const snapshot = clone(data);
    const doc = new Proxy({ _data: local }, {
      get(t, k) {
        if (k === 'toObject' || k === 'toJSON') return () => clone(local);
        if (k === 'set') return (p, v) => { if (typeof p === 'object') Object.entries(p).forEach(([a, b]) => setPath(local, a, b)); else setPath(local, p, v); };
        if (k === 'save') {
          return async () => {
            Object.keys(local).forEach((key) => {
              if (JSON.stringify(local[key]) === JSON.stringify(snapshot[key])) return;
              if (Array.isArray(local[key]) && Array.isArray(data[key])) {
                const known = new Set(snapshot[key].map((x) => String(x._id)));
                local[key].filter((x) => !known.has(String(x._id))).forEach((x) => data[key].push({ ...x, _id: x._id || newId() }));
              } else {
                data[key] = clone(local[key]);
              }
            });
            return doc;
          };
        }
        if (k === 'populate') return () => doc;
        if (typeof k === 'symbol' || k === 'then') return undefined;
        return local[k];
      },
      set(t, k, v) { local[k] = v; return true; },
    });
    return doc;
  };
  class Query {
    constructor(list) { this.list = list; this.fields = null; }
    sort(spec) { const [[f, d]] = Object.entries(spec); this.list = [...this.list].sort((a, b) => (new Date(getPath(a, f)) - new Date(getPath(b, f))) * (d < 0 ? -1 : 1)); return this; }
    skip(n) { this.list = this.list.slice(n); return this; }
    limit(n) { this.list = this.list.slice(0, n); return this; }
    select() { return this; }
    populate() { return this; }
    lean() { this.isLean = true; return this; }
    then(res, rej) { return Promise.resolve(this.isLean ? this.list.map(clone) : this.list.map(wrap)).then(res, rej); }
  }
  const Model = {
    name, rows,
    async create(input) {
      const data = { _id: newId(), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...clone(input) };
      arrays.forEach((a) => { if (!data[a]) data[a] = []; });
      (data.events || []).forEach((e) => { if (!e._id) e._id = newId(); });
      if (name === 'Shipment' && rows.some((r) => r.shipmentCode === data.shipmentCode || String(r.transactionId) === String(data.transactionId))) { const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; }
      if (name === 'ShipmentAlert' && data.isOpen && rows.some((r) => r.isOpen && r.dedupeKey === data.dedupeKey)) { const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; }
      rows.push(data);
      return wrap(data);
    },
    findOne(filter) { const f = rows.find((r) => matches(r, filter)); const p = Promise.resolve(wrap(f)); p.select = () => p; p.lean = async () => (f ? clone(f) : null); p.populate = () => p; return p; },
    findById(id) { return Model.findOne({ _id: id }); },
    find(filter) { return new Query(rows.filter((r) => matches(r, filter))); },
    async countDocuments(filter) { return rows.filter((r) => matches(r, filter)).length; },
    async findOneAndUpdate(filter, update, opts = {}) {
      const f = rows.find((r) => matches(r, filter));
      if (!f) return null;
      const before = clone(f);
      applyUpdate(f, update);
      return wrap(opts.new ? f : before);
    },
    async findByIdAndUpdate(id, update, opts) { return update.$set || update.$push || update.$inc ? Model.findOneAndUpdate({ _id: id }, update, opts) : Model.findOneAndUpdate({ _id: id }, { $set: update }, opts); },
    async updateOne(filter, update) { const f = rows.find((r) => matches(r, filter)); if (f) applyUpdate(f, update); return { modifiedCount: f ? 1 : 0 }; },
    async updateMany(filter, update) { const hit = rows.filter((r) => matches(r, filter)); hit.forEach((f) => applyUpdate(f, update)); return { modifiedCount: hit.length }; },
  };
  return Model;
}

function build() {
  const delivery = () => ({ delivery: { otpHash: null, otpExpiresAt: null, attempts: 0, failedAttemptsTotal: 0, lockedUntil: null, issueCount: 0, lastIssuedAt: null, channel: null, confirmedAt: null, receivedQuantityKg: null, condition: null } });
  return {
    User: makeModel('User'),
    Crop: makeModel('Crop'),
    Bid: makeModel('Bid'),
    Transaction: makeModel('Transaction', () => ({ deliveryDisputed: false })),
    Notification: makeModel('Notification'),
    RefreshToken: makeModel('RefreshToken'),
    Shipment: makeModel('Shipment', () => ({ ...delivery(), deliveryAttempts: 0, photoCount: 0, transporterId: null, statusBeforeIncident: null, status: 'created', lastEventAt: new Date(), statusUpdatedAt: new Date() }), ['events']),
    ShipmentPhoto: makeModel('ShipmentPhoto'),
    ShipmentAlert: makeModel('ShipmentAlert', () => ({ status: 'open', isOpen: true, history: [] }), ['history']),
  };
}

module.exports = { build, matches, applyUpdate };
