const { test, expect } = require('@playwright/test');
const { API_URL, createVerifiedUser, apiLogin, apiCreateListing, autoDialogs, loginThroughUi } = require('../helpers');

const H = (token) => ({ Authorization: `Bearer ${token}` });

// A paid deal with a shipment that is already out for delivery, set up through the API.
async function dealOutForDelivery(request) {
  const farmer = await createVerifiedUser(request, 'Farmer');
  const buyer = await createVerifiedUser(request, 'Buyer');
  const transporter = await createVerifiedUser(request, 'Transporter');
  const [ft, bt, tt] = await Promise.all([apiLogin(request, farmer), apiLogin(request, buyer), apiLogin(request, transporter)]);
  const crop = await apiCreateListing(request, ft, { quantityKg: 100, cropName: 'Tomato' });
  const bid = await (await request.post(`${API_URL}/bids`, { headers: H(bt), data: { cropId: crop._id, amount: 35 } })).json();
  const accepted = await (await request.post(`${API_URL}/bids/${bid.bid._id}/accept`, { headers: H(ft), data: {} })).json();
  const txId = accepted.transaction._id;
  await request.post(`${API_URL}/transactions/${txId}/confirm-upi-payment`, { headers: H(bt), data: {} });
  const me = JSON.parse(Buffer.from(ft.split('.')[1], 'base64url').toString());
  const txs = await (await request.get(`${API_URL}/transactions/user/${me.id}`, { headers: H(ft) })).json();
  const code = txs.transactions.find((t) => t._id === txId).shipmentId;
  const post = (path, token, data) => request.post(`${API_URL}/shipments/${code}${path}`, { headers: H(token), data });
  await post('/status', ft, { status: 'ready_for_pickup' });
  await request.put(`${API_URL}/shipments/${code}/carrier`, { headers: H(ft), data: { transporterEmail: transporter.email } });
  await post('/status', tt, { status: 'picked_up' });
  await post('/status', tt, { status: 'in_transit', location: { source: 'manual', label: 'Hubli bypass' } });
  await post('/status', tt, { status: 'out_for_delivery' });
  return { farmer, buyer, transporter, code, tokens: { ft, bt, tt } };
}

test.describe('shipment tracking and delivery verification', () => {
  test('the buyer follows the shipment, gets the QR code, confirms with the one-time code, and a shortfall raises an alert', async ({ browser, request }) => {
    const deal = await dealOutForDelivery(request);
    const page = await (await browser.newContext()).newPage();
    autoDialogs(page);
    await loginThroughUi(page, deal.buyer);

    await page.getByRole('button', { name: 'Shipments' }).first().click();
    await page.getByRole('button', { name: 'Open' }).first().click();
    await expect(page.getByText(deal.code).first()).toBeVisible();
    await expect(page.getByText('Out for Delivery').first()).toBeVisible();
    await expect(page.getByText(/NOT LIVE: Manual update/)).toBeVisible();     // a typed position is never presented as live
    await expect(page.getByText('Hubli bypass').first()).toBeVisible();

    await page.getByRole('button', { name: 'Show QR code' }).click();
    await expect(page.getByRole('img', { name: new RegExp(`QR code for shipment ${deal.code}`) })).toBeVisible();

    await page.getByRole('button', { name: 'Send me a delivery code' }).click();
    await expect(page.getByText(/DEVELOPMENT MODE: your code is/)).toBeVisible();
    const code = (await page.locator('.shipment-devcode strong').innerText()).trim();

    await page.getByLabel('Delivery code').fill('000000' === code ? '111111' : '000000');
    await page.getByLabel(/Quantity received/).fill('90');
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(page.getByText(/not correct/)).toBeVisible();

    await page.getByLabel('Delivery code').fill(code);
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(page.getByText(/payout is on hold/i).first()).toBeVisible();
    await expect(page.getByText('Quantity mismatch')).toBeVisible();
    await expect(page.getByText(/100 kg was dispatched but the buyer confirmed 90 kg/)).toBeVisible();   // the reason is explained
  });

  test('the farmer sees the alert but cannot resolve it; the buyer can, and the payout is released', async ({ browser, request }) => {
    const deal = await dealOutForDelivery(request);
    const { devCode } = await (await request.post(`${API_URL}/shipments/${deal.code}/delivery-code`, { headers: H(deal.tokens.bt), data: {} })).json();
    await request.post(`${API_URL}/shipments/${deal.code}/confirm-delivery`, { headers: H(deal.tokens.bt), data: { otp: devCode, receivedQuantityKg: 90 } });

    const farmerPage = await (await browser.newContext()).newPage();
    autoDialogs(farmerPage);
    await loginThroughUi(farmerPage, deal.farmer);
    await expect(farmerPage.getByText(/open shipment alert/)).toBeVisible();          // the dashboard banner
    await farmerPage.getByRole('button', { name: 'View shipments' }).click();
    await farmerPage.getByRole('button', { name: 'Open' }).first().click();
    await expect(farmerPage.getByText('Quantity mismatch')).toBeVisible();
    await expect(farmerPage.getByRole('button', { name: 'Resolve' })).toHaveCount(0);
    await farmerPage.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(farmerPage.getByText('acknowledged', { exact: false }).first()).toBeVisible();

    const buyerPage = await (await browser.newContext()).newPage();
    autoDialogs(buyerPage);
    await loginThroughUi(buyerPage, deal.buyer);
    await buyerPage.getByRole('button', { name: 'View shipments' }).click();
    await buyerPage.getByRole('button', { name: 'Open' }).first().click();
    await buyerPage.getByLabel('Note for this alert').fill('Farmer refunded the missing 10 kg');
    await buyerPage.getByRole('button', { name: 'Resolve' }).click();
    await expect(buyerPage.getByText(/resolved alert/)).toBeVisible();
  });

  test('a transporter sees only their assigned shipments, and starts on the Shipments tab', async ({ browser, request }) => {
    const deal = await dealOutForDelivery(request);
    const other = await createVerifiedUser(request, 'Transporter');
    const page = await (await browser.newContext()).newPage();
    autoDialogs(page);
    await loginThroughUi(page, deal.transporter);
    await expect(page.getByText(deal.code)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse Crops' })).toHaveCount(0);

    const stranger = await (await browser.newContext()).newPage();
    autoDialogs(stranger);
    await loginThroughUi(stranger, other);
    await expect(stranger.getByText(deal.code)).toHaveCount(0);
    const direct = await request.get(`${API_URL}/shipments/${deal.code}`, { headers: H(await apiLogin(request, other)) });
    expect(direct.status()).toBe(404);
  });

  test('a logged-in stranger who opens a shipment link is told it was not found', async ({ page, request }) => {
    const deal = await dealOutForDelivery(request);
    const stranger = await createVerifiedUser(request, 'Buyer');
    autoDialogs(page);
    await loginThroughUi(page, stranger);
    await page.evaluate((c) => { window.location.hash = `#/shipment/${c}`; }, deal.code);
    await page.getByRole('button', { name: 'Shipments' }).first().click();
    await expect(page.getByText(/not found, or you are not part of it/)).toBeVisible();
  });
});
