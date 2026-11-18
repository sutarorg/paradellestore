import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import next from 'next';
import { chromium } from '@playwright/test';
import type postgres from 'postgres';
import { isolatedProviders } from './provider-contract';
export async function commerceBrowser(sql: ReturnType<typeof postgres>, staff: string, variant: string) {
  process.env.GA4_MEASUREMENT_ID = 'G-QATEST123';
  process.env.META_PIXEL_ID = '112233445566';
  const provider = await isolatedProviders(staff);
  for (const asset of await sql`select storage_path from shop.assets`) provider.files.add(asset.storage_path);
  const app = next({ dev: false, hostname: '127.0.0.1' });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const server = createServer((q, r) => app.getRequestHandler()(q, r));
  try {
    await app.prepare();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    process.env.SITE_ORIGIN = base;
    await sql`update shop.product_variants set stock_quantity=3 where id=${variant}`;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
    });
    const ctx = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(7500);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://checkout.razorpay.com/v1/checkout.js', (r) =>
      r.fulfill({
        contentType: 'application/javascript',
        body: `window.Razorpay=class{constructor(opts){this.o=opts}on(){}open(){window.__testOrder=this.o.order_id;window.__testComplete=(signature)=>this.o.handler({razorpay_order_id:this.o.order_id,razorpay_payment_id:this.o.order_id.replace('order_','pay_'),razorpay_signature:signature})}};`,
      }),
    );
    const events: { channel: string; name: string; payload: string }[] = [];
    let tagLoads = 0;
    await page.exposeFunction('observeQAEvent', (channel: string, name: string, data: unknown) =>
      events.push({ channel, name, payload: JSON.stringify(data) }),
    );
    await page.route('https://www.googletagmanager.com/**', (r) => {
      tagLoads++;
      return r.fulfill({
        contentType: 'application/javascript',
        body: `for(const a of window.dataLayer||[])if(a[0]==='event')window.observeQAEvent('ga',a[1],a[2]);window.gtag=(...a)=>{if(a[0]==='event')window.observeQAEvent('ga',a[1],a[2])}`,
      });
    });
    await page.route('https://connect.facebook.net/**', (r) => {
      tagLoads++;
      return r.fulfill({
        contentType: 'application/javascript',
        body: `const f=window.fbq;const recv=(...a)=>{if(['track','trackCustom'].includes(a[0]))window.observeQAEvent('meta',a[1],a[2])};for(const a of f.queue)recv(...a);f.callMethod=recv`,
      });
    });
    await page.goto('/kurtis');
    assert.equal(tagLoads, 0);
    await page.getByRole('button', { name: 'Privacy choices' }).click();
    await page.getByLabel(/Allow Google Analytics/).check();
    await page.getByLabel(/Allow Meta/).check();
    await page.getByRole('button', { name: 'Save choices' }).click();
    await page.waitForFunction(() => document.querySelector('iframe[title="Optional measurement"]'));
    await page.getByRole('link', { name: 'Isolated cotton test', exact: true }).first().click();
    assert.equal(
      await page.locator('.gallery-main img').evaluate(async (el) => {
        const img = el as HTMLImageElement;
        await img.decode();
        return img.naturalWidth > 0;
      }),
      true,
    );
    await page.getByRole('button', { name: 'Custom 42', exact: true }).click();
    await page.getByRole('button', { name: /Add to bag/ }).click();
    await page.getByRole('link', { name: /Added to your bag/ }).click();
    await page.getByRole('heading', { name: 'Order summary' }).waitFor();
    await page.goto('/checkout');
    await page.getByLabel('Full name').fill('Isolated Browser');
    await page.getByLabel('Mobile number').fill('9876543211');
    await page.getByLabel('Complete delivery address').fill('QA only example address 123');
    await page.locator('[name="city"]').fill('Pune');
    await page.locator('[name="state"]').fill('Maharashtra');
    await page.locator('[name="pin"]').fill('411001');
    await page.locator('[name="terms"]').check();
    await page.getByRole('button', { name: 'Review final total' }).click();
    await page.getByRole('button', { name: /^Pay ₹/ }).click();
    await page.waitForFunction(() => Reflect.has(window, '__testOrder'), {}, { timeout: 10000 });
    const id = await page.evaluate(() => String(Reflect.get(window, '__testOrder')));
    await page.evaluate((sig) => Reflect.get(window, '__testComplete')(sig), provider.sign(id));
    await page.getByRole('heading', { name: 'Order Confirmed' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Order Confirmed' }).waitFor();
    assert.equal(
      (await sql`select count(*)::int n from shop.orders where customer_phone_snapshot='9876543211'`)[0].n,
      1,
    );
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('9876543211'));
    const [order] =
      await sql`select id,order_number from shop.orders where customer_phone_snapshot='9876543211'`;
    await page.waitForFunction(() => document.querySelector('iframe[title="Optional measurement"]'));
    await page.getByRole('button', { name: 'Privacy choices' }).click();
    await page.getByRole('button', { name: 'Reject optional tracking' }).click();
    assert.equal(await page.locator('iframe[title="Optional measurement"]').count(), 0);
    assert.ok(tagLoads >= 2);
    assert.equal(
      events.filter((x) => x.name === 'purchase').length,
      1,
      JSON.stringify(events.map((x) => x.name)),
    );
    assert.equal(events.filter((x) => x.name === 'Purchase').length, 1);
    assert.ok(!events.some((x) => /9876543211|Pune|Isolated Browser|quoteId|razorpay/i.test(x.payload)));
    await page.goto('/track-order');
    await page.locator('#track-mobile').fill('9876543211');
    await page.getByRole('button', { name: 'Track order', exact: true }).click();
    await page.getByRole('heading', { name: 'Payment confirmed' }).waitFor();
    const result = await page.locator('.tracking-result').textContent();
    assert.ok(result && !result.includes(order.order_number) && !result.includes('Isolated Browser'));
    const ctx2 = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
    const desk = await ctx2.newPage();
    desk.setDefaultTimeout(8000);
    await desk.goto(`/admin/orders/${order.id}`);
    await desk.getByLabel('Admin email').fill(provider.email);
    await desk.locator('[autocomplete=current-password]').fill(provider.password);
    await desk.getByRole('button', { name: 'Sign in', exact: true }).click();
    await desk.waitForURL((url) => url.pathname === '/admin');
    await desk.goto(`/admin/orders/${order.id}`);
    await desk.getByRole('heading', { name: order.order_number }).waitFor();
    assert.ok((await desk.locator('main').textContent())?.includes('Isolated Browser'));
    const cookie = (await ctx2.cookies()).find((c) => c.name === 'paradelle_staff');
    assert.ok(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Strict');
    const rr = await ctx2.request.get(`/api/admin/orders/${order.id}`);
    assert.equal(rr.status(), 200);
    assert.equal((await rr.json()).payment, 'paid');
    await sql`update shop.profiles set is_active=false where id=${staff}`;
    assert.equal((await ctx2.request.get(`/api/admin/orders/${order.id}`)).status(), 403);
    await sql`update shop.profiles set is_active=true where id=${staff}`;
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await app.close();
    provider.restore();
  }
}
