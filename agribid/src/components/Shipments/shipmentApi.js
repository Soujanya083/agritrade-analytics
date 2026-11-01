// shipmentApi.js - the browser's client for the shipment endpoints.
// Every call goes through authFetch (in-memory access token, silent refresh). The fetch function is injectable
// so the client can be tested without a network.
import { API_BASE, authFetch } from '../../api/session';

export class ShipmentApiError extends Error {
  constructor(status, body = {}) {
    super(body.message || `Request failed (${status})`);
    this.name = 'ShipmentApiError';
    this.status = status;
    this.code = body.code || null;
    this.retryAfterSeconds = body.retryAfterSeconds || null;
    this.attemptsRemaining = body.attemptsRemaining ?? null;
  }
}

const toQuery = (query = {}) => {
  const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : '';
};
const enc = encodeURIComponent;

export function createShipmentApi({ fetchImpl = (url, options) => authFetch(url, options), base = API_BASE } = {}) {
  async function send(path, { method = 'GET', json, body, headers = {}, query } = {}) {
    const response = await fetchImpl(`${base}${path}${toQuery(query)}`, {
      method,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    return response;
  }

  async function call(path, options) {
    const response = await send(path, options);
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (!response.ok) throw new ShipmentApiError(response.status, data || {});
    return data;
  }

  return {
    listShipments: (query) => call('/shipments', { query }),
    getShipment: (code) => call(`/shipments/${enc(code)}`).then((d) => d.shipment),
    getByTransaction: (transactionId) => call(`/shipments/by-transaction/${enc(transactionId)}`).then((d) => d.shipment),
    getQr: (code) => call(`/shipments/${enc(code)}/qr`),
    updateStatus: (code, { status, note, location, expectedDeliveryAt }) => call(`/shipments/${enc(code)}/status`, { method: 'POST', json: { status, note, location, expectedDeliveryAt } }),
    addCheckpoint: (code, { note, location }) => call(`/shipments/${enc(code)}/checkpoints`, { method: 'POST', json: { note, location } }),
    assignCarrier: (code, transporterEmail) => call(`/shipments/${enc(code)}/carrier`, { method: 'PUT', json: { transporterEmail } }),
    removeCarrier: (code) => call(`/shipments/${enc(code)}/carrier`, { method: 'PUT', json: { clear: true } }),
    requestDeliveryCode: (code) => call(`/shipments/${enc(code)}/delivery-code`, { method: 'POST', json: {} }),
    confirmDelivery: (code, { otp, receivedQuantityKg, condition, damagedQuantityKg, note }) => call(`/shipments/${enc(code)}/confirm-delivery`, { method: 'POST', json: { otp, receivedQuantityKg, condition, damagedQuantityKg, note } }),
    reportIssue: (code, { kind, description, affectedQuantityKg }) => call(`/shipments/${enc(code)}/issues`, { method: 'POST', json: { kind, description, affectedQuantityKg } }),
    // the photo travels as the raw request body; its type is the Content-Type
    uploadPhoto: (code, { kind, caption, file }) => call(`/shipments/${enc(code)}/photos`, { method: 'POST', query: { kind, caption }, body: file, headers: { 'Content-Type': file.type } }),
    async photoBlob(code, photoId) {
      const response = await send(`/shipments/${enc(code)}/photos/${enc(photoId)}`);
      if (!response.ok) throw new ShipmentApiError(response.status, {});
      return response.blob();
    },
    listAlerts: (query) => call('/shipment-alerts', { query }).then((d) => d.alerts),
    alertAction: (alertId, action, note) => call(`/shipment-alerts/${enc(alertId)}/${enc(action)}`, { method: 'POST', json: { note } }),
  };
}

export const shipmentApi = createShipmentApi();
