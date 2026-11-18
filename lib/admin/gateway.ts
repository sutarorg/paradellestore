import 'server-only';
import { cache } from 'react';
import { cookies, headers as requestHeaders } from 'next/headers';
import { configuredDB, safeError } from '../server/base';
import { dispatchAdmin, respond } from '../server/http';
import { z } from 'zod';
import {
  type Access,
  type Read,
  type Scope,
  viewerSchema,
  dashboard,
  analytics,
  paged,
  productRow,
  stockRow,
  orderRow,
  customerRow,
  reviewRow,
  jobRow,
  jobDetail,
  orderDetail,
  productRecord,
  adjustment,
  settings,
  key,
} from './models';
import { type ListQuery, searchQuery } from './rules';
export const cookieName = 'paradelle_staff';
export const disconnected = 'Private services are not connected. Nothing has been saved.';
export const configured = () => configuredDB() || Boolean(process.env.PARADELLE_ADMIN_API_URL?.trim());
export async function request(path: string, init: RequestInit = {}, authenticated = true) {
  const raw = process.env.PARADELLE_ADMIN_API_URL;
  if (!raw && !configuredDB()) throw new Error('unconfigured');
  const base = new URL(configuredDB() ? 'https://paradelle.internal' : (raw as string));
  if (
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('invalid configuration');
  const h = new Headers(init.headers);
  h.set('accept', 'application/json');
  if (init.body && !(init.body instanceof FormData)) h.set('content-type', 'application/json');
  if (authenticated) {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token || !validToken(token)) throw new Error('no session');
    h.set('authorization', `Bearer ${token}`);
  }
  if (configuredDB()) {
    const incoming = await requestHeaders();
    for (const k of ['x-vercel-forwarded-for', 'x-real-ip'])
      if (incoming.has(k)) h.set(k, incoming.get(k) ?? '');
    const req = new Request(`${base.origin}/${path}`, { ...init, headers: h });
    try {
      return await dispatchAdmin(req, new URL(req.url).pathname.slice(1).split('/'), true);
    } catch (e) {
      const f = safeError(e);
      return respond({ error: { message: f.message } }, f.status);
    }
  }
  return fetch(`${base.href.replace(/\/$/, '')}/${path}`, {
    ...init,
    headers: h,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
}
export const validToken = (s: string) => /^[A-Za-z0-9._~-]{20,4096}$/.test(s);
export const access = cache(async (): Promise<Access> => {
  if (!configured()) return { mode: 'disconnected' };
  try {
    if (!validToken((await cookies()).get(cookieName)?.value ?? '')) return { mode: 'denied' };
    const r = await request('auth/session');
    if ([401, 403].includes(r.status)) return { mode: 'denied' };
    if (!r.ok) return { mode: 'unavailable' };
    const p = viewerSchema.safeParse(await r.json());
    return p.success ? { mode: 'verified', user: p.data } : { mode: 'denied' };
  } catch {
    return { mode: 'unavailable' };
  }
});
export async function allow(scopes: Scope[]): Promise<null | Exclude<Read<never>, { state: 'ready' }>> {
  const a = await access();
  if (a.mode === 'disconnected') return { state: 'offline', message: 'Private services are not connected.' };
  if (a.mode === 'unavailable')
    return { state: 'error', message: 'The private service could not verify this session. Try again.' };
  if (a.mode !== 'verified' || !scopes.every((s) => a.user.permissions.includes(s)))
    return {
      state: 'forbidden',
      message: 'This view requires a verified administrator with the appropriate permission.',
    };
  return null;
}
async function read<T>(
  path: string,
  schema: z.ZodType<T>,
  scopes: Scope[],
  init?: RequestInit,
  record = false,
): Promise<Read<T>> {
  const deny = await allow(scopes);
  if (deny) return deny;
  try {
    const r = await request(path, init);
    if ([401, 403].includes(r.status))
      return { state: 'forbidden', message: 'Access was denied. Sign in with an authorised account.' };
    if (r.status === 404 && record) return { state: 'missing', message: 'This record could not be found.' };
    if (!r.ok) throw new Error();
    return { state: 'ready', value: schema.parse(await r.json()) };
  } catch {
    return { state: 'error', message: 'Data could not be loaded. Retry to request a fresh copy.' };
  }
}
const detail = <T>(prefix: string, id: string, schema: z.ZodType<T>, scopes: Scope[]) =>
  key.safeParse(id).success
    ? read(`${prefix}/${id}`, schema, scopes, undefined, true)
    : Promise.resolve<Read<T>>({ state: 'missing', message: 'This record could not be found.' });
export const getDashboard = (days: number) =>
  read(`dashboard?days=${days}`, dashboard, ['analytics', 'orders', 'pii']);
export const getAnalytics = (days: number) => read(`analytics?days=${days}`, analytics, ['analytics']);
export const getProducts = (q: ListQuery) =>
  read(`products?${searchQuery(q)}`, paged(productRow), ['catalogue']);
export const getProduct = (id: string) => detail('products', id, productRecord, ['catalogue']);
export const getOrders = (q: ListQuery) =>
  read(`orders?${searchQuery(q)}`, paged(orderRow), ['orders', 'pii']);
export const getOrder = (id: string) => detail('orders', id, orderDetail, ['orders', 'pii']);
export const getStock = (q: ListQuery) =>
  read(`inventory?${searchQuery(q)}`, paged(stockRow.extend({ productStock: z.int().nonnegative() })), [
    'inventory',
  ]);
export const getStockHistory = () =>
  read('inventory/history?limit=25', z.array(adjustment).max(25), ['inventory']);
export const getCustomers = (q: ListQuery) =>
  read(`customers?${searchQuery(q)}`, paged(customerRow), ['customers', 'pii']);
export const getReviews = (q: ListQuery) => read(`reviews?${searchQuery(q)}`, paged(reviewRow), ['reviews']);
export const getJobs = (q: ListQuery) => read(`imports?${searchQuery(q)}`, paged(jobRow), ['imports']);
export const getJob = (id: string) => detail('imports', id, jobDetail, ['imports']);
export const getPreferences = () =>
  read('settings', z.object({ revision: z.int().nonnegative(), value: settings }), ['settings']);
export async function getPricingDefaults() {
  return read('pricing/defaults', settings.shape.pricing, ['catalogue']);
}

export const privateOrderSearch = (q: ListQuery) =>
  read('orders/search', paged(orderRow), ['orders', 'pii'], { method: 'POST', body: JSON.stringify(q) });
export const privateCustomerSearch = (q: ListQuery) =>
  read('customers/search', paged(customerRow), ['customers', 'pii'], {
    method: 'POST',
    body: JSON.stringify(q),
  });
