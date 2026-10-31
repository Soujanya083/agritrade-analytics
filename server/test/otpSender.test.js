// Unit tests for the e-mail OTP sender. fetch is injected, so no network is used.
const { sendOtpEmail, buildOtpEmail, buildRequest } = require('../services/otpSender');
const { emailProviderConfigured, shouldExposeOtp } = require('../security');

const BREVO = { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k-brevo', OTP_FROM_EMAIL: 'me@example.com' };
const RESEND = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k-resend', OTP_FROM_EMAIL: 'me@example.com' };

const fakeFetch = (status = 200) => {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok: status >= 200 && status < 300, status }; };
  fn.calls = calls;
  return fn;
};

describe('emailProviderConfigured / shouldExposeOtp', () => {
  test('nothing configured => demo mode (OTP echoed)', () => {
    expect(emailProviderConfigured({})).toBe(false);
    expect(shouldExposeOtp({})).toBe(true);
  });
  test('a provider needs BOTH its key and a from-address', () => {
    expect(emailProviderConfigured({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'x' })).toBe(false);
    expect(emailProviderConfigured({ EMAIL_PROVIDER: 'resend', OTP_FROM_EMAIL: 'a@b.c' })).toBe(false);
    expect(emailProviderConfigured(BREVO)).toBe(true);
    expect(emailProviderConfigured(RESEND)).toBe(true);
    expect(emailProviderConfigured({ ...BREVO, EMAIL_PROVIDER: 'carrier-pigeon' })).toBe(false);
  });
  test('once e-mail works the OTP is no longer echoed', () => {
    expect(shouldExposeOtp(BREVO)).toBe(false);
  });
  test('an explicit EXPOSE_OTP_IN_RESPONSE always wins', () => {
    expect(shouldExposeOtp({ ...BREVO, EXPOSE_OTP_IN_RESPONSE: 'true' })).toBe(true);
    expect(shouldExposeOtp({ EXPOSE_OTP_IN_RESPONSE: 'false' })).toBe(false);
  });
});

describe('buildOtpEmail', () => {
  test('contains the code and the expiry, in text and html', () => {
    const mail = buildOtpEmail({ otp: '123456', minutes: 10, appName: 'AgriTrade' });
    expect(mail.subject).toMatch(/123456/);
    expect(mail.text).toMatch(/10 minutes/);
    expect(mail.html).toMatch(/123456/);
  });
});

describe('sendOtpEmail', () => {
  test('does nothing (and does not call the network) when no provider is configured', async () => {
    const f = fakeFetch();
    expect(await sendOtpEmail({ to: 'a@b.c', otp: '111111' }, { env: {}, fetchImpl: f })).toEqual({ sent: false, reason: 'not-configured' });
    expect(f.calls).toHaveLength(0);
  });
  test('Brevo request shape', async () => {
    const f = fakeFetch(201);
    const out = await sendOtpEmail({ to: 'farmer@example.com', otp: '654321' }, { env: BREVO, fetchImpl: f });
    expect(out).toEqual({ sent: true });
    expect(f.calls[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(f.calls[0].init.headers['api-key']).toBe('k-brevo');
    const body = JSON.parse(f.calls[0].init.body);
    expect(body.to).toEqual([{ email: 'farmer@example.com' }]);
    expect(body.sender.email).toBe('me@example.com');
    expect(body.textContent).toMatch(/654321/);
  });
  test('Resend request shape', async () => {
    const f = fakeFetch();
    await sendOtpEmail({ to: 'buyer@example.com', otp: '222222' }, { env: RESEND, fetchImpl: f });
    expect(f.calls[0].url).toBe('https://api.resend.com/emails');
    expect(f.calls[0].init.headers.authorization).toBe('Bearer k-resend');
    expect(JSON.parse(f.calls[0].init.body).to).toEqual(['buyer@example.com']);
  });
  test('a provider error is reported, not thrown', async () => {
    expect(await sendOtpEmail({ to: 'a@b.c', otp: '1' }, { env: BREVO, fetchImpl: fakeFetch(401) })).toEqual({ sent: false, reason: 'provider-http-401' });
  });
  test('a network failure is reported, not thrown', async () => {
    const boom = async () => { throw new Error('ECONNRESET'); };
    expect(await sendOtpEmail({ to: 'a@b.c', otp: '1' }, { env: RESEND, fetchImpl: boom })).toEqual({ sent: false, reason: 'network-error' });
  });
  test('the OTP never appears in the returned diagnostics', async () => {
    const out = await sendOtpEmail({ to: 'a@b.c', otp: '987654' }, { env: BREVO, fetchImpl: fakeFetch(500) });
    expect(JSON.stringify(out)).not.toMatch(/987654/);
  });
});
