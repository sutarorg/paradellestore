'use client';
import { PrivateImage } from './private-image';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  ChevronRight,
  Ellipsis,
  Image as ImageIcon,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { Modal } from '@/components/modal';
import { money } from '@/lib/shop';
import type {
  Read,
  PageData,
  ProductRow,
  OrderRow,
  Customer,
  Review,
  Stock,
  Ref,
  Adjustment,
} from '@/lib/admin/models';
import { findOrders, findCustomers } from '@/lib/admin/actions';
import type { Command } from '@/lib/admin/commands';
import { asRef, human, stamp, timed, type ListName, type ListQuery } from '@/lib/admin/rules';
import {
  ALink,
  Confirm,
  DataTable,
  Field,
  Heading,
  Pager,
  PanelHead,
  StateBox,
  Tag,
  Toolbar,
  useCommand,
} from './workbench';
type ListProps<T> = { data: Read<PageData<T>>; query: ListQuery };
// Names and mobile numbers belong in a private request body, never navigation, history or storage.
function usePrivateRegister<T>(initial: ListProps<T>, fetcher: (q: ListQuery) => Promise<Read<PageData<T>>>) {
  const [local, set] = useState<ListProps<T> | null>(null);
  const seq = useRef(0);
  const privateQuery = async (q: ListQuery) => {
    const n = ++seq.current;
    try {
      const result = await fetcher(q);
      if (n === seq.current) set({ data: result, query: q });
    } catch {
      if (n === seq.current)
        set({
          data: { state: 'error', message: 'Private search could not be completed. Try your search again.' },
          query: q,
        });
    }
  };
  return { ...(local ?? initial), privateQuery };
}
function Index<T>({
  kind,
  title,
  headers,
  data,
  query,
  rows,
  children,
  icon,
  noun = kind,
  privateQuery,
}: {
  kind: ListName;
  title: string;
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
  children?: ReactNode;
  icon: ReactNode;
  noun?: string;
  privateQuery?: (q: ListQuery) => Promise<void>;
} & ListProps<T>) {
  const base = `/admin/${kind === 'imports' ? 'importer' : kind}`;
  return (
    <section className="ad-panel ad-index">
      <PanelHead title={title}>
        <span className="ad-count">
          {data.state === 'ready'
            ? `${data.value.total.toLocaleString('en-IN')} records`
            : 'Private register'}
        </span>
      </PanelHead>
      <Toolbar
        privateQuery={privateQuery}
        key={JSON.stringify(query)}
        kind={kind}
        query={query}
        base={base}
      />
      {children}
      <DataTable title={title} rows={rows} heads={headers} />
      {!rows.length && (
        <StateBox
          state={data}
          retry={privateQuery && query.q ? () => privateQuery(query) : undefined}
          noun={noun}
          icon={icon}
          filtered={Boolean(query.q || query.status || query.category || query.customerId)}
        />
      )}{' '}
      {data.state === 'ready' && (
        <Pager privateQuery={privateQuery} query={query} data={data.value} base={base} />
      )}
    </section>
  );
}
export function ProductsIndex({ data, query }: ListProps<ProductRow>) {
  const [picked, choose] = useState<Ref[]>([]),
    [row, open] = useState<ProductRow | null>(null),
    [confirm, ask] = useState<{
      c: Command;
      title: string;
      body: string;
      label: string;
      danger?: boolean;
    } | null>(null);
  const cmd = useCommand(),
    router = useRouter();
  const list = data.state === 'ready' ? data.value.rows : [];
  const transition = (refs: Ref[], to: 'draft' | 'published' | 'archived') => {
    cmd.clear();
    open(null);
    const name = { draft: 'Unpublish', published: 'Publish', archived: 'Archive' }[to];
    ask({
      c: { op: 'product.transition', refs, to },
      title: `${name} selected products?`,
      body: `This applies only to the ${refs.length} selected record${refs.length === 1 ? '' : 's'}. ${to === 'published' ? 'Every listing must pass publication checks.' : 'Affected listings will not be available to shoppers.'}`,
      label: name,
      danger: to !== 'published',
    });
  };
  const sel = (v: ProductRow, b: boolean) =>
    choose(b ? [...picked, asRef(v)] : picked.filter((x) => x.id !== v.id));
  return (
    <>
      <Heading
        label="Catalogue / Collection"
        title="Products"
        description="Edit listings, organise your collection and control what is published."
      >
        <ALink href="/admin/importer">Import a Kurti</ALink>
        <ALink href="/admin/products/new" primary>
          Add product
        </ALink>
      </Heading>
      <Index
        kind="products"
        title="Product register"
        icon={<ShoppingBag />}
        query={query}
        data={data}
        headers={['Select', 'Product', 'SKU', 'Price', 'Sizes', 'Stock', 'Status', 'Updated', 'Actions']}
        rows={list.map((v) => ({
          key: v.id,
          cells: [
            <input
              key="pick"
              aria-label={`Select ${v.title}`}
              type="checkbox"
              checked={picked.some((x) => x.id === v.id)}
              onChange={(e) => sel(v, e.target.checked)}
            />,
            <div key="product" className="ad-productcell">
              {v.thumbnail ? (
                <PrivateImage alt="" src={v.thumbnail} width={38} height={48} />
              ) : (
                <ImageIcon size={17} />
              )}
              <div>
                <Link href={`/admin/products/${v.id}/edit`}>{v.title}</Link>
                <small>{human(v.category) || 'Uncategorised'}</small>
              </div>
            </div>,
            v.sku || 'Not set',
            v.pricePaise != null ? money(v.pricePaise) : 'Not set',
            v.sizes.join(', ') || 'None',
            v.stock,
            <Tag key="st" value={v.status} />,
            stamp(v.updatedAt),
            <button
              key="more"
              type="button"
              aria-label={`Actions for ${v.title}`}
              className="ad-icon"
              onClick={() => open(v)}
            >
              <Ellipsis size={18} />
            </button>,
          ],
        }))}
      >
        {list.length > 0 && (
          <div className="ad-bulk">
            <label className="ad-check">
              <input
                type="checkbox"
                checked={list.length > 0 && list.every((x) => picked.some((p) => p.id === x.id))}
                onChange={(e) => choose(e.target.checked ? list.map(asRef) : [])}
              />
              Select this page
            </label>
            {picked.length > 0 && (
              <>
                <b>{picked.length} selected</b>
                {(['published', 'draft', 'archived'] as const).map((v, i) => (
                  <button type="button" key={v} className="ad-textlink" onClick={() => transition(picked, v)}>
                    {['Publish', 'Unpublish', 'Archive'][i]}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </Index>
      {row && (
        <Modal title="Product actions" mode="sheet" close={() => open(null)}>
          <div className="ad-dialog">
            <div className="ad-over">{row.sku || 'Product record'}</div>
            <h3>{row.title}</h3>
            <div className="ad-findlist">
              <Link href={`/admin/products/${row.id}/edit?view=preview`}>
                View listing preview
                <ChevronRight size={15} />
              </Link>
              <Link href={`/admin/products/${row.id}/edit`}>
                Edit product
                <ChevronRight size={15} />
              </Link>
              {row.status === 'published' && (
                <Link href={`/kurtis/${row.slug}`}>
                  View on storefront
                  <ChevronRight size={15} />
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  cmd.clear();
                  ask({
                    c: { op: 'product.duplicate', ref: asRef(row) },
                    title: 'Duplicate this listing?',
                    body: 'Create a separate draft from this record. Stock, SKUs and publication approval are not copied.',
                    label: 'Create draft copy',
                  });
                  open(null);
                }}
              >
                Duplicate as draft
              </button>
              {row.status !== 'published' && (
                <button type="button" onClick={() => transition([asRef(row)], 'published')}>
                  Publish
                </button>
              )}
              {row.status === 'published' && (
                <button type="button" onClick={() => transition([asRef(row)], 'draft')}>
                  Unpublish
                </button>
              )}
              {row.status !== 'archived' && (
                <button type="button" onClick={() => transition([asRef(row)], 'archived')}>
                  Archive
                </button>
              )}
              <button
                className="ad-dangertext"
                type="button"
                onClick={() => {
                  cmd.clear();
                  ask({
                    c: { op: 'product.delete', ref: asRef(row) },
                    title: 'Delete this product?',
                    body: `Permanently remove “${row.title}”. Existing order records must be retained. This cannot be undone.`,
                    label: 'Delete product',
                    danger: true,
                  });
                  open(null);
                }}
              >
                Delete product
              </button>
            </div>
          </div>
        </Modal>
      )}
      {confirm && (
        <Confirm
          {...confirm}
          confirm={confirm.label}
          close={() => ask(null)}
          busy={cmd.busy}
          error={cmd.error}
          onConfirm={async () => {
            await cmd.run(confirm.c, 'Product register updated.', (r) => {
              choose([]);
              ask(null);
              if (confirm.c.op === 'product.duplicate') router.push(`/admin/products/${r.id}/edit`);
              router.refresh();
            });
          }}
        />
      )}
    </>
  );
}
export function OrdersIndex(props: ListProps<OrderRow>) {
  const { data, query, privateQuery } = usePrivateRegister(props, findOrders);
  return (
    <>
      <Heading
        label="Operations / Sales"
        title={query.customerId ? 'Customer order history' : 'Orders'}
        description="Follow each prepaid order from payment to manual fulfilment."
      />
      <Index
        kind="orders"
        privateQuery={privateQuery}
        title="Order register"
        icon={<ReceiptText />}
        query={query}
        data={data}
        headers={[
          'Order',
          'Customer',
          'Mobile',
          'Placed',
          'Items · size × qty',
          'Value',
          'Payment',
          'Fulfilment',
        ]}
        rows={(data.state === 'ready' ? data.value.rows : []).map((v) => ({
          key: v.id,
          cells: [
            <Link key="ref" className="ad-textlink" href={`/admin/orders/${v.id}`}>
              {v.reference}
            </Link>,
            v.customer,
            v.mobile,
            stamp(v.date),
            <div key="lines">
              {v.items.map((l) => (
                <div key={l.id}>
                  {l.name} · {l.size} × {l.quantity}
                </div>
              ))}
            </div>,
            money(v.totalPaise),
            <Tag key="p" value={v.payment} />,
            <Tag key="f" value={v.fulfilment} />,
          ],
        }))}
      />
    </>
  );
}
export function CustomersIndex(props: ListProps<Customer>) {
  const { data, query, privateQuery } = usePrivateRegister(props, findCustomers);
  return (
    <>
      <Heading
        label="Operations / Relationships"
        title="Customers"
        description="Protected customer records derived from genuine purchases."
      />
      <Index
        kind="customers"
        privateQuery={privateQuery}
        title="Customer directory"
        data={data}
        query={query}
        icon={<Users />}
        headers={['Name', 'Mobile', 'Orders', 'Total spend', 'Last purchase', 'History']}
        rows={(data.state === 'ready' ? data.value.rows : []).map((v) => ({
          key: v.id,
          cells: [
            v.name,
            v.mobile,
            v.orders,
            money(v.spendPaise),
            v.lastOrder ? stamp(v.lastOrder) : 'Not recorded',
            <ALink key="history" href={`/admin/orders?customerId=${v.id}`}>
              Order history
            </ALink>,
          ],
        }))}
      />
      <div className="ad-fine">
        <ShieldCheck size={15} />
        Customer details are restricted to authorised staff. This is not a customer account directory.
      </div>
    </>
  );
}
export function InventoryIndex({
  data,
  query,
  history,
}: ListProps<Stock & { productStock: number }> & { history: Read<Adjustment[]> }) {
  const [v, select] = useState<Stock | null>(null),
    [delta, setDelta] = useState(''),
    [reason, setReason] = useState(''),
    [err, setErr] = useState('');
  const cmd = useCommand();
  return (
    <>
      <Heading
        label="Catalogue / Availability"
        title="Inventory"
        description="Manage stock by size. Every adjustment needs a reason and an audit entry."
      />
      <Index
        kind="inventory"
        noun="stock records"
        title="Stock ledger"
        data={data}
        query={query}
        icon={<Boxes />}
        headers={['Product', 'SKU', 'Size', 'Size stock', 'Product stock', 'Alert', 'Updated', 'Adjustment']}
        rows={(data.state === 'ready' ? data.value.rows : []).map((x) => ({
          key: x.id,
          cells: [
            <Link key="prod" className="ad-textlink" href={`/admin/products/${x.productId}/edit`}>
              {x.title}
            </Link>,
            x.sku,
            x.size,
            x.stock,
            x.productStock,
            <Tag
              key="alert"
              value={
                !x.enabled
                  ? 'disabled'
                  : x.stock === 0
                    ? 'out-of-stock'
                    : x.stock <= x.threshold
                      ? 'low-stock'
                      : 'available'
              }
            />,
            stamp(x.updatedAt),
            <button
              type="button"
              className="ad-textlink"
              key="act"
              onClick={() => {
                select(x);
                setDelta('');
                setReason('');
                setErr('');
                cmd.clear();
              }}
            >
              Adjust stock
            </button>,
          ],
        }))}
      />
      <section className="ad-panel">
        <PanelHead kicker="Audit trail" title="Adjustment history" />
        {history.state === 'ready' && history.value.length ? (
          <DataTable
            title="Stock adjustments"
            heads={['Variant', 'Before', 'Change', 'After', 'Reason', 'Recorded by', 'When']}
            rows={history.value.map((a) => ({
              key: a.id,
              cells: [
                `${a.product} · ${a.size} · ${a.sku}`,
                a.before,
                a.delta > 0 ? `+${a.delta}` : a.delta,
                a.after,
                a.reason,
                a.actor,
                timed(a.at),
              ],
            }))}
          />
        ) : (
          <StateBox noun="adjustments" state={history} />
        )}
      </section>
      {v && (
        <Confirm
          title="Adjust size stock"
          body={`${v.title} · ${v.size} · current stock ${v.stock}. Changes apply only to this size.`}
          confirm="Confirm adjustment"
          busy={cmd.busy}
          close={() => select(null)}
          error={err || cmd.error}
          onConfirm={async () => {
            const d = Number(delta);
            if (!Number.isSafeInteger(d) || d === 0 || v.stock + d < 0 || reason.trim().length < 3) {
              setErr('Enter a non-zero whole adjustment and a reason. Resulting stock cannot be negative.');
              return;
            }
            if (
              await cmd.run(
                { op: 'stock.adjust', ref: asRef(v), delta: d, reason },
                'Stock adjusted and history recorded.',
              )
            )
              select(null);
          }}
        >
          <Field type="number" label="Quantity change (+ or −)" value={delta} onChange={setDelta} step="1" />
          <Field label="Adjustment reason" value={reason} onChange={setReason} maxLength={500} />
          {delta && (
            <p>
              Resulting size stock: <b>{v.stock + Number(delta)}</b>
            </p>
          )}
        </Confirm>
      )}
    </>
  );
}
export function ReviewsIndex({ data, query }: ListProps<Review>) {
  const [action, ask] = useState<{ v: Review; to: 'published' | 'unpublished' | 'rejected' } | null>(null);
  const cmd = useCommand();
  return (
    <>
      <Heading
        label="Operations / Feedback"
        title="Reviews"
        description="Moderate genuine feedback. Authorised source reviews stay distinct from PARADELLE purchases."
      />
      <Index
        kind="reviews"
        title="Review register"
        data={data}
        query={query}
        icon={<MessageSquareText />}
        headers={[
          'Product & review',
          'Rating',
          'Origin',
          'Permission',
          'Verified purchase',
          'Status',
          'Moderation',
        ]}
        rows={(data.state === 'ready' ? data.value.rows : []).map((v) => ({
          key: v.id,
          cells: [
            <div key="review">
              <Link className="ad-textlink" href={`/admin/products/${v.productId}/edit`}>
                {v.productTitle}
              </Link>
              <p>{v.body || 'Text withheld: permission not granted.'}</p>
              <small>{stamp(v.at)}</small>
            </div>,
            v.rating ? `${v.rating}/5` : 'Not shared',
            v.origin === 'paradelle' ? 'PARADELLE customer' : `Sourced · ${v.source}`,
            human(v.permission),
            v.origin === 'paradelle' && v.verifiedPurchase ? 'Verified' : 'Not verified',
            <Tag key="st" value={v.status} />,
            <div className="ad-row" key="act">
              {(['published', 'unpublished', 'rejected'] as const)
                .filter(
                  (s) =>
                    s !== v.status &&
                    (s !== 'published' || v.origin === 'paradelle' || v.permission === 'granted'),
                )
                .map((to) => (
                  <button
                    key={to}
                    type="button"
                    className="ad-textlink"
                    onClick={() => {
                      cmd.clear();
                      ask({ v, to });
                    }}
                  >
                    {{ published: 'Publish', unpublished: 'Unpublish', rejected: 'Reject' }[to]}
                  </button>
                ))}
            </div>,
          ],
        }))}
      />
      {action && (
        <Confirm
          title="Change review visibility?"
          body={`Set this review for ${action.v.productTitle} to ${action.to}. Its rating and source will not change.`}
          confirm="Confirm moderation"
          error={cmd.error}
          close={() => ask(null)}
          busy={cmd.busy}
          danger={action.to !== 'published'}
          onConfirm={async () => {
            if (
              await cmd.run(
                { op: 'review.moderate', ref: asRef(action.v), to: action.to },
                'Moderation decision recorded.',
              )
            )
              ask(null);
          }}
        />
      )}
    </>
  );
}
