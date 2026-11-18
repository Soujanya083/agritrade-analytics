// lib/shipmentIds.js - unique, hard-to-guess shipment codes, e.g. SHP-20261029-7K3QX9PA.
// The code goes into the QR link. It is an identifier, NOT a secret: every read still needs a login
// and a place on the shipment (see lib/shipmentAccess.js), and an unknown code and a forbidden one look the same.
const crypto = require('crypto');

// 31 symbols, no 0/O/1/I/L so a code read aloud or copied by hand is not mistyped
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^SHP-\d{8}-[A-HJKMNP-Z2-9]{8}$/;

function randomSuffix(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

function generateShipmentCode(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `SHP-${date}-${randomSuffix()}`;
}

const isValidShipmentCode = (value) => typeof value === 'string' && CODE_PATTERN.test(value);
const normalizeShipmentCode = (value) => String(value || '').trim().toUpperCase();

module.exports = { generateShipmentCode, isValidShipmentCode, normalizeShipmentCode, ALPHABET };
