// validators.js
// Reusable input/data validation helpers.
//
// Why this matters beyond just "clean forms": every crop price, quantity,
// and bid amount stored here eventually feeds the ML analytics service
// (Prophet forecasting, K-Means segmentation). Bad data at this layer
// (NaN prices, negative quantities, garbage dates) silently corrupts
// those downstream models - so validating here isn't just UX, it's
// data-quality protection for the whole analytics pipeline.

const mongoose = require('mongoose');

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

function isPositiveNumber(value) {
  const n = Number(value);
  return typeof value !== 'boolean' && value !== null && value !== '' && !Number.isNaN(n) && n > 0;
}

function isNonEmptyString(value, maxLength = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isValidPhone(phone) {
  // strictly numeric only (rejects letters/alphanumeric) - allows an optional
  // leading + and 10-15 digits, since real phone numbers are never alphanumeric
  if (typeof phone !== 'string') return false;
  return /^\+?[0-9]{10,15}$/.test(phone.trim());
}

function isValidLength(value, min, max) {
  if (typeof value !== 'string') return false;
  const len = value.trim().length;
  return len >= min && len <= max;
}

function isReasonableDate(dateStr, { maxPastYears = 5, maxFutureDays = 365 } = {}) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const earliestAllowed = new Date(now);
  earliestAllowed.setFullYear(now.getFullYear() - maxPastYears);
  const latestAllowed = new Date(now);
  latestAllowed.setDate(now.getDate() + maxFutureDays);
  return date >= earliestAllowed && date <= latestAllowed;
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

module.exports = {
  isValidObjectId,
  isPositiveNumber,
  isNonEmptyString,
  isValidPhone,
  isValidLength,
  isReasonableDate,
  sanitizeString,
};