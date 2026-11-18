import { CircleCheck, ReceiptText } from 'lucide-react';
import { ArrowLink, ButtonLink, Crumbs, EmptyState, PageHead } from '@/components/ui';
import { CompletedPurchase } from '@/components/completed-purchase';
import { SettledBag } from '@/components/order';
import { verifyReceipt } from '@/lib/gateway';
import { pageMeta } from '@/lib/seo';
import { money } from '@/lib/shop';
export const dynamic = 'force-dynamic';
export const metadata = pageMeta(
  'Order Status',
  'Review your payment and order details after confirmation.',
  '/order-success',
  true,
);
export default async function OrderSuccess({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const raw = (await searchParams).receipt;
  const order = await verifyReceipt(typeof raw === 'string' ? raw : undefined);
  return (
    <div className="frame standard-page">
      <Crumbs items={[{ label: 'Order status', href: '/order-success' }]} />
      <PageHead kicker="Your purchase" title={order ? 'Order Confirmed' : 'Order Status'} />
      {order ? (
        <div className="receipt">
          <SettledBag quoteId={order.quoteId} />
          <CircleCheck size={30} />
          <h2>Thank you for your order.</h2>
          <p>
            Order reference: <strong>{order.reference}</strong>
          </p>
          <p>Payment confirmed · {money(order.totalPaise)}</p>
          <ul className="line-summary">
            {order.items.map((l) => (
              <li key={`${l.name}:${l.size}`}>
                <span>
                  {l.name}
                  <small>
                    {l.size ? `Size ${l.size} · ` : ''}Qty {l.quantity}
                  </small>
                </span>
                <strong>{money(l.lineTotalPaise)}</strong>
              </li>
            ))}
          </ul>
          <CompletedPurchase order={order} />
          <h3>Delivery information</h3>
          <p>{order.delivery}</p>
          <div className="row-wrap">
            <ButtonLink href="/track-order">Track your order</ButtonLink>
            <ArrowLink href="/kurtis">Continue shopping</ArrowLink>
          </div>
        </div>
      ) : (
        <>
          <EmptyState
            icon={<ReceiptText size={32} />}
            title="No confirmed order to display."
            href="/track-order"
            cta="Check order status"
          >
            We can’t verify a payment from this page. If you’ve already paid, check your order status before
            attempting another payment.
          </EmptyState>
          <div className="center-link">
            <ArrowLink href="/kurtis">Continue shopping</ArrowLink>
          </div>
        </>
      )}
    </div>
  );
}
