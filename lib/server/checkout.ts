import { z } from 'zod';
import { addressSchema, cartLineSchema, quoteSchema, receiptSchema } from '../contracts';
import {
  type Tx,
  tx,
  need,
  hash,
  mac,
  secret,
  equal,
  first,
  json,
  iso,
  audit,
  uid,
  limit,
  Fault,
} from './base';
import { commercePrice, contribution } from '../../src/lib/pricing';
import { indianRegion } from '../india';
import { costSchema } from '../admin/models';
const input = z
  .object({
    address: addressSchema.extend({
      state: z
        .string()
        .trim()
        .max(100)
        .refine((v) => !!indianRegion(v))
        .transform((v) => indianRegion(v) || v),
      city: z
        .string()
        .trim()
        .min(2)
        .max(100)
        .regex(/^[\p{L}\p{M} .'-]+$/u),
    }),
    lines: z
      .array(cartLineSchema.extend({ variantId: z.uuid() }))
      .min(1)
      .max(40),
    termsAccepted: z.literal(true),
    coupon: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{1,32}$/)
      .optional(),
    email: z.email().max(254).optional(),
  })
  .strict();
type Input = z.infer<typeof input>;
const line = z.object({
  variantId: z.uuid(),
  productId: z.uuid(),
  slug: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  size: z.string(),
  quantity: z.int().positive(),
  unit: z.int().positive(),
  sourceCost: z.int().nullable(),
  sourceUrl: z.string().nullable(),
  sku: z.string().nullish(),
  colour: z.string().nullish(),
  sourcePrice: z.int().nullish(),
  category: z.string(),
  gst: z.int(),
  discountPaise: z.int().optional(),
  taxPaise: z.int().optional(),
  variableCost: z.int().nullable(),
});
type Line = z.infer<typeof line>;
export const gatewayReady = () =>
  !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET &&
    process.env.APP_HMAC_SECRET &&
    process.env.CHECKOUT_ENABLED === 'true' &&
    (((process.env.RAZORPAY_ENV ?? 'test') === 'test' &&
      process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) ||
      (process.env.RAZORPAY_ENV === 'live' &&
        process.env.RAZORPAY_KEY_ID.startsWith('rzp_live_') &&
        process.env.LIVE_PAYMENTS_APPROVED === 'true' &&
        process.env.VERCEL_ENV === 'production'))
  );
