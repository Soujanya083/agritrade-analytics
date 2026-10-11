// Validates the `imageUrl` a client sends when listing a crop.
//
// Before: any string was accepted (up to the 10 MB body limit) and stored
// in the crop document, then returned in GET /api/crops to EVERY visitor.
// One big upload could therefore bloat every page load for everyone.
//
// Accepted: an https URL, or a small PNG/JPEG/WebP data URI whose bytes
// really are that format. Legacy SVG placeholder data-URIs (what the
// frontend used to send for crops without a photo) are ignored, not stored.

const MAX_IMAGE_BYTES = 400 * 1024; // decoded size; the frontend downsizes to well below this
const MAX_URL_LENGTH = 500;
const DATA_URI = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

const hasValidSignature = (mime, base64) => {
  const head = Buffer.from(base64.slice(0, 24), 'base64');
  if (mime === 'image/png') return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (mime === 'image/webp') {
    return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])); // jpeg
};

const decodedLength = (base64) => Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

// Returns { ok: true, imageUrl } (imageUrl may be null) or { ok: false, message }.
function normalizeImageInput(value) {
  if (value === undefined || value === null || value === '') return { ok: true, imageUrl: null };
  if (typeof value !== 'string') return { ok: false, message: 'imageUrl must be a string' };

  const trimmed = value.trim();
  if (/^data:image\/svg/i.test(trimmed)) return { ok: true, imageUrl: null, ignored: 'svg-placeholder' };

  if (trimmed.startsWith('data:')) {
    const match = DATA_URI.exec(trimmed);
    if (!match) return { ok: false, message: 'Image must be a PNG, JPEG or WebP' };
    const [, mime, base64] = match;
    if (decodedLength(base64) > MAX_IMAGE_BYTES) {
      return { ok: false, message: `Image is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024)} KB)` };
    }
    if (!hasValidSignature(mime, base64)) return { ok: false, message: 'Image content does not match its type' };
    return { ok: true, imageUrl: trimmed };
  }

  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, message: 'Image URL is too long' };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return { ok: false, message: 'Image URL must use https' };
    return { ok: true, imageUrl: url.toString() };
  } catch (error) {
    return { ok: false, message: 'Image URL is not valid' };
  }
}

module.exports = { normalizeImageInput, MAX_IMAGE_BYTES };
