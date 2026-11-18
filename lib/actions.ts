'use server';
import { z } from 'zod';
import {
  addressSchema,
  asTile,
  cartLineSchema,
  paymentSessionSchema,
  quoteSchema,
  slugSchema,
  trackingSchema,
  type Address,
  type CartLine,
  type Result,
  type ShopProduct,
  type Tracking,
} from './contracts';
import { getCatalogue, getSettings, request } from './gateway';
import { formatMobile, maskReference, validMobile } from './shop';
const invalid = { ok: false, kind: 'invalid', message: 'Please check the details you entered.' } as const;
export async function lookupProducts(slugs: string[]): Promise<Result<ShopProduct[]>> {
  const input = z.array(slugSchema).max(220).safeParse(slugs);
  if (!input.success) return invalid;
  const { products, unavailable } = await getCatalogue();
  return unavailable
    ? { ok: false, kind: 'unavailable', message: 'We couldn’t check the collection. Please try again.' }
    : { ok: true, value: products.filter((p) => input.data.includes(p.slug)).map(asTile) };
}
export async function trackOrders(number: string): Promise<Result<Tracking>> {
  if (typeof number !== 'string' || !validMobile(number)) return invalid;
  if (!(await getSettings()).trackingEnabled)
    return {
      ok: false,
      kind: 'unavailable',
      message: 'Live tracking is not available right now. Please try again later.',
    };
  const r = await request('orders/track', trackingSchema, { mobile: formatMobile(number) });
  if (!r.ok && r.kind === 'missing') return { ok: true, value: [] };
  return r.ok
    ? { ok: true, value: r.value.orders.map((o) => ({ ...o, reference: maskReference(o.reference) })) }
    : r;
}
export async function getQuote(cart: CartLine[], address: Address, consent: boolean, email?: string) {
  const a = addressSchema.safeParse(address);
  const lines = z.array(cartLineSchema).min(1).max(99).safeParse(cart);
  if (
    !a.success ||
    !lines.success ||
    consent !== true ||
    (email !== undefined && !z.email().max(254).safeParse(email).success)
  )
    return invalid;
  if (!(await getSettings()).checkoutEnabled)
    return {
      ok: false,
      kind: 'unavailable',
      message: 'Payments are not available. No payment has been taken.',
    } as const;
  return request('checkout/quote', quoteSchema, {
    lines: lines.data,
    address: a.data,
    ...(email ? { email } : {}),
    termsAccepted: true,
  });
}
export async function startPayment(quoteId: string) {
  if (typeof quoteId !== 'string' || !quoteId || quoteId.length > 200) return invalid;
  if (!(await getSettings()).checkoutEnabled)
    return { ok: false, kind: 'unavailable', message: 'Payments are not available.' } as const;
  const result = await request('checkout/session', paymentSessionSchema, { quoteId });
  return result.ok && result.value.quoteId !== quoteId ? invalid : result;
}
export async function subscribeEmail(email: string, consent: boolean) {
  if (!z.email().max(254).safeParse(email).success || consent !== true) return invalid;
  if (!(await getSettings()).newsletterEnabled)
    return { ok: false, kind: 'unavailable', message: 'Subscriptions are not open at the moment.' } as const;
  return request('newsletter', z.object({ subscribed: z.literal(true) }), { email, consent: true });
}
export async function sendEnquiry(email: string, message: string) {
  if (
    !z.email().max(254).safeParse(email).success ||
    !z.string().trim().min(10).max(2000).safeParse(message).success
  )
    return invalid;
  if (!(await getSettings()).contactEnabled)
    return {
      ok: false,
      kind: 'unavailable',
      message: 'Direct enquiries are not available at the moment.',
    } as const;
  return request('contact', z.object({ received: z.literal(true) }), { email, message });
}
