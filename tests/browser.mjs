/** Read-only storefront QA. No product seeds, orders, subscriptions or payment requests. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const output = process.env.QA_CAPTURE_DIR || 'test-results/screenshots';
const capture = process.env.QA_CAPTURE === '1';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH, args: ['--disable-dev-shm-usage', '--disable-gpu'] }
    : {}),
});
const summary = {
  routeChecks: 0,
  layoutChecks: 0,
  imageChecks: 0,
  structuredData: 0,
  links: 0,
  accessibilityScans: 0,
  interactions: [],
  expected404: 0,
  cancelledNavigationRequests: 0,
  errors: [],
  violations: [],
  localPerformance: null,
};
const linkTargets = new Set();
const ctx = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 960 },
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();
page.setDefaultTimeout(6000);
const absent = '/kurtis/unpublished-piece';
const missing = '/page-not-in-the-storefront';
const routes = [
  '/',
  '/kurtis',
  '/cart',
  '/checkout',
  '/wishlist',
  '/order-success',
  '/track-order',
  '/about',
  '/contact',
  '/shipping-policy',
  '/returns-refunds',
  '/privacy-policy',
  '/terms',
  absent,
  missing,
];
function monitor(p) {
  p.on('pageerror', (e) => summary.errors.push(`JS ${e.message}`));
  p.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !(m.text().includes('404') && [absent, missing].some((u) => m.location().url.includes(u)))
    )
      summary.errors.push(`Console ${m.text()} ${m.location().url}`);
  });
  p.on('requestfailed', (r) => {
    if (r.failure()?.errorText?.includes('ERR_ABORTED')) summary.cancelledNavigationRequests++;
    else summary.errors.push(`Network ${r.failure()?.errorText} ${r.url()}`);
  });
  p.on('response', (r) => {
    if (r.status() >= 400) {
      if (r.status() === 404 && [absent, missing].includes(new URL(r.url()).pathname)) summary.expected404++;
      else summary.errors.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });
}
monitor(page);
async function audit(label) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  summary.accessibilityScans++;
  for (const v of result.violations)
    summary.violations.push({
      label,
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })).slice(0, 4),
    });
}
async function readyImages() {
  await page.locator('main h1').waitFor({ state: 'attached' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (i) => {
        i.loading = 'eager';
        await i.decode();
      }),
    );
  });
}
async function metricsAndLayout(route, width) {
  const data = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    view: innerWidth,
    imgs: [...document.images].map((i) => [i.alt, i.naturalWidth]),
    headings: document.querySelectorAll('main h1').length,
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((el) =>
      JSON.parse(el.textContent),
    ),
    links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
    title: document.title,
    canonical: document.querySelector('link[rel=canonical]')?.href,
  }));
  assert.ok(data.w <= data.view, `${route} overflows at ${width}: ${data.w}`);
  assert.equal(data.headings, 1, `${route} primary heading`);
  assert.ok(data.title);
  assert.ok(data.canonical);
  for (const [alt, w] of data.imgs) {
    assert.notEqual(alt, null);
    assert.ok(w, `Image did not decode at ${route} ${width}: ${alt}`);
    summary.imageChecks++;
  }
  summary.structuredData += data.ld.length;
  for (const url of data.links) {
    if (new URL(url).origin === new URL(base).origin) linkTargets.add(url);
  }
  summary.layoutChecks++;
}
async function shot(name) {
  if (capture) {
    await readyImages();
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
  }
}
function done(name) {
  summary.interactions.push(name);
  console.log('PASS', name);
}
try {
  await ctx.addInitScript(() => {
    window.__localVitals = { lcp: 0, cls: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__localVitals.lcp = Math.round(e.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__localVitals.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  if (process.env.QA_ONLY !== 'flows') {
    for (const [label, width, height] of [
      ['mobile', 410, 974],
      ['tablet', 820, 1180],
      ['desktop', 1440, 960],
    ]) {
      await page.setViewportSize({ width, height });
      for (const route of routes) {
        const r = await page.goto(route);
        assert.equal(r?.status(), [absent, missing].includes(route) ? 404 : 200, route);
        await readyImages();
        await metricsAndLayout(route, width);
        summary.routeChecks++;
        await audit(`${label} ${route}`);
        if (route === '/') {
          await shot(`${label}-home`);
          if (label === 'desktop')
            summary.localPerformance = await page.evaluate(() => ({
              ...window.__localVitals,
              ttfbMs: Math.round(performance.getEntriesByType('navigation')[0].responseStart),
            }));
        }
        if (route === '/kurtis' && label === 'desktop') await shot('desktop-collection');
      }
      console.log('PASS route matrix', label, width);
    }
    for (const width of [360, 390, 430, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      for (const route of ['/', '/kurtis', '/about', '/track-order']) {
        await page.goto(route);
        await readyImages();
        await metricsAndLayout(route, width);
      }
    }
    await page.setViewportSize({ width: 404, height: 974 });
    await page.goto('/kurtis');
    await shot('mobile-collection');
    await page.setViewportSize({ width: 408, height: 974 });
    await page.goto('/about');
    await shot('mobile-lookbook');
    // Check every internal destination discovered in the route matrix. Anchor targets must exist in HTML.
    for (const url of linkTargets) {
      const u = new URL(url);
      const r = await ctx.request.get(url);
      assert.ok(
        r.status() < 400 || ([absent, missing].includes(u.pathname) && u.hash),
        `${r.status()}: ${u.pathname}`,
      );
      if (u.hash && !(await r.text()).includes(`id="${decodeURIComponent(u.hash.slice(1))}"`)) {
        await page.goto(url);
        await expect(page.locator(u.hash)).toBeAttached();
      }
      summary.links++;
    }
    for (const path of ['/sitemap.xml', '/robots.txt', '/icon.svg'])
      assert.equal((await ctx.request.get(path)).status(), 200);
    done('Internal destinations, fragment targets, sitemap, robots and icon');
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Next campaign' }).click();
  await expect(page.locator('.campaign h1')).toContainText('Poetry');
  await page.getByRole('button', { name: 'Previous campaign' }).click();
  await expect(page.locator('.campaign h1')).toContainText('Elegance');
  await page.getByRole('button', { name: 'Show The occasion edit', exact: true }).click();
  await expect(page.locator('.campaign h1')).toContainText('Motion');
  done('Manual campaign arrows, direct selection and slide content');
  await page.locator('.shop-disclosure summary').click();
  await page.locator('.shop-popover').getByRole('link', { name: 'Cotton Kurtis' }).click();
  await expect(page).toHaveURL(/category=cotton/);
  await expect(page.locator('h1')).toHaveText('Cotton Kurtis');
  done('Desktop shop menu and category destination');
  await page.getByRole('button', { name: 'Open search' }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await audit('search dialog');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open search' })).toBeFocused();
  await page.getByRole('button', { name: 'Open search' }).click();
  await page.getByRole('searchbox').fill('print');
  await page.getByRole('button', { name: 'Submit search' }).click();
  await expect(page).toHaveURL(/q=print/);
  await expect(page.locator('h1')).toHaveText('Search results');
  done('Search query, accessible dialog, Escape and restored focus');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/kurtis');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Minimum (₹)').fill('500');
  await page.getByLabel('Maximum (₹)').fill('100');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('maximum price');
  await page.getByLabel('Maximum (₹)').fill('1200');
  await page.getByLabel('In stock', { exact: true }).check();
  await audit('filter sheet');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/availability=In\+stock/);
  await page.getByRole('link', { name: 'Remove In stock filter' }).click();
  await expect(page).not.toHaveURL(/availability=/);
  await page.getByRole('button', { name: /^Filter/ }).click();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).not.toHaveURL(/min=/);
  done('Filter sheet, price validation, availability, apply/remove/reset');
  await page.getByLabel('Sort Kurtis').selectOption('price-desc');
  await expect(page).toHaveURL(/sort=price-desc/);
  await page.reload();
  await expect(page.getByLabel('Sort Kurtis')).toHaveValue('price-desc');
  await page.goto('/kurtis');
  await expect(page.getByLabel('Sort Kurtis')).toHaveValue('price-desc');
  await page.getByLabel('Sort Kurtis').selectOption('recommended');
  await expect(page).not.toHaveURL(/sort=/);
  done('Sort URLs, persistence across refresh and remembered preference');
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await audit('mobile navigation');
  await page.getByRole('dialog').getByRole('link', { name: 'Wishlist' }).click();
  await expect(page).toHaveURL(/wishlist$/);
  await expect(page.getByRole('heading', { name: 'Keep your favourites here.' })).toBeVisible();
  await page.locator('.mobile-tabs').getByRole('link', { name: 'New in' }).click();
  await expect(page).toHaveURL(/edit=new/);
  done('Mobile drawer, wishlist and bottom navigation');
  await page.goto('/about');
  await page.getByRole('button', { name: /View image 2:/ }).click();
  await expect(page.locator('.gallery-main img')).toHaveAttribute('alt', /Indigo/);
  await page.getByRole('button', { name: 'View full-screen image' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.full-image img')).toHaveAttribute('alt', /Sage/);
  await page.getByRole('button', { name: 'Previous image' }).click();
  await audit('fullscreen gallery');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'View full-screen image' })).toBeFocused();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.locator('.gallery-main').scrollIntoViewIfNeeded();
  const box = await page.locator('.gallery-main').boundingBox();
  assert.ok(box);
  const cy = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width * 0.72, y: cy }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: box.x + box.width * 0.3, y: cy }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(page.locator('.gallery-main img')).toHaveAttribute('alt', /Sage/);
  done('Shared product/lookbook gallery: thumbnails, fullscreen, arrows, swipe and focus');
  await page.goto('/track-order');
  await page.getByLabel('Mobile number').fill('12');
  await page.getByRole('button', { name: 'Track order', exact: true }).click();
  await expect(page.getByLabel('Mobile number')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Mobile number').fill('9000000000');
  await page.getByRole('button', { name: 'Track order', exact: true }).click();
  await expect(page.locator('#tracking-message')).toContainText('not available');
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('9000000000'));
  done('Tracking validation, service-unavailable state and no stored mobile number');
  await page.goto('/order-success?success=true&paid=true');
  await expect(page.getByRole('heading', { name: 'No confirmed order to display.' })).toBeVisible();
  await page.goto('/order-success?receipt=ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  await expect(page.getByRole('heading', { name: 'No confirmed order to display.' })).toBeVisible();
  done('Unverified callbacks cannot show confirmation');
  // An orphaned browser reference is not a fabricated product: it has no product data or price.
  await page.evaluate(() =>
    localStorage.setItem(
      'paradelle:shopping:v1',
      JSON.stringify({
        cart: [{ slug: 'removed-reference', variantId: 'removed', quantity: 2 }],
        wishlist: ['removed-reference'],
        recent: [],
        sort: 'recommended',
      }),
    ),
  );
  await page.goto('/cart');
  await expect(page.getByText('Piece no longer available')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Shopping bag, 2 items' })).toBeVisible();
  await page.getByRole('button', { name: /Decrease quantity/ }).click();
  await expect(page.locator('output')).toHaveText('1');
  await page.reload();
  await expect(page.locator('output')).toHaveText('1');
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Your bag needs a quick review.' })).toBeVisible();
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your bag is empty.' })).toBeVisible();
  await page.goto('/wishlist');
  await page.getByRole('button', { name: 'Remove from wishlist' }).click();
  await expect(page.getByRole('heading', { name: 'Keep your favourites here.' })).toBeVisible();
  done('Stale references, bag count, quantity, refresh, removal and checkout guard');
  await page.goto('/privacy-policy');
  await page.getByRole('button', { name: 'Clear shopping data' }).click();
  await expect(page.getByRole('button', { name: 'Keep my data' })).toBeFocused();
  await page.getByRole('button', { name: 'Keep my data' }).click();
  await page.getByRole('button', { name: 'Clear shopping data' }).click();
  await page.getByRole('button', { name: 'Clear data', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('paradelle:shopping:v1')), null);
  done('Privacy control: non-destructive default, cancel and forget device');
  await page.evaluate(() => localStorage.setItem('paradelle:shopping:v1', '{damaged'));
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Your bag is empty.' })).toBeVisible();
  const blocked = await browser.newContext({ baseURL: base });
  await blocked.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'])
      Storage.prototype[method] = () => {
        throw new DOMException('Storage unavailable', 'SecurityError');
      };
  });
  const b = await blocked.newPage();
  monitor(b);
  await b.goto('/cart');
  await expect(b.getByRole('heading', { name: 'Your bag is empty.' })).toBeVisible();
  await blocked.close();
  done('Corrupt and denied browser storage recovery');
  await page.goto('/contact');
  await page.getByText('Do I need an account?', { exact: true }).click();
  await expect(
    page.getByText('No. You can browse, save favourites, check out and track an order without registering.'),
  ).toBeVisible();
  done('Support accordions and care navigation');
  console.log(
    'SUMMARY',
    JSON.stringify(
      { ...summary, errors: summary.errors.slice(0, 6), violations: summary.violations.slice(0, 5) },
      null,
      2,
    ),
  );
  assert.equal(summary.errors.length, 0, 'Unexpected console/network errors');
  assert.equal(summary.violations.length, 0, 'Automated accessibility violations');
} finally {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/browser.json', JSON.stringify(summary, null, 2));
  await browser.close();
}
