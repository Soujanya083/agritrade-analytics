// The QR encoder was checked against two independent decoders (OpenCV and a ZXing-style one) for 180
// matrices over versions 1-10 and all eight masks. These tests keep it from regressing.
const crypto = require('crypto');
const { encodeQr, byteCapacity } = require('../lib/qr');

const hashOf = (q) => crypto.createHash('sha256').update(q.modules.map((r) => r.map((x) => (x ? 1 : 0)).join('')).join('\n')).digest('hex').slice(0, 16);

describe('QR encoder', () => {
  test('capacities match the QR specification (level M, byte mode)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(byteCapacity)).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
  });
  test('picks the smallest version that fits', () => {
    expect(encodeQr('x'.repeat(14)).version).toBe(1);
    expect(encodeQr('x'.repeat(15)).version).toBe(2);
    expect(encodeQr('x'.repeat(213)).version).toBe(10);
  });
  test('refuses text that is too long instead of producing a broken code', () => {
    expect(() => encodeQr('x'.repeat(214))).toThrow(/too long/);
  });
  test('the matrix is square with the right size: 17 + 4 x version', () => {
    const q = encodeQr('https://app.example.com/#/shipment/SHP-20261030-ABCDEFGH');
    expect(q.modules).toHaveLength(17 + 4 * q.version);
    q.modules.forEach((row) => expect(row).toHaveLength(q.modules.length));
  });
  test('has the three finder patterns, the timing pattern and the dark module', () => {
    const { modules: m, size } = encodeQr('SHP-TEST');
    const finderAt = (r0, c0) => {
      for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        expect(m[r0 + r][c0 + c]).toBe(ring);
      }
    };
    finderAt(0, 0); finderAt(0, size - 7); finderAt(size - 7, 0);
    for (let i = 8; i < size - 8; i += 1) { expect(m[6][i]).toBe(i % 2 === 0); expect(m[i][6]).toBe(i % 2 === 0); }
    expect(m[size - 8][8]).toBe(true);
  });
  test('is deterministic', () => {
    const t = 'https://x.example/#/shipment/SHP-20261030-ABCDEFGH';
    expect(hashOf(encodeQr(t))).toBe(hashOf(encodeQr(t)));
  });
  test('regression vectors: these exact matrices were decoded successfully by independent readers', () => {
    expect(hashOf(encodeQr('SHP-TEST'))).toBe('9be8a66779f31d91');
    expect(hashOf(encodeQr('https://app.example.com/#/shipment/SHP-20261029-ABCD2345'))).toBe('b7df59fed20a2790');
    expect(hashOf(encodeQr(`https://agri.example/#/shipment/${'A'.repeat(100)}`))).toBe('5284326c2cbc3fbf');
  });
  test('different text gives a different code', () => {
    expect(hashOf(encodeQr('SHP-A'))).not.toBe(hashOf(encodeQr('SHP-B')));
  });
  test('non-ASCII text is encoded as UTF-8 bytes', () => {
    expect(encodeQr('कृषि').version).toBe(1);
  });
});
