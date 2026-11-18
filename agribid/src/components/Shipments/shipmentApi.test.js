import { createShipmentApi, ShipmentApiError } from './shipmentApi';

const reply = (status, body, extra = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => ({ size: 3, type: 'image/jpeg' }), ...extra });
const make = (responder) => {
  const calls = [];
  const fetchImpl = jest.fn(async (url, options) => { calls.push({ url, options }); return responder(url, options); });
  return { api: createShipmentApi({ fetchImpl, base: 'http://api/api' }), calls, fetchImpl };
};

describe('shipment api client', () => {
  test('reads a shipment by code (the code is URL-encoded)', async () => {
    const { api, calls } = make(() => reply(200, { shipment: { shipmentId: 'SHP-1', status: 'created' } }));
    const s = await api.getShipment('SHP-1');
    expect(s.status).toBe('created');
    expect(calls[0].url).toBe('http://api/api/shipments/SHP-1');
    expect(calls[0].options.method).toBe('GET');
    const { api: api2, calls: calls2 } = make(() => reply(200, { shipment: {} }));
    await api2.getShipment('a/b?c');
    expect(calls2[0].url).toBe('http://api/api/shipments/a%2Fb%3Fc');
  });
  test('lists with a query string, dropping empty values', async () => {
    const { api, calls } = make(() => reply(200, { shipments: [] }));
    await api.listShipments({ status: 'in_transit', page: 2, active: undefined, q: '' });
    expect(calls[0].url).toBe('http://api/api/shipments?status=in_transit&page=2');
  });
  test('a status update is a JSON POST', async () => {
    const { api, calls } = make(() => reply(200, { shipment: {} }));
    await api.updateStatus('SHP-1', { status: 'delayed', note: 'Rain', location: { source: 'manual', label: 'Hosur' } });
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0].options.body)).toMatchObject({ status: 'delayed', note: 'Rain', location: { source: 'manual', label: 'Hosur' } });
  });
  test('confirming delivery sends the code, quantity and condition', async () => {
    const { api, calls } = make(() => reply(200, { shipment: {} }));
    await api.confirmDelivery('SHP-1', { otp: '123456', receivedQuantityKg: 98, condition: 'ok' });
    expect(calls[0].url).toBe('http://api/api/shipments/SHP-1/confirm-delivery');
    expect(JSON.parse(calls[0].options.body)).toMatchObject({ otp: '123456', receivedQuantityKg: 98, condition: 'ok' });
  });
  test('a photo goes up as the raw body with its own content type and the kind in the query', async () => {
    const { api, calls } = make(() => reply(201, { photo: { photoId: 'x' } }));
    const file = { type: 'image/jpeg', size: 10 };
    await api.uploadPhoto('SHP-1', { kind: 'damage', caption: 'Crate 3', file });
    expect(calls[0].url).toBe('http://api/api/shipments/SHP-1/photos?kind=damage&caption=Crate+3');
    expect(calls[0].options.body).toBe(file);
    expect(calls[0].options.headers['Content-Type']).toBe('image/jpeg');
  });
  test('alerts: list and act', async () => {
    const { api, calls } = make((url) => (url.includes('/shipment-alerts?') ? reply(200, { alerts: [{ id: 'a' }] }) : reply(200, { alert: { id: 'a', status: 'resolved' } })));
    expect(await api.listAlerts({ open: 'true' })).toEqual([{ id: 'a' }]);
    await api.alertAction('a1', 'resolve', 'Refund agreed');
    expect(calls[1].url).toBe('http://api/api/shipment-alerts/a1/resolve');
    expect(JSON.parse(calls[1].options.body)).toEqual({ note: 'Refund agreed' });
  });
  test('errors keep the server\'s message, code and retry information', async () => {
    const { api } = make(() => reply(400, { message: 'That code is not correct.', code: 'otp_invalid', attemptsRemaining: 3 }));
    await expect(api.confirmDelivery('SHP-1', { otp: '000000', receivedQuantityKg: 1 })).rejects.toMatchObject({ status: 400, code: 'otp_invalid', attemptsRemaining: 3, message: 'That code is not correct.' });
    const { api: api2 } = make(() => reply(423, { message: 'Locked', code: 'otp_locked', retryAfterSeconds: 600 }));
    await expect(api2.requestDeliveryCode('SHP-1')).rejects.toMatchObject({ status: 423, retryAfterSeconds: 600 });
  });
  test('a response that is not JSON still becomes a readable error', async () => {
    const { api } = make(() => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    const err = await api.getShipment('SHP-1').catch((e) => e);
    expect(err).toBeInstanceOf(ShipmentApiError);
    expect(err.message).toBe('Request failed (502)');
  });
  test('a photo download returns the bytes, or an error for a missing photo', async () => {
    const { api } = make(() => reply(200, {}));
    expect((await api.photoBlob('SHP-1', 'p1')).type).toBe('image/jpeg');
    const { api: api2 } = make(() => reply(404, {}));
    await expect(api2.photoBlob('SHP-1', 'p1')).rejects.toMatchObject({ status: 404 });
  });
});
