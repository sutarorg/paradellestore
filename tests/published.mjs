// Exercise a merchant-supplied published PDP without inventing a garment or submitting any transaction.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const slug = process.env.QA_PRODUCT_SLUG;
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
  throw new Error('Supply QA_PRODUCT_SLUG for a real published Kurti with an in-stock variant.');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const ctx = await browser.newContext({
    baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
    viewport: { width: 410, height: 974 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const r = await page.goto(`/kurtis/${slug}`);
  assert.equal(r?.status(), 200);
  const json = await page.locator('script[type="application/ld+json"]').allTextContents();
  const p = json.map((s) => JSON.parse(s)).find((s) => s['@type'] === 'Product');
  assert.ok(p);
  assert.equal(p.offers.priceCurrency, 'INR');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.name);
  const wish = page.locator('.wishlist-full');
  await wish.click();
  await expect(wish).toHaveAttribute('aria-pressed', 'true');
  const add = page.locator('.buy-btn');
  await expect(add).toBeEnabled();
  if (await page.locator('.size-field').count()) {
    await add.click();
    await expect(page.locator('.purchase .field-error')).toBeVisible();
    await page.getByRole('button', { name: 'Size guide', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('[data-size]:enabled').first().click();
    await expect(page.locator('[data-size][aria-pressed=true]')).toHaveCount(1);
  }
  await add.click();
  await page.locator('.added-link').click();
  await expect(page.locator('.bag-line')).toHaveCount(1);
  await expect(page.locator('.bag-line h2')).toHaveText(p.name);
  await page.reload();
  await expect(page.locator('.bag-line')).toHaveCount(1);
  const increase = page.getByRole('button', { name: /Increase quantity/ });
  if (await increase.isEnabled()) {
    await increase.click();
    await expect(page.locator('output')).toHaveText('2');
    await page.getByRole('button', { name: /Decrease quantity/ }).click();
    await expect(page.locator('output')).toHaveText('1');
  }
  await page.getByRole('link', { name: 'Proceed to checkout' }).click();
  await expect(page).toHaveURL(/checkout$/);
  if (await page.locator('.checkout-form').count()) {
    await page.getByRole('button', { name: 'Review final total' }).click();
    await expect(page.locator('input[name=fullName]')).toBeFocused();
    assert.equal(await page.locator('input[type=password]').count(), 0);
    assert.ok(!(await page.locator('input[name=terms]').isChecked()));
  }
  await page.goto('/wishlist');
  await expect(page.locator('.product-card').first()).toContainText(p.name);
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your bag is empty.' })).toBeVisible();
  console.log(
    'Published PDP, shopper selections, bag, wishlist and guest checkout entry passed. No payment or order was created.',
  );
} finally {
  await browser.close();
}
