import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import net from 'node:net';
import postgres from 'postgres';
import EmbeddedPostgres from 'embedded-postgres';
import { tx, closeDB, fresh, mac } from '../lib/server/base';
import {
  rights,
  blankDraft,
  dashboard,
  analytics,
  jobDetail,
  paged,
  orderRow,
  productRow,
  stockRow,
  customerRow,
  reviewRow,
  jobRow,
  orderDetail,
  type Viewer,
} from '../lib/admin/models';
import { execute } from '../lib/server/commands';
import { publicList } from '../lib/server/catalogue';
import {
  quote,
  paymentSession,
  verifyPayment,
  webhook,
  track,
  receiptFor,
  submitReview,
} from '../lib/server/checkout';
import { readStudio } from '../lib/server/studio';
import { runOne } from '../lib/server/worker';
import { dispatch } from '../lib/server/http';
import { grants } from '../lib/server/auth';
import { grounded } from '../lib/server/imports';
const port = () =>
  new Promise<number>((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const a = server.address() as net.AddressInfo;
      server.close(() => resolve(a.port));
    });
  });
test('Isolated merchant service · PostgreSQL transactions, access and provider contracts', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'paradelle-integration-'));
  const pw = fresh(),
    p = await port();
  const platform = new EmbeddedPostgres({
    databaseDir: join(dir, 'db'),
    user: 'postgres',
    password: pw,
    port: p,
    persistent: false,
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    onLog: () => {},
    onError: () => {},
  });
  let admin: ReturnType<typeof postgres> | undefined;
  const oldFetch = globalThis.fetch;
  try {
    await platform.initialise();
    await platform.start();
    const root = `postgres://postgres:${pw}@127.0.0.1:${p}/postgres`;
    admin = postgres(root, { max: 1, prepare: false, onnotice: () => {} });
    const sql = admin;
    await sql.unsafe(await readFile('supabase/tests/isolated-platform.sql', 'utf8'));
    for (const f of (await readdir('supabase/migrations')).sort())
      await sql.unsafe(await readFile(`supabase/migrations/${f}`, 'utf8'));
    const pass = randomBytes(20).toString('hex');
    await sql.unsafe(
      `create role integration_app login noinherit password '${pass}';grant paradelle_runtime to integration_app;`,
    );
    Object.assign(process.env, {
      DATABASE_URL: `postgres://integration_app:${pass}@127.0.0.1:${p}/postgres`,
      RAZORPAY_KEY_ID: 'rzp_test_localOnly',
      RAZORPAY_KEY_SECRET: fresh(),
      RAZORPAY_WEBHOOK_SECRET: fresh(),
      APP_HMAC_SECRET: fresh(),
      CHECKOUT_ENABLED: 'true',
      FAL_KEY: 'isolated',
      FAL_DAILY_SUBMISSION_LIMIT: '12',
    });
    const viewer: Viewer = {
        id: randomUUID(),
        name: 'Isolated staff',
        role: 'admin',
        permissions: [...rights],
      },
      other = randomUUID();
    for (const [id, on] of [
      [viewer.id, true],
      [other, false],
    ] as const) {
      await sql`insert into auth.users values(${id})`;
      await sql`insert into shop.profiles(id,email,full_name,role,is_active,permissions) values(${id},${`${id}@example.test`},'Isolated staff','admin',${on},${sql.array([...rights])})`;
    }
    await t.test(
      'Anonymous denied, active own profile visible; inactive denied; runtime cannot grant roles or edit snapshots',
      async () => {
        await assert.rejects(
          sql.begin(async (s) => {
            await s`set local role anon`;
            await s`select * from shop.orders`;
          }),
        );
        for (const [id, n] of [
          [viewer.id, 1],
          [other, 0],
        ] as const)
          await sql.begin(async (s) => {
            await s`set local role authenticated`;
            await s`select set_config('request.jwt.claim.sub',${id},true)`;
            assert.equal((await s`select * from shop.profiles`).length, n);
          });
        await assert.rejects(tx((s) => s`update profiles set is_active=true`));
        await assert.rejects(tx((s) => s`update order_items set quantity=1`));
        await assert.rejects(tx((s) => s`update orders set total_amount=1`));
        await assert.rejects(tx((s) => grants(s, other, ['orders'])));
        assert.equal((await sql`select count(*)::int n from storage.buckets where not public`)[0].n, 2);
      },
    );
    await sql`update shop.store_settings set shipping_paise=5000,serviceable_pins=array['411001']`;
    const photoId = randomUUID();
    await sql`insert into shop.assets(id,bucket,storage_path,purpose,width,height,rights_confirmed,created_by) values(${photoId},'product-images','product/isolated.webp','product',400,400,true,${viewer.id})`;
    const d = blankDraft();
    Object.assign(d, {
      title: 'Isolated cotton test',
      slug: 'isolated-cotton',
      sku: 'ONLY-TEST',
      category: 'cotton',
      shortDescription: 'Isolated garment',
      description: 'Verified test specification.',
      factsVerified: true,
      imageRights: true,
      pricePaise: 100000,
      sourceUrl: 'https://www.meesho.com/example/p/abc',
      costs: { ...d.costs, source: 35000, margin: 2000, tax: 'inclusive', gst: 500 },
    });
    Object.assign(d.attrs, { fabric: 'Cotton', colour: 'Ivory' });
    const variant = randomUUID();
    d.variants = [{ id: variant, size: 'Custom 42', sku: 'ONLY-42', enabled: true, stock: 2 }];
    d.images = [{ id: photoId, src: '/admin/media/test', alt: 'Isolated garment', width: 400, height: 400 }];
    const run = (b: unknown, key = randomUUID()) => execute(viewer, b, key);
    let product = '',
      _revision = 0;
    await t.test(
      'Audited draft→publish, ownership and stale-write gates; public projections exclude cost/source/private URLs',
      async () => {
        const a = await run({ op: 'product.save', ref: null, draft: d, intent: 'draft' });
        product = a.id;
        assert.equal((await publicList()).total, 0);
        const key = randomUUID(),
          cmd = { op: 'product.transition', refs: [{ id: a.id, revision: a.revision }], to: 'published' };
        const pub = await run(cmd, key);
        _revision = pub.revision;
        assert.deepEqual(await run(cmd, key), pub);
        await assert.rejects(run(cmd));
        await assert.rejects(run({ ...cmd, to: 'archived' }, key));
        const items = await publicList();
        assert.equal(items.total, 1);
        assert.ok(!JSON.stringify(items).includes('meesho.com'));
        assert.ok(!JSON.stringify(items).includes('35000'));
        assert.equal(items.products[0].variants[0].stock, 2);
      },
    );
    let quoteId = '',
      who = '';
    const payload = {
      address: {
        fullName: 'Isolated Buyer',
        mobile: '9123456780',
        address: 'Test-only lane, building 42',
        city: 'Pune',
        state: 'Maharashtra',
        pin: '411001',
      },
      termsAccepted: true,
      lines: [{ slug: d.slug, variantId: variant, quantity: 2 }],
      coupon: 'TEST10',
    };
    await sql`insert into shop.coupons(code,discount_type,discount_value,usage_limit,is_active) values('TEST10','bps',1000,1,true)`;
    await t.test(
      'Concurrent last-stock and limited coupon allocation, idempotent retry, address/price tamper, no unpaid customers',
      async () => {
        const owners = [fresh(), fresh()],
          keys = [randomUUID(), randomUUID()];
        const result = await Promise.allSettled(
          owners.map((owner, i) => quote(payload, owner, keys[i], 'isolated')),
        );
        const i = result.findIndex((x) => x.status === 'fulfilled');
        assert.equal(result.filter((x) => x.status === 'fulfilled').length, 1);
        const r = result[i];
        assert.ok(r.status === 'fulfilled');
        quoteId = r.value.id;
        who = owners[i];
        assert.equal(r.value.totalPaise, 185000);
        assert.deepEqual(await quote(payload, who, keys[i], 'isolated'), r.value);
        await assert.rejects(quote({ ...payload, pricePaise: 1 }, who, randomUUID(), 'isolated'));
        await assert.rejects(
          quote(
            { ...payload, address: { ...payload.address, pin: '000000' } },
            who,
            randomUUID(),
            'isolated',
          ),
        );
        assert.equal((await sql`select count(*)::int n from shop.customers`)[0].n, 0);
      },
    );
    let creates = 0;
    const pay = {
      id: 'pay_isolated1',
      order_id: 'order_isolated1',
      amount: 185000,
      status: 'captured',
      captured: true,
      currency: 'INR',
      method: 'upi',
    };
    let refundCalls = 0;
    globalThis.fetch = async (input, init) => {
      const u = String(input);
      if (u.endsWith('/v1/orders') && init?.method === 'POST') {
        creates++;
        return Response.json({ id: pay.order_id, amount: pay.amount, receipt: quoteId, currency: 'INR' });
      }
      if (u.endsWith('/v1/payments/pay_isolated1/refund')) {
        refundCalls++;
        const b = JSON.parse(String(init?.body));
        assert.equal(new Headers(init?.headers).get('X-Refund-Idempotency'), b.receipt);
        return Response.json({
          id: 'rfnd_isolated',
          payment_id: pay.id,
          amount: b.amount,
          currency: 'INR',
          status: 'pending',
          receipt: b.receipt,
        });
      }
      if (u.endsWith('/v1/payments/pay_isolated1')) return Response.json(pay);
      throw new Error('Unexpected test provider request');
    };
    const hook = (event: string, entity: unknown, id: string) => {
      const k = event.startsWith('refund.') ? 'refund' : 'payment';
      const raw = Buffer.from(JSON.stringify({ event, payload: { [k]: { entity } } }));
      return webhook(raw, mac(raw, process.env.RAZORPAY_WEBHOOK_SECRET || ''), id);
    };
    await t.test(
      'One gateway order; bad HMAC/amount and wrong guest rejected; webhook+callback replays settle exactly once',
      async () => {
        await assert.rejects(paymentSession(quoteId, fresh()));
        const sess = await paymentSession(quoteId, who);
        assert.equal((await paymentSession(quoteId, who)).orderId, sess.orderId);
        assert.equal(creates, 1);
        await assert.rejects(webhook(Buffer.from('{}'), '0'.repeat(64), 'evt1'));
        await assert.rejects(hook('payment.captured', { ...pay, amount: 1 }, 'badAmount'));
        const callback = {
          quoteId,
          razorpay_order_id: sess.orderId,
          razorpay_payment_id: pay.id,
          razorpay_signature: mac(`${sess.orderId}|${pay.id}`, process.env.RAZORPAY_KEY_SECRET || ''),
        };
        await assert.rejects(verifyPayment({ ...callback, razorpay_signature: '0'.repeat(64) }, who));
        await Promise.all([
          hook('payment.captured', pay, 'captured1'),
          verifyPayment(callback, who),
          hook('order.paid', pay, 'paid1'),
        ]);
        await hook('payment.captured', pay, 'captured1');
        await hook('payment.failed', { ...pay, status: 'failed' }, 'lateFail');
        for (const k of ['orders', 'order_items', 'customers', 'addresses', 'payments'])
          assert.equal((await sql`select count(*)::int n from shop.${sql(k)}`)[0].n, 1);
        assert.equal((await sql`select stock_quantity from shop.product_variants`)[0].stock_quantity, 0);
        assert.equal((await receiptFor(who, quoteId)).reference, 'PAR-00001');
        await assert.rejects(receiptFor(fresh(), quoteId));
      },
    );
    await t.test(
      'Authenticated staff RLS access requires orders+PII; tracking limited, masked and no addresses or provider IDs',
      async () => {
        await sql.begin(async (s) => {
          await s`set local role authenticated`;
          await s`select set_config('request.jwt.claim.sub',${viewer.id},true)`;
          assert.equal((await s`select id from shop.orders`).length, 1);
        });
        await sql`update shop.profiles set permissions=array['orders'] where id=${viewer.id}`;
        await sql.begin(async (s) => {
          await s`set local role authenticated`;
          await s`select set_config('request.jwt.claim.sub',${viewer.id},true)`;
          assert.equal((await s`select id from shop.orders`).length, 0);
        });
        await assert.rejects(readStudio(viewer, ['orders'], {}));
        await sql`update shop.profiles set permissions=${sql.array([...rights])} where id=${viewer.id}`;
        for (let i = 0; i < 4; i++) {
          const r = await track({ mobile: payload.address.mobile }, `ip${i}`);
          assert.equal(r.orders.length, 1);
          assert.ok(!/PAR-00001|pay_|Isolated Buyer|Pune|lane|912345/.test(JSON.stringify(r)));
        }
        await assert.rejects(track({ mobile: payload.address.mobile }, 'another'));
      },
    );
    let oid = '',
      orev = 0;
    const refreshOrder = async () => {
      const r = (await sql`select * from shop.orders where intent_id=${quoteId}`)[0];
      oid = r.id;
      orev = r.revision;
    };
    await t.test(
      'Manual state transitions and real reference required; verified review requires ownership and delivery',
      async () => {
        await refreshOrder();
        const review = {
          quoteId,
          productId: product,
          rating: 4,
          body: 'Isolated review; never publish to a real store.',
        };
        await assert.rejects(submitReview(review, who, 'test'));
        const manual = {
          status: 'shipped',
          sourceUrl: d.sourceUrl,
          meeshoRef: 'test-source-ref',
          costPaise: 72000,
          purchaseDate: '2025-01-01',
          tracking: 'test-shipment',
          trackingUrl: '',
          notes: '',
          carrier: 'Test',
        };
        await assert.rejects(run({ op: 'order.fulfil', ref: { id: oid, revision: orev }, manual }));
        for (const status of ['ordered-on-meesho', 'shipped', 'delivered']) {
          const r = await run({
            op: 'order.fulfil',
            ref: { id: oid, revision: orev },
            manual: { ...manual, status },
          });
          orev = r.revision;
        }
        await assert.rejects(submitReview(review, fresh(), 'test'));
        await submitReview(review, who, 'test');
        await assert.rejects(submitReview(review, who, 'test'));
        assert.equal((await publicList()).products[0].reviews.length, 0);
        const [rv] = await sql`select id,revision from shop.product_reviews`;
        await run({ op: 'review.moderate', ref: rv, to: 'published' });
        assert.equal((await publicList()).products[0].reviews.length, 1);
      },
    );
    await t.test(
      'Partial refund idempotency, pending vs processed, stale/out-of-order events, no fulfilment rollback',
      async () => {
        const key = randomUUID(),
          cmd = {
            op: 'order.refund',
            ref: { id: oid, revision: orev },
            amountPaise: 75000,
            reason: 'Isolated adjustment',
          };
        const res = await run(cmd, key);
        assert.equal(res.outcome, 'queued');
        assert.deepEqual(await run(cmd, key), res);
        await assert.rejects(run({ ...cmd, ref: { id: oid, revision: res.revision }, amountPaise: 200000 }));
        await runOne();
        assert.equal(refundCalls, 1);
        const ent = {
          id: 'rfnd_isolated',
          payment_id: pay.id,
          amount: 75000,
          currency: 'INR',
          status: 'processed',
          receipt: key,
        };
        await hook('refund.processed', ent, 'refund1');
        await hook('refund.created', { ...ent, status: 'pending' }, 'refund2');
        const [o] = await sql`select * from shop.orders`;
        assert.equal(o.payment_status, 'partially-refunded');
        assert.equal(o.fulfilment_status, 'delivered');
      },
    );
    await t.test(
      'Manual/restricted importer durable across reads; URL allowlist, incomplete jobs cannot publish, copy uses verified fields only',
      async () => {
        await assert.rejects(
          run({ op: 'import.start', method: 'extract', authorised: true, url: 'https://example.com/p/abc' }),
        );
        const r = await run({
          op: 'import.start',
          method: 'extract',
          authorised: true,
          url: 'https://www.meesho.com/example/p/abc?utm=1',
        });
        await runOne();
        const j = jobDetail.parse(await readStudio(viewer, ['imports', r.id], {}));
        assert.equal(j.stages.extraction, 'restricted');
        assert.equal(j.reviews.length, 0);
        const facts = [
          { field: 'title', value: 'Isolated title', verified: true, origin: 'manual' as const },
          { field: 'fabric', value: 'Unverified silk', verified: false, origin: 'manual' as const },
        ];
        const f = await run({ op: 'import.facts', ref: j, facts });
        assert.ok(!JSON.stringify(grounded(facts, ['fabric'])).includes('Unverified'));
        await assert.rejects(run({ op: 'import.finish', ref: f, intent: 'publish', draft: d }));
      },
    );
    await t.test(
      'Studio DTOs, bounded lists, private POST search, analytics based on actual captured/refunded records',
      async () => {
        for (const [k, model] of [
          ['products', productRow],
          ['orders', orderRow],
          ['reviews', reviewRow],
          ['inventory', stockRow],
          ['imports', jobRow],
          ['customers', customerRow],
        ] as const)
          paged(model).parse(JSON.parse(JSON.stringify(await readStudio(viewer, [k], {}))));
        orderDetail.parse(JSON.parse(JSON.stringify(await readStudio(viewer, ['orders', oid], {}))));
        dashboard.parse(JSON.parse(JSON.stringify(await readStudio(viewer, ['dashboard'], {}))));
        const r = analytics.parse(JSON.parse(JSON.stringify(await readStudio(viewer, ['analytics'], {}))));
        assert.equal(r.grossPaise, 185000);
        assert.equal(r.netPaise, 110000);
        assert.equal(r.orders, 1);
      },
    );
    await t.test(
      'Direct routes refuse anonymous staff, cross-origin mutations and arbitrary catalogue leakage',
      async () => {
        const get = (path: string) =>
          dispatch(new Request(`https://paradelle.store/api/${path}`), path.split('/'));
        assert.equal((await get('admin/orders')).status, 401);
        assert.equal((await get(`ai/import-jobs/${randomUUID()}`)).status, 401);
        assert.equal((await get('products/unknown')).status, 404);
        assert.equal((await get('products/isolated-cotton')).status, 200);
        const r = await dispatch(
          new Request('https://paradelle.store/api/orders/track', {
            method: 'POST',
            headers: { origin: 'https://example.test', 'content-type': 'application/json' },
            body: '{}',
          }),
          ['orders', 'track'],
        );
        assert.equal(r.status, 403);
      },
    );
    await t.test(
      'Five paid-provider queue contracts, content fact guard, saved references, human image review, exactly one import product',
      async () => {
        const { isolatedProviders } = await import('./provider-contract');
        const provider = await isolatedProviders(viewer.id);
        try {
          const { storeImage, deliverImage } = await import('../lib/server/media');
          const ref = await storeImage(
            provider.image,
            'reference',
            viewer,
            'Isolated licensed test reference',
          );
          await assert.rejects(deliverImage(ref.id));
          const j = await run({
            op: 'import.start',
            url: 'https://www.meesho.com/test-item/p/def',
            method: 'manual',
            authorised: true,
          });
          const facts = Object.entries({
            title: 'Isolated generated test',
            description: 'Verified only in an isolated environment.',
            fabric: 'Cotton',
            colour: 'Ivory',
            sizes: '42',
            price: '350',
          }).map(([field, value]) => ({ field, value, origin: 'manual', verified: true }));
          const f = await run({ op: 'import.facts', ref: j, facts });
          let state = await run({
            op: 'import.references',
            ref: f,
            referenceIds: [ref.id],
            rightsConfirmed: true,
          });
          const read = () =>
            readStudio(viewer, ['imports', j.id], {}).then((x) =>
              jobDetail.parse(JSON.parse(JSON.stringify(x))),
            );
          assert.equal((await read()).references.length, 1);
          state = await run({ op: 'import.content', ref: state });
          const imageReq = { op: 'import.images', ref: state, referenceIds: [ref.id], rightsConfirmed: true };
          state = await run(imageReq);
          await assert.rejects(run({ ...imageReq, ref: state }));
          for (let step = 0; step < 6; step++) await runOne();
          const [poll] =
            await sql`update shop.work_queue set attempts=8,run_after=now() where job_id=${j.id} and slot=2 returning provider_id`;
          provider.failedPolls.add(poll.provider_id);
          for (let step = 0; step < 20; step++) {
            await sql`update shop.work_queue set run_after=now() where job_id=${j.id}`;
            if (!(await runOne())) break;
          }
          let current = await read();
          assert.equal(current.stages.images, 'failed');
          provider.failedPolls.clear();
          await run({ op: 'import.retry', ref: current, stage: 'images' });
          await runOne();
          current = await read();
          assert.equal(current.stages.content, 'ready', current.error);
          assert.equal(current.stages.images, 'ready', current.error);
          assert.equal(current.images.length, 5);
          assert.equal(provider.images(), 5);
          assert.equal(current.images.filter((i) => i.approved).length, 0);
          assert.equal(current.suggestion?.attrs.fabric, 'Cotton');
          assert.equal(current.suggestion?.attrs.neckline, '');
          for (let i = 0; i < 5; i++) {
            await run({
              op: 'import.image',
              ref: current,
              slot: i,
              action: 'approve',
              alt: `Verified isolated view ${i + 1}`,
            });
            current = await read();
          }
          const draft = {
            ...d,
            images: current.images.map((x) => x.photo),
            sku: 'ISOLATED-IMPORTED',
            slug: 'isolated-imported',
            variants: d.variants.map((x) => ({ ...x, id: randomUUID(), sku: 'ISOLATED-42B' })),
          };
          state = await run({ op: 'import.finish', ref: current, draft, intent: 'draft' });
          const key = randomUUID(),
            approve = { op: 'import.finish', ref: state, draft, intent: 'publish' };
          const finish = await run(approve, key);
          assert.deepEqual(await run(approve, key), finish);
          const [r] = await sql`select product_id,status from shop.product_import_jobs where id=${j.id}`;
          assert.equal(r.status, 'published');
          assert.equal(
            (await sql`select count(*)::int n from shop.product_images where product_id=${r.product_id}`)[0]
              .n,
            5,
          );
          assert.equal((await deliverImage(current.images[0].photo?.id || '')).status, 200);
          assert.ok(
            !JSON.stringify(await sql`select input_manifest from shop.work_queue`).includes('?token='),
          );
        } finally {
          provider.restore();
        }
      },
    );
    await t.test(
      'Expired hold and lost webhook: authenticated reconciliation records the late capture without stealing another reservation',
      async () => {
        const { reconcileOne } = await import('../lib/server/checkout');
        await sql`update shop.product_variants set stock_quantity=1 where id=${variant}`;
        const buyer = fresh();
        const b = {
          ...payload,
          coupon: undefined,
          lines: [{ slug: d.slug, variantId: variant, quantity: 1 }],
          address: { ...payload.address, mobile: '9234567801' },
        };
        const q = await quote(b, buyer, randomUUID(), 'late');
        const pr = { ...pay, order_id: 'order_late', id: 'pay_late', amount: q.totalPaise };
        globalThis.fetch = async (url) =>
          String(url).endsWith('/payments')
            ? Response.json({ items: [pr] })
            : Response.json({ receipt: q.id, id: pr.order_id, amount: pr.amount, currency: 'INR' });
        await paymentSession(q.id, buyer);
        await sql`update shop.reservations set expires_at=now()-interval '1 minute' where intent_id=${q.id}`;
        await sql`update shop.checkout_intents set expires_at=now()-interval '1 minute',provider_claim=now()-interval '2 minutes' where id=${q.id}`;
        await quote(
          { ...b, address: { ...b.address, mobile: '9234567802' } },
          fresh(),
          randomUUID(),
          'late2',
        );
        await reconcileOne();
        const [o] =
          await sql`select fulfilment_status,exception_reason from shop.orders where intent_id=${q.id}`;
        assert.equal(o.fulfilment_status, 'cancelled');
        assert.ok(o.exception_reason);
        assert.equal(
          (await sql`select stock_quantity from shop.product_variants where id=${variant}`)[0].stock_quantity,
          1,
        );
        await sql`delete from shop.reservations`;
      },
    );
    await t.test(
      'Durable IP throttles, no profile promotion, failed refund releases balance; duplicate and unsigned provider notifications fail safely',
      async () => {
        const { limit } = await import('../lib/server/base');
        const id = 'one-budget';
        const a = await Promise.allSettled(
          Array.from({ length: 7 }, () => limit('isolated-budget', id, 3, 60)),
        );
        assert.equal(a.filter((x) => x.status === 'fulfilled').length, 3);
        await assert.rejects(tx((s) => s`update admin_activity_logs set action='erase'`));
        await refreshOrder();
        const key = randomUUID();
        await run(
          {
            op: 'order.refund',
            ref: { id: oid, revision: orev },
            amountPaise: 1000,
            reason: 'Isolated failed refund',
          },
          key,
        );
        const ent = {
          id: 'rfnd_failedTest',
          payment_id: pay.id,
          amount: 1000,
          currency: 'INR',
          status: 'failed',
          receipt: key,
        };
        await hook('refund.failed', ent, 'failed-refund-test');
        const state = await readStudio(viewer, ['orders', oid], {});
        const o = orderDetail.parse(JSON.parse(JSON.stringify(state)));
        assert.equal(o.refundablePaise, 110000);
        assert.equal(o.payment, 'partially-refunded');
        assert.ok(o.refunds?.some((f) => f.status === 'failed'));
      },
    );
    if (process.env.QA_COMMERCE_BROWSER === '1')
      await t.test(
        'Mobile bag → Standard Checkout fixture → verified receipt → masked tracking; real studio sign-in flow, order detail and immediate staff revocation',
        async () => {
          const { commerceBrowser } = await import('./commerce-browser');
          globalThis.fetch = oldFetch;
          await commerceBrowser(sql, viewer.id, variant);
        },
      );
  } finally {
    globalThis.fetch = oldFetch;
    await closeDB();
    await admin?.end({ timeout: 1 });
    await platform.stop();
    await rm(dir, { force: true, recursive: true });
  }
});