const unavailable = 'Availability or pricing has changed. Review your bag.';
async function price(s: Tx, b: Input, exclude: string | null) {
  const cfg = first(await s`select * from store_settings where singleton for share`);
  need(
    cfg.shipping_paise != null && cfg.serviceable_pins.includes(b.address.pin),
    422,
    'Delivery is not configured for this PIN.',
  );
  const items: Line[] = [];
  let subtotal = 0;
  const sorted = [...b.lines].sort((a, c) => a.variantId.localeCompare(c.variantId));
  need(new Set(sorted.map((x) => x.variantId)).size === sorted.length, 422, 'Combine duplicate variants.');
  for (const l of sorted) {
    const [v] =
      await s`select v.*,p.slug,p.status,p.title,p.source_url,p.source_price,p.colour as product_colour,p.purchase_cost,p.category,p.selling_price,p.details,(select '/api/media/'||asset_id from product_images where product_id=p.id and is_primary) img from product_variants v join products p on p.id=v.product_id where v.id=${l.variantId} and p.slug=${l.slug} for update of v`;
    need(v && v.status === 'published' && v.is_available, 409, unavailable);
    const [h] =
      await s`select coalesce(sum(quantity),0)::int n from reservations where variant_id=${v.id} and expires_at>now() and intent_id is distinct from ${exclude}::uuid`;
    need(v.stock_quantity - h.n >= l.quantity, 409, unavailable);
    const unit = v.variant_price_override ?? v.selling_price;
    const costs = costSchema.parse(v.details.costs);
    const cal = commercePrice(costs);
    need(cal.ok && unit >= cal.min, 409, 'The selling price needs merchant review.');
    subtotal += unit * l.quantity;
    items.push(
      line.parse({
        variantId: v.id,
        productId: v.product_id,
        slug: v.slug,
        name: v.title,
        image: v.img,
        size: v.size,
        quantity: l.quantity,
        unit,
        sourceCost: v.purchase_cost,
        sku: v.sku,
        colour: v.colour || v.product_colour,
        sourcePrice: v.source_price,
        sourceUrl: v.source_url,
        category: v.category,
        gst: costs.tax === 'inclusive' ? costs.gst : 0,
        variableCost: Math.round(unit / (1 + cal.t)) - contribution(unit, cal).amount,
      }),
    );
  }
  let discount = 0,
    couponId: string | null = null;
  if (b.coupon) {
    const [c] =
      await s`select * from coupons where code=${b.coupon} and is_active and start_at<=now() and (expiry_at is null or expiry_at>now()) for update`;
    need(c && subtotal >= c.minimum_order_value, 422, 'Coupon not applicable.');
    const [r] =
      await s`select count(*)::int n from checkout_intents where coupon_id=${c.id} and state in ('quoted','opened') and expires_at>now() and id is distinct from ${exclude}::uuid`;
    need(c.usage_limit === null || c.usage_count + r.n < c.usage_limit, 409, 'Coupon no longer available.');
    discount = Math.min(
      subtotal,
      c.maximum_discount ?? subtotal,
      c.discount_type === 'fixed' ? c.discount_value : Math.floor((subtotal * c.discount_value) / 10000),
    );
    couponId = c.id;
  }
  const shipping =
    cfg.free_from_paise != null && subtotal - discount >= cfg.free_from_paise ? 0 : cfg.shipping_paise;
  const total = subtotal - discount + shipping;
  need(
    total >= 100 && total <= 100000000 && Number.isSafeInteger(total),
    422,
    'Order total outside supported limits.',
  );
  let cumulative = 0,
    applied = 0;
  const tax = items.reduce((sum, l) => {
    const gross = l.unit * l.quantity;
    cumulative += gross;
    const allocation = Number((BigInt(discount) * BigInt(cumulative)) / BigInt(subtotal)) - applied;
    applied += allocation;
    l.discountPaise = allocation;
    l.taxPaise = Math.round(((gross - allocation) * l.gst) / (10000 + l.gst));
    return sum + l.taxPaise;
  }, 0);
  return {
    items,
    subtotal,
    shipping,
    discount,
    total,
    tax: tax + Math.round((shipping * cfg.shipping_gst_bps) / (10000 + cfg.shipping_gst_bps)),
    couponId,
  };
}
const project = (r: Record<string, unknown>) =>
  quoteSchema.parse({
    id: r.id,
    currency: 'INR',
    subtotalPaise: r.subtotal,
    shippingPaise: r.shipping,
    discountPaise: r.discount,
    taxPaise: r.tax,
    totalPaise: r.total,
    expiresAt: iso(r.expires_at as Date),
    delivery: 'Serviceable delivery PIN confirmed.',
  });
