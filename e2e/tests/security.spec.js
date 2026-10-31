const { test, expect } = require('@playwright/test');
const { API_URL, createVerifiedUser, apiLogin } = require('../helpers');

test.describe('session security', () => {
  test('protected endpoints refuse requests without a token', async ({ request }) => {
    const res = await request.get(`${API_URL}/notifications/507f1f77bcf86cd799439011`);
    expect(res.status()).toBe(401);
  });

  test('a forged token is refused', async ({ request }) => {
    const res = await request.get(`${API_URL}/notifications/507f1f77bcf86cd799439011`, {
      headers: { Authorization: 'Bearer not.a.real.token' },
    });
    expect(res.status()).toBe(401);
  });

  test('the access token is short-lived (minutes, not days)', async ({ request }) => {
    const user = await createVerifiedUser(request, 'Farmer');
    const token = await apiLogin(request, user);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60 * 60);
  });

  test('the refresh endpoint needs the CSRF header', async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/refresh`);
    expect(res.status()).toBe(403);
  });

  test('the refresh cookie is HttpOnly and scoped to the auth path', async ({ request }) => {
    const user = await createVerifiedUser(request, 'Farmer');
    const res = await request.post(`${API_URL}/login`, {
      data: { email: user.email, password: user.password, role: user.role, phone: user.phone },
    });
    const cookie = res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('agri_rt='));
    expect(cookie, 'login sets the refresh cookie').toBeTruthy();
    expect(cookie.value).toMatch(/HttpOnly/i);
    expect(cookie.value).toMatch(/Path=\/api\/auth/);
  });

  test('the OTP is only echoed in demo mode', async ({ request }) => {
    test.skip(!!process.env.E2E_EMAIL_PROVIDER_CONFIGURED, 'a real e-mail provider is configured');
    const { newUser } = require('../helpers');
    const user = newUser('Farmer');
    const res = await request.post(`${API_URL}/signup`, { data: { ...user, confirmPassword: user.password } });
    expect((await res.json()).otpDelivery).toBe('demo-mode-in-response');
  });
});
