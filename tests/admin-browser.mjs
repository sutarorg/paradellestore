/** Empty/private-shell acceptance. Does not seed merchandise, identities, generated outputs or financial records. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
  out = process.env.QA_ADMIN_CAPTURE_DIR || 'test-results/admin',
  capture = process.env.QA_CAPTURE === '1';
const b = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH, args: ['--disable-dev-shm-usage', '--disable-gpu'] }
    : {}),
});
const c = await b.newContext({ baseURL: base, reducedMotion: 'reduce' });
const page = await c.newPage();
page.setDefaultTimeout(6500);
const log = {
  routeChecks: 0,
  layoutChecks: 0,
  axeScans: 0,
  images: 0,
  groups: [],
  unexpected: [],
  violations: [],
  cancelledRequests: 0,
  screenshots: [],
};
const routes = [
  '',
  '/login',
  '/products',
  '/products/new',
  '/products/no-record/edit',
  '/importer',
  '/orders',
  '/orders/no-record',
  '/inventory',
  '/customers',
  '/reviews',
  '/analytics',
  '/settings',
];
const sets = [
  ['desktop', 1440, 960],
  ['tablet', 820, 1180],
  ['mobile', 390, 844],
];
const nav = (p) => page.goto(`/admin${p}`);
const btn = (name) => page.getByRole('button', { name, exact: true });
const label = (name) => page.getByLabel(name, { exact: true });
const alert = (s) =>
  expect(page.locator('.ad-info[role=alert]').filter({ hasText: s }).first()).toBeVisible();
const section = (s) => page.locator('.ad-editor-nav').getByRole('button', { name: s, exact: true }).click();
function done(s) {
  log.groups.push(s);
}
page.on('pageerror', (e) => log.unexpected.push(e.message));
page.on('console', (e) => {
  if (e.type() === 'error') log.unexpected.push(e.text());
});
page.on('requestfailed', (r) => {
  if (r.failure()?.errorText?.includes('ABORTED')) log.cancelledRequests++;
  else log.unexpected.push(r.failure()?.errorText);
});
page.on('response', (r) => {
  if (r.status() >= 400) log.unexpected.push(`${r.status()} ${r.url()}`);
});
async function ready() {
  await page.locator('main h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  log.images += await page.evaluate(async () => {
    const a = [...document.images];
    for (const i of a) {
      i.loading = 'eager';
      await i.decode();
    }
    return a.length;
  });
}
async function layout() {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `overflow: ${page.url()} ${page.viewportSize().width}`,
  );
  log.layoutChecks++;
}
async function audit(name) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  log.axeScans++;
  for (const v of r.violations)
    log.violations.push({
      name,
      rule: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })).slice(0, 3),
    });
}
async function snap(name) {
  if (capture) {
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: `${out}/${name}.png` });
    log.screenshots.push(name);
  }
}
try {
  if (process.env.QA_FLOWS_ONLY !== '1') {
    for (const [device, width, height] of sets) {
      await page.setViewportSize({ width, height });
      for (const p of routes) {
        const res = await nav(p);
        assert.equal(res.status(), 200);
        assert.match(res.headers()['cache-control'], /private.*no-store/);
        assert.match(res.headers()['x-robots-tag'], /noindex/);
        assert.equal(res.headers()['referrer-policy'], 'no-referrer');
        await ready();
        await layout();
        await audit(device + p);
        assert.ok(!(await page.locator('.masthead,.mobile-tabs').count()));
        log.routeChecks++;
        if (
          p === '' ||
          p === '/importer' ||
          (device === 'desktop' &&
            [
              '/products',
              '/login',
              '/orders',
              '/inventory',
              '/analytics',
              '/settings',
              '/reviews',
              '/customers',
              '/products/new',
              '/products/no-record/edit',
              '/orders/no-record',
            ].includes(p))
        )
          await snap(`${device}-${p.slice(1).replaceAll('/', '-') || 'overview'}`);
      }
    }
    for (const width of [360, 430, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const p of ['', '/products', '/importer?step=4', '/settings']) {
        await nav(p);
        await ready();
        await layout();
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await nav('');
  await btn('Collapse sidebar').click();
  await btn('Expand sidebar').click();
  await page.keyboard.press('Control+k');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await label('Search workspace pages').fill('stock-no-match');
  await expect(dlg).toContainText('No matching pages');
  await label('Search workspace pages').fill('Orders');
  await audit('Page finder');
  await dlg.getByRole('link', { name: 'Orders' }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await page.setViewportSize({ width: 820, height: 1180 });
  await btn('Open navigation').click();
  await audit('Tablet navigation drawer');
  await dlg.getByRole('link', { name: 'Inventory' }).click();
  await expect(page).toHaveURL(/inventory$/);
  await btn('Open navigation').click();
  await page.keyboard.press('Escape');
  await expect(btn('Open navigation')).toBeFocused();
  done(
    'Sidebar, keyboard page finder, empty search, tablet drawer navigation, dismissal and focus restoration',
  );
  await nav('/login');
  await label('Admin email').fill('check@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('not-a-credential');
  await btn('Show password').click();
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveAttribute('type', 'text');
  await btn('Hide password').click();
  await btn('Sign in').click();
  await alert('No session was created');
  await btn('Forgot password?').click();
  await btn('Request recovery link').click();
  await alert('No email was requested');
  await btn('Back to sign-in').click();
  assert.equal(
    (await c.cookies()).some((c) => c.name === 'paradelle_staff'),
    false,
  );
  done('Private sign-in and recovery fail closed; password visibility and no session cookie');
  await page.setViewportSize({ width: 1440, height: 960 });
  await nav('/products');
  await label('Search products').fill('input');
  await btn('Apply search').click();
  await expect(page).toHaveURL(/[?&]q=input/);
  await label('Category').selectOption('cotton');
  await expect(page).toHaveURL(/category=cotton/);
  await label('Filter').selectOption('archived');
  await expect(page).toHaveURL(/status=archived/);
  await label('Sort by').selectOption('price-asc');
  await expect(page).toHaveURL(/sort=price-asc/);
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  done('Catalogue search, status and category filters, sorting, shareable query and clear');
  await nav('/products/new');
  await btn('Publish product').click();
  await alert('Enter a product title');
  await page.getByLabel(/Product title/).fill('Local validation input');
  await btn('Save draft').click();
  await alert('Nothing has been saved');
  await section('Specifications');
  await label('Fabric').fill('Unconfirmed input');
  await section('Sizes & stock');
  await btn('Add size').click();
  await label('Size', { exact: true }).fill('S');
  await label('Variant SKU').fill('local-only');
  await label('Stock').fill('2');
  await btn('Remove size S').click();
  await expect(page.getByText('No sizes added')).toBeVisible();
  await section('Images');
  await page.getByLabel('Choose image files').setInputFiles('public/admin/atelier.webp');
  await expect(page.getByText('Local previews · not uploaded')).toBeVisible();
  await btn('Preview selected image 1').click();
  await expect(dlg).toBeVisible();
  await audit('Local photo preview');
  await page.keyboard.press('Escape');
  await btn('Upload selected files').click();
  await alert('Confirm image rights');
  await page.getByLabel(/business has the right/).check();
  await btn('Upload selected files').click();
  await alert('Nothing has been saved');
  await btn('Remove preview').click();
  done(
    'Draft and publication validation, reversible size editor, local photo preview, rights gate and blocked upload',
  );
  await section('Pricing');
  await label('Sourcing cost (₹)').fill('500');
  await label('Target contribution margin (%)').fill('20');
  await label('GST treatment').selectOption('none');
  await btn('Use recommended price').click();
  await expect(label('Actual selling price (₹)')).toHaveValue('625');
  await expect(page.locator('.ad-summaryline')).toContainText('20.00%');
  await section('Preview');
  await expect(page.locator('.ad-preview')).toContainText('Local validation input');
  await btn('Back to products').click();
  await dlg.getByRole('button', { name: 'Go back' }).click();
  await btn('Back to products').click();
  await dlg.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  done(
    'Live pricing arithmetic in rupees, recommendation applied explicitly, preview and discard confirmation',
  );
  await nav('/importer');
  const next = () => page.getByRole('button', { name: /^Next: / }).click();
  await btn('Extract Product Details').click();
  await alert('valid HTTPS Meesho');
  await page
    .getByLabel(/Paste your Meesho product URL/)
    .fill('https://www.meesho.com/taj-kurti-for-women/p/6hnqz1');
  await btn('Extract Product Details').click();
  await alert('Confirm you are authorised');
  await page.getByLabel(/authorised to use the source/).check();
  await btn('Extract Product Details').click();
  await alert('Nothing has been saved');
  await btn('Start manual job').click();
  await alert('Nothing has been saved');
  await next();
  await label('Source title').fill('Local fact');
  await page
    .locator('.ad-fact')
    .filter({ has: page.getByLabel('Source title', { exact: true }) })
    .getByRole('checkbox')
    .check();
  await btn('Save source facts').click();
  await alert('Start or resume');
  await audit('Source fact sheet');
  await next();
  await page.getByLabel(/Product title/).fill('Local draft only');
  await btn('Generate from verified facts').click();
  await alert('Start or resume');
  await next();
  assert.equal(await page.locator('.ad-slot').count(), 5);
  await btn('Generate five square images').click();
  await alert('rights-cleared');
  await audit('Import image direction');

  await next();
  await expect(page.getByText('No authorised source reviews')).toBeVisible();
  await next();
  await expect(label('Actual selling price (₹)')).toBeVisible();
  await next();
  await expect(page.locator('.ad-preview')).toContainText('Local draft only');
  await btn('Approve & publish').click();
  await alert('five square garment images');
  await btn('Cancel import').click();
  await dlg.getByRole('button', { name: 'Go back' }).click();
  await next();
  await label('Filter').selectOption('failed');
  await expect(page).toHaveURL(/step=8.*status=failed/);
  await expect(page.getByRole('heading', { name: 'Import job tracker' })).toBeVisible();
  done(
    'All eight import stages: canonical URL, consent, manual facts, provenance, local copy, five empty slots, review rights, pricing, guarded approval, tracker filters',
  );
  await nav('/settings');
  await section('Contact details');
  await label('Support email').fill('invalid');
  await btn('Save contact details').click();
  await alert('Check the fields');
  await section('Pricing defaults');
  await label('Sourcing cost (₹)').fill('1');
  await section('Social links');
  await label('Instagram URL').fill('not-https');
  await btn('Save social links').click();
  await alert('HTTPS social links');
  await section('Store policies');
  await label('Policy').selectOption('returns-refunds');
  await btn('Add policy section').click();
  await label('Section 1 heading').fill('Local edit');
  await label('Section 1 text').fill('Unpublished local edit.');
  await btn('Save store policies').click();
  await dlg.getByRole('button', { name: 'Confirm settings' }).click();
  await alert('No settings were saved');
  await btn('Remove section').click();
  await section('SEO defaults');
  await expect(label('Default page title')).toBeVisible();
  await section('Admin profile');
  await expect(label('Display name')).toBeVisible();
  done(
    'All seven settings sections, validation, editable policy blocks, confirmation and unavailable-write handling',
  );
  for (const [kind, status, sort] of [
    ['orders', 'ordered-on-meesho', 'value-desc'],
    ['inventory', 'out-of-stock', 'stock-desc'],
    ['reviews', 'paradelle', 'rating-desc'],
    ['customers', '', 'spend-desc'],
  ]) {
    await nav(`/${kind}`);
    if (status) {
      await label('Filter').selectOption(status);
      await expect(page).toHaveURL(new RegExp(`status=${status}`));
    }
    await label('Sort by').selectOption(sort);
    await expect(page).toHaveURL(new RegExp(`sort=${sort}`));
  }
  await nav('/analytics');
  await label('Reporting period').selectOption('7');
  await expect(page).toHaveURL(/days=7/);
  await btn('weekly').click();
  await expect(btn('weekly')).toHaveAttribute('aria-pressed', 'true');
  await btn('monthly').click();
  await expect(btn('monthly')).toHaveAttribute('aria-pressed', 'true');
  assert.equal(await page.locator('.ad-plot').count(), 0);
  await nav('/customers');
  await label('Search customers').fill('ephemeral-query');
  await btn('Apply search').click();
  await expect(btn('Clear filters')).toBeVisible();
  assert.ok(!page.url().includes('ephemeral-query'));
  await btn('Clear filters').click();
  done('Customer search stays in a private request body, never the URL');
  done('Operational filters and sorting, reporting range and grouping; no chart rendered without real data');
  await page.setViewportSize({ width: 360, height: 800 });
  await nav('/importer');
  for (let i = 1; i <= 8; i++) {
    await label('Workflow step').selectOption(String(i));
    await expect(page).toHaveURL(new RegExp(`step=${i}`));
    await layout();
    await audit(`Mobile import step ${i}`);
  }
  await nav('/settings');
  for (const k of [
    'Store identity',
    'Contact details',
    'Pricing defaults',
    'Social links',
    'Store policies',
    'SEO defaults',
    'Admin profile',
  ]) {
    await section(k);
    await layout();
  }
  done('Mobile eight-stage selector and seven settings layouts at 360px');
  assert.equal(
    await page.evaluate(() =>
      [...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(
        (k) => k.includes('staff') || k.includes('admin'),
      ),
    ),
    false,
  );
  assert.ok(!(await (await c.request.get('/sitemap.xml')).text()).includes('/admin'));
  assert.match(await (await c.request.get('/robots.txt')).text(), /Disallow: \/admin/);
  if (capture) {
    await page.setViewportSize({ width: 1440, height: 960 });
    await nav('/importer?step=4');
    await ready();
    await snap('desktop-five-frames');
  }
  done('Private paths excluded from sitemap, crawler policy and no private browser storage');
} finally {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/admin-browser.json', JSON.stringify(log, null, 2));
  await b.close();
}
console.log(JSON.stringify(log, null, 2));
assert.deepEqual(log.unexpected, []);
assert.deepEqual(log.violations, []);
