const { isShipmentAdmin, actorRoles, capabilities } = require('../lib/shipmentAccess');

const shipment = (extra = {}) => ({ status: 'in_transit', farmerId: 'F1', buyerId: 'B1', transporterId: null, ...extra });

describe('roles on a shipment', () => {
  test('the farmer is also the carrier when no transporter is assigned', () => {
    expect(actorRoles({ id: 'F1' }, shipment())).toEqual(['farmer', 'carrier']);
  });
  test('with a transporter assigned, the farmer is only the farmer', () => {
    expect(actorRoles({ id: 'F1' }, shipment({ transporterId: 'T1' }))).toEqual(['farmer']);
    expect(actorRoles({ id: 'T1' }, shipment({ transporterId: 'T1' }))).toEqual(['carrier']);
  });
  test('the buyer', () => {
    expect(actorRoles({ id: 'B1' }, shipment())).toEqual(['buyer']);
  });
  test('a stranger has no role at all (so no access)', () => {
    expect(actorRoles({ id: 'X9' }, shipment())).toEqual([]);
    expect(actorRoles({}, shipment())).toEqual([]);
    expect(actorRoles(null, shipment())).toEqual([]);
  });
  test('works with populated documents and ObjectId-like values', () => {
    const oid = { toString: () => 'F1' };
    expect(actorRoles({ id: 'F1' }, shipment({ farmerId: { _id: oid } }))).toContain('farmer');
  });
  test('an admin gets the admin role in addition', () => {
    expect(actorRoles({ id: 'A1' }, shipment(), { admin: true })).toEqual(['admin']);
  });
});

describe('admins come from configuration', () => {
  test('SHIPMENT_ADMIN_EMAILS, case-insensitive', () => {
    const env = { SHIPMENT_ADMIN_EMAILS: ' Ops@Example.com , lead@example.com' };
    expect(isShipmentAdmin('ops@example.com', env)).toBe(true);
    expect(isShipmentAdmin('LEAD@example.com', env)).toBe(true);
    expect(isShipmentAdmin('farmer@example.com', env)).toBe(false);
  });
  test('nobody is admin by default', () => {
    expect(isShipmentAdmin('ops@example.com', {})).toBe(false);
    expect(isShipmentAdmin('', { SHIPMENT_ADMIN_EMAILS: ',' })).toBe(false);
  });
});

describe('capabilities', () => {
  test('a stranger can do nothing', () => {
    const c = capabilities(shipment(), []);
    expect(Object.values(c).every((v) => v === false)).toBe(true);
  });
  test('only the buyer can confirm delivery, and only when out for delivery', () => {
    expect(capabilities(shipment({ status: 'out_for_delivery' }), ['buyer']).canConfirmDelivery).toBe(true);
    expect(capabilities(shipment({ status: 'in_transit' }), ['buyer']).canConfirmDelivery).toBe(false);
    expect(capabilities(shipment({ status: 'out_for_delivery' }), ['carrier']).canConfirmDelivery).toBe(false);
    expect(capabilities(shipment({ status: 'out_for_delivery' }), ['farmer']).canConfirmDelivery).toBe(false);
  });
  test('the carrier can record checkpoints only while moving', () => {
    expect(capabilities(shipment({ status: 'in_transit' }), ['carrier']).canRecordCheckpoint).toBe(true);
    expect(capabilities(shipment({ status: 'created' }), ['carrier']).canRecordCheckpoint).toBe(false);
    expect(capabilities(shipment({ status: 'in_transit' }), ['buyer']).canRecordCheckpoint).toBe(false);
  });
  test('the farmer can assign a carrier before delivery, not after', () => {
    expect(capabilities(shipment({ status: 'created' }), ['farmer']).canAssignCarrier).toBe(true);
    expect(capabilities(shipment({ status: 'delivered', deliveredAt: new Date() }), ['farmer']).canAssignCarrier).toBe(false);
    expect(capabilities(shipment({ status: 'created' }), ['buyer']).canAssignCarrier).toBe(false);
  });
});
