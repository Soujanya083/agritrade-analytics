import { fitWithin, validateImageFile, todayIso, MAX_INPUT_BYTES } from './imageTools';

describe('fitWithin', () => {
  test('scales the longest side down to the limit, keeping aspect ratio', () => {
    expect(fitWithin(4000, 3000, 900)).toEqual({ width: 900, height: 675 });
    expect(fitWithin(3000, 4000, 900)).toEqual({ width: 675, height: 900 });
  });
  test('never upscales small images', () => {
    expect(fitWithin(300, 200, 900)).toEqual({ width: 300, height: 200 });
  });
  test('never returns zero', () => {
    expect(fitWithin(10000, 1, 900).height).toBe(1);
  });
});

describe('validateImageFile', () => {
  test('accepts jpeg/png/webp', () => {
    ['image/jpeg', 'image/png', 'image/webp'].forEach((type) => expect(validateImageFile({ type, size: 1000 })).toBeNull());
  });
  test('rejects other types and oversize files', () => {
    expect(validateImageFile({ type: 'image/gif', size: 10 })).toMatch(/JPEG, PNG or WebP/);
    expect(validateImageFile({ type: 'application/pdf', size: 10 })).toMatch(/JPEG, PNG or WebP/);
    expect(validateImageFile({ type: 'image/png', size: MAX_INPUT_BYTES + 1 })).toMatch(/too large/);
    expect(validateImageFile(null)).toMatch(/No file/);
  });
});

describe('todayIso', () => {
  test('is yyyy-mm-dd, zero padded, regardless of locale', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 9, 25))).toBe('2026-10-25');
  });
});
