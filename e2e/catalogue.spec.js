const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const USERNAME = process.env.E2E_ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'HoustonLab10';
const ORDER_KEY = 'catalogue-local-custom-order';
const TOKEN_KEY = 'catalogue-admin-token';

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function loaded(page) {
  await expect(page.locator('[data-testid^="launchpad-card-title-"]').first()).toBeVisible();
  await expect(page.getByTestId('launchpad-skeleton-0')).toHaveCount(0);
}
async function chooseCustom(page) {
  await page.getByTestId('search-sort-select').click();
  await page.getByRole('option', { name: 'Vlastní pořadí', exact: true }).click();
}
async function login(page) {
  await page.goto('/admin');
  await expect(page.getByTestId('admin-login-dialog')).toBeVisible();
  await page.getByTestId('admin-login-username-input').fill(USERNAME);
  await page.getByTestId('admin-login-password-input').fill(PASSWORD);
  await page.getByTestId('admin-login-submit').click();
  await expect(page.getByTestId('admin-page-title')).toBeVisible();
  await expect(page.getByTestId('admin-add-link-button')).toBeEnabled();
  return page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
}

function mockLinks(baseURL) {
  return {
    links: ['Alfa', 'Beta', 'Gama'].map((title, index) => ({
      id: `browser-${index}`, title, url: `${baseURL}/browser-destination`,
      logo_url: index === 0 ? `${baseURL}/broken-logo.png` : null,
      logo_data: null, clicks: index, custom_order: index, is_active: true,
      is_favorite: false, created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-01T00:00:00+00:00',
    })),
    settings: { id: 'browser-settings', sort_mode: 'alphabetical', open_in_new_tab: true, show_inactive_public: false },
  };
}

test('real catalogue starts with search, filters immediately and stays within the viewport', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await loaded(page);
  const search = page.getByTestId('search-input');
  await expect(search).toBeVisible();
  const firstCard = page.locator('[data-testid^="launchpad-card-title-"]').first();
  const firstTitle = await firstCard.textContent();
  const searchBox = await search.boundingBox();
  const cardBox = await firstCard.boundingBox();
  expect(searchBox.y).toBeLessThan(cardBox.y);
  await search.fill(firstTitle.trim());
  await expect(firstCard).toBeVisible();
  await search.fill('nenalezitelný-katalog-987654321');
  await expect(page.getByTestId('launchpad-empty-state')).toBeVisible();
  await expect(page.getByTestId('launchpad-empty-state')).toContainText('nic nenašel');
  await search.fill('');
  await loaded(page);
  await noOverflow(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('catalogue.png'), fullPage: true });
});

