// lib/helpers.js - small shared helpers and constants.
const { Notification } = require('../models');

const MAX_OTP_ATTEMPTS = 5;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmailValid = (email) => EMAIL_REGEX.test(String(email || '').toLowerCase().trim());
const isStrongPassword = (password) => typeof password === 'string' && password.length >= 8;
const otpExpiryMinutes = 10;

const CROP_CATEGORIES = ['Grains', 'Vegetables', 'Fruits', 'Leafy'];

const createNotification = async (userId, message, type = 'info') => {
  await Notification.create({ userId, message, type, isRead: false });
};

// Logs the real error server-side, tells the client nothing about internals
// (the original returned the raw error object: stack-like detail, DB messages).
const sendServerError = (res, error, message) => {
  console.error(`${message}:`, error);
  return res.status(500).json({ message });
};

module.exports = {
  MAX_OTP_ATTEMPTS, isEmailValid, isStrongPassword, otpExpiryMinutes, CROP_CATEGORIES,
  createNotification, sendServerError,
};
