import { z } from 'zod';
import { authenticate, grants, login, logoutStaff, recoverStaff, supabase } from './auth';
import { execute, createLicensedReview } from './commands';
import { readStudio } from './studio';
import {
  receiptFor,
  reconcileOne,
  quote,
  paymentSession,
  verifyPayment,
  webhook,
  track,
  submitReview,
} from './checkout';
import { publicList, categories, publishedReviews } from './catalogue';
import { storeImage, deliverImage } from './media';
import { maintain, runOne } from './worker';
import {
  secret,
  need,
  body,
  boundedBytes,
  clientIP,
  fresh,
  limit,
  equal,
  safeError,
  uid,
  tx,
  hash,
  first,
} from './base';
import type { Raw } from '../admin/rules';
export const guestCookie = 'paradelle_guest',
  staffCookie = 'paradelle_staff';
export const cookieAttrs = (days: number) =>
  `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
export const privateHeaders = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
};
export const respond = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...privateHeaders, ...extra } });
const cookie = (r: Request, k: string) =>
  r.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${k}=`))
    ?.slice(k.length + 1) ?? '';
export function originCheck(r: Request) {
  const origin = r.headers.get('origin');
  const allowed = [
    process.env.SITE_ORIGIN || 'https://paradelle.store',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    process.env.E2B_SANDBOX_ID ? `https://3000-${process.env.E2B_SANDBOX_ID}.e2b.app` : '',
    ...(!process.env.VERCEL ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : []),
  ];
  need(
    origin ? allowed.includes(origin) : !r.headers.get('cookie') || !!r.headers.get('authorization'),
    403,
    'Invalid request origin.',
  );
  need(r.headers.get('sec-fetch-site') !== 'cross-site', 403, 'Cross-site request rejected.');
}
function token(r: Request) {
  return r.headers.get('authorization')?.replace(/^Bearer /, '') || cookie(r, staffCookie);
}
function rawQuery(r: Request): Raw {
  return Object.fromEntries(new URL(r.url).searchParams);
}
export async function dispatchAdmin(r: Request, parts: string[], internal = false) {
  const [k, id, action] = parts;
  const verb = r.method;
  const ip = clientIP(r.headers);
  if (verb !== 'GET' && !internal) originCheck(r);
  if (k === 'auth') {
    if (id === 'login' && verb === 'POST') {
      const data = await login(await body(r, 4096), ip);
      return internal
        ? respond(data)
        : respond({ signedIn: true }, 200, {
            'set-cookie': `${staffCookie}=${data.token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${data.expiresIn}`,
          });
    }
    if (id === 'recover' && verb === 'POST') {
      await recoverStaff(await body(r, 2048), ip);
      return respond({ accepted: true }, 202);
    }
    if (id === 'reset' && verb === 'POST') {
      await limit('reset-ip', ip, 8, 3600);
      const b = z
        .object({
          tokenHash: z.string().regex(/^[A-Za-z0-9_-]{20,512}$/),
          password: z.string().min(12).max(256),
        })
        .strict()
        .parse(await body(r, 4096));
      const auth = supabase().auth;
      const { data, error } = await auth.verifyOtp({ token_hash: b.tokenHash, type: 'recovery' });
      need(!error && data.user, 401, 'Recovery link expired.');
      const recovered = data.user.id;
      await tx((s) => grants(s, recovered));
      const changed = await auth.updateUser({ password: b.password });
      need(!changed.error, 502, 'Password change not confirmed.');
      await tx((s) => s`delete from staff_sessions where admin_id=${recovered}`);
      await auth.signOut();
      return respond({ changed: true });
    }
    if (id === 'logout' && verb === 'POST') {
      await logoutStaff(token(r));
      return respond({ signedOut: true }, 200, {
        'set-cookie': `${staffCookie}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
      });
    }
    if (id === 'session' && verb === 'GET') return respond(await authenticate(token(r)));
    need(false, 404, 'Unknown operation.');
  }
  const v = await authenticate(token(r));
  if (verb === 'GET') {
    if (k === 'media' && id) return deliverImage(id, v);
    if (k === 'orders' && id && action === 'history' && parts.length === 3) {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(rawQuery(r).page ?? 1);
      return respond(
        await tx(async (s) => {
          await grants(s, v.id, ['orders', 'pii']);
          return s`select revision,manual,updated_by as actor,created_at at from fulfilment_revisions where order_id=${uid(id)} order by revision desc limit 20 offset ${(page - 1) * 20}`;
        }),
      );
    }
    need(
      [
        'dashboard',
        'analytics',
        'products',
        'orders',
        'customers',
        'inventory',
        'reviews',
        'imports',
        'pricing',
        'settings',
      ].includes(k) && parts.length <= 2,
      404,
      'Unknown resource.',
    );
    if ((k === 'orders' || k === 'customers') && new URL(r.url).searchParams.has('q'))
      need(false, 422, 'Use private POST search for customer fields.');
    return respond(await readStudio(v, parts, rawQuery(r)));
  }
  await limit('staff-write', v.id, 150, 60);
  if (k === 'media' && verb === 'POST') {
    const buffer = await boundedBytes(r, 4400000);
    const form = await new Response(buffer, {
      headers: { 'content-type': r.headers.get('content-type') || '' },
    }).formData();
    const purpose = z.enum(['product', 'reference', 'logo']).parse(form.get('purpose'));
    need(form.get('rights') === 'confirmed', 422, 'Image rights required.');
    await tx((s) =>
      grants(s, v.id, [purpose === 'reference' ? 'imports' : purpose === 'logo' ? 'settings' : 'catalogue']),
    );
    const f = form.get('file');
    need(
      f instanceof File && f.size <= 4194304 && ['image/jpeg', 'image/webp', 'image/png'].includes(f.type),
      422,
      'Expected a permitted image.',
    );
    return respond(await storeImage(Buffer.from(await f.arrayBuffer()), purpose, v, '', false, f.type), 201);
  }
  const data = await body(r);
  if (id === 'search' && verb === 'POST' && (k === 'customers' || k === 'orders')) {
    const obj = z
      .object({
        q: z.string().max(150).optional(),
        status: z.string().max(64).optional(),
        sort: z.string().max(64).optional(),
        customerId: z.string().max(128).optional(),
        page: z.coerce.number().int().min(1).max(999999).optional(),
      })
      .parse(data);
    return respond(await readStudio(v, [k, 'search'], { ...obj, page: String(obj.page || 1) }));
  }
  if (k === 'reviews' && !id && verb === 'POST') return respond(await createLicensedReview(v, data), 201);
  const ref = id ? { id, revision: data.revision } : null;
  let cmd: unknown;
  if (k === 'commands' && verb === 'POST') cmd = data;
  else if (k === 'products') {
    if ((verb === 'POST' && !id) || (['PATCH', 'PUT'].includes(verb) && id && !action))
      cmd = { op: 'product.save', ref, draft: data.draft, intent: data.intent || 'draft' };
    else if (id && action === 'publish' && verb === 'POST')
      cmd = { op: 'product.transition', refs: [ref], to: 'published' };
    else if (id && verb === 'DELETE') cmd = { op: 'product.delete', ref };
  } else if (k === 'orders' && id && ['POST', 'PATCH', 'PUT'].includes(verb)) {
    if (action === 'refund')
      cmd = { op: 'order.refund', ref, amountPaise: data.amountPaise, reason: data.reason };
    else if (!action || action === 'fulfilment') cmd = { op: 'order.fulfil', ref, manual: data.manual };
  } else if (k === 'inventory' && verb === 'POST' && (action === 'adjust' || id === 'adjust'))
    cmd = { op: 'stock.adjust', ref: action ? ref : data.ref, delta: data.delta, reason: data.reason };
  else if (k === 'reviews' && action === 'moderate' && ['PATCH', 'POST'].includes(verb))
    cmd = { op: 'review.moderate', ref, to: data.to };
  else if (k === 'settings' && verb === 'PATCH') cmd = { ...data, op: 'settings.save' };
  need(cmd, 405, 'Operation not supported.');
  const result = await execute(v, cmd, r.headers.get('idempotency-key') ?? '');
  return respond(result, result.outcome === 'queued' ? 202 : 200);
}
export async function dispatch(r: Request, parts: string[]): Promise<Response> {
  try {
    const [k, id, sub, extra] = parts;
    const path = parts.join('/'),
      ip = clientIP(r.headers),
      owner = cookie(r, guestCookie);
    if (k === 'admin') return await dispatchAdmin(r, parts.slice(1));
    if (k === 'ai') {
      if (r.method !== 'GET') originCheck(r);
      const v = await authenticate(token(r), ['imports']);
      if (r.method === 'GET' && id === 'import-jobs' && sub && !extra)
        return respond(await readStudio(v, ['imports', sub], {}));
      need(r.method === 'POST', 405, 'Expected POST.');
      await limit('ai', v.id, 30, 600);
      const b = await body(r);
      let cmd: unknown;
      if (id === 'import-product')
        cmd = { op: 'import.start', url: b.url, method: b.method ?? 'manual', authorised: b.authorised };
      else if (id === 'generate-images')
        cmd = {
          op: 'import.images',
          ref: b.ref,
          referenceIds: b.referenceIds,
          rightsConfirmed: b.rightsConfirmed,
        };
      else if (id === 'import-jobs' && extra === 'retry')
        cmd = { op: 'import.retry', ref: { id: sub, revision: b.revision }, stage: b.stage };
      else if (id === 'import-jobs' && extra === 'approve')
        cmd = {
          op: 'import.finish',
          ref: { id: sub, revision: b.revision },
          draft: b.draft,
          intent: b.intent,
        };
      need(cmd, 404, 'Unknown import operation.');
      const result = await execute(v, cmd, r.headers.get('idempotency-key') || '');
      return respond(result, result.outcome === 'queued' ? 202 : 200);
    }
    if (k === 'maintenance' && r.method === 'GET') {
      need(
        equal(r.headers.get('authorization') || '', `Bearer ${secret('CRON_SECRET')}`),
        401,
        'Unauthorised.',
      );
      await maintain();
      await reconcileOne();
      const t = Date.now();
      let count = 0;
      while (count < 6 && Date.now() - t < 25000 && (await runOne())) count++;
      return respond({ advanced: count });
    }
    if (path === 'payments/webhook' && r.method === 'POST')
      return respond(
        await webhook(
          await boundedBytes(r, 262144),
          r.headers.get('x-razorpay-signature') || '',
          r.headers.get('x-razorpay-event-id') || '',
        ),
      );
    if (r.method === 'GET') {
      const query = new URL(r.url).searchParams;
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(query.get('page') || 1);
      if (k === 'media' && id && parts.length === 2) {
        const w = z
          .enum(['320', '640', '960', '1800'])
          .optional()
          .parse(query.get('w') ?? undefined);
        return await deliverImage(id, undefined, w);
      }
      if (k === 'products' || k === 'search') await limit('catalogue-read', ip, 180, 60);
      if (k === 'products' && id === 'categories') return respond({ categories: await categories() });
      if (k === 'products' && id && sub === 'reviews')
        return respond({ reviews: await publishedReviews(id, page), page, pageSize: 20 });
      if (k === 'products' && id) return respond(first((await publicList('', '', 1, 1, id)).products));
      if (k === 'search' || k === 'products')
        return respond(
          await publicList(
            z
              .string()
              .max(150)
              .parse(query.get('q') || ''),
            z
              .string()
              .max(80)
              .parse(query.get('category') || ''),
            page,
            z.coerce
              .number()
              .int()
              .min(1)
              .max(50)
              .parse(query.get('limit') || 24),
          ),
        );
    }
    need(r.method === 'POST', 405, 'Operation not supported.');
    originCheck(r);
    const b = await body(r, 32768);
    if (path === 'device/forget')
      return respond({ forgotten: true }, 200, { 'set-cookie': `${guestCookie}=; ${cookieAttrs(0)}` });
    if (path === 'orders/track') return respond(await track(b, ip));
    if (path === 'checkout/validate') {
      const who = /^[\w-]{43}$/.test(owner) ? owner : fresh();
      const q = await quote(b, who, r.headers.get('idempotency-key') || '', ip);
      return respond(q, 200, { 'set-cookie': `${guestCookie}=${who}; ${cookieAttrs(90)}` });
    }
    need(/^[\w-]{43}$/.test(owner), 403, 'Guest checkout session required.');
    if (['checkout/create-order', 'payments/create'].includes(path)) {
      await limit('payment-create', ip, 40, 600);
      return respond(await paymentSession(uid(b.quoteId), owner));
    }
    if (path === 'payments/verify') {
      await limit('payment-verify', ip, 60, 600);
      return respond(await verifyPayment(b, owner));
    }
    if (path === 'payments/receipt') return respond(await receiptFor(owner, b.quoteId));
    if (path === 'reviews' || (k === 'products' && sub === 'reviews'))
      return respond(await submitReview(k === 'products' ? { ...b, productId: id } : b, owner, ip), 201);
    if (path === 'analytics/purchase') {
      const data = z
        .object({ quoteId: z.uuid(), channel: z.enum(['ga', 'meta']) })
        .strict()
        .parse(b);
      const result = await tx(async (s) => {
        const o = first(
          await s`select o.id from orders o join checkout_intents i on i.id=o.intent_id join payments p on p.order_id=o.id where i.id=${data.quoteId} and i.owner_hash=${hash(owner)} and o.created_at>now()-interval '7 days'`,
        );
        const rows =
          await s`insert into analytics_claims(order_id,channel) values(${o.id},${data.channel}) on conflict do nothing returning order_id`;
        return rows.length > 0;
      });
      return respond({ send: result });
    }
    need(false, 404, 'Unknown endpoint.');
  } catch (e) {
    const f = safeError(e);
    return respond(
      { error: { message: f.message } },
      f.status,
      f.status === 429 ? { 'retry-after': '900' } : {},
    );
  }
}
