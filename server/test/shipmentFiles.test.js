const {
  detectImageType, validatePhoto, safeFileName, sanitizeText, canUploadKind, newPhotoId, maxPhotoBytes, KINDS,
} = require('../lib/shipmentFiles');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(32, 1)]);

describe('detecting the real type from the bytes', () => {
  test('jpeg, png and webp are recognised', () => {
    expect(detectImageType(JPEG)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(detectImageType(PNG)).toEqual({ mime: 'image/png', ext: 'png' });
    expect(detectImageType(WEBP)).toEqual({ mime: 'image/webp', ext: 'webp' });
  });
  test('everything else is not an image', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from('<?php echo 1; ?> plus some padding bytes'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a......padding'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType('not a buffer')).toBeNull();
  });
});

describe('validatePhoto', () => {
  test('a good photo passes and gets a checksum', () => {
    const r = validatePhoto(JPEG, 'image/jpeg');
    expect(r.ok).toBe(true);
    expect(r.ext).toBe('jpg');
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  test('"image/jpg" and content-type parameters are tolerated', () => {
    expect(validatePhoto(JPEG, 'image/jpg').ok).toBe(true);
    expect(validatePhoto(PNG, 'image/png; charset=binary').ok).toBe(true);
  });
  test('a script renamed to .jpg is rejected because the bytes decide, not the name or the header', () => {
    const r = validatePhoto(Buffer.from('<script>alert(1)</script> padding padding'), 'image/jpeg');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(415);
  });
  test('content that does not match the declared type is rejected', () => {
    expect(validatePhoto(PNG, 'image/jpeg').status).toBe(415);
  });
  test('too large: 413', () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(3 * 1024 * 1024)]);
    expect(validatePhoto(big, 'image/jpeg').status).toBe(413);
  });
  test('the size limit is configurable', () => {
    expect(maxPhotoBytes({ SHIPMENT_PHOTO_MAX_BYTES: '1000' })).toBe(1000);
    expect(validatePhoto(JPEG, 'image/jpeg', { maxBytes: 50 }).status).toBe(413);
  });
  test('an empty body: 400', () => {
    expect(validatePhoto(Buffer.alloc(0), 'image/jpeg').status).toBe(400);
    expect(validatePhoto(undefined, 'image/jpeg').status).toBe(400);
  });
});

describe('names and text', () => {
  test('stored names are built from our own data only', () => {
    expect(safeFileName('SHP-20261030-ABCDEFGH', 'damage', 'aB3_-x', 'jpg')).toBe('SHP-20261030-ABCDEFGH-damage-aB3_-x.jpg');
  });
  test('path tricks cannot get into a name', () => {
    const name = safeFileName('../../etc', 'pass/wd', '..\\..\\x', 'j/pg');
    expect(name).not.toMatch(/[\\/.]{2}|\//);
    expect(name).toBe('etc-passwd-x.jpg');
  });
  test('photo ids are random and URL-safe', () => {
    const ids = new Set(Array.from({ length: 500 }, newPhotoId));
    expect(ids.size).toBe(500);
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/));
  });
  test('captions lose control characters and are capped', () => {
    expect(sanitizeText('a\u0000b\u0007c   d\te')).toBe('abc d e');
    expect(sanitizeText('x'.repeat(1000), 300)).toHaveLength(300);
    expect(sanitizeText(null)).toBe('');
  });
});

describe('who may upload which kind', () => {
  test('the buyer takes delivery photos but not pickup photos', () => {
    expect(canUploadKind('delivery', ['buyer'])).toBe(true);
    expect(canUploadKind('pickup', ['buyer'])).toBe(false);
  });
  test('anyone on the shipment can upload damage evidence; a stranger cannot upload anything', () => {
    for (const role of ['farmer', 'buyer', 'carrier', 'admin']) expect(canUploadKind('damage', [role])).toBe(true);
    for (const kind of KINDS) expect(canUploadKind(kind, [])).toBe(false);
  });
  test('unknown kinds are refused', () => {
    expect(canUploadKind('selfie', ['admin'])).toBe(false);
  });
});
