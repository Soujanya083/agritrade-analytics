const { generateShipmentCode, isValidShipmentCode, normalizeShipmentCode, ALPHABET } = require('../lib/shipmentIds');

describe('shipment codes', () => {
  test('format: SHP-YYYYMMDD-8 unambiguous characters', () => {
    const code = generateShipmentCode(new Date('2026-10-30T12:00:00Z'));
    expect(code).toMatch(/^SHP-20261030-[A-HJKMNP-Z2-9]{8}$/);
    expect(isValidShipmentCode(code)).toBe(true);
  });
  test('the alphabet has no look-alike characters', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) expect(ALPHABET.includes(bad)).toBe(false);
  });
  test('20,000 codes generated on one day are all different', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    const seen = new Set();
    for (let i = 0; i < 20000; i += 1) seen.add(generateShipmentCode(now));
    expect(seen.size).toBe(20000);
  });
  test('malformed or hostile input is not a valid code', () => {
    for (const bad of ['', 'SHP-1', 'shp-20261030-ABCDEFGH', 'SHP-20261030-ABCDEFG0', "SHP-20261030-ABCDEFGH'; DROP", null, undefined, 42, { $ne: 1 }]) {
      expect(isValidShipmentCode(bad)).toBe(false);
    }
  });
  test('normalizing makes a hand-typed lowercase code usable', () => {
    expect(normalizeShipmentCode(' shp-20261030-abcdefgh ')).toBe('SHP-20261030-ABCDEFGH');
  });
});
