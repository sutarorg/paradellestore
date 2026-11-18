/** Read-only acceptance on a staging workspace containing merchant-supplied genuine records.
 * No write, publishing, upload, refund, extraction or generation action is submitted.
 * No PII, screenshots, traces or session exports are written by this runner.
 */
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const origin = process.env.QA_BASE_URL,
  state = process.env.QA_ADMIN_STORAGE_STATE;
if (!origin || !state)
  throw new Error(
    'Run only against authorised staging: set QA_BASE_URL and a protected, external QA_ADMIN_STORAGE_STATE file.',
  );
const u = new URL(origin);
if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(u.hostname))
  throw new Error('Staging requires HTTPS.');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const c = await b.newContext({ baseURL: origin, storageState: state, reducedMotion: 'reduce' }),
    p = await c.newPage();
  p.setDefaultTimeout(7000);
  const dlg = p.getByRole('dialog');
  const first = () => p.locator('.ad-table tbody tr').first();
  const cancel = () => dlg.getByRole('button', { name: 'Go back', exact: true }).click();
  await p.goto('/admin/products');
  await first().waitFor();
  await first().getByRole('checkbox').check();
  await p.locator('.ad-bulk').getByRole('button', { name: 'Archive', exact: true }).click();
  await cancel();
  await first()
    .getByRole('button', { name: /Actions for/ })
    .click();
  await dlg.getByRole('button', { name: 'Duplicate as draft' }).click();
  await cancel();
  await first()
    .getByRole('button', { name: /Actions for/ })
    .click();
  await dlg.getByRole('button', { name: 'Delete product' }).click();
  await cancel();
  await first()
    .getByRole('button', { name: /Actions for/ })
    .click();
  await dlg.getByRole('link', { name: 'View listing preview' }).click();
  await expect(p.locator('.ad-preview')).toBeVisible();
  await p.locator('.ad-editor-nav').getByRole('button', { name: 'Images', exact: true }).click();
  const picture = p.getByRole('button', { name: 'Preview image 1', exact: true });
  await picture.click();
  await expect(dlg).toBeVisible();
  await p.keyboard.press('Escape');
  await p.goto('/admin/inventory');
  await first().getByRole('button', { name: 'Adjust stock' }).click();
  await dlg.getByLabel(/Quantity change/).fill('1');
  await expect(dlg).toContainText('Resulting size stock');
  await cancel();
  await p.goto('/admin/orders');
  await first().locator('a').first().click();
  await expect(p.getByRole('heading', { name: 'Razorpay payment' })).toBeVisible();
  await expect(p.getByRole('heading', { name: 'Fulfilment desk' })).toBeVisible();
  await expect(p.getByRole('heading', { name: 'Order history' })).toBeVisible();
  await p.goto('/admin/customers');
  await first().getByRole('link', { name: 'Order history' }).click();
  await expect(p).toHaveURL(/customerId=/);
  await p.goto('/admin/reviews');
  await first().getByRole('button').first().click();
  await expect(dlg).toContainText('visibility');
  await cancel();
  await p.goto('/admin/importer?step=8');
  await first().getByRole('link', { name: 'Open job' }).click();
  await expect(p).toHaveURL(/job=/);
  assert.ok(!(await p.url()).includes('/login'));
  console.log('Genuine-record staging checks passed. No store mutation submitted.');
} finally {
  await b.close();
}
