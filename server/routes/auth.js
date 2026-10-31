// routes/auth.js - signup, OTP verification and login
const express = require('express');
const bcrypt = require('bcryptjs');
const { User, RefreshToken } = require('../models');
const { sendServerError, isEmailValid, isStrongPassword, otpExpiryMinutes, MAX_OTP_ATTEMPTS } = require('../lib/helpers');
const { signToken } = require('../lib/auth');
const { authLimiter } = require('../lib/limiters');
const { isValidPhone, isValidLength } = require('../validators');
const { generateOtp, safeEqual, shouldExposeOtp } = require('../security');
const { sendOtpEmail } = require('../services/otpSender');
const { issueRefreshToken, setRefreshCookie } = require('../lib/refreshTokens');

const router = express.Router();

// Sends the OTP by e-mail when a provider is configured (services/otpSender.js).
// With no provider the API stays in DEMO MODE and echoes the OTP in the response -
// that is the only case in which the code is ever returned. Returns the response fields.
const deliverOtp = async (email, otpCode) => {
  const emailed = await sendOtpEmail({ to: email, otp: otpCode, minutes: otpExpiryMinutes });
  const expose = shouldExposeOtp();
  return {
    otpSent: emailed.sent || expose,
    otpDelivery: emailed.sent ? 'email' : (expose ? 'demo-mode-in-response' : 'failed'),
    ...(expose ? { otp: otpCode } : {}),
  };
};

router.post('/api/signup', authLimiter, async (req, res) => {
  try {
    const {
      role, fullName, email, phone, location, password, confirmPassword, deliveryAddress,
    } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedRole = role === 'Buyer' ? 'Buyer' : 'Farmer';

    if (!fullName || !phone || !location || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }
    if (!isValidLength(fullName, 2, 60)) {
      return res.status(400).json({ message: 'Full name must be between 2 and 60 characters' });
    }
    if (!isEmailValid(normalizedEmail) || !isValidLength(normalizedEmail, 5, 100)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Phone number must contain digits only (10-15 digits, optional leading +)' });
    }
    if (!isValidLength(location, 2, 100)) {
      return res.status(400).json({ message: 'Location must be between 2 and 100 characters' });
    }
    if (!isStrongPassword(password) || !isValidLength(password, 8, 64)) {
      return res.status(400).json({ message: 'Password must be between 8 and 64 characters long' });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ message: 'Password and confirm password do not match' });
    }
    if (normalizedRole === 'Buyer') {
      if (!deliveryAddress?.trim()) {
        return res.status(400).json({ message: 'Buyer delivery address is required' });
      }
      if (!isValidLength(deliveryAddress, 5, 200)) {
        return res.status(400).json({ message: 'Delivery address must be between 5 and 200 characters' });
      }
    }
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const otpCode = generateOtp();
    const newUser = await User.create({
      role: normalizedRole,
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      location: location.trim(),
      deliveryAddress: normalizedRole === 'Buyer' ? deliveryAddress.trim() : null,
      isVerified: false,
      verificationOtp: otpCode,
      otpExpiresAt: new Date(Date.now() + otpExpiryMinutes * 60 * 1000),
      otpAttempts: 0,
      password: hashedPassword,
    });
    const delivery = await deliverOtp(normalizedEmail, otpCode);
    res.status(201).json({
      message: delivery.otpSent
        ? 'User registered successfully! Please verify your account with the OTP sent to your email or phone.'
        : 'Account created, but we could not send the verification email. Please use "Resend OTP".',
      user: {
        id: newUser._id,
        role: newUser.role,
        fullName: newUser.fullName,
        email: newUser.email,
        location: newUser.location,
        deliveryAddress: newUser.deliveryAddress,
      },
      ...delivery,
    });
  } catch (error) {
    return sendServerError(res, error, 'Server Error');
  }
});

router.post('/api/verify-otp', authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!isEmailValid(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }
    if (!otp || String(otp).trim().length !== 6) {
      return res.status(400).json({ message: 'Please enter a valid 6-digit OTP' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isVerified) return res.status(200).json({ message: 'Account already verified' });
    if (!user.verificationOtp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    // The IP limiter does not stop one account being attacked from many addresses, so each code also has a
    // small number of tries: after MAX_OTP_ATTEMPTS wrong guesses it is destroyed and a new one must be requested.
    if (!safeEqual(user.verificationOtp, String(otp).trim())) {
      const attempts = (user.otpAttempts || 0) + 1;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await User.updateOne({ _id: user._id }, { $set: { verificationOtp: null, otpExpiresAt: null, otpAttempts: 0 } });
        return res.status(429).json({ message: 'Too many wrong codes. Please request a new OTP.' });
      }
      await User.updateOne({ _id: user._id }, { $inc: { otpAttempts: 1 } });
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.isVerified = true;
    user.verificationOtp = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Account verified successfully' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to verify OTP');
  }
});

router.post('/api/resend-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!isEmailValid(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Account is already verified' });

    const otpCode = generateOtp();
    user.verificationOtp = otpCode;
    user.otpExpiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();

    const delivery = await deliverOtp(user.email, otpCode);
    res.status(200).json({
      message: delivery.otpSent ? 'OTP resent successfully' : 'Could not send the email right now. Please try again shortly.',
      ...delivery,
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to resend OTP');
  }
});

router.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password, role, phone } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!isEmailValid(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }
    if (!password || !isValidLength(password, 8, 64)) {
      return res.status(400).json({ message: 'Please enter a valid password' });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.role !== role) {
      return res.status(400).json({ message: `Account is registered as ${user.role}` });
    }
    if (user.phone.trim() !== String(phone).trim()) {
      return res.status(400).json({ message: 'Phone number does not match our records' });
    }

    let isMatch = false;
    if (user.password && user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
      if (isMatch) {
        user.password = await bcrypt.hash(password, 10);
        await user.save();
      }
    }
    if (!isMatch) return res.status(400).json({ message: 'Invalid password' });
    // Only reveal "not verified" to someone who proved they know the password.
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Account not verified. Please confirm OTP first.' });
    }

    const token = signToken(user);
    // Long-lived session = opaque rotating cookie the page's JavaScript cannot read.
    setRefreshCookie(res, await issueRefreshToken(RefreshToken, user._id));

    res.status(200).json({
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        location: user.location,
        deliveryAddress: user.deliveryAddress,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
