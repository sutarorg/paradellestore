import { cookies, headers } from 'next/headers';
import type { z } from 'zod';
import type { Result } from '../contracts';
import { safeError, clientIP, fresh, limit } from './base';
import { quote, paymentSession, track, receiptFor } from './checkout';
import { guestCookie } from './http';
export async function guestCall<T>(path: string, schema: z.ZodType<T>, input: unknown): Promise<Result<T>> {
  try {
    const jar = await cookies();
    let who = jar.get(guestCookie)?.value ?? '';
    const ip = clientIP(await headers());
    const b = input as { key?: string; quoteId?: string; receipt?: string };
    let out: unknown;
    if (path === 'checkout/quote') {
      if (!/^[\w-]{43}$/.test(who)) {
        who = fresh();
        jar.set(guestCookie, who, {
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 90 * 86400,
        });
      }
      const { key, ...data } = b;
      out = await quote(data, who, key || crypto.randomUUID(), ip);
    } else if (path === 'checkout/session') {
      await limit('payment-create', ip, 40, 600);
      out = await paymentSession(b.quoteId || '', who);
    } else if (path === 'orders/track') out = await track(b, ip);
    else if (path === 'payments/receipt') out = await receiptFor(who, b.receipt);
    else throw new Error();
    return { ok: true, value: schema.parse(out) };
  } catch (e) {
    const f = safeError(e);
    return {
      ok: false,
      kind:
        f.status === 429
          ? 'limited'
          : f.status === 409
            ? 'conflict'
            : f.status === 404
              ? 'missing'
              : f.status === 422
                ? 'invalid'
                : 'unavailable',
      message: f.message,
    };
  }
}
