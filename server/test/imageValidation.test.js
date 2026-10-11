const { normalizeImageInput, MAX_IMAGE_BYTES } = require('../services/imageValidation');

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dataUri = (mime, head, totalBytes = 64) => {
  const body = Buffer.concat([head, Buffer.alloc(Math.max(0, totalBytes - head.length), 1)]);
  return `data:${mime};base64,${body.toString('base64')}`;
};
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_HEAD = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);

describe('normalizeImageInput', () => {
  test('empty input is fine and means "no photo"', () => {
    expect(normalizeImageInput(undefined)).toEqual({ ok: true, imageUrl: null });
    expect(normalizeImageInput(null)).toEqual({ ok: true, imageUrl: null });
    expect(normalizeImageInput('')).toEqual({ ok: true, imageUrl: null });
  });
  test('legacy SVG placeholder data-URIs are ignored, not stored', () => {
    const svg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;
    expect(normalizeImageInput(svg)).toMatchObject({ ok: true, imageUrl: null, ignored: 'svg-placeholder' });
  });
  test('accepts real PNG, JPEG and WebP data URIs', () => {
    expect(normalizeImageInput(dataUri('image/png', PNG_HEAD)).ok).toBe(true);
    expect(normalizeImageInput(dataUri('image/jpeg', JPEG_HEAD)).ok).toBe(true);
    expect(normalizeImageInput(dataUri('image/webp', WEBP_HEAD)).ok).toBe(true);
  });
  test('rejects content that is not really the claimed type', () => {
    const fake = dataUri('image/png', Buffer.from('<script>alert(1)</script>'));
    expect(normalizeImageInput(fake)).toMatchObject({ ok: false, message: expect.stringMatching(/does not match/i) });
  });
  test('rejects oversized images', () => {
    const big = dataUri('image/png', PNG_HEAD, MAX_IMAGE_BYTES + 1024);
    expect(normalizeImageInput(big)).toMatchObject({ ok: false, message: expect.stringMatching(/too large/i) });
  });
  test('rejects other data types (gif, html, pdf)', () => {
    expect(normalizeImageInput('data:image/gif;base64,R0lGODlh').ok).toBe(false);
    expect(normalizeImageInput('data:text/html;base64,PHNjcmlwdD4=').ok).toBe(false);
  });
  test('accepts https URLs only', () => {
    expect(normalizeImageInput('https://images.pexels.com/photos/1/x.jpeg')).toMatchObject({ ok: true });
    expect(normalizeImageInput('http://example.com/x.jpg').ok).toBe(false);
    expect(normalizeImageInput('javascript:alert(1)').ok).toBe(false);
    expect(normalizeImageInput('not a url').ok).toBe(false);
  });
  test('rejects very long URLs and non-strings', () => {
    expect(normalizeImageInput(`https://a.com/${'x'.repeat(600)}`).ok).toBe(false);
    expect(normalizeImageInput(12345).ok).toBe(false);
    expect(normalizeImageInput({}).ok).toBe(false);
  });
});
