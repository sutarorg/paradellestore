import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  Boxes,
  ChartColumn,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  HandCoins,
  PackageCheck,
  PackageOpen,
  Plus,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { money } from '@/lib/shop';
import type { Dashboard, Read, Analytics } from '@/lib/admin/models';
import { stamp, human } from '@/lib/admin/rules';
import { ALink, DataTable, Heading, History, PanelHead, StateBox, Tag } from './workbench';
import { Period, Sales } from './reporting';
function part<T, K extends keyof T>(r: Read<T>, k: K): Read<T[K]> {
  return r.state === 'ready' ? { state: 'ready', value: r.value[k] } : r;
}
function Metrics({
  items,
}: {
  items: { label: string; value: string | null; icon: LucideIcon; tone: string }[];
}) {
  return (
    <div className="ad-kpis">
      {items.map((m) => (
        <div className="ad-kpi" key={m.label}>
          <span className={`ad-ki ${m.tone}`}>
            <m.icon size={17} />
          </span>
          <span className="ad-kval">
            {m.value ?? (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">Not available</span>
              </>
            )}
          </span>
          <span className="ad-klabel">{m.label}</span>
        </div>
      ))}
    </div>
  );
}
const quicks = [
  { label: 'Add product', note: 'Build a listing', href: '/admin/products/new', icon: Plus, tone: 'sage' },
  {
    label: 'Import a Kurti',
    note: 'Open import studio',
    href: '/admin/importer',
    icon: ScanLine,
    tone: 'rose',
  },
  {
    label: 'Review orders',
    note: 'Manage fulfilment',
    href: '/admin/orders',
    icon: ReceiptText,
    tone: 'ochre',
  },
  {
    label: 'Check stock',
    note: 'Size-level inventory',
    href: '/admin/inventory',
    icon: Boxes,
    tone: 'mauve',
  },
];
export function Overview({ data, days }: { data: Read<Dashboard>; days: number }) {
  const s = data.state === 'ready' ? data.value.summary : null;
  const d = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  return (
    <>
      <section className="ad-hero">
        <Image src="/admin/atelier.webp" fill priority sizes="(min-width: 1100px) 82vw, 100vw" alt="" />
        <div className="ad-herocopy">
          <div className="ad-over">
            <i /> THE MERCHANT DESK
          </div>
          <h1>Store overview</h1>
          <p>Your collection, orders and store operations.</p>
          <small>{d}</small>
        </div>
      </section>
      <div className="ad-sectionline">
        <div>
          <span className="ad-over">At a glance</span>
          <h2>Store pulse</h2>
        </div>
        <div className="ad-row">
          <Tag
            value={data.state === 'ready' ? 'ready' : data.state === 'offline' ? 'offline' : 'unavailable'}
          >
            {data.state === 'ready'
              ? 'Connected'
              : data.state === 'offline'
                ? 'Not connected'
                : 'Unavailable'}
          </Tag>
          <Period days={days} />
        </div>
      </div>
      <Metrics
        items={[
          { label: 'Paid revenue', value: s ? money(s.revenuePaise) : null, icon: Wallet, tone: 'sage' },
          { label: 'Paid orders', value: s ? String(s.paidOrders) : null, icon: PackageCheck, tone: 'blue' },
          { label: 'Pending orders', value: s ? String(s.pendingOrders) : null, icon: Clock3, tone: 'ochre' },
          {
            label: 'Published products',
            value: s ? String(s.publishedProducts) : null,
            icon: ShoppingBag,
            tone: 'mauve',
          },
          {
            label: 'Low-stock products',
            value: s ? String(s.lowStockProducts) : null,
            icon: PackageOpen,
            tone: 'rose',
          },
          {
            label: 'Imports for approval',
            value: s ? String(s.importsPending) : null,
            icon: ScanLine,
            tone: 'sage',
          },
        ]}
      />
      <div className="ad-dashgrid">
        <Sales result={part(data, 'sales')} />
        <section className="ad-panel">
          <PanelHead kicker="Workspace shortcuts" title="Quick actions" />
          <div className="ad-quickgrid">
            {quicks.map((v) => (
              <Link href={v.href} key={v.href}>
                <div>
                  <span className={`ad-ki ${v.tone}`}>
                    <v.icon size={18} />
                  </span>
                  <ArrowUpRight size={14} />
                </div>
                <strong>{v.label}</strong>
                <small>{v.note}</small>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="ad-panel">
        <PanelHead title="Order overview" kicker="Operations">
          <ALink href="/admin/orders">All orders</ALink>
        </PanelHead>
        {data.state === 'ready' && data.value.orders.length ? (
          <DataTable
            title="Recent orders"
            heads={['Order', 'Customer', 'Products', 'Payment', 'Fulfilment', 'Date', 'Value']}
            rows={data.value.orders.map((o) => ({
              key: o.id,
              cells: [
                <Link key="order" className="ad-textlink" href={`/admin/orders/${o.id}`}>
                  {o.reference}
                </Link>,
                o.customer,
                o.items.map((v) => v.name).join(', '),
                <Tag key="p" value={o.payment} />,
                <Tag key="f" value={o.fulfilment} />,
                stamp(o.date),
                money(o.totalPaise),
              ],
            }))}
          />
        ) : (
          <StateBox state={data} noun="orders" icon={<ReceiptText size={22} />} />
        )}
      </section>
      <section className="ad-panel">
        <PanelHead title="Recent activity" kicker="Store journal" />
        {data.state === 'ready' ? (
          <History rows={data.value.activity} />
        ) : (
          <StateBox state={data} noun="activity" icon={<ClipboardList size={22} />} />
        )}
      </section>
    </>
  );
}
export function Reports({ data, days }: { data: Read<Analytics>; days: number }) {
  const a = data.state === 'ready' ? data.value : null;
  const pct = (v: number | null | undefined) => (v != null ? `${(v / 100).toFixed(2)}%` : null);
  return (
    <>
      <Heading
        label="Workspace / Reporting"
        title="Store analytics"
        description="Sales and contribution from verified transactions. Report dates use India Standard Time."
      >
        <Period days={days} />
      </Heading>
      <Metrics
        items={[
          { label: 'Gross sales', value: a ? money(a.grossPaise) : null, icon: ChartColumn, tone: 'sage' },
          { label: 'Net sales', value: a ? money(a.netPaise) : null, icon: Wallet, tone: 'mauve' },
          { label: 'Orders', value: a ? String(a.orders) : null, icon: ShoppingBag, tone: 'blue' },
          {
            label: 'Average order value',
            value: a?.aovPaise != null ? money(a.aovPaise) : null,
            icon: ReceiptText,
            tone: 'ochre',
          },
          {
            label: 'Contribution',
            value: a?.contributionPaise != null ? money(a.contributionPaise) : null,
            icon: HandCoins,
            tone: 'sage',
          },
          { label: 'Return rate', value: pct(a?.returnBps), icon: PackageOpen, tone: 'rose' },
          { label: 'Refund rate', value: pct(a?.refundBps), icon: CircleDollarSign, tone: 'mauve' },
        ]}
      />
      <Sales result={part(data, 'sales')} />
      <div className="ad-twocol">
        {(['products', 'categories', 'statuses'] as const).map((k, i) => {
          const list = a?.[k];
          return (
            <section key={k} className="ad-panel">
              <PanelHead
                title={['Popular products', 'Category performance', 'Order status breakdown'][i]}
                kicker={['Units sold', 'Net sales', 'Fulfilment'][i]}
              />
              {list?.length ? (
                <DataTable
                  title={k}
                  heads={['Name', i === 1 ? 'Net sales' : i === 0 ? 'Units' : 'Orders']}
                  rows={list.map((v) => ({
                    key: v.name,
                    cells: [human(v.name), i === 1 ? money(v.value) : v.value],
                  }))}
                />
              ) : (
                <StateBox state={data} noun={['product sales', 'category sales', 'order statuses'][i]} />
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
