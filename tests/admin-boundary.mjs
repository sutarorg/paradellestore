/** One-shot, loopback-only protocol checks. Empty registers and failure responses only; no store records. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import next from 'next';
import { chromium, expect } from '@playwright/test';
import { blankCosts } from '../lib/admin/models.ts';
const calls = [],
  checks = [];
const ok = (s) => {
  checks.push(s);
  console.log('PASS', s);
};
let role = 'customer',
  revoked = false,
  fault = 'none',
  writeStatus = 409;
const opaque = randomBytes(32).toString('hex');
const staff = { id: 'contract-probe', name: 'Protocol check', permissions: ['catalogue'] };
const empty = { rows: [], total: 0, page: 1, pageSize: 25 };
const api = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1'),
    path = url.pathname;
  calls.push(path);
  const send = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  if (path === '/auth/login') return send(200, { token: opaque, expiresIn: 60 });
  if (req.headers.authorization !== `Bearer ${opaque}` || revoked) return send(401, {});
  if (path === '/auth/session') return send(200, { ...staff, role });
  if (path === '/auth/logout') return send(204, null);
  if (path === '/products')
    return fault === 'down'
      ? send(503, { message: 'private-upstream-message' })
      : send(200, fault === 'schema' ? { rows: [] } : empty);
  if (path === '/pricing/defaults') return send(200, blankCosts());
  if (path === '/commands') {
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    assert.equal(JSON.parse(Buffer.concat(parts)).op, 'product.save');
    assert.match(req.headers['idempotency-key'], /^[a-f0-9-]{36}$/i);
    return send(writeStatus, { ok: true });
  }
  return send(404, {});
});
const listen = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
};
let app, server, b;
const close = (s) =>
  s &&
  new Promise((resolve) => {
    s.close(resolve);
    s.closeAllConnections();
  });
try {
  process.env.PARADELLE_ADMIN_API_URL = await listen(api);
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  app = next({ dev: false, hostname: '127.0.0.1' });
  await app.prepare();
  const handler = app.getRequestHandler();
  server = createServer((req, res) => handler(req, res));
  const base = await listen(server);
  b = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--disable-dev-shm-usage', '--disable-gpu'] }
      : {}),
  });
  const ctx = await b.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6500);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const count = (path) => calls.filter((v) => v === path).length;
  const cookie = async () => (await ctx.cookies()).find((c) => c.name === 'paradelle_staff');
  await p.goto('/admin/orders/no-record');
  await expect(p).toHaveURL(/\/admin\/login$/);
  assert.ok(!calls.includes('/orders/no-record'));
  ok('A direct protected URL without a cookie reaches login without reading the private record');
  await p.getByLabel('Admin email').fill('protocol@example.invalid');
  await p.getByLabel('Password', { exact: true }).fill(opaque.slice(0, 15));
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(p.getByText('Administrator access could not be verified.')).toBeVisible();
  assert.equal(await cookie(), undefined);
  ok('A valid-shaped provider response without an admin role cannot create a session');
  role = 'admin';
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(p).toHaveURL(/\/admin$/);
  const staffCookie = await cookie();
  assert.ok(
    staffCookie.httpOnly &&
      staffCookie.secure &&
      staffCookie.sameSite === 'Strict' &&
      staffCookie.path === '/admin',
  );
  assert.ok(!(await p.content()).includes(opaque));
  assert.ok(!(await p.evaluate(() => document.cookie)).includes(opaque));
  ok('A verified admin receives a Secure, HttpOnly, Strict, admin-path cookie, not a browser-visible token');
  await p.goto('/admin/customers');
  await expect(p.getByText('Access restricted', { exact: true })).toBeVisible();
  await p.getByLabel('Search customers', { exact: true }).fill('private-query');
  await p.getByRole('button', { name: 'Apply search' }).click();
  await expect(p.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  assert.ok(!p.url().includes('private-query'));
  assert.ok(!calls.includes('/customers') && !calls.includes('/customers/search'));
  ok('Verified non-PII scope cannot read customer rows or issue a private search upstream');
  await p.goto('/admin/products');
  await expect(p.getByText('No products yet')).toBeVisible();
  assert.ok(count('/products') > 0);
  ok('An authorised empty page is distinct from disconnected and forbidden states');
  fault = 'down';
  await p.reload();
  await expect(p.getByText('Unable to load this view')).toBeVisible();
  assert.ok(!(await p.content()).includes('private-upstream-message'));
  fault = 'schema';
  await p.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(p.getByText('Unable to load this view')).toBeVisible();
  fault = 'none';
  await p.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(p.getByText('No products yet')).toBeVisible();
  ok('Upstream outage and malformed data fail closed; no raw error leaks and Retry re-reads');
  await p.goto('/admin/products/no-record/edit');
  await expect(p.getByText('Record not found', { exact: true })).toBeVisible();
  ok('Authorised, missing product shows a distinct not-found state');
  await p.goto('/admin/products/new');
  await p.getByLabel(/Product title/).fill('Unsaved contract probe');
  const save = p.getByRole('button', { name: 'Save draft', exact: true });
  await save.click();
  await expect(p.locator('.ad-info').filter({ hasText: 'This record changed' })).toBeVisible();
  writeStatus = 200;
  await save.click();
  await expect(p.locator('.ad-info').filter({ hasText: 'No confirmation was received' })).toBeVisible();
  assert.equal(count('/commands'), 2);
  ok(
    'Commands require explicit revisions/idempotency and a typed receipt; 409 and ambiguous 200 are not success',
  );
  revoked = true;
  const before = count('/commands');
  await save.click();
  await expect(p.locator('.ad-info').filter({ hasText: 'requires a verified administrator' })).toBeVisible();
  assert.equal(count('/commands'), before);
  ok('Revoking a session on an already-mounted editor blocks the next Server Action before mutation');
  revoked = false;
  await p.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(p).toHaveURL(/\/admin\/login$/);
  assert.equal(await cookie(), undefined);
  assert.ok(calls.includes('/auth/logout'));
  assert.deepEqual(errors, []);
  ok('Sign-out expires the browser session and requests server-side revocation');
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/admin-boundary.json',
    JSON.stringify({ checks, storedMerchantRecords: 0 }, null, 2),
  );
} finally {
  if (b) await b.close();
  await close(server);
  if (app) await app.close();
  await close(api);
}
