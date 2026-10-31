// Shared helpers for the end-to-end tests.
const API_URL = process.env.E2E_API_URL || 'http://localhost:5000/api';

let counter = 0;
const stamp = Date.now().toString(36);

// A fresh, valid user (unique e-mail and phone) so tests never collide with each other.
function newUser(role = 'Farmer') {
  counter += 1;
  const phone = `9${String(100000000 + ((Date.now() + counter * 7919) % 899999999))}`.slice(0, 10);
  return {
    role,
    fullName: `${role} E2E ${counter}`,
    email: `e2e-${role.toLowerCase()}-${stamp}-${counter}@example.com`,
    phone,
    location: 'Pune',
    deliveryAddress: '12 Test Street, Pune, Maharashtra',
    password: 'password123',
  };
}

// Creates + verifies an account through the API. Works in demo mode (the OTP is in the response).
async function createVerifiedUser(request, role = 'Farmer') {
  const user = newUser(role);
  const signup = await request.post(`${API_URL}/signup`, { data: { ...user, confirmPassword: user.password } });
  if (!signup.ok()) throw new Error(`signup failed: ${signup.status()} ${await signup.text()}`);
  const body = await signup.json();
  if (!body.otp) throw new Error('The API did not return an OTP. E2E tests need demo mode (leave EMAIL_PROVIDER unset).');
  const verify = await request.post(`${API_URL}/verify-otp`, { data: { email: user.email, otp: body.otp } });
  if (!verify.ok()) throw new Error(`verify failed: ${verify.status()} ${await verify.text()}`);
  return user;
}

// Logs in over the API and returns the access token (for seeding data quickly).
async function apiLogin(request, user) {
  const res = await request.post(`${API_URL}/login`, {
    data: { email: user.email, password: user.password, role: user.role, phone: user.phone },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  return (await res.json()).token;
}

const today = () => new Date().toISOString().slice(0, 10);

async function apiCreateListing(request, token, overrides = {}) {
  const res = await request.post(`${API_URL}/crops`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      cropName: 'Tomato', variety: 'Hybrid', quantityKg: 100, location: 'Pune', harvestedDate: today(),
      basePrice: 20, category: 'Vegetables', ...overrides,
    },
  });
  if (!res.ok()) throw new Error(`create listing failed: ${res.status()} ${await res.text()}`);
  return (await res.json()).crop;
}

// The app uses alert/confirm/prompt. Accept them all; answer prompts with `promptValue`.
function autoDialogs(page, { promptValue } = {}) {
  const seen = [];
  page.on('dialog', async (dialog) => {
    seen.push({ type: dialog.type(), message: dialog.message() });
    if (dialog.type() === 'prompt') await dialog.accept(promptValue ?? dialog.defaultValue());
    else await dialog.accept();
  });
  return seen;
}

async function loginThroughUi(page, user) {
  await page.goto('/');
  await page.getByRole('button', { name: /I'm a Farmer/i }).click();
  if (user.role === 'Buyer') await page.getByRole('button', { name: 'Buyer', exact: true }).click();
  await page.getByPlaceholder('Enter your email').fill(user.email);
  await page.getByPlaceholder('Enter your registered phone number').fill(user.phone);
  await page.getByPlaceholder('Enter your password').fill(user.password);
  await page.locator('button.login-btn').click();
  await page.getByRole('button', { name: 'Logout' }).waitFor();
}

module.exports = { API_URL, newUser, createVerifiedUser, apiLogin, apiCreateListing, autoDialogs, loginThroughUi, today };
