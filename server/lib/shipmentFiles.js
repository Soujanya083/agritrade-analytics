// lib/shipmentFiles.js - validation of delivery / damage photos and safe naming (pure functions).
//
// Photos arrive as raw image bytes. We trust the CONTENT, not the file name or the declared type:
// the leading bytes must match a JPEG, PNG or WebP, the size is capped, and the name the user's phone
// gave the file is never used. Files are served only to people on the shipment, with the type we detected.
const crypto = require('crypto');

const KINDS = Object.freeze(['pickup', 'delivery', 'damage']);
const MAX_PHOTOS_PER_SHIPMENT = 10;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

const maxPhotoBytes = (env = process.env) => {
  const n = Number(env.SHIPMENT_PHOTO_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
};

// -> { mime, ext } | null, judged by the bytes themselves
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const normalizeMime = (value) => String(value || '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');

// -> { ok: true, mime, ext, size, sha256 } | { ok: false, status, message }
function validatePhoto(buffer, declaredMime, { maxBytes = maxPhotoBytes() } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, status: 400, message: 'No image was received. Send the photo as the request body.' };
  if (buffer.length > maxBytes) return { ok: false, status: 413, message: `The photo is too large (max ${Math.round(maxBytes / 1024)} KB). Reduce its size and try again.` };
  const detected = detectImageType(buffer);
  if (!detected) return { ok: false, status: 415, message: 'Only JPEG, PNG or WebP photos are accepted.' };
  if (normalizeMime(declaredMime) !== detected.mime) return { ok: false, status: 415, message: 'The file content does not match its declared type.' };
  return { ok: true, mime: detected.mime, ext: detected.ext, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

const newPhotoId = () => crypto.randomBytes(9).toString('base64url');

// The only name ever shown or sent in Content-Disposition: built from our own data, never from user input.
function safeFileName(shipmentCode, kind, photoId, ext) {
  const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '');
  return `${clean(shipmentCode)}-${clean(kind)}-${clean(photoId)}.${clean(ext)}`;
}

// Captions are free text shown to other users: remove control characters, collapse spaces, cap the length.
function sanitizeText(text, max = 300) {
  return String(text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

// Which kinds may each role upload?
const KIND_BY_ROLE = Object.freeze({
  pickup: ['farmer', 'carrier', 'admin'],
  delivery: ['buyer', 'carrier', 'admin'],
  damage: ['farmer', 'buyer', 'carrier', 'admin'],
});
const canUploadKind = (kind, roles) => roles.some((r) => (KIND_BY_ROLE[kind] || []).includes(r));

module.exports = {
  KINDS, MAX_PHOTOS_PER_SHIPMENT, maxPhotoBytes, detectImageType, validatePhoto, newPhotoId, safeFileName, sanitizeText, canUploadKind, normalizeMime,
};
