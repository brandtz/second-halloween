import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request, page }) => {
  await request.delete('http://127.0.0.1:8080/emulator/v1/projects/demo-second-halloween/databases/(default)/documents');
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-second-halloween/accounts');
  // External providers are not dependencies of deterministic app tests.
  await page.route(/tile\.openstreetmap\.org|server\.arcgisonline\.com/, route => route.fulfill({
    contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  }));
});
async function showList(page: Page) {
  const toggle = page.getByRole('button', { name: /^House List/ });
  if (await toggle.isVisible()) await toggle.click();
}
async function showMap(page: Page) {
  const toggle = page.getByRole('button', { name: 'Map View', exact: true });
  if (await toggle.isVisible()) await toggle.click();
}
async function registerAndOpenForm(page: Page) {
  await page.getByRole('button', { name: 'Add Our House', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
  await dialog.getByLabel('Email', { exact: true }).fill('host@example.test');
  await dialog.getByLabel('Password', { exact: true }).fill('Test-only-password-123!');
  await dialog.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add Your House to Second Halloween' })).toBeVisible();
}
async function publish(page: Page) {
  await page.getByLabel('Street Address or Cross-Streets').fill('Test Home - Not a Real Listing');
  await page.getByLabel('Note for Parents & Kids').fill('Glow sticks and cocoa. Test listing only.');
  await page.getByRole('button', { name: 'View / Adjust Pin on Map' }).click();
  await page.getByRole('button', { name: 'Confirm pin location' }).click();
  await page.getByRole('button', { name: 'Post Our House Live' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Test Home - Not a Real Listing', exact: true }).first()).toBeVisible();
}

test('host lifecycle, realtime guest updates, saved walk, voting, filters, and account persistence', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await showList(page);
  await expect(page.getByText('No houses match these filters yet!')).toBeVisible();
  await registerAndOpenForm(page);
  await page.getByRole('button', { name: 'Post Our House Live' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await publish(page);
  await expect(page.getByText('Your House — Quick Candy Status')).toBeVisible();
  await page.getByRole('button', { name: 'Save Test Home - Not a Real Listing to Our Walk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Our Walk (1)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Great Stop (0)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Great Stop (1)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await showList(page);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Our Walk (1)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Test Home - Not a Real Listing', exact: false }).filter({ has: page.locator('h3') }).click();
  await expect(page.getByRole('button', { name: 'Great Stop (1)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const guest = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 } });
  const guestPage = await guest.newPage();
  await guestPage.route(/tile\.openstreetmap\.org|server\.arcgisonline\.com/, route => route.abort());
  await guestPage.goto('/');
  await expect(guestPage.locator('.house-card')).toHaveCount(1);
  await guestPage.getByRole('button', { name: 'Test Home - Not a Real Listing', exact: false }).filter({ has: guestPage.locator('h3') }).click();
  await expect(guestPage.getByRole('button', { name: 'Edit Details' })).toHaveCount(0);
  await expect(guestPage.getByText('Your House — Quick Candy Status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lights Out', exact: false }).filter({ hasText: 'Lights Out' }).click();
  await expect(guestPage.locator('.house-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lights On Only', exact: false }).click();
  await showList(page);
  await expect(page.locator('.house-card')).toHaveCount(1);
  await page.getByLabel('Filter listed houses or notes').fill(' GLOW ');
  await expect(page.locator('.house-card')).toHaveCount(1);
  await page.getByLabel('Filter listed houses or notes').fill('no match');
  await expect(page.locator('.house-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset Filters', exact: true }).click();
  await showMap(page);
  await page.getByRole('button', { name: 'Edit Details', exact: true }).click();
  await page.getByLabel('Note for Parents & Kids').fill('Updated host note');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.locator('.detail-card').getByText('Updated host note')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Host sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Details', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Host sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('host@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Test-only-password-123!');
  await page.getByRole('dialog').locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Details', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Stop', exact: false }).click();
  await page.getByRole('button', { name: 'Confirm removal', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await showList(page);
  await expect(page.locator('.house-card')).toHaveCount(0);
  await guest.close();
  expect(errors).toEqual([]);
});

test('map modes, manual placement, safe geocoding, GPS denial and no mobile overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Springfield Grid', exact: false }).click();
  await expect(page.getByLabel('Approximate Springfield grid')).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Bright', exact: false }).click();
  await page.getByRole('button', { name: 'Aerial', exact: false }).click();
  await expect(page.locator('.leaflet-map')).toBeVisible();
  await page.getByRole('button', { name: 'Streets', exact: false }).click();
  await page.route('https://photon.komoot.io/**', route => route.fulfill({
    json: { features: [{ geometry: { coordinates: [-123.02, 44.05] }, properties: { street: '<img src=x onerror=alert(1)>', city: 'Springfield' } }] },
  }));
  await page.getByLabel('Jump to Springfield address').fill('Example Street');
  await page.getByRole('button', { name: 'Go to Map', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Search result: <img src=x onerror=alert(1)>');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear map search', exact: true }).click();
  await page.unroute('https://photon.komoot.io/**');
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [] } }));
  await page.getByLabel('Jump to Springfield address').fill('Unknown Street');
  await page.getByRole('button', { name: 'Go to Map', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No matching Springfield location');
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 }),
    } });
  });
  await page.getByRole('button', { name: 'Near Me (GPS)', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('Location permission was denied');
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await registerAndOpenForm(page);
  await page.getByLabel('Street Address or Cross-Streets').fill('Manual pin test');
  await page.getByLabel('Latitude', { exact: true }).fill('');
  await page.getByRole('button', { name: 'View / Adjust Pin on Map' }).click();
  await expect(page.getByRole('alert')).toContainText('valid Springfield coordinates');
  await page.getByLabel('Latitude', { exact: true }).fill('44.0485');
  await page.getByRole('button', { name: 'Post Our House Live' }).click();
  await expect(page.getByRole('alert')).toContainText('confirm the pin');
  await page.getByRole('button', { name: 'View / Adjust Pin on Map' }).click();
  await page.getByRole('button', { name: 'Springfield Grid', exact: false }).click();
  const grid = page.getByLabel('Approximate Springfield grid');
  const bounds = await grid.boundingBox();
  if (!bounds) throw new Error('Grid is missing');
  const svgPoint = await grid.evaluate((element, dimensions) => {
    const matrix = (element as SVGSVGElement).getScreenCTM();
    if (!matrix) throw new Error('Missing grid transform');
    const p = new DOMPoint(dimensions.x + dimensions.width * .55, dimensions.y + dimensions.height * .68).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }, bounds);
  await grid.click({ position: { x: bounds.width * .55, y: bounds.height * .68 } });
  await page.getByRole('button', { name: 'Confirm pin location' }).click();
  const lat = Number(await page.getByLabel('Latitude', { exact: true }).inputValue());
  const lng = Number(await page.getByLabel('Longitude', { exact: true }).inputValue());
  expect(lat).toBeCloseTo(44.0485 - (svgPoint.y - 350) / 152000, 5);
  expect(lng).toBeCloseTo(-123.0215 + (svgPoint.x - 500) / (152000 * .72), 5);
  await page.getByRole('button', { name: 'Post Our House Live' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('tile failures fall back visibly and an empty database never seeds invented homes', async ({ page }) => {
  await page.unroute(/tile\.openstreetmap\.org|server\.arcgisonline\.com/);
  await page.route(/tile\.openstreetmap\.org|server\.arcgisonline\.com/, route => route.abort());
  await page.goto('/');
  await expect(page.getByLabel('Approximate Springfield grid')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('schematic grid');
  await showList(page);
  await expect(page.locator('.house-card')).toHaveCount(0);
  await expect(page.getByText('No houses match these filters yet!')).toBeVisible();
});
