import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blankCosts,
  blankDraft,
  costSchema,
  draftSchema,
  jobDetail,
  key,
  mediaSrc,
  reviewRow,
  viewerSchema,
  paged,
  productRow,
  adjustment,
  analytics,
  type Job,
  type Draft,
  type Manual,
} from '../lib/admin/models';
import {
  asRef,
  buckets,
  commercePrice,
  contribution,
  draftIssues,
  importIssues,
  listQuery,
  manualIssues,
  meeshoUrl,
  minor,
  rangeDays,
  searchQuery,
  verifiedFacts,
} from '../lib/admin/rules';
import { checkCommand, command, queued, receipt } from '../lib/admin/commands';
// Arithmetic and schema probes only. No catalogue, account, review or order seeds.
test('missing business inputs do not become a price or a KPI', () => {
  assert.equal(commercePrice(blankCosts()).ok, false);
  assert.equal(blankDraft().pricePaise, null);
  assert.equal(analytics.safeParse({}).success, false);
  assert.equal(minor(''), null);
  assert.equal(minor('2.45'), 245);
});
test('break-even and contribution use integer paise, GST-inclusive net sales and fees on gross', () => {
  const c = commercePrice({
    ...blankCosts(),
    source: 50000,
    shipping: 4500,
    packaging: 500,
    feeFixed: 100,
    extras: 200,
    reserve: 700,
    feeRate: 200,
    margin: 2500,
    tax: 'inclusive',
    gst: 500,
  });
  assert.ok(c.ok);
  assert.equal(c.fixed, 56000);
  assert.ok((contribution(c.recommended, c).percent ?? NaN) >= 25);
  assert.ok((contribution(c.recommended - 1, c).percent ?? NaN) < 25);
  assert.ok(c.min <= c.recommended);
  assert.ok(c.premium !== null && c.premium > c.recommended);
  assert.ok(contribution(c.min, c).amount >= 0);
});
test('suggested endings never lower the calculated margin or inflate a price beyond the guard', () => {
  const base = { ...blankCosts(), source: 99400, tax: 'none' as const, margin: 0, endings: true };
  const a = commercePrice(base);
  assert.ok(a.ok);
  assert.equal(a.recommended, 99900);
  const b = commercePrice({ ...base, source: 100100 });
  assert.ok(b.ok);
  assert.equal(b.recommended, 109900);
  const c = commercePrice({ ...base, source: 10000 });
  assert.ok(c.ok);
  assert.equal(c.recommended, 10000);
});
test('negative costs, unfeasible margins, out-of-range rates and missing GST are blocked', () => {
  for (const p of [
    { source: -2 },
    { margin: 10000 },
    { feeRate: 9900, margin: 3000 },
    { gst: 10001 },
    { tax: 'inclusive' as const, gst: null },
  ])
    assert.equal(commercePrice({ ...blankCosts(), source: 1000, tax: 'none', margin: 1000, ...p }).ok, false);
  assert.equal(costSchema.safeParse({ ...blankCosts(), feeRate: 10000 }).success, false);
});
test('import links accept only a canonical HTTPS Meesho product and discard attribution', () => {
  const p = '/taj-kurti-for-women/p/6hnqz1';
  assert.equal(meeshoUrl(`https://meesho.com${p}?ref=a#piece`), `https://www.meesho.com${p}`);
  for (const s of [
    '',
    '/p/x',
    'https://meesho.com',
    `https://example.org${p}`,
    `http://meesho.com${p}`,
    `https://meesho.com:8000${p}`,
    `https://person@meesho.com${p}`,
  ])
    assert.equal(meeshoUrl(s), null);
});
test('pagination, filters and sorts are constrained independently by register', () => {
  const q = listQuery('products', {
    q: '  ash ',
    page: '-3',
    status: 'paid',
    sort: 'price-desc',
    category: 'cotton',
    customerId: 'private',
  });
  assert.deepEqual(q, {
    q: 'ash',
    page: 1,
    status: '',
    sort: 'price-desc',
    category: 'cotton',
    customerId: '',
  });
  assert.equal(listQuery('orders', { customerId: 'aa-12', status: 'refund-pending' }).customerId, 'aa-12');
  assert.equal(listQuery('orders', { customerId: '../../a' }).customerId, '');
  assert.equal(rangeDays('500'), 30);
  assert.equal(rangeDays('7'), 7);
  assert.deepEqual(listQuery('products', Object.fromEntries(new URLSearchParams(searchQuery(q)))), q);
});
test('weekly groups start Monday and absent days are not filled with invented sales', () => {
  const s = [
    { day: '2026-01-04', salesPaise: 123 },
    { day: '2026-01-06', salesPaise: 77 },
  ];
  assert.deepEqual(buckets([], 'daily'), []);
  assert.deepEqual(buckets(s, 'weekly'), [
    ['2025-12-29', 123],
    ['2026-01-05', 77],
  ]);
  assert.deepEqual(buckets(s, 'monthly'), [['2026-01-01', 200]]);
});
test('draft validation differs from publication; disabled sizes, duplicate SKUs, unverified facts and unlicensed media fail closed', () => {
  const d: Draft = { ...blankDraft(), title: 'input' };
  assert.equal(draftIssues(d, false).length, 0);
  assert.ok(draftIssues(d, true).length >= 4);
  assert.ok(draftIssues({ ...d, slug: 'Invalid Slug' }, false).length);
  assert.ok(
    draftIssues({ ...d, variants: [{ id: 'a', size: 's', stock: -1, enabled: false, sku: '' }] }, false)
      .length,
  );
  assert.equal(draftSchema.safeParse({ ...d, pricePaise: 1.75 }).success, false);
});
test('each revision-checked selection is unique and bounded; a bare or duplicate bulk reference is rejected', () => {
  const r = asRef({ id: 'r', revision: 1 });
  assert.ok(command.safeParse({ op: 'product.transition', refs: [r], to: 'archived' }).success);
  for (const refs of [[], [r, r], ['r'], [{ id: 'r' }]])
    assert.equal(command.safeParse({ op: 'product.transition', refs, to: 'draft' }).success, false);
});
test('manual fulfilment never implicitly confirms payment and needs a traceable purchase or shipment', () => {
  const v: Manual = {
    status: 'pending-purchase',
    sourceUrl: '',
    meeshoRef: '',
    costPaise: null,
    purchaseDate: '',
    carrier: '',
    tracking: '',
    trackingUrl: '',
    notes: '',
  };
  assert.deepEqual(manualIssues(v), []);
  assert.equal(manualIssues({ ...v, status: 'delivered' }).length, 2);
  assert.ok(manualIssues({ ...v, trackingUrl: 'http://example.org' }).length);
  assert.equal(command.safeParse({ op: 'order.paid' }).success, false);
});
test('authentication requires an explicit admin role; media and identifiers cannot inject other URL schemes or paths', () => {
  assert.equal(
    viewerSchema.safeParse({ id: 'x', name: 'x', role: 'customer', permissions: [] }).success,
    false,
  );
  for (const v of ['//elsewhere', 'data:image/png,x', 'javascript:alert(1)', 'https://u:p@example.org/a'])
    assert.equal(mediaSrc.safeParse(v).success, false);
  assert.equal(key.safeParse('../x').success, false);
});
test('verified facts omit gaps and unconfirmed manual values; consent is mandatory at import creation', () => {
  const f = { field: 'fabric', value: '', verified: true, origin: 'manual' as const };
  assert.deepEqual(verifiedFacts([f, { ...f, value: 'input', verified: false }]), []);
  assert.equal(
    command.safeParse({
      op: 'import.start',
      url: 'https://www.meesho.com/a/p/b',
      method: 'extract',
      authorised: false,
    }).success,
    false,
  );
  assert.ok(checkCommand({ op: 'import.facts', ref: { id: 'j', revision: 0 }, facts: [f] }).length);
});
test('job publication requires five distinct square approved frames, matching IDs, verified evidence and permission', () => {
  const d = blankDraft();
  const j = {
    facts: [],
    stages: { approval: 'pending' },
    rightsConfirmed: true,
    reviews: [],
    images: [],
  } as unknown as Job;
  assert.ok(importIssues(d, j).some((i) => i.includes('five square')));
  assert.ok(importIssues(d, j).some((i) => i.includes('source facts')));
  const ids = Array.from({ length: 5 }, (_, slot) => ({
    id: `f-${slot}`,
    width: 2,
    height: 2,
    alt: 'input',
    src: '/media/f',
  }));
  j.images = ids.map((photo, slot) => ({ slot, photo, status: 'ready', approved: true, error: '' }));
  d.images = ids;
  assert.equal(
    importIssues(d, j).some((i) => i.includes('five')),
    false,
  );
  j.images[4] = { ...j.images[4], approved: false };
  assert.ok(importIssues(d, j).some((i) => i.includes('five square')));
  assert.equal(jobDetail.shape.reviews.safeParse(Array(11).fill({})).success, false);
});
test('stock ledger entries balance; zero adjustments and empty reasons are invalid', () => {
  const a = {
    id: 'a',
    variantId: 'v',
    productId: 'p',
    product: 'input',
    size: 's',
    sku: 'v',
    before: 5,
    delta: -2,
    after: 3,
    at: '2026-01-01T00:00:00Z',
    reason: 'count',
    actor: 'staff',
  };
  assert.ok(adjustment.safeParse(a).success);
  assert.equal(adjustment.safeParse({ ...a, after: 4 }).success, false);
  assert.equal(
    command.safeParse({ op: 'stock.adjust', ref: { id: 'v', revision: 0 }, delta: 0, reason: '' }).success,
    false,
  );
});
test('jobs and refunds need queue receipts, not a fabricated commit or a success flag', () => {
  assert.equal(receipt.safeParse({ ok: true }).success, false);
  assert.ok(queued({ op: 'import.start', url: '', method: 'extract', authorised: true }));
  assert.equal(queued({ op: 'product.delete', ref: { id: 'r', revision: 0 } }), false);
  assert.ok(queued({ op: 'order.refund', ref: { id: 'r', revision: 2 }, amountPaise: 1, reason: 'input' }));
});
test('an empty page is valid but an ambiguous payload, unlinked review or invalid settings section is not', () => {
  assert.ok(paged(productRow).safeParse({ rows: [], total: 0, page: 1, pageSize: 25 }).success);
  assert.equal(paged(productRow).safeParse({ rows: [] }).success, false);
  assert.equal(reviewRow.safeParse({ rating: 5 }).success, false);
  assert.ok(
    checkCommand({
      op: 'settings.save',
      revision: 1,
      section: 'social',
      value: { instagram: 'not a URL', facebook: '', pinterest: '' },
    }).length,
  );
});

test('source feedback cannot be published as permission-free or as a verified customer purchase', async () => {
  const { authorisedReviewSchema } = await import('../lib/contracts');
  const fields = { id: 'id', rating: 3, body: 'input', source: 'source' };
  assert.equal(authorisedReviewSchema.safeParse(fields).success, false);
  assert.equal(
    authorisedReviewSchema.safeParse({ ...fields, approved: true, permission: 'pending' }).success,
    false,
  );
  const r = authorisedReviewSchema.parse({
    ...fields,
    approved: true,
    permission: 'granted',
    displayName: 'not allowed',
  });
  assert.equal('displayName' in r, false);
});
