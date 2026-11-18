import 'server-only';
import { cache } from 'react';
import { configuredDB } from './server/base';
import { browse } from './server/browse';
import { discover, getFacets, parseQuery, type Params } from './shop';
import { tx } from './server/base';
import { selectedCatalogue, publicList, publicSettings } from './server/catalogue';
import { guestCall } from './server/guest';
import type { z } from 'zod';
import { catalogueSchema, settingsSchema, receiptSchema, type Result } from './contracts';
const origin = process.env.STOREFRONT_API_URL?.replace(/\/$/, '');
const unavailable = {
  ok: false,
  kind: 'unavailable',
  message: 'This service is unavailable right now. Please try again later.',
} as const;
/** Paths are fixed by server modules. No user-supplied URLs, credentials or payment results are trusted. */
export async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<Result<T>> {
  if (configuredDB() && body !== undefined) return guestCall(path, schema, body);
  if (!origin) return unavailable;
  try {
    const response = await fetch(`${origin}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(body === undefined
        ? { next: { revalidate: 60, tags: [`storefront-${path}`] } }
        : { cache: 'no-store' as const }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429)
      return {
        ok: false,
        kind: 'limited',
        message: 'Too many requests. Please wait a little before trying again.',
      };
    if (response.status === 409 || response.status === 410)
      return {
        ok: false,
        kind: 'conflict',
        message: 'Availability or pricing has changed. Please review your bag and request a new total.',
      };
    if (response.status === 404)
      return { ok: false, kind: 'missing', message: 'No matching record was found.' };
    if (!response.ok) return unavailable;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { ok: true, value: parsed.data } : unavailable;
  } catch {
    return unavailable;
  }
}
export const getCatalogue = cache(async () => {
  if (!origin) return { products: [], unavailable: false };
  const res = await request('catalogue', catalogueSchema);
  return {
    products: res.ok
      ? res.value.products
          .filter((p) => p.published)
          .map((p) => ({ ...p, reviews: p.reviews.filter((r) => r.verified) }))
      : [],
    unavailable: !res.ok,
  };
});
export const getSettings = cache(async () => {
  if (configuredDB()) {
    try {
      return await publicSettings();
    } catch {
      return settingsSchema.parse({});
    }
  }
  if (origin) {
    const r = await request('settings', settingsSchema);
    if (r.ok) return r.value;
  }
  return settingsSchema.parse({});
});
export async function verifyReceipt(receipt?: string) {
  if (configuredDB()) {
    const r = await guestCall('payments/receipt', receiptSchema, { receipt });
    return r.ok ? r.value : null;
  }
  if (!receipt || !/^[A-Za-z0-9_-]{24,192}$/.test(receipt)) return null;
  const r = await request('payments/receipt', receiptSchema, { receipt });
  return r.ok ? r.value : null;
}

export const getSelection = cache(
  async (kind: 'home' | 'related' | 'selection' | 'detail', ...keys: string[]) => {
    if (!configuredDB()) return getCatalogue();
    try {
      return {
        products:
          kind === 'detail'
            ? (await publicList('', '', 1, 1, keys[0])).products
            : await selectedCatalogue(kind, keys),
        unavailable: false,
      };
    } catch {
      return { products: [], unavailable: true };
    }
  },
);
export const getListing = cache(async (raw: Params) => {
  const q = parseQuery(raw);
  if (configuredDB()) {
    try {
      return await browse(q);
    } catch {
      return { ...discover([], q), options: getFacets([]), unavailable: true };
    }
  }
  const { products, unavailable } = await getCatalogue();
  return { ...discover(products, q), options: getFacets(products), unavailable };
});
export async function sitemapRecords() {
  if (configuredDB())
    return tx((s) => s`select slug,category from products where status='published' order by slug`);
  const { products } = await getCatalogue();
  return products.map((p) => ({ slug: p.slug, category: p.categories[0] }));
}