test('broken logo falls back and native links open before delayed statistics', async ({ page, context, baseURL }) => {
  await page.route('**/api/launchpad', (route) => route.fulfill({ json: mockLinks(baseURL) }));
  await page.route('**/broken-logo.png', (route) => route.fulfill({ status: 404, body: '' }));
  await context.route('**/browser-destination', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<title>Cílový katalog</title><p>Odkaz se otevřel.</p>' }));
  let releaseStatistics;
  const statisticsGate = new Promise((resolve) => { releaseStatistics = resolve; });
  await context.route('**/api/links/*/click', async (route) => {
    await statisticsGate;
    await route.fulfill({ json: { success: true } }).catch(() => {});
  });
  try {
    await page.goto('/');
    await loaded(page);
    await expect(page.getByTestId('launchpad-card-logo-fallback-browser-0')).toBeVisible();
    const card = page.getByTestId('launchpad-card-browser-0');
    await expect(card).toHaveAttribute('href', `${baseURL}/browser-destination`);
    await expect(card).toHaveAttribute('target', '_blank');
    await expect(card).toHaveAttribute('rel', /noopener/);
    const popupPromise = page.waitForEvent('popup', { timeout: 2000 });
    await card.click();
    const popup = await popupPromise;
    await expect(popup).toHaveTitle('Cílový katalog', { timeout: 2000 });
    await popup.close();
  } finally { releaseStatistics(); }
});

test('invalid local order cannot crash the page; saved personal order never writes globally', async ({ page, baseURL }) => {
  const data = mockLinks(baseURL);
  let reorderRequests = 0;
  page.on('request', (request) => { if (request.url().includes('/api/admin/links/reorder')) reorderRequests++; });
  await page.route('**/api/launchpad', (route) => route.fulfill({ json: data }));
  await page.addInitScript((key) => localStorage.setItem(key, '{"not":"an array"}'), ORDER_KEY);
  await page.goto('/');
  await loaded(page);
  await chooseCustom(page);
  await expect(page.locator('[data-testid^="launchpad-card-title-"]')).toHaveText(['Alfa', 'Beta', 'Gama']);
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify(['browser-2', 'browser-2', 'missing', 'browser-0'])), ORDER_KEY);
  // Override the malformed initialization only for this fresh load.
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify(['browser-2', 'browser-2', 'missing', 'browser-0'])), ORDER_KEY);
  await page.reload();
  await loaded(page);
  await chooseCustom(page);
  await expect(page.locator('[data-testid^="launchpad-card-title-"]')).toHaveText(['Gama', 'Alfa', 'Beta']);
  await page.getByTestId('custom-order-lock-toggle').click();
  await expect(page.getByTestId('launchpad-sortable-grid')).toBeVisible();
  const dragged = page.getByTestId('launchpad-sortable-card-browser-2');
  await dragged.focus();
  await dragged.press('Space');
  await dragged.press('ArrowRight');
  await dragged.press('Space');
  await expect(page.locator('[data-testid^="launchpad-card-title-"]')).toHaveText(['Alfa', 'Gama', 'Beta']);
  await page.getByTestId('custom-order-lock-toggle').click();
  await expect(page.getByTestId('launchpad-sortable-grid')).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), ORDER_KEY)).toEqual(['browser-0', 'browser-2', 'browser-1']);
  expect(reorderRequests).toBe(0);
  await page.getByTestId('custom-order-reset-button').click();
  await expect(page.locator('[data-testid^="launchpad-card-title-"]')).toHaveText(['Alfa', 'Beta', 'Gama']);
  await noOverflow(page);
});

