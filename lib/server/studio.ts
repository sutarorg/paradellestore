import { blankSettings, settings, type Viewer, type Scope, jobDetail, type Job } from '../admin/models';
import { listQuery, type ListName, type Raw } from '../admin/rules';
import { grants } from './auth';
import { asPhoto } from './media';
import { first, need, uid, type Tx, tx } from './base';
import { getDraft } from './catalogue';
const resources = {
  products: ['product_register', 'catalogue'],
  orders: ['order_register', 'orders'],
  customers: ['customer_register', 'customers'],
  reviews: ['review_register', 'reviews'],
  inventory: ['inventory_register', 'inventory'],
  imports: ['job_register', 'imports'],
} as const;
export const scopesFor = (k: ListName): Scope[] =>
  k === 'customers' || k === 'orders' ? [k, 'pii'] : [resources[k][1]];
export async function job(s: Tx, id: string): Promise<Job> {
  const j = first(
    await s`select v.*,j.extracted_data facts,j.generated_content suggestion,j.images,j.draft,j.reviews,j.rights_confirmed as "rightsConfirmed",j.reference_ids from job_register v join product_import_jobs j on j.id=v.id where v.id=${uid(id)}`,
  );
  const refs =
    await s`select * from assets where id=any(${s.array(j.reference_ids)}::uuid[]) order by array_position(${s.array(j.reference_ids)}::uuid[],id)`;
  return jobDetail.parse({
    ...j,
    updatedAt: new Date(j.updatedAt).toISOString(),
    references: refs.map(asPhoto),
  });
}
export async function adminList(s: Tx, k: ListName, raw: Raw) {
  const q = listQuery(k, raw);
  const search = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const searchCols = {
    products: ['title', 'sku', 'slug'],
    inventory: ['title', 'sku', 'size'],
    customers: ['name', 'mobile'],
    orders: ['reference', 'customer', 'mobile'],
    reviews: ['productTitle', 'body'],
    imports: ['sourceUrl', 'title'],
  }[k];
  const where = [s`concat_ws(' ',${s(searchCols)}) ilike ${search}`];
  if (k === 'products') {
    if (q.category) where.push(s`category=${q.category}`);
    if (q.status) where.push(s`status=${q.status}`);
  }
  if (k === 'reviews' && q.status) where.push(s`(status=${q.status} or origin=${q.status})`);
  if (k === 'orders') {
    if (q.customerId) where.push(s`customer_id=${uid(q.customerId)}`);
    if (q.status) where.push(s`(payment=${q.status} or fulfilment=${q.status})`);
  }
  if (k === 'imports' && q.status) {
    where.push(
      q.status === 'failed'
        ? s`stages::text like '%"failed"%'`
        : q.status === 'in-progress'
          ? s`(stages::text like '%"running"%' or stages::text like '%"queued"%')`
          : s`stages->>'approval'=${q.status === 'pending-review' ? 'pending' : q.status}`,
    );
  }
  if (k === 'inventory' && q.status) {
    where.push(
      q.status === 'disabled'
        ? s`not enabled`
        : q.status === 'out-of-stock'
          ? s`stock=0`
          : q.status === 'available'
            ? s`enabled and stock>0`
            : s`stock<=threshold`,
    );
  }
  const sorts: Record<string, [string, boolean]> = {
    'updated-desc': ['updatedAt', true],
    'title-asc': ['title', false],
    'price-asc': ['pricePaise', false],
    'price-desc': ['pricePaise', true],
    newest: [k === 'orders' ? 'date' : 'at', true],
    oldest: [k === 'orders' ? 'date' : k === 'imports' ? 'updatedAt' : 'at', false],
    'value-desc': ['totalPaise', true],
    recent: ['lastOrder', true],
    'name-asc': ['name', false],
    'spend-desc': ['spendPaise', true],
    'rating-desc': ['rating', true],
    'stock-asc': ['stock', false],
    'stock-desc': ['stock', true],
  };
  const [col, desc] = sorts[q.sort];
  const cond = where.reduce((a, b) => s`${a} and ${b}`);
  const view = s(resources[k][0]);
  const { n } = first(await s`select count(*)::int n from ${view} where ${cond}`);
  const page = Math.min(q.page, Math.max(1, Math.ceil(n / 20)));
  const rows =
    await s`select * from ${view} where ${cond} order by ${s(col)} ${desc ? s`desc` : s`asc`} nulls last,id limit 20 offset ${(page - 1) * 20}`;
  return {
    rows: rows.map((r) => {
      if (k === 'customers') return { ...r, spendPaise: Number(r.spendPaise) };
      const { customer_id: _, ...dto } = r;
      return dto;
    }),
    page,
    pageSize: 20,
    total: n,
  };
}
const history = (s: Tx, id?: string) =>
  s`select l.id,l.action label,coalesce(l.metadata->>'detail','') detail,l.created_at at,coalesce(p.full_name,'Commerce service') actor from admin_activity_logs l left join profiles p on p.id=l.admin_user_id where (${id ?? null}::uuid is null or (entity_type='order' and entity_id=${id ?? null})) order by l.created_at desc limit ${id ? 100 : 12}`;
