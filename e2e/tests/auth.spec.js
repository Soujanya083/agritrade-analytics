const { test, expect } = require('@playwright/test');
const { API_URL, newUser, createVerifiedUser, autoDialogs, loginThroughUi } = require('../helpers');

test.describe('sign up, log in, stay logged in, log out', () => {
  test('a new farmer can sign up with the OTP, then log in', async ({ page }) => {
    autoDialogs(page);
    const user = newUser('Farmer');
    await page.goto('/');
    await page.getByRole('button', { name: /I'm a Farmer/i }).click();
    await page.getByText('Create an account').click();

    await page.getByPlaceholder('John Doe').fill(user.fullName);
    await page.getByPlaceholder('+91 98765 43210').fill(user.phone);
    await page.getByPlaceholder('name@example.com').fill(user.email);
    await page.getByPlaceholder('e.g. Bangalore, Karnataka').fill(user.location);
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator('input[name="confirmPassword"]').fill(user.password);

    const signupResponse = page.waitForResponse((r) => r.url().endsWith('/api/signup') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create Account' }).click();
    const body = await (await signupResponse).json();
    expect(body.otp, 'demo mode returns the OTP').toMatch(/^\d{6}$/);

    await page.getByPlaceholder('Enter 6-digit OTP').fill(body.otp);
    await page.getByRole('button', { name: 'Verify OTP' }).click();

    await page.getByPlaceholder('Enter your email').fill(user.email);
    await page.getByPlaceholder('Enter your registered phone number').fill(user.phone);
    await page.getByPlaceholder('Enter your password').fill(user.password);
    await page.locator('button.login-btn').click();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  test('a wrong OTP is rejected', async ({ request }) => {
    const user = newUser('Farmer');
    await request.post(`${API_URL}/signup`, { data: { ...user, confirmPassword: user.password } });
    const res = await request.post(`${API_URL}/verify-otp`, { data: { email: user.email, otp: '000000' } });
    expect(res.status()).toBe(400);
  });

  test('a page reload keeps the user logged in (silent refresh), without a token in localStorage', async ({ page, request }) => {
    autoDialogs(page);
    const user = await createVerifiedUser(request, 'Farmer');
    await loginThroughUi(page, user);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await expect(page.getByText(/Session expired/i)).toHaveCount(0);

    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookies: document.cookie,
    }));
    expect(storage.local).not.toContain('token');
    expect(storage.session).not.toContain('token');
    expect(storage.cookies, 'the refresh cookie is httpOnly, so JavaScript cannot read it').not.toMatch(/agri_rt/);
  });

  test('logging out ends the session for real', async ({ page, request }) => {
    autoDialogs(page);
    const user = await createVerifiedUser(request, 'Farmer');
    await loginThroughUi(page, user);
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('button', { name: /I'm a Farmer/i })).toBeVisible();

    // the refresh cookie was revoked on the server, so a refresh now fails
    const refresh = await page.request.post(`${API_URL}/auth/refresh`, { headers: { 'X-Requested-With': 'agribid-web' } });
    expect(refresh.status()).toBe(401);
  });

  test('after logout, a reload shows the landing page, not the dashboard', async ({ page, request }) => {
    autoDialogs(page);
    const user = await createVerifiedUser(request, 'Buyer');
    await loginThroughUi(page, user);
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);
  });
});
