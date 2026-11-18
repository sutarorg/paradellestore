import { z } from 'zod';
import { command, checkCommand, queued, scopes, receipt, type Command } from '../admin/commands';
import { settings, type Viewer, type Scope, type Draft } from '../admin/models';
import { grants } from './auth';
import { locked, getDraft, saveProduct, adjust } from './catalogue';
import { importCommand } from './imports';
import { refreshRefundState } from './checkout';
import { tx, first, need, secret, hash, json, audit, uid } from './base';
export async function execute(v: Viewer, raw: unknown, key: string) {
  const c = command.parse(raw);
  uid(key);
  const perms: Scope[] = [scopes[c.op.split('.')[0]]];
  if (perms[0] === 'orders') perms.push('pii');
  if (c.op === 'import.finish') perms.push('catalogue');
  const problems = checkCommand(c);
  need(!problems.length, 422, problems.join(' '));
  return tx(async (s) => {
    await grants(s, v.id, perms);
    await s`select pg_advisory_xact_lock(hashtextextended(${v.id + key},0))`;
    const digest = hash(json(c));
    const [prior] = await s`select * from command_receipts where actor=${v.id} and key=${key}`;
    if (prior) {
      need(prior.body_hash === digest, 409, 'Idempotency key already used.');
      return receipt.parse(prior.result);
    }
    let result: { id: string; revision: number; productId?: string } = { id: v.id, revision: 0 };
    let detail = '';
    if (c.op.startsWith('import.')) {
      const r = await importCommand(s, v, c as Extract<Command, { op: `import.${string}` }>);
      result = {
        id: r.id,
        revision: r.revision,
        ...(c.op === 'import.finish' ? { productId: r.product_id } : {}),
      };
    } else
      switch (c.op) {
        case 'product.save': {
          const r = await saveProduct(s, v, c.draft, c.ref, c.intent === 'draft' ? 'draft' : 'published');
          result = { id: r.id, revision: r.revision };
          detail = c.intent;
          break;
        }
        case 'product.transition': {
          for (const ref of [...c.refs].sort((a, b) => a.id.localeCompare(b.id))) {
            const d = await getDraft(s, ref.id);
            const r = await saveProduct(s, v, d.draft, ref, c.to);
            result = { id: r.id, revision: r.revision };
            await audit(s, v.id, 'Publication status changed', 'product', ref.id, c.to);
          }
          break;
        }
        case 'product.delete': {
          const p = await locked(s, 'products', c.ref);
          need(p.status !== 'published', 409, 'Archive or unpublish before deletion.');
          const [used] =
            await s`select exists(select from checkout_intents i cross join lateral jsonb_array_elements(i.lines) l where l->>'productId'=${p.id} and i.state in ('opened','paid')) or exists(select from product_import_jobs where product_id=${p.id}) used`;
          need(!used.used, 409, 'Retain this product for purchase history. Archive instead.');
          await s`delete from products where id=${p.id}`;
          result = { id: p.id, revision: p.revision + 1 };
          break;
        }
        case 'product.duplicate': {
          await locked(s, 'products', c.ref);
          const { draft: d } = await getDraft(s, c.ref.id);
          const copy: Draft = {
            ...d,
            title: `${d.title.slice(0, 210)} (copy)`,
            slug: '',
            sku: '',
            bestseller: false,
            featured: false,
            factsVerified: false,
            images: [],
            variants: d.variants.map((x) => ({ ...x, id: crypto.randomUUID(), sku: '', stock: 0 })),
          };
          const r = await saveProduct(s, v, copy, null, 'draft');
          result = { id: r.id, revision: r.revision };
          break;
        }
        case 'stock.adjust': {
          const row = await locked(s, 'product_variants', c.ref);
          await adjust(s, row.id, row.stock_quantity + c.delta, c.reason, v);
          await s`update products set revision=revision+1,updated_at=now() where id=${row.product_id}`;
          result = { id: row.id, revision: row.revision + 1 };
          detail = `Adjustment ${c.delta > 0 ? '+' : ''}${c.delta}.`;
          break;
        }
        case 'order.fulfil': {
          const o = await locked(s, 'orders', c.ref),
            m = c.manual;
          const next: Record<string, string[]> = {
            'pending-purchase': ['pending-purchase', 'ordered-on-meesho', 'cancelled'],
            'ordered-on-meesho': ['ordered-on-meesho', 'shipped', 'cancelled'],
            shipped: ['shipped', 'delivered'],
            delivered: ['delivered'],
            cancelled: ['cancelled'],
          };
          need(next[o.fulfilment_status]?.includes(m.status), 409, 'Invalid fulfilment transition.');
          if (m.status !== o.fulfilment_status && m.status !== 'cancelled')
            need(
              !o.exception_reason && !['refunded', 'refund-pending'].includes(o.payment_status),
              409,
              'Review payment before purchasing.',
            );
          if (m.purchaseDate)
            need(
              m.purchaseDate <=
                new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Kolkata',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).format(new Date()),
              422,
              'Purchase date cannot be in the future.',
            );
          if (m.trackingUrl) z.url({ protocol: /^https$/ }).parse(m.trackingUrl);
          await s`update order_fulfilment set source_product_url=${m.sourceUrl || null},source_order_id=${m.meeshoRef || null},source_purchase_cost=${m.costPaise},actual_purchase_date=${m.purchaseDate || null},carrier=${m.carrier || null},tracking_reference=${m.tracking || null},tracking_url=${m.trackingUrl || null},admin_notes=${m.notes || null},fulfilment_status=${m.status},updated_by=${v.id},updated_at=now() where order_id=${o.id}`;
          await s`insert into fulfilment_revisions(order_id,revision,manual,updated_by) values(${o.id},${o.revision + 1},${json(m)}::text::jsonb,${v.id})`;
          await s`update orders set fulfilment_status=${m.status},revision=revision+1,updated_at=now() where id=${o.id}`;
          result = { id: o.id, revision: o.revision + 1 };
          detail = `${o.fulfilment_status} → ${m.status}. Manual ledger updated.`;
          break;
        }
        case 'order.refund':
        case 'order.check-refund': {
          secret('RAZORPAY_KEY_SECRET');
          const o = await locked(s, 'orders', c.ref);
          const p = first(await s`select * from payments where order_id=${o.id}`);
          if (c.op === 'order.refund') {
            const [used] =
              await s`select coalesce(sum(amount),0)::int n from refunds where order_id=${o.id} and status<>'failed'`;
            need(c.amountPaise <= p.amount - used.n, 409, 'Amount exceeds remaining refundable balance.');
            const [f] =
              await s`insert into refunds(id,order_id,payment_id,amount,reason) values(${key},${o.id},${p.razorpay_payment_id},${c.amountPaise},${c.reason}) returning id`;
            await s`insert into work_queue(kind,refund_id) values('refund',${f.id})`;
            await refreshRefundState(s, o.id);
          } else {
            const rows =
              await s`select id,provider_id from refunds where order_id=${o.id} and status in ('requested','pending')`;
            need(rows.length, 409, 'No outstanding refund.');
            for (const f of rows)
              await s`insert into work_queue(kind,refund_id) select ${f.provider_id ? 'refund-check' : 'refund'},${f.id} where not exists(select 1 from work_queue where refund_id=${f.id} and stage in('queued','leased','waiting'))`;
            await s`update orders set revision=revision+1,updated_at=now() where id=${o.id}`;
          }
          result = { id: o.id, revision: o.revision + 1 };
          break;
        }
        case 'review.moderate': {
          const r = await locked(s, 'product_reviews', c.ref);
          await s`update product_reviews set publication_status=${c.to},updated_at=now(),revision=revision+1 where id=${r.id}`;
          result = { id: r.id, revision: r.revision + 1 };
          detail = c.to;
          break;
        }
        case 'settings.save': {
          const cfg = first(await s`select revision from store_settings for update`);
          need(c.revision === cfg.revision, 409, 'Settings changed.');
          const value = settings.shape[c.section].parse(c.value);
          if (c.section === 'profile') {
            const p = settings.shape.profile.parse(value);
            need(
              p.name && p.email === first(await s`select email from profiles where id=${v.id}`).email,
              422,
              'To change an identity email use verified Supabase Auth administration.',
            );
            await s`update profiles set full_name=${p.name},updated_at=now() where id=${v.id}`;
          } else if (c.section === 'delivery') {
            const d = settings.shape.delivery.parse(value);
            await s`update store_settings set shipping_paise=${d.shipping},free_from_paise=${d.freeFrom},shipping_gst_bps=${d.gst},serviceable_pins=${s.array([...new Set(d.pins)])}::text[]`;
          } else {
            if (c.section === 'identity') {
              const p = settings.shape.identity.parse(value);
              if (p.logo) {
                const a = first(
                  await s`select id,width,height from assets where id=${uid(p.logo.id)} and purpose='logo'`,
                );
                p.logo = { ...p.logo, id: a.id, width: a.width, height: a.height, src: `/api/media/${a.id}` };
              }
              await s`update store_settings set sections=jsonb_set(sections,array['identity'],${json(p)}::text::jsonb)`;
            } else
              await s`update store_settings set sections=jsonb_set(sections,array[${c.section}::text],${json(value)}::text::jsonb)`;
          }
          await s`update store_settings set revision=revision+1,updated_at=now()`;
          result = { id: v.id, revision: c.revision + 1 };
          detail = c.section;
          break;
        }
      }
    const kind = c.op.split('.')[0];
    const eventId = await audit(s, v.id, c.op, kind, result.id, detail);
    const out = receipt.parse({ ...result, eventId, outcome: queued(c) ? 'queued' : 'applied' });
    await s`insert into command_receipts(actor,key,body_hash,result) values(${v.id},${key},${digest},${json(out)}::text::jsonb)`;
    return out;
  });
}
export async function createLicensedReview(v: Viewer, raw: unknown) {
  const b = z
    .object({
      productId: z.uuid(),
      source: z.string().trim().min(1).max(120),
      licenceReference: z.string().trim().min(5).max(240),
      rating: z.int().min(1).max(5),
      body: z.string().trim().min(5).max(1500),
      permissionConfirmed: z.literal(true),
    })
    .strict()
    .parse(raw);
  return tx(async (s) => {
    await grants(s, v.id, ['reviews']);
    first(await s`select id from products where id=${b.productId} for update`);
    const [cap] =
      await s`select count(*)::int n from product_reviews where product_id=${b.productId} and verification_status='licensed'`;
    need(cap.n < 10, 409, 'At most ten licensed reviews per product.');
    const r = first(
      await s`insert into product_reviews(product_id,rating,review_text,verification_status,source,licence_reference) values(${b.productId},${b.rating},${b.body},'licensed',${b.source},${b.licenceReference}) returning id,revision`,
    );
    await audit(s, v.id, 'Licensed review recorded', 'review', r.id);
    return r;
  });
}