export async function orderDetail(s: Tx, id: string) {
  const o = first(
    await s`select v.*,o.delivery_address_snapshot a,o.subtotal,o.tax_amount,o.discount_amount,o.exception_reason,p.razorpay_payment_id,p.amount,p.paid_at,f.source_product_url,f.source_order_id,f.source_purchase_cost,to_char(f.actual_purchase_date,'YYYY-MM-DD') purchase_date,f.carrier,f.tracking_reference,f.tracking_url,f.admin_notes,(select coalesce(sum(amount),0)::int from refunds where order_id=o.id and status<>'failed') committed from order_register v join orders o on o.id=v.id join payments p on p.order_id=o.id join order_fulfilment f on f.order_id=o.id where o.id=${uid(id)}`,
  );
  const m = first(
    await s`select sum(variable_cost_snapshot*quantity)::bigint costs,sum(source_cost_snapshot*quantity)::bigint source from order_items where order_id=${id}`,
  );
  const refunds =
    await s`select id,amount,status,created_at as "createdAt" from refunds where order_id=${id} order by created_at desc`;
  const processed = refunds.reduce((n, r) => n + (r.status === 'processed' ? r.amount : 0), 0);
  const { customer_id: _, a, exception_reason, ...rest } = o;
  return {
    id: rest.id,
    revision: o.revision,
    reference: o.reference,
    customer: o.customer,
    mobile: o.mobile,
    items: o.items,
    date: o.date,
    totalPaise: o.totalPaise,
    payment: o.payment,
    fulfilment: o.fulfilment,
    address: [a.fullName, a.address, a.city, a.state, a.pin, 'India'].join(', '),
    subtotalPaise: o.subtotal,
    discountPaise: o.discount_amount,
    paidPaise: o.amount,
    refundablePaise: o.amount - o.committed,
    sourcingPaise: o.source_purchase_cost,
    contributionPaise:
      m.costs != null && o.source_purchase_cost != null
        ? o.totalPaise -
          o.tax_amount -
          Number(m.costs) +
          Number(m.source) -
          o.source_purchase_cost -
          processed
        : null,
    paymentReference: o.razorpay_payment_id,
    paymentAt: o.paid_at,
    manual: {
      status: o.fulfilment,
      sourceUrl: o.source_product_url ?? '',
      meeshoRef: o.source_order_id ?? '',
      costPaise: o.source_purchase_cost,
      purchaseDate: o.purchase_date ?? '',
      carrier: o.carrier ?? '',
      tracking: o.tracking_reference ?? '',
      trackingUrl: o.tracking_url ?? '',
      notes: o.admin_notes ?? '',
    },
    exception: exception_reason,
    refunds,
    history: await history(s, id),
  };
}
export async function report(s: Tx, days: number) {
  const span = s`o.created_at>=((now() at time zone 'Asia/Kolkata')::date-(${days}::int-1))::timestamp at time zone 'Asia/Kolkata'`;
  const [r] =
    await s`select count(*)::int n,coalesce(sum(total_amount),0)::bigint gross,count(*) filter(where o.fulfilment_status='pending-purchase')::int pending,count(*) filter(where payment_status in ('refunded','partially-refunded'))::int refunded,coalesce(sum((select sum(amount) from refunds where order_id=o.id and status='processed')),0)::bigint deductions,
 case when count(*)>0 and count(f.source_purchase_cost)=count(*) then sum(o.total_amount-o.tax_amount-f.source_purchase_cost-(select sum((variable_cost_snapshot-source_cost_snapshot)*quantity) from order_items where order_id=o.id)) end contribution from orders o join order_fulfilment f on f.order_id=o.id where ${span}`;
  const sales =
    await s`select to_char((o.created_at at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD') as "day",sum(o.total_amount)::bigint value from orders o where ${span} group by 1 order by 1`;
  const rank = async (cat: boolean) =>
    (
      await s`select ${cat ? s`l.category_snapshot` : s`l.product_title_snapshot`} name,sum(l.total_price)::bigint value from order_items l join orders o on o.id=l.order_id where ${span} group by 1 order by 2 desc,1 limit 10`
    ).map((x) => ({ name: x.name, value: Number(x.value) }));
  const statuses =
    await s`select fulfilment_status name,count(*)::int value from orders o where ${span} group by 1 order by 2 desc,1`;
  return {
    grossPaise: Number(r.gross),
    netPaise: Number(r.gross) - Number(r.deductions),
    orders: r.n,
    aovPaise: r.n ? Math.round(Number(r.gross) / r.n) : null,
    contributionPaise: r.contribution == null ? null : Number(r.contribution) - Number(r.deductions),
    returnBps: null,
    refundBps: r.n ? Math.round((r.refunded * 10000) / r.n) : null,
    sales: sales.map((x) => ({ day: x.day, salesPaise: Number(x.value) })),
    products: await rank(false),
    categories: await rank(true),
    statuses,
  };
}
export async function readStudio(v: Viewer, path: string[], raw: Raw) {
  const [k, id] = path;
  return tx(async (s) => {
    if (Object.hasOwn(resources, k)) {
      await grants(s, v.id, scopesFor(k as ListName));
      if (!id || id === 'search') return adminList(s, k as ListName, raw);
      if (k === 'products') return getDraft(s, id);
      if (k === 'imports') return job(s, id);
      if (k === 'orders') return orderDetail(s, id);
      if (k === 'customers') {
        const r = first(await s`select * from customer_register where id=${uid(id)}`);
        return {
          ...r,
          spendPaise: Number(r.spendPaise),
          recentOrders: v.permissions.includes('orders')
            ? (await adminList(s, 'orders', { customerId: id })).rows.map((x) => ({
                reference: x.reference,
                date: x.date,
                totalPaise: x.totalPaise,
              }))
            : [],
        };
      }
      if (k === 'inventory' && id === 'history')
        return s`select id,variant_id as "variantId",product_id as "productId",product,size,sku,before_qty as before,delta,after_qty as after,reason,created_at at,actor from stock_history order by created_at desc limit 25`;
    }
    if (k === 'analytics' || k === 'dashboard') {
      await grants(s, v.id, k === 'analytics' ? ['analytics'] : ['orders', 'pii', 'analytics']);
      const days = [7, 30, 90].includes(Number(raw.days)) ? Number(raw.days) : 30;
      const a = await report(s, days);
      if (k === 'analytics') return id === 'sales' ? a.sales : id === 'products' ? a.products : a;
      const [n] =
        await s`select (select count(*)::int from products where status='published') published,(select count(distinct product_id)::int from product_variants where is_available and stock_quantity<=low_threshold) low,(select count(*)::int from product_import_jobs where status='pending') jobs,(select count(*)::int from orders where fulfilment_status='pending-purchase') pending`;
      const orders =
        await s`select id,revision,reference,customer,items,date,"totalPaise",payment,fulfilment from order_register order by date desc limit 6`;
      return {
        summary: {
          revenuePaise: a.grossPaise,
          paidOrders: a.orders,
          pendingOrders: n.pending,
          publishedProducts: n.published,
          lowStockProducts: n.low,
          importsPending: n.jobs,
        },
        sales: a.sales,
        orders,
        activity: await history(s),
      };
    }
    if (k === 'settings' || k === 'pricing') {
      await grants(s, v.id, [k === 'pricing' ? 'catalogue' : 'settings']);
      const r = first(await s`select * from store_settings`),
        p = first(await s`select email,full_name from profiles where id=${v.id}`);
      const value = settings.parse({
        ...blankSettings(),
        ...r.sections,
        delivery: {
          shipping: r.shipping_paise,
          freeFrom: r.free_from_paise,
          gst: r.shipping_gst_bps,
          pins: r.serviceable_pins,
        },
        profile: { name: p.full_name, email: p.email },
      });
      return k === 'pricing' ? value.pricing : { revision: r.revision, value };
    }
    need(false, 404, 'Unknown resource.');
  });
}