test('failed catalogue request shows retry and recovers without reloading the page', async ({ page }) => {
  let fail = true;
  await page.route('**/api/launchpad', async (route) => {
    if (fail) return route.fulfill({ status: 503, json: { detail: 'Databáze není dostupná' } });
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByTestId('launchpad-error-state')).toBeVisible();
  await expect(page.getByTestId('launchpad-empty-state')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Zkusit znovu', exact: true }).click();
  await loaded(page);
  await expect(page.getByTestId('launchpad-error-state')).toHaveCount(0);
});

test('real login, validated admin forms, CRUD, export and non-destructive import', async ({ page, request }, testInfo) => {
  const token = await login(page);
  const headers = { Authorization: `Bearer ${token}` };
  const original = await (await request.get('/api/admin/links', { headers })).json();
  const createdIds = [];
  const title = `E2E katalog ${testInfo.project.name} ${Date.now()}`;
  await page.route('**/api/admin/discover-logo', (route) => route.fulfill({ json: { found: false, logo_url: null } }));
  try {
    await expect(page.getByTestId('credentials-new-username-input')).toHaveValue(USERNAME);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('admin.png'), fullPage: true });
    await page.getByTestId('admin-add-link-button').click();
    await page.getByTestId('link-form-title-input').fill('   ');
    await page.getByTestId('link-form-url-input').fill('https://example.org');
    await page.getByTestId('link-form-save-button').click();
    await expect(page.getByTestId('link-form-dialog')).toBeVisible();
    await expect(page.getByText('Vyplň název webu.', { exact: true })).toBeVisible();
    await page.getByTestId('link-form-title-input').fill(`  ${title}  `);
    await page.getByTestId('link-form-url-input').fill('javascript:alert(1)');
    await page.getByTestId('link-form-save-button').click();
    await expect(page.getByTestId('link-form-dialog')).toBeVisible();
    await expect(page.getByText('Zadej platnou HTTP nebo HTTPS adresu bez přihlašovacích údajů.', { exact: true })).toBeVisible();
    await page.getByTestId('link-form-logo-upload-input').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    await expect(page.getByText('Vyber PNG, JPEG, WebP, GIF nebo ICO. SVG není podporováno.', { exact: true })).toBeVisible();
    await page.getByTestId('link-form-logo-upload-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
    await expect(page.getByTestId('link-form-preview-image')).toBeVisible();
    await page.getByTestId('link-form-url-input').fill('example.org');
    const createResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/links') && response.request().method() === 'POST');
    await page.getByTestId('link-form-save-button').click();
    const created = await (await createResponse).json();
    createdIds.push(created.id);
    expect(created.title).toBe(title);
    expect(created.url).toBe('https://example.org');
    expect(created.logo_data).toMatch(/^data:image\/png;base64,/);
    await expect(page.getByTestId('link-form-dialog')).toHaveCount(0);
    await expect(page.getByTestId(`admin-link-title-${created.id}`)).toHaveText(title);
    await page.getByTestId(`admin-link-edit-${created.id}`).click();
    await page.getByTestId('link-form-title-input').fill(`${title} upravený`);
    await page.getByTestId('link-form-save-button').click();
    await expect(page.getByTestId(`admin-link-title-${created.id}`)).toHaveText(`${title} upravený`);

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('admin-export-button').click();
    const download = await downloadPromise;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    expect(exported.links.some((item) => item.id === created.id)).toBe(true);
    const retainedResponse = await request.post('/api/admin/links', { headers, data: { title: `${title} zachovaný`, url: 'https://example.org/retained', is_active: true, is_favorite: false } });
    expect(retainedResponse.ok()).toBe(true);
    const retained = await retainedResponse.json();
    createdIds.push(retained.id);
    page.once('dialog', (dialog) => dialog.accept());
    const importResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/import') && response.request().method() === 'POST');
    await page.getByTestId('admin-import-input').setInputFiles({ name: 'catalogue.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    expect((await importResponse).ok()).toBe(true);
    await expect(page.getByTestId(`admin-link-title-${retained.id}`)).toHaveText(`${title} zachovaný`);
    const afterImport = await (await request.get('/api/admin/links', { headers })).json();
    for (const old of original) expect(afterImport.some((item) => item.id === old.id)).toBe(true);
    await page.getByTestId('admin-import-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await expect(page.getByText('Soubor není platný JSON export.', { exact: true })).toBeVisible();
    const afterInvalid = await (await request.get('/api/admin/links', { headers })).json();
    expect(afterInvalid.map((item) => item.id).sort()).toEqual(afterImport.map((item) => item.id).sort());

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`admin-link-delete-${created.id}`).click();
    await expect(page.getByTestId(`admin-link-row-${created.id}`)).toHaveCount(0);
    await noOverflow(page);
  } finally {
    for (const id of createdIds) await request.delete(`/api/admin/links/${id}`, { headers });
  }
});

test('reduced motion keeps catalogue interactive without entrance movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await loaded(page);
  const animated = await page.locator('[data-testid^="launchpad-card-"]').first().evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    duration: getComputedStyle(element).animationDuration,
  }));
  expect(animated.animation === 'none' || animated.duration === '0s' || animated.duration === '0.001s').toBe(true);
  await page.getByTestId('search-input').fill('nenalezitelný-katalog-987654321');
  await expect(page.getByTestId('launchpad-empty-state')).toBeVisible();
});
