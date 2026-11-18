// services/otpSender.js - sends the sign-up / re-send OTP by e-mail.
//
// Uses the providers' plain HTTPS APIs through Node's built-in fetch, so no new
// npm dependency is needed. Supported (both have a free tier):
//   EMAIL_PROVIDER=brevo   + BREVO_API_KEY   + OTP_FROM_EMAIL (a sender verified in Brevo)
//   EMAIL_PROVIDER=resend  + RESEND_API_KEY  + OTP_FROM_EMAIL
// With no provider configured nothing is sent and the API stays in demo mode
// (OTP echoed in the response) - see security.shouldExposeOtp.
const { emailProviderConfigured } = require('../security');

const APP_NAME = process.env.OTP_APP_NAME || 'AgriTrade';

function buildOtpEmail({ otp, minutes = 10, appName = APP_NAME }) {
  const subject = `${appName}: your verification code is ${otp}`;
  const text = `Your ${appName} verification code is ${otp}. It expires in ${minutes} minutes. If you did not sign up, ignore this email.`;
  const html = `<p>Your ${appName} verification code is:</p><p style="font-size:24px;letter-spacing:4px"><b>${otp}</b></p>`
    + `<p>It expires in ${minutes} minutes. If you did not sign up, you can ignore this email.</p>`;
  return { subject, text, html };
}

function buildRequest(provider, { to, from, content, env }) {
  if (provider === 'brevo') {
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: { sender: { name: APP_NAME, email: from }, to: [{ email: to }], subject: content.subject, htmlContent: content.html, textContent: content.text },
    };
  }
  return {
    url: 'https://api.resend.com/emails',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: { from: `${APP_NAME} <${from}>`, to: [to], subject: content.subject, html: content.html, text: content.text },
  };
}

// Resolves { sent: true } or { sent: false, reason }. NEVER throws and never logs the OTP,
// so a provider outage cannot break signup or leak codes into logs.
async function sendOtpEmail({ to, otp, minutes = 10 }, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!emailProviderConfigured(env)) return { sent: false, reason: 'not-configured' };
  const provider = String(env.EMAIL_PROVIDER).toLowerCase();
  try {
    const req = buildRequest(provider, { to, from: env.OTP_FROM_EMAIL, content: buildOtpEmail({ otp, minutes }), env });
    const res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    if (!res.ok) return { sent: false, reason: `provider-http-${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: 'network-error' };
  }
}

// The delivery code for a shipment. Same providers and safety rules as the sign-up code.
function buildDeliveryEmail({ code, shipmentCode, cropName, minutes = 60, appName = APP_NAME }) {
  const subject = `${appName}: delivery code for shipment ${shipmentCode}`;
  const text = `Your delivery code for shipment ${shipmentCode}${cropName ? ` (${cropName})` : ''} is ${code}. `
    + `Enter it in the app only after you have received and checked your goods. It works once and expires in ${minutes} minutes. `
    + 'Never share it with anyone before you have the goods in your hands. If you did not expect a delivery, ignore this e-mail.';
  const html = `<p>Your delivery code for shipment <b>${shipmentCode}</b>${cropName ? ` (${cropName})` : ''}:</p>`
    + `<p style="font-size:24px;letter-spacing:4px"><b>${code}</b></p>`
    + `<p>Enter it in the app <b>only after you have received and checked your goods</b>. It works once and expires in ${minutes} minutes.</p>`
    + '<p>Never share it before you have the goods in your hands. If you did not expect a delivery, ignore this e-mail.</p>';
  return { subject, text, html };
}

async function sendDeliveryCodeEmail({ to, code, shipmentCode, cropName, minutes = 60 }, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!emailProviderConfigured(env)) return { sent: false, reason: 'not-configured' };
  const provider = String(env.EMAIL_PROVIDER).toLowerCase();
  try {
    const req = buildRequest(provider, { to, from: env.OTP_FROM_EMAIL, content: buildDeliveryEmail({ code, shipmentCode, cropName, minutes }), env });
    const res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    return res.ok ? { sent: true } : { sent: false, reason: `provider-http-${res.status}` };
  } catch (err) {
    return { sent: false, reason: 'network-error' }; // never log the code
  }
}

module.exports = { sendOtpEmail, buildOtpEmail, buildRequest, sendDeliveryCodeEmail, buildDeliveryEmail };
