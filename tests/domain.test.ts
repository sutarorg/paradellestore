import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogueSchema,
  paymentSessionSchema,
  quoteSchema,
  receiptSchema,
  settingsSchema,
  trackingSchema,
  productSchema,
} from '../lib/contracts';
import {
  discount,
  discover,
  fingerprint,
  formatMobile,
  getFacets,
  maskReference,
  money,
  nextQuantity,
  parseQuery,
  queryHref,
  shipping,
  validMobile,
} from '../lib/shop';
import { restore } from '../lib/device';
import { categories, categoryHref } from '../lib/content';
// These tests use primitive boundary values, not a seeded catalogue or simulated orders.
test('every category has a stable, shareable collection URL', () => {
  for (const c of categories) assert.equal(queryHref(parseQuery({ category: c.slug })), categoryHref(c.slug));
});
test('query defaults and unsupported values are safe', () => {
  const q = parseQuery({ category: 'unknown', sort: 'random', min: '-4', max: 'Infinity', page: '-1' });
  assert.equal(queryHref(q), '/kurtis');
});
test('search, sort and repeated facet selections round-trip', () => {
  const q = parseQuery({
    q: ' cotton & rayon ',
    size: ['M', 'M', 'L'],
    colour: 'Ivory',
    min: '100',
    max: '900.25',
    sort: 'price-desc',
    page: '2',
  });
  const url = new URL(queryHref(q), 'https://paradelle.store');
  assert.equal(url.searchParams.get('q'), 'cotton & rayon');
  assert.deepEqual(url.searchParams.getAll('size'), ['M', 'L']);
  assert.equal(url.searchParams.get('max'), '900.25');
  assert.equal(url.searchParams.get('sort'), 'price-desc');
  assert.equal(url.searchParams.get('page'), '2');
});
test('empty catalogue has zero products, no invented facets and bounded pagination', () => {
  assert.deepEqual(discover([], parseQuery({ page: '999' })), { items: [], total: 0, page: 1, pages: 1 });
  assert.deepEqual(getFacets([]), {
    fabric: [],
    size: [],
    style: [],
    colour: [],
    availability: [],
    occasion: [],
  });
});
test('rupee formatting preserves real paise and Indian grouping', () => {
  assert.equal(money(10000000), '₹1,00,000');
  assert.equal(money(125), '₹1.25');
});
test('unknown shipping is never changed to free shipping', () => {
  assert.equal(shipping(50000, {}), null);
  assert.equal(shipping(50000, { flatShippingPaise: 700 }), 700);
  assert.equal(shipping(50000, { flatShippingPaise: 700, freeShippingFromPaise: 50000 }), 0);
});
test('reductions require MRP strictly above selling price', () => {
  assert.equal(discount(200), 0);
  assert.equal(discount(200, 190), 0);
  assert.equal(discount(200, 210), 10);
});
test('adding a unit cannot exceed variant stock or the per-line limit', () => {
  assert.equal(nextQuantity(2, 1, 2), 2);
  assert.equal(nextQuantity(0, 1, 0), 0);
  assert.equal(nextQuantity(2, 1, 6), 3);
  assert.equal(nextQuantity(99, 1, 100), 99);
  assert.equal(nextQuantity(0, -2, 100), 0);
});
test('tracking validates Indian mobile input and masks references', () => {
  assert.ok(!validMobile('12'));
  assert.ok(!validMobile('0011223344'));
  assert.ok(validMobile('+91 90000 00000'));
  assert.equal(formatMobile('+91 90000 00000'), '9000000000');
  assert.equal(maskReference('ABCDEFGH'), '•••• EFGH');
});
test('storage recovers from missing, malformed and wrongly shaped JSON', () => {
  for (const s of [
    null,
    '{',
    'null',
    '5',
    'false',
    '{"cart":[null,{}, {"quantity":-2}],"wishlist":[3],"sort":"invalid"}',
  ])
    assert.deepEqual(restore(s), restore(null));
});
test('versioned storage discards invalid entries, secrets and expired addresses', () => {
  assert.deepEqual(
    restore(
      JSON.stringify({
        recent: ['k', 'k', null],
        sort: 'newest',
        address: { expires: 0, value: {} },
        card: 'not accepted',
        pending: { quoteId: 22 },
      }),
    ),
    { cart: [], recent: ['k'], wishlist: [], sort: 'newest', address: null, pending: null },
  );
  assert.equal(fingerprint([]), '[]');
});
test('default settings enable no unconfigured transaction or messaging service', () => {
  const s = settingsSchema.parse({});
  assert.ok(!s.checkoutEnabled && !s.trackingEnabled && !s.contactEnabled && !s.newsletterEnabled);
  assert.equal(s.flatShippingPaise, undefined);
});
test('catalogue records need actual publishable garment data', () => {
  assert.ok(catalogueSchema.safeParse({ products: [] }).success);
  assert.ok(!productSchema.safeParse({ published: true }).success);
  assert.ok(!catalogueSchema.safeParse({ products: [null] }).success);
});
test('a browser flag, a pending payment or a callback alone is never a receipt', () => {
  for (const v of [
    { success: true },
    { verified: true },
    { paymentStatus: 'captured' },
    { verified: false, paymentStatus: 'captured' },
    { verified: true, paymentStatus: 'authorized' },
  ])
    assert.ok(!receiptSchema.safeParse(v).success);
});
test('payment handoff rejects unrelated origins, malformed quotes and non-HTTPS links', () => {
  for (const url of ['http://rzp.io/', 'https://example.org/', 'javascript:void(0)'])
    assert.ok(!paymentSessionSchema.safeParse({ quoteId: 'q', paymentUrl: url }).success);
  assert.ok(!quoteSchema.safeParse({ currency: 'USD' }).success);
});
test('tracking accepts a genuine empty result and rejects an ambiguous body', () => {
  assert.deepEqual(trackingSchema.parse({ orders: [] }), { orders: [] });
  assert.ok(!trackingSchema.safeParse({ success: true }).success);
});

test('device actions persist only identifiers; quantity, wishlist and recent views are reversible', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
  });
  const store = await import('../lib/device');
  const current = () => restore(values.get(store.STORAGE_KEY) ?? null);
  try {
    assert.equal(store.addToBag('a', 'v', 2), true);
    assert.equal(store.addToBag('a', 'v', 2), true);
    assert.equal(store.addToBag('a', 'v', 2), false);
    assert.deepEqual(current().cart, [{ slug: 'a', variantId: 'v', quantity: 2 }]);
    store.toggleWish('a');
    assert.deepEqual(current().wishlist, ['a']);
    store.toggleWish('a');
    assert.deepEqual(current().wishlist, []);
    store.markViewed('a');
    store.markViewed('b');
    store.markViewed('a');
    assert.deepEqual(current().recent, ['a', 'b']);
    store.saveSort('newest');
    assert.equal(current().sort, 'newest');
    await store.rememberCheckout('opaque-quote-reference');
    assert.ok(!values.get(store.STORAGE_KEY)?.includes('opaque-quote-reference'));
    await store.settleBag('different-reference');
    assert.equal(current().cart.length, 1);
    store.changeQuantity(current().cart[0], 1);
    await store.settleBag('opaque-quote-reference');
    assert.equal(current().cart.length, 1);
    await store.rememberCheckout('matching-reference');
    await store.settleBag('matching-reference');
    assert.equal(current().cart.length, 0);
    store.forgetDevice();
    assert.equal(values.size, 0);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
