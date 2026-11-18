import { categories, isSort, type Sort } from './content';
import type { CartLine, Product, Settings, ShopProduct } from './contracts';
export const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const formatMobile = (s: string) => s.replace(/[\s()-]/g, '').replace(/^(?:\+91|91)(?=\d{10}$)/, '');
export const validMobile = (s: string) => /^[6-9]\d{9}$/.test(formatMobile(s));
export const maskReference = (s: string) =>
  s.length < 3 ? '••••' : `•••• ${s.slice(-Math.min(4, s.length - 2))}`;
export const slugOK = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 150 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
export const fingerprint = (lines: CartLine[]) =>
  JSON.stringify(lines.map((l) => [l.slug, l.variantId, l.quantity]).sort());
export const discount = (price: number, mrp?: number | null) => (mrp && mrp > price ? mrp - price : 0);
export const shipping = (
  subtotal: number,
  settings: Pick<Settings, 'flatShippingPaise' | 'freeShippingFromPaise'>,
) =>
  settings.freeShippingFromPaise != null && subtotal >= settings.freeShippingFromPaise
    ? 0
    : (settings.flatShippingPaise ?? null);
export const availability = (product: Pick<Product, 'variants'>) => product.variants.some((v) => v.stock > 0);
export const facetNames = ['fabric', 'size', 'style', 'colour', 'availability', 'occasion'] as const;
export type Facet = (typeof facetNames)[number];
export type Query = {
  category: string;
  sort: Sort;
  q: string;
  edit: string;
  page: number;
  min: string;
  max: string;
} & Record<Facet, string[]>;
export type Params = Record<string, string | string[] | undefined>;
const first = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x)?.trim().slice(0, 150) || '';
export function parseQuery(raw: Params): Query {
  const sort = first(raw.sort);
  const c = first(raw.category);
  const edit = first(raw.edit);
  const price = (p: string) => (/^\d{1,7}(\.\d{1,2})?$/.test(p) ? p : '');
  const facets = Object.fromEntries(
    facetNames.map((k) => [
      k,
      [
        ...new Set(
          [raw[k] ?? []]
            .flat()
            .map((s) => s.trim().slice(0, 80))
            .filter(Boolean),
        ),
      ].slice(0, 20),
    ]),
  ) as Record<Facet, string[]>;
  return {
    ...facets,
    category: categories.some((v) => v.slug === c) ? c : 'all',
    sort: isSort(sort) ? sort : 'recommended',
    edit: ['new', 'bestsellers'].includes(edit) ? edit : '',
    page: /^\d{1,6}$/.test(first(raw.page)) ? Math.max(1, Number(first(raw.page))) : 1,
    q: first(raw.q),
    min: price(first(raw.min)),
    max: price(first(raw.max)),
  };
}
export function queryHref(q: Query) {
  const params = new URLSearchParams();
  if (q.category !== 'all') params.set('category', q.category);
  for (const k of ['q', 'edit', 'min', 'max'] as const) if (q[k]) params.set(k, q[k]);
  if (q.sort !== 'recommended') params.set('sort', q.sort);
  for (const k of facetNames)
    q[k].forEach((v) => {
      params.append(k, v);
    });
  if (q.page > 1) params.set('page', String(q.page));
  return `/kurtis${params.size ? `?${params.toString()}` : ''}`;
}
function values(p: Product, key: Facet) {
  if (key === 'availability') return [availability(p) ? 'In stock' : 'Out of stock'];
  if (key === 'size') return p.variants.filter((v) => v.stock > 0 && v.size).map((v) => v.size as string);
  return key === 'occasion' ? p.occasion : [p[key]];
}
export function getFacets(products: Product[]) {
  return Object.fromEntries(
    facetNames.map((k) => [k, [...new Set(products.flatMap((p) => values(p, k)))].sort()]),
  ) as Record<Facet, string[]>;
}
export function discover(products: Product[], q: Query) {
  const words = q.q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const hits = products.filter(
    (p) =>
      p.published &&
      (q.category === 'all' || p.categories.includes(q.category)) &&
      (!q.edit || (q.edit === 'new' ? p.newArrival : p.bestseller)) &&
      (!q.min || p.pricePaise >= Number(q.min) * 100) &&
      (!q.max || p.pricePaise <= Number(q.max) * 100) &&
      facetNames.every((k) => !q[k].length || q[k].some((v) => values(p, k).includes(v))) &&
      words.every((w) =>
        [p.name, p.fabric, p.style, p.colour, ...p.occasion, ...p.categories, p.description]
          .join(' ')
          .toLocaleLowerCase()
          .includes(w),
      ),
  );
  if (q.sort === 'price-asc') hits.sort((a, b) => a.pricePaise - b.pricePaise);
  if (q.sort === 'price-desc') hits.sort((a, b) => b.pricePaise - a.pricePaise);
  if (q.sort === 'newest') hits.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const pages = Math.max(1, Math.ceil(hits.length / 12));
  const page = Math.min(q.page, pages);
  return { items: hits.slice((page - 1) * 12, page * 12), total: hits.length, page, pages };
}
export function resolveBag(cart: CartLine[], products: ShopProduct[]) {
  return cart.map((line) => {
    const product = products.find((p) => p.slug === line.slug);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    return { ...line, product, variant, valid: !!variant && line.quantity <= variant.stock };
  });
}
export function nextQuantity(existing: number, requested: number, stock: number) {
  return Math.max(0, Math.min(99, Math.floor(stock), Math.floor(existing + requested)));
}
