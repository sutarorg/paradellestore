import {
  type Costs,
  type Draft,
  type Manual,
  type Ref,
  type SaleDay,
  type Job,
  type Fact,
  categoryValues,
  statuses,
  fulfilments,
} from './models';
export const human = (s: string) => s.replaceAll('-', ' ').replace(/^./, (v) => v.toUpperCase());
export const stamp = (s: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(s));
export const timed = (s: string) =>
  `${new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(s))} IST`;
export const minor = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100));
export function meeshoUrl(value: string) {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' &&
      ['meesho.com', 'www.meesho.com'].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^\/[a-z0-9%-]+\/p\/[a-z0-9]+\/?$/i.test(u.pathname)
      ? `https://www.meesho.com${u.pathname}`
      : null;
  } catch {
    return null;
  }
}
export function commercePrice(c: Costs) {
  if (
    c.source == null ||
    c.margin == null ||
    c.tax === 'unspecified' ||
    (c.tax === 'inclusive' && c.gst == null)
  )
    return {
      ok: false as const,
      message: 'Enter sourcing cost, tax treatment and target margin to calculate prices.',
    };
  if (Object.values(c).some((v) => typeof v === 'number' && (!Number.isSafeInteger(v) || v < 0)))
    return { ok: false as const, message: 'Costs and rates must be non-negative.' };
  const fixed =
    c.source +
    (c.extras ?? 0) +
    (c.packaging ?? 0) +
    (c.shipping ?? 0) +
    (c.feeFixed ?? 0) +
    (c.reserve ?? 0);
  const t = c.tax === 'inclusive' ? (c.gst ?? 0) / 10000 : 0;
  const fee = (c.feeRate ?? 0) / 10000;
  if (
    !Number.isSafeInteger(fixed) ||
    fixed <= 0 ||
    (c.gst ?? 0) > 10000 ||
    (c.feeRate ?? 0) >= 10000 ||
    c.margin >= 10000
  )
    return { ok: false as const, message: 'Check the cost base and percentage rates.' };
  // Work in paise and basis points. Integer ceiling avoids rounding a minimum price below its target.
  const price = (marginBps: number) => {
    const gross = 10000 + (c.tax === 'inclusive' ? (c.gst ?? 0) : 0),
      divisor = (10000 - marginBps) * 10000 - (c.feeRate ?? 0) * gross;
    if (divisor <= 0) return null;
    const den = BigInt(divisor);
    const result = Number((BigInt(fixed) * 10000n * BigInt(gross) + den - 1n) / den);
    return Number.isSafeInteger(result) ? result : null;
  };
  const end = (p: number) => {
    const rounded = Math.ceil((p + 100) / 10000) * 10000 - 100;
    return c.endings && rounded <= p * 1.1 ? rounded : p;
  };
  const min = price(0),
    rec = price(c.margin),
    premium = price(c.margin + 500);
  if (!min || !rec)
    return {
      ok: false as const,
      message: 'A positive cost base and a feasible margin after fees and tax are required.',
    };
  return {
    ok: true as const,
    min,
    recommended: end(rec),
    premium: premium ? end(premium) : null,
    fixed,
    t,
    fee,
  };
}
export function contribution(price: number, cal: Extract<ReturnType<typeof commercePrice>, { ok: true }>) {
  const net = price / (1 + cal.t);
  const contribution = net - cal.fixed - price * cal.fee;
  return { amount: Math.round(contribution), percent: net ? (contribution / net) * 100 : null };
}
export function draftIssues(d: Draft, publish: boolean) {
  const errs: string[] = [];
  if (!d.title.trim()) errs.push('Enter a product title.');
  if (d.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug))
    errs.push('Use lowercase words separated by hyphens for the slug.');
  if (
    d.variants.some((v) => !v.size.trim() || !Number.isSafeInteger(v.stock) || v.stock < 0) ||
    new Set(d.variants.map((v) => v.size.toLowerCase())).size !== d.variants.length
  )
    errs.push('Each variant needs a unique size and a non-negative whole stock quantity.');
  if (publish) {
    if (!d.slug || !d.category || !d.shortDescription.trim() || !d.description.trim() || !d.sku.trim())
      errs.push('Add the slug, category, SKU and both descriptions.');
    if (!d.attrs.fabric.trim() || !d.attrs.colour.trim()) errs.push('Confirm the fabric and colour.');
    if (!d.factsVerified) errs.push('Verify the garment specifications before publication.');
    if (!d.images.length || !d.imageRights || d.images.some((i) => !i.alt.trim()))
      errs.push('Add a rights-cleared main image and descriptive alt text for every image.');
    if (!d.pricePaise || d.pricePaise < 1) errs.push('Enter an actual selling price.');
    if (
      !d.variants.some((v) => v.enabled) ||
      d.variants.some((v) => !v.sku.trim()) ||
      new Set(d.variants.map((v) => v.sku.trim().toLowerCase())).size !== d.variants.length
    )
      errs.push('Add at least one enabled size and unique variant SKUs.');
  }
  return errs;
}
export function manualIssues(v: Manual) {
  const e: string[] = [];
  if (v.sourceUrl && !meeshoUrl(v.sourceUrl)) e.push('Use a valid HTTPS Meesho product URL.');
  if (
    ['ordered-on-meesho', 'shipped', 'delivered'].includes(v.status) &&
    (!v.meeshoRef.trim() || v.costPaise === null || !v.purchaseDate || !meeshoUrl(v.sourceUrl))
  )
    e.push('Record the source link, Meesho order ID, actual cost and purchase date.');
  if (['shipped', 'delivered'].includes(v.status) && !v.tracking.trim())
    e.push('Enter the shipment tracking reference.');
  if (v.trackingUrl && !/^https:\/\//.test(v.trackingUrl)) e.push('Use an HTTPS carrier tracking URL.');
  return e;
}
export function importIssues(d: Draft, job: Job | null) {
  const issues = draftIssues(d, true);
  if (!job) issues.push('A saved import job is required.');
  if (job) {
    if (['cancelled', 'published'].includes(job.stages.approval)) issues.push('This import job is closed.');
    if (!verifiedFacts(job.facts).length) issues.push('Save verified source facts first.');
    const ids = [...job.images].sort((a, b) => a.slot - b.slot).map((i) => i.photo?.id);
    if (
      new Set(ids).size !== 5 ||
      ids.length !== d.images.length ||
      ids.some((id, i) => id !== d.images[i]?.id)
    )
      issues.push('Use the five distinct approved job outputs in frame order.');
    if (job.reviews.some((r) => r.approved && r.permission !== 'granted'))
      issues.push('Remove approval from reviews without permission.');
  }

  if (
    !job?.rightsConfirmed ||
    job.images.length !== 5 ||
    job.images.some(
      (s) => !s.approved || s.status !== 'ready' || !s.photo || s.photo.width !== s.photo.height,
    )
  )
    issues.push('Approve all five square garment images.');
  return issues;
}
export const verifiedFacts = (facts: Fact[]) => facts.filter((f) => f.verified && f.value.trim());
export const asRef = (x: Ref) => ({ id: x.id, revision: x.revision });
export function buckets(rows: SaleDay[], unit: 'daily' | 'weekly' | 'monthly') {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(`${r.day}T00:00:00Z`);
    if (unit === 'weekly') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    if (unit === 'monthly') d.setUTCDate(1);
    const k = d.toISOString().slice(0, 10);
    map.set(k, (map.get(k) ?? 0) + r.salesPaise);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
export const lists = {
  products: {
    status: [...statuses],
    sort: ['updated-desc', 'title-asc', 'price-asc', 'price-desc'],
    category: [...categoryValues],
  },
  orders: {
    status: ['paid', ...fulfilments, 'refund-pending', 'refunded'],
    sort: ['newest', 'oldest', 'value-desc'],
  },
  customers: { status: [], sort: ['recent', 'name-asc', 'spend-desc'] },
  reviews: {
    status: ['pending', 'published', 'unpublished', 'rejected', 'authorised-feed', 'paradelle'],
    sort: ['newest', 'oldest', 'rating-desc'],
  },
  inventory: {
    status: ['low-stock', 'out-of-stock', 'available', 'disabled'],
    sort: ['stock-asc', 'stock-desc', 'title-asc'],
  },
  imports: {
    status: ['in-progress', 'pending-review', 'failed', 'published', 'cancelled'],
    sort: ['updated-desc', 'oldest'],
  },
} as const;
export type ListName = keyof typeof lists;
export type Raw = Record<string, string | string[] | undefined>;
export type ListQuery = {
  q: string;
  status: string;
  category: string;
  sort: string;
  page: number;
  customerId: string;
};
const scalar = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 150) ?? '';
export function listQuery(kind: ListName, r: Raw): ListQuery {
  const schema = lists[kind];
  const pick = (v: string, values: readonly string[], fallback = '') => (values.includes(v) ? v : fallback);
  return {
    q: scalar(r.q),
    status: pick(scalar(r.status), schema.status),
    sort: pick(scalar(r.sort), schema.sort, schema.sort[0]),
    category: kind === 'products' ? pick(scalar(r.category), categoryValues) : '',
    page: /^\d{1,6}$/.test(scalar(r.page)) ? Math.max(1, Number(scalar(r.page))) : 1,
    customerId: kind === 'orders' && /^[\w-]{1,128}$/.test(scalar(r.customerId)) ? scalar(r.customerId) : '',
  };
}
export function searchQuery(q: ListQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== '' && !(k === 'page' && v === 1)) params.set(k, String(v));
  return params.toString();
}
export const rangeDays = (v: string | string[] | undefined) =>
  ['7', '30', '90'].includes(scalar(v)) ? Number(scalar(v)) : 30;
