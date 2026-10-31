const { test, expect } = require('@playwright/test');
const { API_URL, createVerifiedUser, apiLogin, apiCreateListing, autoDialogs, loginThroughUi, today } = require('../helpers');

test.describe('listing and bidding', () => {
  test('a farmer uploads a crop and a buyer can find it with the search box', async ({ browser, request }) => {
    const farmer = await createVerifiedUser(request, 'Farmer');
    const buyer = await createVerifiedUser(request, 'Buyer');
    const cropName = `Dragonfruit${Date.now().toString(36)}`.slice(0, 22);

    const farmerPage = await (await browser.newContext()).newPage();
    autoDialogs(farmerPage);
    await loginThroughUi(farmerPage, farmer);
    await farmerPage.getByRole('button', { name: 'Upload Crop' }).first().click();
    await farmerPage.getByPlaceholder('Crop Name').fill(cropName);
    await farmerPage.getByPlaceholder('Variety').fill('Red');
    await farmerPage.getByPlaceholder('Quantity (kg)').fill('250');
    await farmerPage.getByPlaceholder('Location').fill('Nashik');
    await farmerPage.locator('input[name="harvestedDate"]').fill(today());
    await farmerPage.getByPlaceholder('Base Price (INR/kg)').fill('42');
    await farmerPage.locator('select[name="category"]').selectOption('Fruits');
    await farmerPage.getByRole('button', { name: 'Save Listing' }).click();

    const buyerPage = await (await browser.newContext()).newPage();
    autoDialogs(buyerPage);
    await loginThroughUi(buyerPage, buyer);
    await buyerPage.getByPlaceholder('Search crops...').fill(cropName);
    await expect(buyerPage.locator('.listing-card', { hasText: cropName })).toHaveCount(1);
  });

  test('a buyer can place a higher bid and the listing shows it', async ({ page, request }) => {
    const farmer = await createVerifiedUser(request, 'Farmer');
    const buyer = await createVerifiedUser(request, 'Buyer');
    const farmerToken = await apiLogin(request, farmer);
    const cropName = `Bidcrop${Date.now().toString(36)}`.slice(0, 20);
    await apiCreateListing(request, farmerToken, { cropName, basePrice: 30 });

    autoDialogs(page, { promptValue: '55' });
    await loginThroughUi(page, buyer);
    await page.getByPlaceholder('Search crops...').fill(cropName);
    const card = page.locator('.listing-card', { hasText: cropName });
    await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: 'Place Bid' }).click();
    await expect(card.getByText(/Current Bid: INR 55/)).toBeVisible();
  });

  test('a bid that is not higher than the current bid is refused', async ({ request }) => {
    const farmer = await createVerifiedUser(request, 'Farmer');
    const buyer = await createVerifiedUser(request, 'Buyer');
    const crop = await apiCreateListing(request, await apiLogin(request, farmer), { basePrice: 30 });
    const res = await request.post(`${API_URL}/bids`, {
      headers: { Authorization: `Bearer ${await apiLogin(request, buyer)}` },
      data: { cropId: crop._id, amount: 10 },
    });
    expect(res.status()).toBe(400);
  });

  test('a farmer can delete their own listing, a buyer cannot', async ({ page, request }) => {
    const farmer = await createVerifiedUser(request, 'Farmer');
    const buyer = await createVerifiedUser(request, 'Buyer');
    const crop = await apiCreateListing(request, await apiLogin(request, farmer));

    const asBuyer = await request.delete(`${API_URL}/crops/${crop._id}`, { headers: { Authorization: `Bearer ${await apiLogin(request, buyer)}` } });
    expect([401, 403]).toContain(asBuyer.status());

    const cropName = `Todelete${Date.now().toString(36)}`.slice(0, 20);
    await apiCreateListing(request, await apiLogin(request, farmer), { cropName });
    autoDialogs(page);
    await loginThroughUi(page, farmer);
    const card = page.locator('.listing-card', { hasText: cropName });
    await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: 'Delete my listing' }).click();
    await expect(card).toHaveCount(0);
  });
});

test.describe('pagination', () => {
  test('a long list loads a page at a time, with a Load more button', async ({ page, request }) => {
    const farmer = await createVerifiedUser(request, 'Farmer');
    const buyer = await createVerifiedUser(request, 'Buyer');
    const token = await apiLogin(request, farmer);
    const tag = `Pg${Date.now().toString(36)}`.slice(0, 12);
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await apiCreateListing(request, token, { cropName: `${tag}${i}`.slice(0, 24), variety: `V${i}` });
    }

    const first = await request.get(`${API_URL}/crops?q=${tag}&limit=24`);
    const firstBody = await first.json();
    expect(firstBody.crops).toHaveLength(24);
    expect(firstBody.total).toBe(30);
    expect(firstBody.hasMore).toBe(true);
    expect(JSON.stringify(firstBody)).not.toMatch(/data:image/);   // no inline base64 photos in the list

    autoDialogs(page);
    await loginThroughUi(page, buyer);
    await page.getByPlaceholder('Search crops...').fill(tag);
    const cards = page.locator('.listing-card');
    await expect(cards).toHaveCount(24);
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(cards).toHaveCount(30);
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  });
});