export async function quote(raw: unknown, owner: string, key: string, ip: string) {
  need(gatewayReady(), 503, 'Checkout is not configured.');
  const b = input.parse(raw);
  uid(key);
  need(/^[\w-]{43}$/.test(owner), 403, 'Guest checkout session required.');
  await limit('quote-ip', ip, 30, 600);
  await limit('quote-phone', b.address.mobile, 8, 600);
  const digest = hash(json(b)),
    who = hash(owner);
  return tx(async (s) => {
    await s`select pg_advisory_xact_lock(hashtextextended(${who},0))`;
    const [old] =
      await s`select * from checkout_intents where owner_hash=${who} and (request_id=${key} or (state in ('quoted','opened') and input_hash=${digest} and expires_at>now())) order by created_at desc limit 1 for update`;
    if (old) {
      need(
        old.input_hash === digest && +old.expires_at > Date.now() && old.state !== 'paid',
        409,
        'Request key already used or expired.',
      );
      return project(old);
    }
    await s`delete from reservations where intent_id in(select id from checkout_intents where owner_hash=${who} and state='quoted')`;
    await s`update checkout_intents set state='expired',expires_at=now(),address=null,email=null where owner_hash=${who} and state='quoted'`;
    const p = await price(s, b, null);
    const [i] =
      await s`insert into checkout_intents(owner_hash,request_id,input_hash,address,email,lines,subtotal,discount,shipping,tax,total,coupon_id,expires_at) values(${who},${key},${digest},${json(b.address)}::text::jsonb,${b.email ?? null},${json(p.items)}::text::jsonb,${p.subtotal},${p.discount},${p.shipping},${p.tax},${p.total},${p.couponId},now()+interval '15 minutes') returning *`;
    for (const l of p.items)
      await s`insert into reservations values(${i.id},${l.variantId},${l.quantity},${i.expires_at})`;
    return project(i);
  });
}
export async function razor(path: string, payload?: unknown, headers?: Record<string, string>) {
  const auth = Buffer.from(`${secret('RAZORPAY_KEY_ID')}:${secret('RAZORPAY_KEY_SECRET')}`).toString(
    'base64',
  );
  const r = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json', ...headers },
    body: payload === undefined ? undefined : json(payload),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(7000),
  });
  need(r.ok, 502, 'The payment provider has not confirmed this operation.');
  return r.json();
}
const providerOrder = z.object({
  id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
  amount: z.int(),
  receipt: z.string(),
  currency: z.literal('INR'),
});
export async function paymentSession(id: string, owner: string) {
  need(gatewayReady(), 503, 'Checkout is not configured.');
  uid(id);
  const i = await tx(async (s) => {
    const row = first(
      await s`select i.*,c.code from checkout_intents i left join coupons c on c.id=i.coupon_id where i.id=${id} and i.owner_hash=${hash(owner)} for update of i`,
    );
    need(
      row.address && ['quoted', 'opened'].includes(row.state) && +row.expires_at > Date.now(),
      409,
      'Quote expired. Review your total.',
    );
    const p = await price(
      s,
      {
        address: row.address,
        termsAccepted: true,
        lines: z.array(line).parse(row.lines),
        coupon: row.code ?? undefined,
      },
      id,
    );
    need(
      p.total === row.total &&
        p.tax === row.tax &&
        p.discount === row.discount &&
        p.shipping === row.shipping &&
        p.items.every((l, index) => l.unit === row.lines[index].unit && l.size === row.lines[index].size),
      409,
      unavailable,
    );
    if (!row.provider_order) {
      need(
        !row.provider_claim || Date.now() - Number(row.provider_claim) > 15000,
        409,
        'Payment order is being prepared.',
      );
      await s`update checkout_intents set provider_claim=now(),state='opened' where id=${id}`;
    }
    return row;
  });
  let orderId = i.provider_order;
  if (!orderId) {
    let order: unknown;
    if (i.provider_claim) {
      const found = await razor(`orders?receipt=${id}&count=2`);
      need(
        Array.isArray(found.items) && found.items.length === 1,
        409,
        'Provider creation is unconfirmed. Do not pay again until this quote expires.',
      );
      order = found.items[0];
    } else order = await razor('orders', { amount: i.total, currency: 'INR', receipt: id });
    const o = providerOrder.parse(order);
    need(o.amount === i.total && o.receipt === id, 502, 'Provider order mismatch.');
    await tx(async (s) => {
      await s`update checkout_intents set provider_order=${o.id} where id=${id} and (provider_order is null or provider_order=${o.id})`;
    });
    orderId = o.id;
  }
  return {
    quoteId: id,
    orderId,
    keyId: secret('RAZORPAY_KEY_ID'),
    amount: i.total,
    currency: 'INR' as const,
  };
}
const captured = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.int().positive(),
  currency: z.literal('INR'),
  status: z.literal('captured'),
  captured: z.literal(true),
  method: z.string().max(40).optional(),
});
export async function settle(s: Tx, raw: unknown) {
  const p = captured.parse(raw);
  const i = first(
    await s`select * from checkout_intents where provider_order=${p.order_id} for update`,
    'Checkout order has not been linked.',
  );
  need(i.total === p.amount, 409, 'Captured amount mismatch.');
  if (i.state === 'paid') {
    const paid = first(
      await s`select p.razorpay_payment_id from payments p join orders o on o.id=p.order_id where o.intent_id=${i.id}`,
    );
    need(paid.razorpay_payment_id === p.id, 409, 'Another captured payment requires reconciliation.');
    return i.id;
  }
  const a = addressSchema.parse(i.address);
  const lines = z.array(line).parse(i.lines);
  let couponException = false;
  if (i.coupon_id) {
    const c = first(await s`select usage_limit,usage_count from coupons where id=${i.coupon_id} for update`);
    const [h] =
      await s`select count(*)::int n from checkout_intents where coupon_id=${i.coupon_id} and id<>${i.id} and state in('opened','quoted') and expires_at>now()`;
    couponException = c.usage_limit != null && c.usage_count + h.n >= c.usage_limit;
  }
  let exception = couponException;
  for (const l of lines) {
    const [v] = await s`select stock_quantity from product_variants where id=${l.variantId} for update`;
    const [h] =
      await s`select coalesce(sum(quantity),0)::int n from reservations where variant_id=${l.variantId} and intent_id<>${i.id} and expires_at>now()`;
    if (!v || v.stock_quantity - h.n < l.quantity) exception = true;
  }
  const [c] =
    await s`insert into customers(full_name,phone_number,normalised_phone,email) values(${a.fullName},${a.mobile},${a.mobile},${i.email}) on conflict(normalised_phone) do update set full_name=excluded.full_name,email=coalesce(excluded.email,customers.email),updated_at=now() returning id`;
  const [ad] =
    await s`insert into addresses(customer_id,full_name,phone_number,address_line_1,city,state,pincode) values(${c.id},${a.fullName},${a.mobile},${a.address},${a.city},${a.state},${a.pin}) returning id`;
  const [o] =
    await s`insert into orders(intent_id,customer_id,address_id,customer_name_snapshot,customer_phone_snapshot,delivery_address_snapshot,subtotal,discount_amount,shipping_amount,tax_amount,total_amount,payment_status,currency,exception_reason,fulfilment_status) values(${i.id},${c.id},${ad.id},${a.fullName},${a.mobile},${json(a)}::text::jsonb,${i.subtotal},${i.discount},${i.shipping},${i.tax},${i.total},'paid','INR',${exception ? 'Late capture: inventory or coupon hold unavailable. Review and refund; do not purchase.' : null},${exception ? 'cancelled' : 'pending-purchase'}) returning id`;
  for (const l of lines) {
    await s`insert into order_items(order_id,product_id,product_title_snapshot,product_image_snapshot,selected_size,selected_variant_id,quantity,unit_price,total_price,source_cost_snapshot,source_url_snapshot,category_snapshot,gst_bps,variable_cost_snapshot,variant_sku_snapshot,colour_snapshot,source_price_snapshot,discount_snapshot,tax_snapshot) values(${o.id},${l.productId},${l.name},${l.image},${l.size},${l.variantId},${l.quantity},${l.unit},${l.quantity * l.unit},${l.sourceCost},${l.sourceUrl},${l.category},${l.gst},${l.variableCost},${l.sku ?? null},${l.colour ?? null},${l.sourcePrice ?? null},${l.discountPaise ?? 0},${l.taxPaise ?? 0})`;
    if (!exception) {
      const [v] =
        await s`update product_variants set stock_quantity=stock_quantity-${l.quantity},revision=revision+1,updated_at=now() where id=${l.variantId} returning *`;
      await s`insert into stock_history(variant_id,product_id,product,size,sku,before_qty,delta,after_qty,reason,actor) values(${v.id},${l.productId},${l.name},${l.size},${v.sku ?? ''},${v.stock_quantity + l.quantity},${-l.quantity},${v.stock_quantity},'Captured guest order','Payment verification')`;
      await s`update products set revision=revision+1,updated_at=now() where id=${l.productId}`;
    }
  }
  await s`insert into payments(order_id,razorpay_order_id,razorpay_payment_id,razorpay_signature_verified,amount,currency,status,method,paid_at) values(${o.id},${p.order_id},${p.id},true,${p.amount},'INR','captured',${p.method ?? null},now())`;
  await s`insert into order_fulfilment(order_id,source_product_url,fulfilment_status) values(${o.id},${lines[0].sourceUrl},${exception ? 'cancelled' : 'pending-purchase'})`;
  if (i.coupon_id && !couponException)
    await s`update coupons set usage_count=usage_count+1 where id=${i.coupon_id}`;
  await s`delete from reservations where intent_id=${i.id}`;
  await s`update checkout_intents set state='paid',address=null,email=null where id=${i.id}`;
  await audit(
    s,
    null,
    'Payment captured',
    'order',
    o.id,
    exception ? 'Stock exception · refund review required.' : 'Manual purchase pending.',
  );
  return i.id;
}
export const verifyFields = z
  .object({
    quoteId: z.uuid(),
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
    razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export async function verifyPayment(raw: unknown, owner: string) {
  const b = verifyFields.parse(raw);
  const i = await tx(async (s) =>
    first(
      await s`select provider_order from checkout_intents where id=${b.quoteId} and owner_hash=${hash(owner)}`,
    ),
  );
  need(
    i.provider_order === b.razorpay_order_id &&
      equal(
        mac(`${i.provider_order}|${b.razorpay_payment_id}`, secret('RAZORPAY_KEY_SECRET')),
        b.razorpay_signature,
      ),
    400,
    'Invalid payment signature.',
  );
  const p = await razor(`payments/${b.razorpay_payment_id}`);
  need(
    p.id === b.razorpay_payment_id && p.order_id === i.provider_order && p.status === 'captured',
    409,
    'Payment capture is not confirmed yet.',
  );
  await tx((s) => settle(s, p));
  return { verified: true, quoteId: b.quoteId };
}
export async function refreshRefundState(s: Tx, orderId: string) {
  const [r] =
    await s`select coalesce(sum(amount) filter(where status='processed'),0)::int processed,count(*) filter(where status in ('requested','pending')) pending from refunds where order_id=${orderId}`;
  await s`update orders set payment_status=case when ${r.processed}>=total_amount then 'refunded' when ${Number(r.pending)}>0 then 'refund-pending' when ${r.processed}>0 then 'partially-refunded' else 'paid' end,updated_at=now(),revision=revision+1 where id=${orderId}`;
}
export async function refundUpdate(s: Tx, raw: unknown, localId?: string) {
  const r = z
    .object({
      id: z.string().regex(/^rfnd_[A-Za-z0-9]+$/),
      payment_id: z.string(),
      amount: z.int().positive(),
      currency: z.literal('INR'),
      status: z.enum(['pending', 'processed', 'failed']),
      receipt: z.string().nullable().optional(),
    })
    .parse(raw);
  const [p] = await s`select order_id from payments where razorpay_payment_id=${r.payment_id}`;
  need(p, 409, 'Unknown captured payment.');
  await s`select id from orders where id=${p.order_id} for update`;
  const local = localId ?? (z.uuid().safeParse(r.receipt).success ? r.receipt : null) ?? null;
  const [f] = await s`select * from refunds where provider_id=${r.id} or id=${local}::uuid for update`;
  if (!f) {
    await s`insert into refunds(order_id,payment_id,provider_id,amount,reason,status) values(${p.order_id},${r.payment_id},${r.id},${r.amount},'Provider-initiated refund',${r.status})`;
  } else {
    need(
      f.payment_id === r.payment_id && f.amount === r.amount && (!f.provider_id || f.provider_id === r.id),
      409,
      'Refund identity mismatch.',
    );
    if ((f.status === r.status && f.provider_id === r.id) || ['processed', 'failed'].includes(f.status))
      return;
    await s`update refunds set provider_id=${r.id},status=${r.status},updated_at=now() where id=${f.id}`;
  }
  await refreshRefundState(s, p.order_id);
  await audit(s, null, `Refund ${r.status}`, 'order', p.order_id);
}
export async function webhook(raw: Buffer, sig: string, eventId: string) {
  need(
    /^[a-f0-9]{64}$/.test(sig) &&
      [secret('RAZORPAY_WEBHOOK_SECRET'), process.env.RAZORPAY_WEBHOOK_PREVIOUS_SECRET].some(
        (k) => k && equal(mac(raw, k), sig),
      ),
    400,
    'Invalid webhook signature.',
  );
  need(/^[A-Za-z0-9:_-]{1,160}$/.test(eventId), 400, 'Invalid event identifier.');
  const e = (() => {
    try {
      return z
        .object({
          event: z.string(),
          payload: z.record(z.string(), z.object({ entity: z.record(z.string(), z.unknown()) })).optional(),
        })
        .parse(JSON.parse(raw.toString('utf8')));
    } catch {
      throw new Fault(400, 'Invalid event.');
    }
  })();
  const kind = z.string().max(80).parse(e.event);
  return tx(async (s) => {
    const seen =
      await s`insert into payment_events values(${eventId},${kind},now()) on conflict do nothing returning event_id`;
    if (!seen.length) return { received: true };
    if (['payment.captured', 'order.paid'].includes(kind)) await settle(s, e.payload?.payment?.entity);
    else if (['payment.authorized', 'payment.failed'].includes(kind)) {
      const p = e.payload?.payment?.entity;
      if (typeof p?.order_id === 'string')
        await s`update checkout_intents set provider_state=${kind},checked_at=null where provider_order=${p.order_id} and state='opened'`;
    } else if (['refund.created', 'refund.processed', 'refund.failed'].includes(kind))
      await refundUpdate(s, e.payload?.refund?.entity);
    return { received: true };
  });
}
export async function receiptFor(owner: string, id?: string) {
  need(/^[\w-]{43}$/.test(owner), 404, 'No confirmed order.');
  if (id) uid(id);
  return tx(async (s) => {
    const o = first(
      await s`select o.* from orders o join checkout_intents i on i.id=o.intent_id join payments p on p.order_id=o.id where i.owner_hash=${hash(owner)} and i.id=coalesce(${id ?? null}::uuid,(select id from checkout_intents where owner_hash=${hash(owner)} and state in ('opened','paid') order by created_at desc limit 1)) and o.created_at>now()-interval '90 days' order by o.created_at desc limit 1`,
    );
    const items =
      await s`select product_title_snapshot name,selected_size size,quantity,total_price as "lineTotalPaise",total_price-tax_snapshot-discount_snapshot as "revenuePaise",product_id as "productId" from order_items where order_id=${o.id} order by id`;
    return receiptSchema.parse({
      verified: true,
      paymentStatus: 'captured',
      reviewEligible: o.fulfilment_status === 'delivered',
      reference: o.order_number,
      quoteId: o.intent_id,
      totalPaise: o.total_amount,
      items,
      shippingPaise: o.shipping_amount,
      taxPaise: o.tax_amount,
      delivery: o.exception_reason
        ? 'Your payment was received. The store is reviewing availability.'
        : 'See order tracking for the latest fulfilment status.',
    });
  });
}
export async function track(raw: unknown, ip: string) {
  await limit('tracking-ip', ip, 8, 900);
  const { mobile } = z
    .object({
      mobile: z
        .string()
        .trim()
        .regex(/^(?:\+91)?[6-9]\d{9}$/)
        .transform((v) => v.slice(-10)),
    })
    .strict()
    .parse(raw);
  await limit('tracking-phone', mobile, 4, 3600);
  return tx(async (s) => {
    const orders =
      await s`select right(order_number,3) tail,fulfilment_status state,payment_status payment from orders where customer_phone_snapshot=${mobile} and created_at>=now()-interval '45 days' order by created_at desc limit 2`;
    return {
      orders: orders.map((o) => ({
        reference: `•••${o.tail}`,
        status:
          o.payment === 'refunded'
            ? 'Refund processed'
            : o.state === 'pending-purchase'
              ? 'Payment confirmed'
              : o.state === 'ordered-on-meesho'
                ? 'Preparing your order'
                : o.state === 'shipped'
                  ? 'Shipped'
                  : o.state === 'delivered'
                    ? 'Delivered'
                    : 'Order under review',
        items: [],
        update: 'Latest recorded status. Contact the store for assistance.',
      })),
    };
  });
}
export async function submitReview(raw: unknown, owner: string, ip: string) {
  const b = z
    .object({
      quoteId: z.uuid(),
      productId: z.uuid(),
      rating: z.int().min(1).max(5),
      body: z.string().trim().min(5).max(1500),
    })
    .strict()
    .parse(raw);
  await limit('review-ip', ip, 8, 3600);
  return tx(async (s) => {
    const o = first(
      await s`select o.id,o.customer_id from orders o join checkout_intents i on i.id=o.intent_id join payments p on p.order_id=o.id where i.owner_hash=${hash(owner)} and i.id=${b.quoteId} and o.fulfilment_status='delivered' and exists(select 1 from order_items l where l.order_id=o.id and l.product_id=${b.productId}) and o.created_at>now()-interval '90 days'`,
      'A completed purchase on this device is required.',
    );
    await s`insert into product_reviews(product_id,customer_id,order_id,rating,review_text,verification_status,source) values(${b.productId},${o.customer_id},${o.id},${b.rating},${b.body},'purchase','PARADELLE')`;
    return { status: 'pending' };
  });
}
// Also recovers a provider order created just before the function lost its response.
export async function reconcileOne() {
  if (!process.env.RAZORPAY_KEY_SECRET) return false;
  const row = await tx(async (s) => {
    const [i] =
      await s`select * from checkout_intents where state='opened' and created_at>now()-interval '30 days' and (checked_at is null or checked_at<now()-(case when expires_at>now()-interval '1 hour' then interval '3 minutes' else interval '4 hours' end)) and provider_claim<now()-interval '30 seconds' order by checked_at nulls first,created_at for update skip locked limit 1`;
    if (i) await s`update checkout_intents set checked_at=now() where id=${i.id}`;
    return i;
  });
  if (!row) return false;
  let id = row.provider_order;
  if (!id) {
    const found = await razor(`orders?receipt=${row.id}&count=2`);
    if (found.items?.length !== 1) return true;
    const o = providerOrder.parse(found.items[0]);
    need(o.receipt === row.id && o.amount === row.total, 409, 'Unreconciled gateway order.');
    await tx(
      (s) =>
        s`update checkout_intents set provider_order=${o.id} where id=${row.id} and (provider_order is null or provider_order=${o.id})`,
    );
    id = o.id;
  }
  const r = await razor(`orders/${id}/payments`);
  for (const p of z.array(z.unknown()).parse(r.items)) {
    const c = captured.safeParse(p);
    if (c.success && c.data.order_id === id) await tx((s) => settle(s, c.data));
  }
  return true;
}
