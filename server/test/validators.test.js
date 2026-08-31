// test/validators.test.js
// Unit tests for validators.js - pure functions, no database needed.
// Run with: npm test

const {
  isValidObjectId, isPositiveNumber, isNonEmptyString, isValidPhone,
  isValidLength, isReasonableDate, sanitizeString,
} = require('../validators');

describe('isValidObjectId', () => {
  test('accepts a valid 24-char hex MongoDB ID', () => {
    expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
  });
  test('rejects a short/garbage string', () => {
    expect(isValidObjectId('abc123')).toBe(false);
  });
  test('rejects null/undefined', () => {
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(undefined)).toBe(false);
  });
});

describe('isPositiveNumber (the NaN bug fix)', () => {
  test('accepts a positive number', () => {
    expect(isPositiveNumber(25.5)).toBe(true);
    expect(isPositiveNumber('25.5')).toBe(true);
  });
  test('rejects zero and negative numbers', () => {
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-10)).toBe(false);
  });
  test('rejects non-numeric strings (this was the original bug)', () => {
    expect(isPositiveNumber('abc')).toBe(false);
    expect(isPositiveNumber('twenty')).toBe(false);
  });
  test('rejects null, empty string, and booleans', () => {
    expect(isPositiveNumber(null)).toBe(false);
    expect(isPositiveNumber('')).toBe(false);
    expect(isPositiveNumber(true)).toBe(false);
  });
});

describe('isNonEmptyString', () => {
  test('accepts a normal string within length', () => {
    expect(isNonEmptyString('Wheat', 80)).toBe(true);
  });
  test('rejects an empty or whitespace-only string', () => {
    expect(isNonEmptyString('', 80)).toBe(false);
    expect(isNonEmptyString('   ', 80)).toBe(false);
  });
  test('rejects a string longer than maxLength', () => {
    expect(isNonEmptyString('a'.repeat(100), 80)).toBe(false);
  });
});

describe('isValidPhone (strictly numeric)', () => {
  test('accepts a plain 10-digit number', () => {
    expect(isValidPhone('9876543210')).toBe(true);
  });
  test('accepts a number with a leading +', () => {
    expect(isValidPhone('+919876543210')).toBe(true);
  });
  test('rejects alphanumeric input (letters mixed with digits)', () => {
    expect(isValidPhone('abc1234567')).toBe(false);
    expect(isValidPhone('98765abcde')).toBe(false);
  });
  test('rejects too-short or too-long numbers', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('1'.repeat(20))).toBe(false);
  });
});

describe('isValidLength', () => {
  test('accepts a string within the given range', () => {
    expect(isValidLength('Soujanya', 2, 60)).toBe(true);
  });
  test('rejects a string shorter than min', () => {
    expect(isValidLength('A', 2, 60)).toBe(false);
  });
  test('rejects a string longer than max', () => {
    expect(isValidLength('a'.repeat(70), 2, 60)).toBe(false);
  });
});

describe('isReasonableDate', () => {
  test('accepts a recent, valid date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isReasonableDate(yesterday.toISOString())).toBe(true);
  });
  test('rejects an invalid date string', () => {
    expect(isReasonableDate('not-a-date')).toBe(false);
  });
  test('rejects a date too far in the future', () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 5);
    expect(isReasonableDate(farFuture.toISOString(), { maxFutureDays: 180 })).toBe(false);
  });
  test('rejects a date too far in the past', () => {
    const farPast = new Date();
    farPast.setFullYear(farPast.getFullYear() - 10);
    expect(isReasonableDate(farPast.toISOString(), { maxPastYears: 2 })).toBe(false);
  });
});

describe('sanitizeString', () => {
  test('trims leading/trailing whitespace', () => {
    expect(sanitizeString('  Wheat  ')).toBe('Wheat');
  });
  test('passes through non-string values unchanged', () => {
    expect(sanitizeString(42)).toBe(42);
  });
});